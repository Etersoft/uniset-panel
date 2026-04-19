// ============================================================================
// System Overview — persistent view state (localStorage)
// ============================================================================
// Key:  uniset-panel:overview:<serverId>
// Schema: {v, zoom, offsetX, offsetY, toggles, searchQuery, manualPositions}
// Public API:
//   overviewStateDefault() -> default state object
//   loadOverviewState(serverId) -> restored state or default
//   saveOverviewState(serverId, state) -- debounced (300ms) save
//   flushOverviewState(serverId, state) -- immediate save (used on beforeunload)
// Versioning: bump OVERVIEW_STATE_VERSION when schema changes; old states reset.
// ============================================================================

const OVERVIEW_STATE_VERSION = 1;
const OVERVIEW_STATE_DEBOUNCE_MS = 300;

function overviewStateKey(serverId) {
    return `uniset-panel:overview:${serverId}`;
}

function overviewStateDefault() {
    return {
        v: OVERVIEW_STATE_VERSION,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        toggles: { wires: true, values: true, minimap: false, groupBackgrounds: false },
        searchQuery: '',
        manualPositions: {},
    };
}

function loadOverviewState(serverId) {
    try {
        const raw = localStorage.getItem(overviewStateKey(serverId));
        if (!raw) return overviewStateDefault();
        const parsed = JSON.parse(raw);
        if (parsed.v !== OVERVIEW_STATE_VERSION) {
            console.warn('[overview-state] state version mismatch, resetting');
            return overviewStateDefault();
        }
        // Shallow merge for top-level fields, deep-merge `toggles` so a
        // persisted partial toggles object (e.g. {values:false}) does not wipe
        // newer default toggle keys (wires/minimap/groupBackgrounds/...).
        const defaults = overviewStateDefault();
        const merged = Object.assign({}, defaults, parsed);
        merged.toggles = Object.assign({}, defaults.toggles, parsed.toggles || {});
        return merged;
    } catch (e) {
        console.warn('[overview-state] load failed:', e);
        return overviewStateDefault();
    }
}

const _overviewStateSaveTimers = {};
function saveOverviewState(serverId, state) {
    clearTimeout(_overviewStateSaveTimers[serverId]);
    _overviewStateSaveTimers[serverId] = setTimeout(() => {
        try {
            localStorage.setItem(overviewStateKey(serverId), JSON.stringify(state));
        } catch (e) {
            console.warn('[overview-state] save failed:', e);
        }
    }, OVERVIEW_STATE_DEBOUNCE_MS);
}

function flushOverviewState(serverId, state) {
    clearTimeout(_overviewStateSaveTimers[serverId]);
    delete _overviewStateSaveTimers[serverId];
    try {
        localStorage.setItem(overviewStateKey(serverId), JSON.stringify(state));
    } catch (e) {
        console.warn('[overview-state] flush failed:', e);
    }
}

// Attach global beforeunload flusher at load time.
// Reads window.overviewInstances (defined in 58-overview-core.js).
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        const instances = window.overviewInstances || {};
        for (const sid of Object.keys(instances)) {
            const inst = instances[sid];
            if (inst && inst.state) flushOverviewState(sid, inst.state);
        }
    });
}
