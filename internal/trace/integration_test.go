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
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"
)

// TestIntegration_endToEnd verifies end-to-end wiring:
// fake uniset HTTP server → trace.Client → trace.Manager → fake
// SSEBroadcaster. A subscription must produce multiple broadcasts whose
// records have strictly-advancing time_us values (watermark progresses).
func TestIntegration_endToEnd(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		idx := atomic.AddInt32(&callCount, 1)
		rec, _ := json.Marshal(map[string]int64{"time_us": int64(idx) * 1000})
		body := fmt.Sprintf(`{"X":{"trace":{"enabled":true,"records":[%s]}}}`, rec)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	resolver := resolverFn(func(_ string) (string, int, error) {
		u, _ := url.Parse(srv.URL)
		p := 0
		_, _ = fmt.Sscanf(u.Port(), "%d", &p)
		return u.Hostname(), p, nil
	})
	client := NewClient(resolver)
	hub := &fakeBroadcaster{}
	m := NewManager(client, hub)
	defer m.StopAll()

	token := m.Subscribe("srv-1", "srv-1", "X", 100)
	defer m.Unsubscribe(token)

	// Wait for at least 2 broadcasts.
	deadline := time.Now().Add(1 * time.Second)
	for hub.count() < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if hub.count() < 2 {
		t.Fatalf("expected >=2 broadcasts, got %d", hub.count())
	}

	// Verify first batch is enabled and records differ across broadcasts.
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if !hub.batches[0].Enabled {
		t.Errorf("first batch should be enabled")
	}
	if len(hub.batches[0].Records) == 0 || len(hub.batches[1].Records) == 0 {
		t.Fatalf("expected non-empty records in first two batches")
	}
	var a, b recordTimeOnly
	_ = json.Unmarshal(hub.batches[0].Records[0], &a)
	_ = json.Unmarshal(hub.batches[1].Records[0], &b)
	if a.TimeUs == 0 || b.TimeUs == 0 {
		t.Errorf("parsed time_us: a=%d b=%d (expected non-zero)", a.TimeUs, b.TimeUs)
	}
	if a.TimeUs == b.TimeUs {
		t.Errorf("records should differ across broadcasts: %d vs %d", a.TimeUs, b.TimeUs)
	}
}

// TestIntegration_subscribeUnsubscribeLifecycle verifies that Manager
// creates exactly one poller per (server,object) key and tears it down
// once the last subscriber leaves.
func TestIntegration_subscribeUnsubscribeLifecycle(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"X":{"trace":{"enabled":true,"records":[]}}}`))
	}))
	defer srv.Close()

	resolver := resolverFn(func(_ string) (string, int, error) {
		u, _ := url.Parse(srv.URL)
		p := 0
		_, _ = fmt.Sscanf(u.Port(), "%d", &p)
		return u.Hostname(), p, nil
	})
	m := NewManager(NewClient(resolver), &fakeBroadcaster{})
	defer m.StopAll()

	if got := m.PollerCount(); got != 0 {
		t.Fatalf("initial PollerCount: got %d want 0", got)
	}

	t1 := m.Subscribe("srv-1", "srv-1", "X", 100)
	t2 := m.Subscribe("srv-1", "srv-1", "X", 100) // same key — shares poller
	if got := m.PollerCount(); got != 1 {
		t.Fatalf("after two subs on same key: got %d want 1", got)
	}

	t3 := m.Subscribe("srv-1", "srv-1", "Y", 100) // different object
	if got := m.PollerCount(); got != 2 {
		t.Fatalf("after sub on different object: got %d want 2", got)
	}

	m.Unsubscribe(t1)
	if got := m.PollerCount(); got != 2 {
		t.Errorf("after first unsub of shared: got %d want 2", got)
	}
	m.Unsubscribe(t2)
	if got := m.PollerCount(); got != 1 {
		t.Errorf("after last unsub of shared: got %d want 1", got)
	}
	m.Unsubscribe(t3)
	if got := m.PollerCount(); got != 0 {
		t.Errorf("after final unsub: got %d want 0", got)
	}
}
