// ============================================================================
// System Overview — hotkeys + help overlay (Spec 3 Task 7)
// ============================================================================
// Public API:
//   attachOverviewHotkeys(serverId) -> handler  (pass to removeEventListener)
//   fitOverviewInstance(inst), resetOverviewZoom(inst), stepOverviewZoom(inst, factor)
//   scrollOverviewToOrigin(inst)
//   toggleOverviewValues(inst), toggleOverviewWires(inst), toggleOverviewMinimap(inst)
//   toggleOverviewHelp()
//
// This module wires keyboard shortcuts when an overview tab is opened. The
// handler is returned so `closeOverviewTab` can detach it via
// removeEventListener. Focus in INPUT/TEXTAREA/contentEditable is respected
// (hotkeys are ignored there).
//
// Value/Wires toggles add body classes `overview-no-values` / `overview-no-wires`
// so CSS (or future render-paths in Task 9 / Task 13) can suppress rendering.
// Minimap toggle only updates state — actual show/hide lives in Task 8.
// Clear-highlight delegates to clearOverviewHighlight (Task 10) if defined.
// ============================================================================

const OVERVIEW_SCALE_MIN = 0.1;
const OVERVIEW_SCALE_MAX = 5;

const OVERVIEW_HOTKEYS = {
    'f': 'fit',
    'F': 'fit',
    '0': 'reset-zoom',
    '+': 'zoom-in',
    '=': 'zoom-in',
    '-': 'zoom-out',
    'Home': 'scroll-origin',
    'v': 'toggle-values',
    'V': 'toggle-values',
    'w': 'toggle-wires',
    'W': 'toggle-wires',
    'm': 'toggle-minimap',
    'M': 'toggle-minimap',
    '/': 'focus-search',
    'Escape': 'clear-highlight',
    '?': 'toggle-help',
};

// ----------------------------------------------------------------------------
// Zoom / fit / scroll helpers
// ----------------------------------------------------------------------------

// Wrapper: existing fitOverviewToScreen has signature (lgCanvas, graph).
// Accept an overview instance for uniform call-sites.
function fitOverviewInstance(inst) {
    if (!inst || !inst.canvas || !inst.graph) return;
    if (typeof fitOverviewToScreen === 'function') {
        fitOverviewToScreen(inst.canvas, inst.graph);
    }
    applyLOD(inst);
}

function resetOverviewZoom(inst) {
    if (!inst || !inst.canvas || !inst.canvas.ds) return;
    inst.canvas.ds.scale = 1;
    inst.canvas.setDirty(true, true);
    applyLOD(inst);
}

function stepOverviewZoom(inst, factor) {
    if (!inst || !inst.canvas || !inst.canvas.ds) return;
    const cur = inst.canvas.ds.scale || 1;
    const next = Math.max(OVERVIEW_SCALE_MIN, Math.min(OVERVIEW_SCALE_MAX, cur * factor));
    inst.canvas.ds.scale = next;
    inst.canvas.setDirty(true, true);
    applyLOD(inst);
}

// ----------------------------------------------------------------------------
// Ctrl+wheel zoom-around-cursor + LOD (Spec 3 Task 9)
// ----------------------------------------------------------------------------
// attachOverviewWheelZoom(inst) -> handler
//   Wheel with Ctrl held zooms the main overview canvas around the cursor
//   (world-coords under cursor stay put). Returns the handler so
//   closeOverviewTab can detach via removeEventListener.
//
// applyLOD(inst)
//   Toggles body classes `overview-lod-low` (<0.5 scale) and
//   `overview-lod-min` (<0.25 scale). The `overview-lod-min` class is read
//   by UniSetProcessNode.onDrawForeground to skip detail rendering when
//   zoomed far out (perf + visual clarity). CSS selectors on these classes
//   hide DOM-based overlays if/when they exist.
// ----------------------------------------------------------------------------

function applyLOD(inst) {
    const s = (inst && inst.canvas && inst.canvas.ds && inst.canvas.ds.scale) || 1;
    document.body.classList.toggle('overview-lod-low', s < 0.5);
    document.body.classList.toggle('overview-lod-min', s < 0.25);
}

