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
	"crypto/rand"
	"encoding/hex"
	"sync"
)

type pollerKey struct {
	serverID   string
	objectName string
}

// Manager is the registry of running TracePollers keyed by (server,object).
// Reference-counts subscribers; stops the poller when count reaches 0.
type Manager struct {
	client HTTPFetcher
	sseHub SSEBroadcaster

	mu       sync.Mutex
	pollers  map[pollerKey]*pollerEntry
	subIndex map[string]pollerKey // subscriberID → key
}

type pollerEntry struct {
	poller *TracePoller
	cancel context.CancelFunc
}

func NewManager(client HTTPFetcher, hub SSEBroadcaster) *Manager {
	return &Manager{
		client:   client,
		sseHub:   hub,
		pollers:  make(map[pollerKey]*pollerEntry),
		subIndex: make(map[string]pollerKey),
	}
}

// Subscribe registers a subscriber and returns a token for unsubscribe.
func (m *Manager) Subscribe(serverID, serverName, objectName string, intervalMS int64) string {
	key := pollerKey{serverID: serverID, objectName: objectName}

	token := randomToken()

	m.mu.Lock()
	entry, ok := m.pollers[key]
	if !ok {
		p := newPoller(serverID, serverName, objectName, m.client, m.sseHub)
		ctx, cancel := context.WithCancel(context.Background())
		entry = &pollerEntry{poller: p, cancel: cancel}
		m.pollers[key] = entry
		go p.run(ctx)
	}
	entry.poller.AddSubscriber(token, intervalMS)
	m.subIndex[token] = key
	m.mu.Unlock()

	return token
}

// Unsubscribe removes a subscriber. If no subscribers remain for its
// poller, stops and unregisters the poller.
func (m *Manager) Unsubscribe(token string) {
	m.mu.Lock()
	key, ok := m.subIndex[token]
	if !ok {
		m.mu.Unlock()
		return
	}
	delete(m.subIndex, token)
	entry := m.pollers[key]
	m.mu.Unlock()

	if entry == nil {
		return
	}
	left := entry.poller.RemoveSubscriber(token)
	if left == 0 {
		m.mu.Lock()
		delete(m.pollers, key)
		m.mu.Unlock()
		entry.cancel()
		entry.poller.Stop()
	}
}

func (m *Manager) PollerCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pollers)
}

// StopAll is used for shutdown.
func (m *Manager) StopAll() {
	m.mu.Lock()
	entries := make([]*pollerEntry, 0, len(m.pollers))
	for _, e := range m.pollers {
		entries = append(entries, e)
	}
	m.pollers = make(map[pollerKey]*pollerEntry)
	m.subIndex = make(map[string]pollerKey)
	m.mu.Unlock()

	for _, e := range entries {
		e.cancel()
		e.poller.Stop()
	}
}

func randomToken() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
