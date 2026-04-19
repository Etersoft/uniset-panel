// ============================================================================
// System Overview — FB Status panel (Task 11, Spec 3)
// ============================================================================
// Replaces the old toolbar "Objects" palette dropdown as the primary FB
// navigator. Renders a per-server list of nodes with a live name filter
// (and `:type` filter for future extension). Click = highlight the node on
// the canvas + scroll viewport to it. Double-click = emit the Spec 4
// `uniset:node-double-clicked` CustomEvent.
//
// Public API (attached to window because concat.go emits a flat script):
//   initFBStatusPanel(inst)      -- bind search input + render list
//   renderFBStatusList(inst)     -- re-render list from inst.nodeMap + state
//   scrollToOverviewNode(inst,n) -- center the canvas on a given LGraphNode
//
// Notes:
//   * inst.nodeMap is a Map<name, LGraphNode>, not a plain object.
//   * Node "type" (function block type) is not currently tracked on the
//     LGraphNode — the existing UniSetProcessNode only carries `title`.
//     The `:type` filter is wired through `n.__type` so it becomes usable
//     the moment that field is populated (e.g. in a later task) without
//     extra integration. Until then the `:xxx` query yields an empty list.
//   * Rendering goes through `_fbStatusEscape` to keep object names XSS-safe
//     (names come from the server API and are not otherwise sanitized).
// ============================================================================

function _fbStatusEscape(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function initFBStatusPanel(inst) {
    if (!inst || !inst.serverId) return;
    const container = document.getElementById('fb-status-panel-' + inst.serverId);
    if (!container) return;

    const sid = inst.serverId;
    container.innerHTML =
        '<h3>FB Status (<span class="fb-count">0</span>)</h3>' +
        '<input type="text" id="fb-status-search-' + _fbStatusEscape(sid) + '" placeholder="Filter (type :x)" class="fb-status-search"/>' +
        '<div class="fb-list"></div>';

    const searchInput = container.querySelector('.fb-status-search');
    const list = container.querySelector('.fb-list');

    // Restore persisted query (Task 5 state).
    searchInput.value = (inst.state && inst.state.searchQuery) || '';

    searchInput.addEventListener('input', function(e) {
        if (inst.state) inst.state.searchQuery = e.target.value;
        renderFBStatusList(inst);
        if (typeof saveOverviewState === 'function' && inst.state) {
            saveOverviewState(inst.serverId, inst.state);
        }
    });

    inst.fbStatus = { container: container, searchInput: searchInput, list: list };
    renderFBStatusList(inst);
}

function renderFBStatusList(inst) {
    if (!inst || !inst.fbStatus) return;
    const list = inst.fbStatus.list;
    const query = ((inst.state && inst.state.searchQuery) || '').toLowerCase();
    const typeFilter = query.charAt(0) === ':' ? query.slice(1) : null;
    const nameFilter = typeFilter === null ? query : null;

    const nodes = Array.from(inst.nodeMap.values());
    const filtered = nodes.filter(function(n) {
        if (typeFilter !== null) {
            // TODO: n.__type is not currently populated by UniSetProcessNode.
            // When it is (future task), this filter will start working.
            return String(n.__type || '').toLowerCase().indexOf(typeFilter) !== -1;
        }
        if (nameFilter) {
            return String(n.title || '').toLowerCase().indexOf(nameFilter) !== -1;
        }
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div class="fb-empty">No matches</div>';
    } else {
        list.innerHTML = filtered.map(function(n) {
            const name = _fbStatusEscape(n.title);
            const type = n.__type ? '<span class="fb-type">(' + _fbStatusEscape(n.__type) + ')</span>' : '';
            return '<div class="fb-card" data-name="' + name + '"><span class="fb-name">' + name + '</span>' + type + '</div>';
        }).join('');
    }

    Array.prototype.forEach.call(list.querySelectorAll('.fb-card'), function(card) {
        card.addEventListener('click', function() {
            const name = card.getAttribute('data-name');
            const node = inst.nodeMap.get(name);
            if (!node) return;
            if (typeof applyOverviewHighlight === 'function') applyOverviewHighlight(inst, node);
            scrollToOverviewNode(inst, node);
        });
        card.addEventListener('dblclick', function() {
            const name = card.getAttribute('data-name');
            if (typeof emitNodeDoubleClicked === 'function') {
                emitNodeDoubleClicked(inst.serverId, inst.serverName, name, null);
            }
        });
    });

    const counter = inst.fbStatus.container.querySelector('.fb-count');
    if (counter) counter.textContent = String(filtered.length);
}

function scrollToOverviewNode(inst, node) {
    if (!inst || !inst.canvas || !node || !node.pos) return;
    const ds = inst.canvas.ds;
    if (!ds) return;
    const s = ds.scale || 1;
    const canvasEl = inst.canvas.canvas;
    if (!canvasEl) return;
    ds.offset = [
        -node.pos[0] * s + canvasEl.width / 2,
        -node.pos[1] * s + canvasEl.height / 2
    ];
    inst.canvas.setDirty(true, true);
}