function attachOverviewWheelZoom(inst) {
    if (!inst || !inst.canvas || !inst.canvas.canvas) return null;
    const dom = inst.canvas.canvas;
    const handler = function(e) {
        // Intercept before LiteGraph's native wheel-zoom handler fires.
        e.preventDefault();
        e.stopImmediatePropagation();

        // LiteGraph applies the transform as `ctx.scale(s,s).translate(off)`,
        // so screen = s * (world + off) and therefore world = screen/s - off.
        // (See LGraphCanvas.convertEventToCanvasOffset in litegraph.js.)
        const rect = dom.getBoundingClientRect();
        // Map from CSS pixels (clientX/Y) to canvas-internal pixels, which is
        // what ds.offset is measured in. rect.width may differ from
        // canvas.width on HiDPI displays or when CSS scales the element.
        const pxRatioX = dom.width / rect.width || 1;
        const pxRatioY = dom.height / rect.height || 1;
        const cx = (e.clientX - rect.left) * pxRatioX;
        const cy = (e.clientY - rect.top) * pxRatioY;
        const s = inst.canvas.ds.scale || 1;
        const off = inst.canvas.ds.offset || [0, 0];

        if (e.ctrlKey) {
            // Ctrl+wheel: zoom around the cursor. World coords under the
            // cursor must be invariant under the scale change:
            //   world = cx/s - off   ==>   new_off = cx/newS - world
            const wx = cx / s - off[0];
            const wy = cy / s - off[1];
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newS = Math.max(OVERVIEW_SCALE_MIN, Math.min(OVERVIEW_SCALE_MAX, s * factor));
            inst.canvas.ds.scale = newS;
            inst.canvas.ds.offset = [cx / newS - wx, cy / newS - wy];
            applyLOD(inst);
        } else {
            // Plain wheel: pan. Vertical by default; Shift — horizontal.
            // offset is world-space, so delta (screen px) is divided by scale.
            const delta = e.deltaY / s;
            if (e.shiftKey) {
                inst.canvas.ds.offset[0] -= delta;
            } else {
                inst.canvas.ds.offset[1] -= delta;
            }
        }
        inst.canvas.setDirty(true, true);

        if (inst.state) {
            inst.state.zoom = inst.canvas.ds.scale;
            inst.state.offsetX = inst.canvas.ds.offset[0];
            inst.state.offsetY = inst.canvas.ds.offset[1];
            if (typeof saveOverviewState === 'function' && inst.serverId) {
                saveOverviewState(inst.serverId, inst.state);
            }
        }
    };
    // `capture: true` — run before LiteGraph's own wheel handler so our
    // preventDefault + stopImmediatePropagation actually suppress it.
    dom.addEventListener('wheel', handler, { passive: false, capture: true });
    return handler;
}

function scrollOverviewToOrigin(inst) {
    if (!inst || !inst.canvas || !inst.canvas.ds) return;
    // LiteGraph pan state is canvas.ds.offset — a 2-element array.
    if (Array.isArray(inst.canvas.ds.offset)) {
        inst.canvas.ds.offset[0] = 0;
        inst.canvas.ds.offset[1] = 0;
    } else {
        inst.canvas.ds.offset = [0, 0];
    }
    inst.canvas.setDirty(true, true);
}

// ----------------------------------------------------------------------------
// Toggle helpers (values / wires / minimap)
// ----------------------------------------------------------------------------

function persistOverviewInstState(inst) {
    if (!inst || !inst.serverId || !inst.state) return;
    if (typeof saveOverviewState === 'function') {
        saveOverviewState(inst.serverId, inst.state);
    }
}

function toggleOverviewValues(inst) {
    if (!inst || !inst.state) return;
    if (!inst.state.toggles) inst.state.toggles = {};
    inst.state.toggles.values = !inst.state.toggles.values;
    document.body.classList.toggle('overview-no-values', !inst.state.toggles.values);
    if (inst.canvas) inst.canvas.setDirty(true, true);
    persistOverviewInstState(inst);
}

function toggleOverviewWires(inst) {
    if (!inst || !inst.state) return;
    if (!inst.state.toggles) inst.state.toggles = {};
    inst.state.toggles.wires = !inst.state.toggles.wires;
    document.body.classList.toggle('overview-no-wires', !inst.state.toggles.wires);
    if (inst.canvas) inst.canvas.setDirty(true, true);
    persistOverviewInstState(inst);
}

function toggleOverviewMinimap(inst) {
    if (!inst || !inst.state) return;
    if (!inst.state.toggles) inst.state.toggles = {};
    inst.state.toggles.minimap = !inst.state.toggles.minimap;
    // Apply visibility via body class; container lives in overview tab markup
    // and CSS rule `body.overview-minimap-hidden .overview-minimap { display: none }`
    // hides it. When minimap=false (default), hidden class is applied.
    document.body.classList.toggle('overview-minimap-hidden', !inst.state.toggles.minimap);
    persistOverviewInstState(inst);
}

