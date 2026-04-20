// ============================================================================
// UObject Detail Panel — Variables tab (reads flat snapshot from panel adapter)
// ============================================================================
// NOTE: Top-level identifiers must use `var` / `function` so indirect-eval in
// unit tests promotes them to globals. `const` / `let` at top-level stay in
// the eval scope and won't be visible to other loadSrc'd files or tests.

var DETAIL_SNAPSHOT_POLL_MS = 500;

function buildVariablesSections(snap) {
    const out = {
        inputs:  (snap && snap.inputs)  || [],
        outputs: (snap && snap.outputs) || [],
        locals: []
    };
    const vars = (snap && snap.variables) || {};
    for (const name of Object.keys(vars).sort()) {
        out.locals.push({ name: name, value: vars[name] });
    }
    return out;
}

// Render-strategy note: a full innerHTML replace would be triggered every
// 500 ms by the snapshot poll, which destroys the chart-toggle checkboxes
// and their click handlers mid-interaction. We rebuild the skeleton only
// when the set of rows or the collapsed state changes; otherwise we just
// update value cells in place (same pattern as IONC/Modbus renderers via
// _animateCellValue).

var DETAIL_VAR_GROUP_DEFS = [
    { key: 'inputs', label: 'Inputs (io.in)' },
    { key: 'outputs', label: 'Outputs (io.out)' },
    { key: 'locals', label: 'Locals' }
];

function renderDetailVariables(inst) {
    const root = document.querySelector('#detail-tab-' +
        inst.key.replace(/:/g, '_') + ' [data-inner-panel="variables"]');
    if (!root) return;

    if (!inst.snapshot) {
        root.innerHTML = '<div class="detail-placeholder">Loading snapshot...</div>';
        root.dataset.built = '';
        return;
    }

    const sections = buildVariablesSections(inst.snapshot);
    const collapsed = (inst.state && inst.state.varsCollapsed) || {};

    // Structure key = section collapsed state + list of variable names per
    // section. Any change triggers a full rebuild; identical structure →
    // fast path that only updates values.
    const structureKey = JSON.stringify({
        inputs:  { c: !!collapsed.inputs,  n: sections.inputs.map(x => x.name) },
        outputs: { c: !!collapsed.outputs, n: sections.outputs.map(x => x.name) },
        locals:  { c: !!collapsed.locals,  n: sections.locals.map(x => x.name) }
    });

    if (root.dataset.built === '1' && root.dataset.structureKey === structureKey) {
        updateDetailVariableCells(inst, root, sections);
        inst._prevVars = collectPrevVars(sections);
        return;
    }

    root.innerHTML = buildDetailVariablesHTML(inst, sections, collapsed);
    root.dataset.built = '1';
    root.dataset.structureKey = structureKey;
    wireDetailVariableHandlers(inst, root);
    inst._prevVars = collectPrevVars(sections);
}

function buildDetailVariablesHTML(inst, sections, collapsed) {
    let html = '';
    for (const gd of DETAIL_VAR_GROUP_DEFS) {
        const items = sections[gd.key];
        const isCollapsed = !!collapsed[gd.key];
        html += '<section data-section="' + gd.key + '">';
        html += '<div class="detail-var-section-header" data-toggle="' + gd.key + '">';
        html += '<span class="arrow' + (isCollapsed ? ' collapsed' : '') + '">▼</span>';
        html += escapeDetailText(gd.label);
        html += '<span class="count">' + items.length + '</span></div>';

        if (!isCollapsed) {
            html += '<table class="detail-var-table"><thead><tr>';
            html += '<th class="col-chart"></th><th>Name</th><th>Value</th><th>Type</th></tr></thead><tbody>';
            for (const it of items) {
                const sensorId = (gd.key === 'inputs' || gd.key === 'outputs') ? it.id : null;
                const rowClasses = (gd.key === 'inputs' || gd.key === 'outputs') ? 'forcible' : '';
                const safeVar = escapeDetailText(it.name);
                const chartId = 'detail-chart-' + inst.serverId + '-' + safeVar;
                const onChart = inst.selectedTrends && inst.selectedTrends.has(it.name);
                html += '<tr data-var="' + safeVar + '"';
                if (sensorId != null) html += ' data-sensor-id="' + sensorId + '"';
                html += ' data-section="' + gd.key + '" class="' + rowClasses + '">';
                html += '<td class="col-chart">' +
                        '<span class="chart-toggle">' +
                            '<input type="checkbox" class="chart-toggle-input" id="' + chartId + '" data-var="' + safeVar + '"' + (onChart ? ' checked' : '') + '>' +
                            '<label class="chart-toggle-label" for="' + chartId + '" title="Add to Trends">' +
                                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                    '<path d="M3 3v18h18"/>' +
                                    '<path d="M18 9l-5 5-4-4-3 3"/>' +
                                '</svg>' +
                            '</label>' +
                        '</span>' +
                        '</td>';
                html += '<td>' + safeVar + '</td>';
                html += '<td class="value-cell">' + formatVarValue(it.value) + '</td>';
                html += '<td>' + detectVarType(it.value) + '</td></tr>';
            }
            html += '</tbody></table>';
        }
        html += '</section>';
    }
    return html;
}

