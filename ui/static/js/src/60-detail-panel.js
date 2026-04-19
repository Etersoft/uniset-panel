// ============================================================================
// UObject Detail Panel — entry point + tab lifecycle + inner-tab switch
// ============================================================================
// Listens for uniset:node-double-clicked from System Overview, creates
// (or activates) a per-object tab holding Variables/Trends/Message Log.
// Sub-modules (60-detail-variables.js etc.) are loaded later by concat
// and wire their render functions at call time (typeof checks).

var detailInstances = {};

function detailPanelKey(serverId, objectName) {
    return serverId + ':' + objectName;
}

function openDetailPanel(serverId, serverName, objectName) {
    const key = detailPanelKey(serverId, objectName);
    if (detailInstances[key]) {
        activateDetailTab(key);
        return detailInstances[key];
    }

    const state = (typeof loadDetailState === 'function')
        ? loadDetailState(serverId, objectName)
        : { activeInnerTab: 'variables' };

    const inst = {
        key: key,
        serverId: serverId,
        serverName: serverName,
        objectName: objectName,
        state: state,
        snapshot: null,
        snapshotTimer: null,
        selectedTrends: new Set(state.selectedTrends || []),
        trendsBuffer: {},
        logBuffer: [],
        traceToken: null
    };
    detailInstances[key] = inst;

    createDetailTabDOM(inst);
    applyInnerTab(inst, inst.state.activeInnerTab);

    if (typeof registerDetailForFlush === 'function') {
        registerDetailForFlush(serverId, objectName, function() {
            return captureState(inst);
        });
    }

    // Start snapshot poll (Variables + Trends both use it).
    if (typeof startDetailSnapshotPoll === 'function') {
        startDetailSnapshotPoll(inst);
    }

    // If persisted active tab is messagelog, subscribe immediately.
    if (inst.state.activeInnerTab === 'messagelog' &&
        typeof subscribeTraceForDetail === 'function') {
        subscribeTraceForDetail(inst);
    }

    document.dispatchEvent(new CustomEvent('uniset:detail-opened', {
        detail: { serverId, serverName, objectName, key }
    }));

    return inst;
}

function closeDetailPanel(key) {
    const inst = detailInstances[key];
    if (!inst) return;

    if (typeof stopDetailSnapshotPoll === 'function') {
        stopDetailSnapshotPoll(inst);
    }
    if (typeof unsubscribeTraceForDetail === 'function') {
        unsubscribeTraceForDetail(inst);
    }
    if (typeof flushDetailStateImmediate === 'function') {
        flushDetailStateImmediate(inst.serverId, inst.objectName, captureState(inst));
    }
    if (typeof unregisterDetailForFlush === 'function') {
        unregisterDetailForFlush(inst.serverId, inst.objectName);
    }

    removeDetailTabDOM(inst);
    delete detailInstances[key];

    document.dispatchEvent(new CustomEvent('uniset:detail-closed', {
        detail: { serverId: inst.serverId, objectName: inst.objectName, key }
    }));
}

function captureState(inst) {
    return Object.assign({}, inst.state, {
        selectedTrends: Array.from(inst.selectedTrends)
    });
}

function applyInnerTab(inst, tabName) {
    inst.state.activeInnerTab = tabName;
    if (typeof saveDetailState === 'function') {
        saveDetailState(inst.serverId, inst.objectName, captureState(inst));
    }

    const root = document.getElementById('detail-tab-' + inst.key.replace(/:/g, '_'));
    if (!root) return;
    const buttons = root.querySelectorAll('.detail-inner-tabs > button');
    buttons.forEach(function(b) {
        if (b.getAttribute('data-inner') === tabName) b.classList.add('active');
        else b.classList.remove('active');
    });
    const panels = root.querySelectorAll('[data-inner-panel]');
    panels.forEach(function(p) {
        if (p.getAttribute('data-inner-panel') === tabName) p.classList.add('active');
        else p.classList.remove('active');
    });

    if (tabName === 'messagelog' && typeof subscribeTraceForDetail === 'function') {
        subscribeTraceForDetail(inst);
    }
}