// ----------------------------------------------------------------------------
// Help overlay
// ----------------------------------------------------------------------------

function toggleOverviewHelp() {
    const overlay = document.getElementById('overview-help-overlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden');
}

function attachOverviewHelpCloseOnce() {
    const btn = document.getElementById('overview-help-close');
    if (!btn || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
        const overlay = document.getElementById('overview-help-overlay');
        if (overlay) overlay.classList.add('hidden');
    });
}

// ----------------------------------------------------------------------------
// Focus-search: delegate to FB-status search input (Task 11). Defensive — if
// the input is not yet present (Task 11 not implemented), silently no-op.
// ----------------------------------------------------------------------------

function focusOverviewSearch(inst) {
    if (!inst || !inst.serverId) return;
    const sel = `#fb-status-search-${inst.serverId}`;
    const el = document.querySelector(sel);
    if (el && typeof el.focus === 'function') el.focus();
}

// ----------------------------------------------------------------------------
// Main: attachOverviewHotkeys
// ----------------------------------------------------------------------------

function attachOverviewHotkeys(serverId) {
    const handler = function(e) {
        // Ignore when focus is in editable form control.
        const t = e.target;
        if (t) {
            const tag = (t.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
        }

        const action = OVERVIEW_HOTKEYS[e.key];
        if (!action) return;

        // Only preventDefault once we know we handle this key.
        e.preventDefault();

        const inst = (window.overviewInstances || {})[serverId];
        if (!inst) return;

        switch (action) {
            case 'fit':
                fitOverviewInstance(inst);
                break;
            case 'reset-zoom':
                resetOverviewZoom(inst);
                break;
            case 'zoom-in':
                stepOverviewZoom(inst, 1.2);
                break;
            case 'zoom-out':
                stepOverviewZoom(inst, 1 / 1.2);
                break;
            case 'scroll-origin':
                scrollOverviewToOrigin(inst);
                break;
            case 'toggle-values':
                toggleOverviewValues(inst);
                break;
            case 'toggle-wires':
                toggleOverviewWires(inst);
                break;
            case 'toggle-minimap':
                toggleOverviewMinimap(inst);
                break;
            case 'focus-search':
                focusOverviewSearch(inst);
                break;
            case 'clear-highlight': {
                if (typeof clearOverviewHighlight === 'function') {
                    clearOverviewHighlight(inst);
                }
                // Also close help overlay if open.
                const helpOverlay = document.getElementById('overview-help-overlay');
                if (helpOverlay && !helpOverlay.classList.contains('hidden')) {
                    helpOverlay.classList.add('hidden');
                }
                break;
            }
            case 'toggle-help':
                toggleOverviewHelp();
                attachOverviewHelpCloseOnce();
                break;
        }
    };

    document.addEventListener('keydown', handler);
    // Make sure the close button gets wired as soon as hotkeys are active —
    // overlay HTML is present from page load, just wire once.
    attachOverviewHelpCloseOnce();
    return handler;
}

// ============================================================================
// Floating minimap (Spec 3 Task 8)
// ============================================================================
// initOverviewMinimap(inst)     — mount canvas into #overview-minimap-<serverId>,
//                                 start rAF redraw loop, wire mousedown for pan.
// drawOverviewMinimap(inst)     — one frame: clear, nodes as rects, viewport box.
// minimapPan(inst, evt)         — centre main canvas on minimap coords; drag-pan
//                                 while mouse held. Listeners removed on mouseup.
// Cleanup: `closeOverviewTab` sets `inst.minimap = null`; the rAF callback
// then short-circuits on next tick, so no explicit cancelAnimationFrame is
// needed.
// ============================================================================

function initOverviewMinimap(inst) {
    if (!inst || !inst.serverId) return;
    const container = document.getElementById('overview-minimap-' + inst.serverId);
    if (!container) return;
    // Guard against double-init (hot-reload, re-entry).
    if (inst.minimap) return;

    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    container.appendChild(canvas);
    inst.minimap = { canvas, ctx: canvas.getContext('2d') };

    const redrawLoop = () => {
        // `inst.minimap = null` in closeOverviewTab stops the loop on next tick.
        if (!inst.minimap) return;
        drawOverviewMinimap(inst);
        requestAnimationFrame(redrawLoop);
    };
    redrawLoop();

    canvas.addEventListener('mousedown', (e) => minimapPan(inst, e));
}

// ============================================================================
// View dropdown + SVG export (Spec 3 Task 14)
// ============================================================================
// initViewDropdown(inst)
//   Wires the View ▾ button and its checkbox menu (Values/Wires/Minimap) to
//   the existing toggle* helpers. Avoids the double-flip bug: checkbox
//   `change` events only call toggle* when desired != current state, and the
//   menu is re-synced from state on each open so hotkey-driven changes (V/W/M)
//   are reflected. Outside-click dismisses the menu.
//
// exportOverviewSVG(inst)
//   Builds a static SVG snapshot of the current graph — bbox of all nodes with
//   20px padding, dark background, cubic-bezier edges from inst.data.edges,
//   nodes as rects + title text (XML-escaped). Downloads via Blob + <a>.
// ============================================================================

function _overviewXmlEscape(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
}

function initViewDropdown(inst) {
    if (!inst || !inst.serverId) return;
    const btn = document.getElementById('overview-view-btn-' + inst.serverId);
    const menu = document.getElementById('overview-view-menu-' + inst.serverId);
    if (!btn || !menu) return;

    // Sync checkboxes from current inst.state.toggles. Called on open so that
    // hotkey-driven toggles (V/W/M) are reflected when the user reopens menu.
    function syncCheckboxes() {
        menu.querySelectorAll('[data-toggle]').forEach(function(cb) {
            const k = cb.getAttribute('data-toggle');
            cb.checked = !!(inst.state && inst.state.toggles && inst.state.toggles[k]);
        });
    }

    syncCheckboxes();

    // Checkbox change: only invoke toggle* if the checkbox's desired value
    // differs from the current state. toggle* helpers flip the state, so a
    // naive assign-then-toggle would double-flip (net zero) — see Task 14 spec.
    menu.querySelectorAll('[data-toggle]').forEach(function(cb) {
        const key = cb.getAttribute('data-toggle');
        cb.addEventListener('change', function() {
            const desired = cb.checked;
            const current = !!(inst.state && inst.state.toggles && inst.state.toggles[key]);
            if (desired === current) return;
            if (key === 'values' && typeof toggleOverviewValues === 'function') toggleOverviewValues(inst);
            else if (key === 'wires' && typeof toggleOverviewWires === 'function') toggleOverviewWires(inst);
            else if (key === 'minimap' && typeof toggleOverviewMinimap === 'function') toggleOverviewMinimap(inst);
        });
    });

    btn.addEventListener('click', function() {
        const willOpen = menu.classList.contains('hidden');
        if (willOpen) syncCheckboxes();
        menu.classList.toggle('hidden');
    });

    document.addEventListener('click', function(e) {
        if (!btn.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    const svgBtn = document.getElementById('overview-svg-export-' + inst.serverId);
    if (svgBtn) {
        svgBtn.addEventListener('click', function() { exportOverviewSVG(inst); });
    }
}

function exportOverviewSVG(inst) {
    if (!inst || !inst.nodeMap) return;
    const nodes = Array.from(inst.nodeMap.values());
    if (nodes.length === 0) return;

    // Compute bounding box of all node rectangles.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n || !n.pos || !n.size) continue;
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
        maxX = Math.max(maxX, n.pos[0] + n.size[0]);
        maxY = Math.max(maxY, n.pos[1] + n.size[1]);
    }
    const pad = 20;
    const w = maxX - minX + 2 * pad;
    const h = maxY - minY + 2 * pad;

    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">');
    parts.push('<rect width="100%" height="100%" fill="#1a1a1a"/>');

    // Edges as cubic Bezier paths between output-right and input-left.
    const edges = (inst.data && inst.data.edges) || [];
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const from = inst.nodeMap.get(e.fromNode);
        const to = inst.nodeMap.get(e.toNode);
        if (!from || !to) continue;
        const fx = from.pos[0] + from.size[0] - minX + pad;
        const fy = from.pos[1] + from.size[1] / 2 - minY + pad;
        const tx = to.pos[0] - minX + pad;
        const ty = to.pos[1] + to.size[1] / 2 - minY + pad;
        parts.push('<path d="M' + fx + ',' + fy + ' C' + (fx + 40) + ',' + fy + ' ' + (tx - 40) + ',' + ty + ' ' + tx + ',' + ty + '" stroke="#555" fill="none"/>');
    }

    // Nodes as rect + title text.
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const x = n.pos[0] - minX + pad;
        const y = n.pos[1] - minY + pad;
        parts.push('<g>');
        parts.push('<rect x="' + x + '" y="' + y + '" width="' + n.size[0] + '" height="' + n.size[1] + '" fill="#131320" stroke="#1c2836"/>');
        parts.push('<text x="' + (x + 10) + '" y="' + (y + 16) + '" fill="#fff" font-family="sans-serif" font-size="12">' + _overviewXmlEscape(n.title || '') + '</text>');
        parts.push('</g>');
    }

    parts.push('</svg>');
    const svg = parts.join('');

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'overview-' + (inst.serverId || 'export') + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 100);
}