function updateDetailVariableCells(inst, root, sections) {
    const prev = inst._prevVars || {};
    const groups = [sections.inputs, sections.outputs, sections.locals];
    for (const group of groups) {
        for (const it of group) {
            const safeVar = escapeDetailText(it.name);
            const tr = root.querySelector('tr[data-var="' + cssEscapeVar(safeVar) + '"]');
            if (!tr) continue;
            const cell = tr.querySelector('.value-cell');
            if (cell) {
                const newText = formatVarValue(it.value);
                if (cell.textContent !== newText) {
                    cell.textContent = newText;
                    cell.classList.remove('value-changed');
                    void cell.offsetWidth;
                    cell.classList.add('value-changed');
                }
            }
            // Keep the chart-toggle checkbox in sync with selectedTrends —
            // user might have toggled the variable from the Trends tab.
            const cb = tr.querySelector('.chart-toggle-input');
            if (cb) {
                const want = !!(inst.selectedTrends && inst.selectedTrends.has(it.name));
                if (cb.checked !== want) cb.checked = want;
            }
        }
    }
}

function cssEscapeVar(s) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    return String(s).replace(/"/g, '\\"');
}

function collectPrevVars(sections) {
    const out = {};
    for (const p of sections.inputs) out[p.name] = p.value;
    for (const p of sections.outputs) out[p.name] = p.value;
    for (const v of sections.locals) out[v.name] = v.value;
    return out;
}

function wireDetailVariableHandlers(inst, root) {
    root.querySelectorAll('.detail-var-section-header').forEach(function(h) {
        h.addEventListener('click', function() {
            const gk = h.getAttribute('data-toggle');
            inst.state.varsCollapsed[gk] = !inst.state.varsCollapsed[gk];
            if (typeof saveDetailState === 'function') {
                saveDetailState(inst.serverId, inst.objectName, captureState(inst));
            }
            renderDetailVariables(inst);
        });
    });

    // Chart-toggle checkbox: add/remove variable from Trends.
    root.querySelectorAll('.chart-toggle-input').forEach(function(cb) {
        cb.addEventListener('change', function() {
            const name = cb.getAttribute('data-var');
            if (typeof toggleTrendForDetail === 'function') {
                toggleTrendForDetail(inst, name);
            }
        });
    });

    // Right-click on a row opens force/unforce context menu (for inputs/outputs).
    root.querySelectorAll('tr[data-var]').forEach(function(tr) {
        tr.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            if (typeof showDetailVarContextMenu === 'function') {
                const section = tr.getAttribute('data-section');
                const sensorId = tr.dataset.sensorId ? parseInt(tr.dataset.sensorId, 10) : null;
                showDetailVarContextMenu(inst, section, tr.getAttribute('data-var'), sensorId, e);
            }
        });
    });
}

function formatVarValue(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    return escapeDetailText(String(v));
}

function detectVarType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

function renderSnapshotError(inst, msg) {
    const root = document.querySelector('#detail-tab-' +
        inst.key.replace(/:/g, '_') + ' [data-inner-panel="variables"]');
    if (!root) return;
    root.innerHTML = '<div class="detail-error-banner">' +
        escapeDetailText(msg) + '</div>';
}

