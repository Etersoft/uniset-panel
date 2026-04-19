// ============================================================================
// UObject Detail Panel — per-panel state persistence (localStorage)
// ============================================================================
// Key pattern: uniset-panel:detail:<serverId>:<objectName>
// Reuses the pattern established in 58-overview-state.js: debounced
// save (300ms), flush on beforeunload, version-gated reset, silent
// fail on quota/disabled storage.

const DETAIL_STATE_VERSION = 1;
const DETAIL_STATE_DEBOUNCE_MS = 300;

function detailStateDefault() {
    return {
        v: DETAIL_STATE_VERSION,
        activeInnerTab: 'variables',
        selectedTrends: [],
        trendsWindow: 60,
        logFilter: '',
        logSize: 256,
        logPaused: false,
        logEnabled: false,
        varsCollapsed: {
            inputs: false,
            outputs: false,
            locals: true,
            fb_instances: true
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

const _detailStateSaveTimers = {};

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
const _detailFlushRegistry = {};

function registerDetailForFlush(serverId, objectName, getStateFn) {
    _detailFlushRegistry[serverId + ':' + objectName] = { getStateFn };
}

function unregisterDetailForFlush(serverId, objectName) {
    delete _detailFlushRegistry[serverId + ':' + objectName];
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', function() {
        for (const key of Object.keys(_detailFlushRegistry)) {
            const [serverId, objectName] = key.split(':');
            try {
                const state = _detailFlushRegistry[key].getStateFn();
                flushDetailStateImmediate(serverId, objectName, state);
            } catch (e) {
                console.warn('[detail-state] beforeunload flush failed:', e);
            }
        }
    });
}
