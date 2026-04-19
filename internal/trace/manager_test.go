package trace

import (
	"testing"
	"time"
)

func TestManager_SubscribeCreatesPoller(t *testing.T) {
	fc := &fakeClient{}
	bc := &fakeBroadcaster{}
	m := NewManager(fc, bc)
	defer m.StopAll()

	token := m.Subscribe("srv-1", "srv-1", "X", 500)
	if token == "" {
		t.Fatal("empty token")
	}
	if m.PollerCount() != 1 {
		t.Errorf("expected 1 poller, got %d", m.PollerCount())
	}

	m.Unsubscribe(token)
	time.Sleep(50 * time.Millisecond)
	if m.PollerCount() != 0 {
		t.Errorf("expected 0 pollers after last unsubscribe, got %d", m.PollerCount())
	}
}

func TestManager_SecondSubscribeReuses(t *testing.T) {
	fc := &fakeClient{}
	bc := &fakeBroadcaster{}
	m := NewManager(fc, bc)
	defer m.StopAll()

	t1 := m.Subscribe("srv-1", "srv-1", "X", 500)
	t2 := m.Subscribe("srv-1", "srv-1", "X", 100)

	if t1 == t2 {
		t.Error("subscriber tokens must differ")
	}
	if m.PollerCount() != 1 {
		t.Errorf("expected 1 poller (shared), got %d", m.PollerCount())
	}
	m.Unsubscribe(t1)
	if m.PollerCount() != 1 {
		t.Errorf("expected poller alive with 1 subscriber left, got %d", m.PollerCount())
	}
	m.Unsubscribe(t2)
	time.Sleep(50 * time.Millisecond)
	if m.PollerCount() != 0 {
		t.Errorf("expected 0 pollers, got %d", m.PollerCount())
	}
}

func TestManager_DifferentObjectsHaveOwnPollers(t *testing.T) {
	fc := &fakeClient{}
	bc := &fakeBroadcaster{}
	m := NewManager(fc, bc)
	defer m.StopAll()

	m.Subscribe("srv-1", "srv-1", "A", 500)
	m.Subscribe("srv-1", "srv-1", "B", 500)
	if m.PollerCount() != 2 {
		t.Errorf("expected 2 pollers, got %d", m.PollerCount())
	}
}
