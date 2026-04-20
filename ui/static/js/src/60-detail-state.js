// ============================================================================
// UObject Detail Panel — per-panel state persistence (localStorage)
// ============================================================================
// Key pattern: uniset-panel:detail:<serverId>:<objectName>
// Reuses the pattern established in 58-overview-state.js: debounced
// save (300ms), flush on beforeunload, version-gated reset, silent
// fail on quota/disabled storage.
//
// NOTE: Top-level identifiers must use `var` / `function` so indirect-eval
// in unit tests promotes them to globals. `const` / `let` at top-level
// stay in the eval scope and won't be visible to other loadSrc'd files
// or tests — same convention as other 58-*/60-* modules.

var DETAIL_STATE_VERSION = 1;
var DETAIL_STATE_DEBOUNCE_MS = 300;

function detailStateDefault() {
    return {
        v: DETAIL_STATE_VERSION,
        activeInnerTab: 'variables',
        selectedTrends: [],
        trendsWindow: 60,
        logFilter: '',
        logFilterRegex: false,
        logFilterCase: false,
        logSize: 256,
        logPaused: false,
        logEnabled: false,
        varsCollapsed: {
            inputs: false,
            outputs: false,
            locals: true
        }
    };
}

function detailStateKey(serverId, objectName) {
    return 'uniset-panel:detail:' + serverId + ':' + objectName;
}

function loadDetailState(serverId, objectName) {
    const defaults = detailStateDefault();
    try {
        const raw = localStorage.getItem(detailStateKey(serverId, objectName));
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        if (parsed.v !== DETAIL_STATE_VERSION) {
            console.warn('[detail-state] version mismatch, resetting');
            return defaults;
        }
        const merged = Object.assign({}, defaults, parsed);
        merged.varsCollapsed = Object.assign({}, defaults.varsCollapsed,
            parsed.varsCollapsed || {});
        return merged;
    } catch (e) {
        console.warn('[detail-state] load failed:', e);
        return defaults;
    }
}

var _detailStateSaveTimers = {};

function saveDetailState(serverId, objectName, state) {
    const key = detailStateKey(serverId, objectName);
    if (_detailStateSaveTimers[key]) clearTimeout(_detailStateSaveTimers[key]);
    _detailStateSaveTimers[key] = setTimeout(function() {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {
            console.warn('[detail-state] save failed:', e);
        }
        delete _detailStateSaveTimers[key];
    }, DETAIL_STATE_DEBOUNCE_MS);
}

// flushDetailStateImmediate synchronously persists state, skipping debounce.
// Used on beforeunload and critical lifecycle transitions.
function flushDetailStateImmediate(serverId, objectName, state) {
    const key = detailStateKey(serverId, objectName);
    if (_detailStateSaveTimers[key]) {
        clearTimeout(_detailStateSaveTimers[key]);
        delete _detailStateSaveTimers[key];
    }
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
        console.warn('[detail-state] flush failed:', e);
    }
}

// Global beforeunload: caller must register each live panel's
// (serverId, objectName, getStateFn) via registerDetailForFlush.
// Value shape: { serverId, objectName, getStateFn }. We store the pair
// explicitly instead of splitting the map key at flush time — serverId
// may legitimately contain ':' (e.g. "host:8080"), which would break
// key.split(':').
var _detailFlushRegistry = {};

function registerDetailForFlush(serverId, objectName, getStateFn) {
    _detailFlushRegistry[serverId + ':' + objectName] = {
        serverId: serverId,
        objectName: objectName,
        getStateFn: getStateFn
    };
}

function unregisterDetailForFlush(serverId, objectName) {
    delete _detailFlushRegistry[serverId + ':' + objectName];
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', function() {
        for (const key of Object.keys(_detailFlushRegistry)) {
            const entry = _detailFlushRegistry[key];
            try {
                const state = entry.getStateFn();
                flushDetailStateImmediate(entry.serverId, entry.objectName, state);
            } catch (e) {
                console.warn('[detail-state] beforeunload flush failed:', e);
            }
        }
    });
}
