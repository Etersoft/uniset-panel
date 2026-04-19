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
	"sync/atomic"
	"testing"
	"time"
)

// fakeClient simulates the uniset HTTP client without making network calls.
type fakeClient struct {
	mu    sync.Mutex
	calls int32
	resp  dumpEnvelope
	err   error
}

func (f *fakeClient) Fetch(_ context.Context, _, _ string, _ int64, _ int) (dumpEnvelope, error) {
	atomic.AddInt32(&f.calls, 1)
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.resp, f.err
}

// fakeBroadcaster collects TraceBatch events.
type fakeBroadcaster struct {
	mu      sync.Mutex
	batches []TraceBatch
}

func (f *fakeBroadcaster) BroadcastTraceBatch(_, _, _ string, b TraceBatch) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.batches = append(f.batches, b)
}

func (f *fakeBroadcaster) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.batches)
}

func makeRecord(t *testing.T, timeUs int64) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(map[string]int64{"time_us": timeUs})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestPoller_singleSubscriber(t *testing.T) {
	rec := makeRecord(t, 12345)
	fc := &fakeClient{resp: dumpEnvelope{Trace: &traceSection{
		Enabled: true, Overflow: false,
		Records: []json.RawMessage{rec},
	}}}
	bc := &fakeBroadcaster{}

	p := newPoller("srv-1", "srv-1", "DG_Control", fc, bc)
	p.AddSubscriber("s1", 50) // 50ms interval

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)

	// Wait for at least 2 broadcasts
	deadline := time.Now().Add(500 * time.Millisecond)
	for bc.count() < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	p.wg.Wait()

	if bc.count() < 2 {
		t.Fatalf("expected >=2 broadcasts, got %d", bc.count())
	}

	// All broadcasts should include the record
	bc.mu.Lock()
	defer bc.mu.Unlock()
	for i, b := range bc.batches {
		if !b.Enabled {
			t.Errorf("batch %d not enabled", i)
		}
		if len(b.Records) == 0 {
			t.Errorf("batch %d empty records", i)
		}
	}
}

func TestPoller_watermarkAdvances(t *testing.T) {
	rec1 := makeRecord(t, 100)
	rec2 := makeRecord(t, 200)
	fc := &fakeClient{resp: dumpEnvelope{Trace: &traceSection{
		Enabled: true,
		Records: []json.RawMessage{rec1, rec2},
	}}}
	bc := &fakeBroadcaster{}

	p := newPoller("srv-1", "srv-1", "X", fc, bc)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)

	time.Sleep(120 * time.Millisecond) // allow 2 fetches
	cancel()
	p.wg.Wait()

	p.mu.Lock()
	watermark := p.lastTimeUs
	p.mu.Unlock()
	if watermark != 200 {
		t.Errorf("watermark: expected 200, got %d", watermark)
	}
}

func TestPoller_unsubscribeStops(t *testing.T) {
	fc := &fakeClient{resp: dumpEnvelope{Trace: &traceSection{Enabled: true}}}
	bc := &fakeBroadcaster{}

	p := newPoller("srv-1", "srv-1", "X", fc, bc)
	p.AddSubscriber("s1", 50)
	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)

	time.Sleep(80 * time.Millisecond)

	left := p.RemoveSubscriber("s1")
	if left != 0 {
		t.Errorf("subs left: %d", left)
	}
	cancel()
	p.wg.Wait()

	callsAfter := atomic.LoadInt32(&fc.calls)
	time.Sleep(100 * time.Millisecond)
	callsLater := atomic.LoadInt32(&fc.calls)
	if callsLater != callsAfter {
		t.Errorf("fetches continued after stop: %d -> %d", callsAfter, callsLater)
	}
}

func TestPoller_effectiveIntervalMin(t *testing.T) {
	p := newPoller("srv", "srv", "X", &fakeClient{}, &fakeBroadcaster{})
	p.AddSubscriber("a", 500)
	p.AddSubscriber("b", 100)
	if got := p.effectiveInterval(); got != 100*time.Millisecond {
		t.Errorf("effective: got %v", got)
	}
	p.RemoveSubscriber("b")
	if got := p.effectiveInterval(); got != 500*time.Millisecond {
		t.Errorf("after remove: got %v", got)
	}
}

func TestPoller_intervalClamp(t *testing.T) {
	p := newPoller("srv", "srv", "X", &fakeClient{}, &fakeBroadcaster{})
	p.AddSubscriber("a", 10) // below min
	if got := p.effectiveInterval(); got != MinInterval {
		t.Errorf("low clamp: got %v", got)
	}
	p.RemoveSubscriber("a")
	p.AddSubscriber("b", 99999) // above max
	if got := p.effectiveInterval(); got != MaxInterval {
		t.Errorf("high clamp: got %v", got)
	}
}

func TestPoller_backoffOnError(t *testing.T) {
	fc := &fakeClient{err: ErrObjectNotFound}
	bc := &fakeBroadcaster{}
	p := newPoller("srv", "srv", "X", fc, bc)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)
	time.Sleep(50 * time.Millisecond)

	p.mu.Lock()
	b1 := p.backoff
	p.mu.Unlock()
	if b1 != backoffInitial {
		t.Errorf("initial backoff: got %v", b1)
	}

	cancel()
	p.wg.Wait()
}

func TestPoller_backoffResetsOnSuccess(t *testing.T) {
	fc := &fakeClient{err: ErrObjectNotFound}
	bc := &fakeBroadcaster{}
	p := newPoller("srv", "srv", "X", fc, bc)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)
	time.Sleep(50 * time.Millisecond) // allow error to occur and backoff to set

	// Switch to success
	fc.mu.Lock()
	fc.err = nil
	fc.resp = dumpEnvelope{Trace: &traceSection{Enabled: true}}
	fc.mu.Unlock()

	// Wait for the backoff sleep (1s) plus next iteration
	time.Sleep(1200 * time.Millisecond)

	p.mu.Lock()
	b := p.backoff
	p.mu.Unlock()
	if b != 0 {
		t.Errorf("backoff after success: got %v", b)
	}

	cancel()
	p.wg.Wait()
}