function drawOverviewMinimap(inst) {
    if (!inst || !inst.minimap || !inst.canvas || !inst.nodeMap) return;
    const { canvas, ctx } = inst.minimap;
    // nodeMap is a Map<string, LGraphNode> (set by buildOverviewGraph).
    const nodes = Array.from(inst.nodeMap.values());

    // Always clear first so the minimap doesn't show stale content when graph
    // becomes empty mid-session.
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (nodes.length === 0) return;

    // Compute bounding box of all node rectangles.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        if (!n || !n.pos || !n.size) continue;
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
        maxX = Math.max(maxX, n.pos[0] + n.size[0]);
        maxY = Math.max(maxY, n.pos[1] + n.size[1]);
    }
    const w = maxX - minX, h = maxY - minY;
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;

    // Fit bbox into canvas with 10% padding, preserving aspect ratio.
    const scale = Math.min(canvas.width / w, canvas.height / h) * 0.9;
    const offX = (canvas.width - w * scale) / 2 - minX * scale;
    const offY = (canvas.height - h * scale) / 2 - minY * scale;

    // Nodes as filled rects.
    ctx.fillStyle = '#5a7b9a';
    for (const n of nodes) {
        if (!n || !n.pos || !n.size) continue;
        ctx.fillRect(
            n.pos[0] * scale + offX,
            n.pos[1] * scale + offY,
            n.size[0] * scale,
            n.size[1] * scale
        );
    }

    // Viewport rectangle: main canvas maps screen_x -> graph_x by
    //   screen_x = (graph_x + offset_x) * scale
    // => visible graph-space range: graph_x in [-offset_x, -offset_x + canvasW/scale]
    const mainCanvasEl = inst.canvas.canvas;
    if (mainCanvasEl && inst.canvas.ds) {
        const canvasW = mainCanvasEl.width;
        const canvasH = mainCanvasEl.height;
        const s = inst.canvas.ds.scale || 1;
        const off = inst.canvas.ds.offset || [0, 0];
        const vx = (-off[0]) * scale + offX;
        const vy = (-off[1]) * scale + offY;
        const vw = (canvasW / s) * scale;
        const vh = (canvasH / s) * scale;
        ctx.strokeStyle = '#f0b040';
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, vw, vh);
    }

    // Remember latest transform for click-to-pan coordinate inversion.
    inst.minimap.scale = scale;
    inst.minimap.offX = offX;
    inst.minimap.offY = offY;
}

