package api

import (
	"fmt"
	"net/http"
	"time"
)

// Trace interval bounds (milliseconds).
const (
	traceDefaultIntervalMS int64 = 500
	traceMinIntervalMS     int64 = 100
	traceMaxIntervalMS     int64 = 10000
)

// HandleTraceEvents streams trace SSE for one (server, object).
// GET /api/trace/events?object=X&server=S&interval=N
//
// interval is in milliseconds; out-of-range values are clamped to
// [traceMinIntervalMS, traceMaxIntervalMS]. The default (and the value used
// for non-positive / unparsable input) is traceDefaultIntervalMS.
//
// This endpoint registers a trace-only SSE client (so regular object_data /
// sensor_batch events are NOT forwarded to it) and a trace manager
// subscription. Both are released when the HTTP context is cancelled.
func (h *Handlers) HandleTraceEvents(w http.ResponseWriter, r *http.Request) {
	object := r.URL.Query().Get("object")
	server := r.URL.Query().Get("server")
	if object == "" || server == "" {
		h.writeError(w, http.StatusBadRequest, "object and server query params required")
		return
	}

	interval := traceDefaultIntervalMS
	if s := r.URL.Query().Get("interval"); s != "" {
		var n int64
		if _, err := fmt.Sscanf(s, "%d", &n); err == nil && n > 0 {
			interval = n
		}
	}
	if interval < traceMinIntervalMS {
		interval = traceMinIntervalMS
	}
	if interval > traceMaxIntervalMS {
		interval = traceMaxIntervalMS
	}

	if h.traceMgr == nil {
		h.writeError(w, http.StatusServiceUnavailable, "trace manager not configured")
		return
	}
	if h.sseHub == nil {
		h.writeError(w, http.StatusServiceUnavailable, "sse hub not configured")
		return
	}

	// Check SSE support before registering anything, so we don't leak a
	// subscription / hub client on error.
	flusher, ok := w.(http.Flusher)
	if !ok {
		h.writeError(w, http.StatusInternalServerError, "SSE not supported")
		return
	}

	// Register trace-only SSE client + register subscriber with trace manager.
	// Resolver enrichment (serverName) is out of scope for Spec 2; reuse
	// serverID as serverName so the manager still receives a stable identity.
	serverName := server
	token := h.traceMgr.Subscribe(server, serverName, object, interval)
	defer h.traceMgr.Unsubscribe(token)

	client := h.sseHub.AddTraceClient(object)
	defer h.sseHub.RemoveClient(client)

	// SSE response headers — mirror HandleSSE.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	// Heartbeat to keep proxies from dropping the connection.
	heartbeat := time.NewTicker(sseHeartbeatInterval)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-client.done:
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case event, open := <-client.events:
			if !open {
				return
			}
			h.sendSSEEvent(w, event)
			flusher.Flush()
		}
	}
}
