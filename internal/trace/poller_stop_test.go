package trace

import (
	"sync"
	"testing"
)

func TestTracePoller_StopIdempotent(t *testing.T) {
	fc := &fakeClient{}
	bc := &fakeBroadcaster{}
	p := newPoller("srv", "srv", "X", fc, bc)
	// Call Stop multiple times from multiple goroutines — must not panic.
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.Stop()
		}()
	}
	wg.Wait()
	// Single Stop path also verified (no panic on second call).
	p.Stop()
}