function minimapPan(inst, evt) {
    if (!inst || !inst.minimap || !inst.canvas) return;
    const mini = inst.minimap;
    const canvas = mini.canvas;

    const onMove = (e) => {
        const m = inst.minimap;
        if (!m || typeof m.scale !== 'number') return;
        // Recompute rect on every move so it stays accurate if the window was
        // resized during the drag.
        const rect = canvas.getBoundingClientRect();
        // Translate minimap-local mouse coords -> graph-space coords
        // (inverse of drawOverviewMinimap: graph_x * scale + offX = mini_x).
        const x = (e.clientX - rect.left - m.offX) / m.scale;
        const y = (e.clientY - rect.top - m.offY) / m.scale;
        const mainCanvasEl = inst.canvas.canvas;
        if (!mainCanvasEl || !inst.canvas.ds) return;
        const s = inst.canvas.ds.scale || 1;
        // LiteGraph transform: screen_x = (graph_x + offset_x) * scale.
        // Centre clicked graph coord (x, y) in main canvas -> solve for offset.
        inst.canvas.ds.offset = [
            mainCanvasEl.width / (2 * s) - x,
            mainCanvasEl.height / (2 * s) - y
        ];
        inst.canvas.setDirty(true, true);
    };

    // Immediate pan on mousedown.
    onMove(evt);

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}