function startDetailSnapshotPoll(inst) {
    const fetchOnce = async function() {
        try {
            const url = '/api/servers/' + encodeURIComponent(inst.serverId) +
                        '/objects/' + encodeURIComponent(inst.objectName) + '/snapshot';
            const resp = await fetch(url);
            if (!resp.ok) {
                inst.snapshotError = 'status ' + resp.status;
                // 404: object gone or never existed — stop polling and
                // show a clear banner. Other non-2xx: transient, keep trying.
                if (resp.status === 404) {
                    stopDetailSnapshotPoll(inst);
                    renderSnapshotError(inst,
                        'Object not found on server (404). Poll stopped.');
                }
                return;
            }
            inst.snapshotError = null;
            inst.snapshot = await resp.json();
            renderDetailVariables(inst);
            if (typeof updateTrendsFromSnapshot === 'function') {
                updateTrendsFromSnapshot(inst);
            }
        } catch (e) {
            inst.snapshotError = String(e);
        }
    };
    fetchOnce();
    inst.snapshotTimer = setInterval(fetchOnce, DETAIL_SNAPSHOT_POLL_MS);
}

function stopDetailSnapshotPoll(inst) {
    if (inst.snapshotTimer) {
        clearInterval(inst.snapshotTimer);
        inst.snapshotTimer = null;
    }
}

// ---------------------------------------------------------------------------
// Force / Unforce via SharedMemory ionc endpoints
// ---------------------------------------------------------------------------

async function postForce(inst, sensorId, value) {
    if (sensorId == null) return null;
    const smObject = (inst.snapshot && inst.snapshot.sm_object) || 'SharedMemory';
    const url = '/api/objects/' + encodeURIComponent(smObject) +
                '/ionc/freeze?server=' + encodeURIComponent(inst.serverId);
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: sensorId, value: Number(value) })
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
        handleForceError(resp.status, body, 'force');
    }
    return { status: resp.status, body: body };
}

async function postUnforce(inst, sensorId) {
    if (sensorId == null) return null;
    const smObject = (inst.snapshot && inst.snapshot.sm_object) || 'SharedMemory';
    const url = '/api/objects/' + encodeURIComponent(smObject) +
                '/ionc/unfreeze?server=' + encodeURIComponent(inst.serverId);
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: sensorId })
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
        handleForceError(resp.status, body, 'unforce');
    }
    return { status: resp.status, body: body };
}

// TODO: replace alert() with a proper toast / modal dialog once the
// project gains a shared notification widget. For now alert() guarantees
// visibility on 403/409 and is consistent with other ad-hoc errors.
function handleForceError(status, body, action) {
    let msg;
    if (status === 403) {
        msg = action + ' failed: authentication required (missing --control-token?)';
    } else if (status === 409) {
        msg = action + ' conflict: sensor may already be in target state';
    } else {
        const detail = (body && body.error) || ('HTTP ' + status);
        msg = action + ' failed: ' + detail;
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(msg);
    }
    console.warn('[detail] ' + msg);
}

function showDetailVarContextMenu(inst, section, varName, sensorId, event) {
    if (section !== 'inputs' && section !== 'outputs') return;
    if (sensorId == null) return;

    const existing = document.getElementById('detail-var-ctxmenu');
    if (existing) existing.remove();

    const currentValue = lookupSnapshotValue(inst.snapshot, varName);

    const menu = document.createElement('div');
    menu.id = 'detail-var-ctxmenu';
    menu.className = 'detail-ctxmenu';
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = (typeof currentValue === 'number') ? currentValue : 0;

    const forceBtn = document.createElement('button');
    forceBtn.textContent = 'Force ' + varName;
    forceBtn.addEventListener('click', async function() {
        const v = input.value;
        menu.remove();
        await postForce(inst, sensorId, v);
    });

    const unforceBtn = document.createElement('button');
    unforceBtn.textContent = 'Unforce';
    unforceBtn.addEventListener('click', async function() {
        menu.remove();
        await postUnforce(inst, sensorId);
    });

    menu.appendChild(input);
    menu.appendChild(forceBtn);
    menu.appendChild(unforceBtn);
    document.body.appendChild(menu);

    setTimeout(function() {
        document.addEventListener('click', function onOutside(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', onOutside);
            }
        });
    }, 0);
}

function lookupSnapshotValue(snap, varName) {
    if (!snap) return null;
    for (const p of (snap.inputs || [])) if (p.name === varName) return p.value;
    for (const p of (snap.outputs || [])) if (p.name === varName) return p.value;
    if (snap.variables && varName in snap.variables) return snap.variables[varName];
    return null;
}
