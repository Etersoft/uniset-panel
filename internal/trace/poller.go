/*
 * Copyright (c) 2025 Pavel Vainerman.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation, version 2.1.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Lesser Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
// --------------------------------------------------------------------------
package trace

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

// HTTPFetcher is the subset of *Client used by TracePoller (allows
// fakes in unit tests).
type HTTPFetcher interface {
	Fetch(ctx context.Context, serverID, objectName string, since int64, limit int) (dumpEnvelope, error)
}

// SSEBroadcaster is the subset of SSEHub used by TracePoller.
type SSEBroadcaster interface {
	BroadcastTraceBatch(serverID, serverName, objectName string, batch TraceBatch)
}

const (
	// FetchLimit bounds records returned per uniset call.
	FetchLimit = 1024
	// MinInterval / MaxInterval bound client-requested interval.
	MinInterval = 100 * time.Millisecond
	MaxInterval = 10 * time.Second

	// Backoff parameters for uniset failures.
	backoffInitial = 1 * time.Second
	backoffMax     = 30 * time.Second
	backoffFactor  = 2
)

// TracePoller runs a polling loop for a single (serverID, objectName)
// pair, shared across multiple subscribers with per-subscriber intervals.
type TracePoller struct {
	serverID   string
	serverName string
	objectName string

	client HTTPFetcher
	sseHub SSEBroadcaster

	mu          sync.Mutex
	subscribers map[string]time.Duration
	lastTimeUs  int64
	backoff     time.Duration

	stopCh chan struct{}
	wg     sync.WaitGroup
}

func newPoller(serverID, serverName, objectName string, client HTTPFetcher, hub SSEBroadcaster) *TracePoller {
	return &TracePoller{
		serverID:    serverID,
		serverName:  serverName,
		objectName:  objectName,
		client:      client,
		sseHub:      hub,
		subscribers: make(map[string]time.Duration),
		stopCh:      make(chan struct{}),
	}
}

// AddSubscriber registers a subscriber with its requested interval
// (clamped to [MinInterval, MaxInterval]).
func (p *TracePoller) AddSubscriber(id string, intervalMS int64) {
	d := time.Duration(intervalMS) * time.Millisecond
	if d < MinInterval {
		d = MinInterval
	}
	if d > MaxInterval {
		d = MaxInterval
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.subscribers[id] = d
}

// RemoveSubscriber returns the number of subscribers remaining.
func (p *TracePoller) RemoveSubscriber(id string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.subscribers, id)
	return len(p.subscribers)
}

// effectiveInterval returns the min of subscriber intervals, or
// MaxInterval if none.
func (p *TracePoller) effectiveInterval() time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	best := MaxInterval
	first := true
	for _, d := range p.subscribers {
		if first || d < best {
			best = d
			first = false
		}
	}
	if first {
		return MaxInterval
	}
	return best
}

// run is the poll loop. Exits when ctx is cancelled or stopCh closed.
func (p *TracePoller) run(ctx context.Context) {
	p.wg.Add(1)
	defer p.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case <-p.stopCh:
			return
		default:
		}

		env, err := p.client.Fetch(ctx, p.serverID, p.objectName, p.currentWatermark(), FetchLimit)
		switch {
		case err != nil:
			p.onError()
			p.broadcast(TraceBatch{Enabled: false})
			p.sleep(ctx, p.currentBackoff())
			continue
		case env.Trace == nil || !env.Trace.Enabled:
			p.resetBackoff()
			p.broadcast(TraceBatch{Enabled: false})
		default:
			p.resetBackoff()
			p.updateWatermark(env.Trace.Records)
			p.broadcast(TraceBatch{
				Enabled:  true,
				Overflow: env.Trace.Overflow,
				Records:  env.Trace.Records,
			})
		}
		p.sleep(ctx, p.effectiveInterval())
	}
}

func (p *TracePoller) currentWatermark() int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.lastTimeUs
}

func (p *TracePoller) updateWatermark(recs []json.RawMessage) {
	if len(recs) == 0 {
		return
	}
	var last recordTimeOnly
	if err := json.Unmarshal(recs[len(recs)-1], &last); err == nil && last.TimeUs > 0 {
		p.mu.Lock()
		if last.TimeUs > p.lastTimeUs {
			p.lastTimeUs = last.TimeUs
		}
		p.mu.Unlock()
	}
}

func (p *TracePoller) broadcast(b TraceBatch) {
	p.sseHub.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName, b)
}

func (p *TracePoller) onError() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.backoff == 0 {
		p.backoff = backoffInitial
		return
	}
	p.backoff *= backoffFactor
	if p.backoff > backoffMax {
		p.backoff = backoffMax
	}
}

func (p *TracePoller) resetBackoff() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.backoff = 0
}

func (p *TracePoller) currentBackoff() time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.backoff
}

func (p *TracePoller) sleep(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-p.stopCh:
	case <-time.After(d):
	}
}

// Stop signals the loop to exit.
func (p *TracePoller) Stop() {
	close(p.stopCh)
	p.wg.Wait()
}
