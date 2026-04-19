// ============================================================================
// System Overview — trace SSE subscription API (used by Spec 4 detail panel)
// ============================================================================
// Pure API module. Consumers:
//   const t = window.UnisetOverview.trace.subscribe(sid, obj, 500, batch => ...);
//   window.UnisetOverview.trace.unsubscribe(t);
//   await window.UnisetOverview.trace.enable(sid, obj, 256);
//   await window.UnisetOverview.trace.disable(sid, obj);
// No DOM hooks here. Spec 4 panel drives lifecycle.
// NOTE: always call as `window.UnisetOverview.trace.<method>(...)` — the
// object-literal methods are not auto-bound; destructuring will lose `this`.

window.UnisetOverview = window.UnisetOverview || {};

window.UnisetOverview.trace = {
    _sources: {}, // token → EventSource

    subscribe: function(serverId, objectName, intervalMS, onBatch) {
        const token = serverId + ':' + objectName + ':' + Date.now() + ':' +
                      Math.random().toString(36).slice(2, 8);
        const url = '/api/trace/events' +
            '?object=' + encodeURIComponent(objectName) +
            '&server=' + encodeURIComponent(serverId) +
            '&interval=' + (intervalMS || 500);
        const es = new EventSource(url);
        es.addEventListener('trace', function(e) {
            try {
                if (typeof onBatch === 'function') onBatch(JSON.parse(e.data));
            } catch (err) {
                console.warn('[trace] parse failed:', err);
            }
        });
        es.onerror = function(err) {
            console.warn('[trace] SSE error:', err);
        };
        this._sources[token] = es;
        return token;
    },

    unsubscribe: function(token) {
        const es = this._sources[token];
        if (es) {
            es.close();
            delete this._sources[token];
        }
    },

    enable: async function(serverId, objectName, size) {
        const url = '/api/trace/servers/' + encodeURIComponent(serverId) +
                    '/objects/' + encodeURIComponent(objectName) +
                    '/enable?size=' + encodeURIComponent(String(size));
        try {
            const resp = await fetch(url, { method: 'POST' });
            let body = null;
            try { body = await resp.json(); } catch (e) { body = null; }
            return { status: resp.status, body: body };
        } catch (err) {
            console.warn('[trace] enable network error:', err);
            return { status: 0, body: null };
        }
    },

    disable: async function(serverId, objectName) {
        const url = '/api/trace/servers/' + encodeURIComponent(serverId) +
                    '/objects/' + encodeURIComponent(objectName) +
                    '/disable';
        try {
            const resp = await fetch(url, { method: 'POST' });
            let body = null;
            try { body = await resp.json(); } catch (e) { body = null; }
            return { status: resp.status, body: body };
        } catch (err) {
            console.warn('[trace] disable network error:', err);
            return { status: 0, body: null };
        }
    },

    _closeAll: function() {
        const self = this;
        Object.keys(this._sources).forEach(function(t) { self.unsubscribe(t); });
    }
};

// Close all subscriptions on page unload.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', function() {
        try { window.UnisetOverview.trace._closeAll(); } catch (e) {}
    });
}