function createDetailTabDOM(inst) {
    const safeKey = inst.key.replace(/:/g, '_');
    const root = document.createElement('div');
    root.id = 'detail-tab-' + safeKey;
    root.className = 'detail-panel';
    root.dataset.key = inst.key;
    root.innerHTML =
        '<div class="detail-header">' +
            '<span class="detail-obj">' + escapeDetailText(inst.objectName) + '</span>' +
            '<span class="detail-server">Server: ' + escapeDetailText(inst.serverName) + '</span>' +
        '</div>' +
        '<div class="detail-inner-tabs">' +
            '<button data-inner="variables">Variables</button>' +
            '<button data-inner="trends">Trends</button>' +
            '<button data-inner="messagelog">Message Log</button>' +
        '</div>' +
        '<div class="detail-inner-content">' +
            '<div data-inner-panel="variables"></div>' +
            '<div data-inner-panel="trends"></div>' +
            '<div data-inner-panel="messagelog"></div>' +
        '</div>';

    root.querySelectorAll('.detail-inner-tabs > button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            applyInnerTab(inst, btn.getAttribute('data-inner'));
        });
    });

    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');
    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.dataset.name = inst.key;
    tabBtn.dataset.objectType = 'Detail';
    tabBtn.dataset.serverId = inst.serverId;
    tabBtn.innerHTML =
        '<span class="tab-type-badge">Detail</span>' +
        '<span class="tab-server-badge" data-server-id="' + escapeDetailText(inst.serverId) + '">' +
            escapeDetailText(inst.serverName) +
        '</span>' +
        escapeDetailText(inst.objectName) +
        '<span class="close">&times;</span>';
    tabBtn.addEventListener('click', function(e) {
        if (e.target.classList.contains('close')) {
            closeDetailPanel(inst.key);
        } else if (typeof activateTab === 'function') {
            activateTab(inst.key);
        }
    });
    tabsHeader.appendChild(tabBtn);

    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panel.dataset.name = inst.key;
    panel.dataset.objectType = 'Detail';
    panel.dataset.serverId = inst.serverId;
    panel.appendChild(root);
    tabsContent.appendChild(panel);

    if (typeof state !== 'undefined' && state && state.tabs && typeof state.tabs.set === 'function') {
        state.tabs.set(inst.key, {
            charts: new Map(),
            variables: {},
            objectType: 'Detail',
            renderer: null,
            updateInterval: null,
            displayName: inst.objectName,
            serverId: inst.serverId,
            serverName: inst.serverName
        });
    }

    if (typeof activateTab === 'function') {
        activateTab(inst.key);
    }
}

function removeDetailTabDOM(inst) {
    const safeKey = inst.key.replace(/:/g, '_');
    const root = document.getElementById('detail-tab-' + safeKey);
    const panel = root ? root.closest('.tab-panel') : null;

    if (panel && panel.parentNode) {
        panel.parentNode.removeChild(panel);
    } else if (root && root.parentNode) {
        root.parentNode.removeChild(root);
    }

    const tabBtn = document.querySelector('.tab-btn[data-name="' + cssEscapeTabKey(inst.key) + '"]');
    if (tabBtn && tabBtn.parentNode) tabBtn.parentNode.removeChild(tabBtn);

    if (typeof state !== 'undefined' && state && state.tabs && typeof state.tabs.delete === 'function') {
        state.tabs.delete(inst.key);
        if (state.tabs.size === 0) {
            const tabsContent = document.getElementById('tabs-content');
            if (tabsContent && !tabsContent.querySelector('.tab-panel')) {
                tabsContent.innerHTML = '<div class="placeholder">Select an object from the list on the left</div>';
            }
            if (state.activeTab === inst.key) state.activeTab = null;
        } else if (state.activeTab === inst.key) {
            const next = state.tabs.keys().next().value;
            if (next && typeof activateTab === 'function') activateTab(next);
        }
    }
}

function activateDetailTab(key) {
    if (typeof activateTab === 'function' &&
        typeof state !== 'undefined' && state && state.tabs && state.tabs.has && state.tabs.has(key)) {
        activateTab(key);
        return;
    }
    const safeKey = key.replace(/:/g, '_');
    const el = document.getElementById('detail-tab-' + safeKey);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView();
}

function cssEscapeTabKey(key) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(key);
    return String(key).replace(/"/g, '\\"');
}

function escapeDetailText(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
                 '"': '&quot;', "'": '&#39;' }[c];
    });
}

// ---------------------------------------------------------------------------
// Entry listeners
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('uniset:node-double-clicked', function(e) {
        const d = e.detail || {};
        if (!d.serverId || !d.objectName) return;
        openDetailPanel(d.serverId, d.serverName || d.serverId, d.objectName);
    });

    // When the System Overview is closed for a given server, tear down
    // any detail panels that belong to that server (they can't poll or
    // navigate back without the schema).
    document.addEventListener('uniset:schema-closed', function(e) {
        const serverId = e.detail && e.detail.serverId;
        if (!serverId) return;
        for (const key of Object.keys(detailInstances)) {
            if (detailInstances[key].serverId === serverId) {
                closeDetailPanel(key);
            }
        }
    });
}
