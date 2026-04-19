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
        locals: [],
        fb_instances: []
    };
    const vars = (snap && snap.variables) || {};
    for (const name of Object.keys(vars).sort()) {
        const entry = { name: name, value: vars[name] };
        if (name.indexOf('.') >= 0) out.fb_instances.push(entry);
        else out.locals.push(entry);
    }
    return out;
}

function renderVariables(inst) {
    const root = document.querySelector('#detail-tab-' +
        inst.key.replace(/:/g, '_') + ' [data-inner-panel="variables"]');
    if (!root) return;

    if (!inst.snapshot) {
        root.innerHTML = '<div class="detail-placeholder">Loading snapshot...</div>';
        return;
    }

    const sections = buildVariablesSections(inst.snapshot);
    const collapsed = (inst.state && inst.state.varsCollapsed) || {};

    const groupDefs = [
        { key: 'inputs', label: 'Inputs (io.in)' },
        { key: 'outputs', label: 'Outputs (io.out)' },
        { key: 'locals', label: 'Locals' },
        { key: 'fb_instances', label: 'FB Instances' }
    ];

    let html = '';
    for (const gd of groupDefs) {
        const items = sections[gd.key];
        const isCollapsed = !!collapsed[gd.key];
        html += '<section data-section="' + gd.key + '">';
        html += '<div class="detail-var-section-header" data-toggle="' + gd.key + '">';
        html += '<span class="arrow' + (isCollapsed ? ' collapsed' : '') + '">▼</span>';
        html += escapeDetailText(gd.label);
        html += '<span class="count">' + items.length + '</span></div>';

        if (!isCollapsed) {
            html += '<table class="detail-var-table"><thead><tr>';
            html += '<th>Name</th><th>Value</th><th>Type</th><th>Δ</th></tr></thead><tbody>';
            for (const it of items) {
                const sensorId = (gd.key === 'inputs' || gd.key === 'outputs') ? it.id : null;
                const prev = inst._prevVars ? inst._prevVars[it.name] : undefined;
                const changed = prev !== undefined && prev !== it.value;
                let flashClass = '';
                if (changed && typeof it.value === 'number' && typeof prev === 'number') {
                    flashClass = it.value > prev ? ' flash-up' : ' flash-down';
                } else if (changed) {
                    flashClass = ' flash-up';
                }
                const rowClasses = (gd.key === 'inputs' || gd.key === 'outputs') ? 'forcible' : '';
                html += '<tr data-var="' + escapeDetailText(it.name) + '"';
                if (sensorId != null) html += ' data-sensor-id="' + sensorId + '"';
                html += ' data-section="' + gd.key + '" class="' + rowClasses + '">';
                html += '<td>' + escapeDetailText(it.name) + '</td>';
                html += '<td class="value-cell' + flashClass + '">' + formatVarValue(it.value) + '</td>';
                html += '<td>' + detectVarType(it.value) + '</td>';
                html += '<td>' + (changed ? '•' : '') + '</td></tr>';
            }
            html += '</tbody></table>';
        }
        html += '</section>';
    }

    root.innerHTML = html;

    root.querySelectorAll('.detail-var-section-header').forEach(function(h) {
        h.addEventListener('click', function() {
            const gk = h.getAttribute('data-toggle');
            inst.state.varsCollapsed[gk] = !inst.state.varsCollapsed[gk];
            if (typeof saveDetailState === 'function') {
                saveDetailState(inst.serverId, inst.objectName, captureState(inst));
            }
            renderVariables(inst);
        });
    });

    root.querySelectorAll('.flash-up, .flash-down').forEach(function(el) {
        setTimeout(function() {
            el.classList.remove('flash-up');
            el.classList.remove('flash-down');
        }, 500);
    });

    root.querySelectorAll('tr[data-var]').forEach(function(tr) {
        tr.addEventListener('click', function() {
            const name = tr.getAttribute('data-var');
            if (typeof toggleTrendForDetail === 'function') {
                toggleTrendForDetail(inst, name);
            }
        });
        tr.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            if (typeof showDetailVarContextMenu === 'function') {
                const section = tr.getAttribute('data-section');
                const sensorId = tr.dataset.sensorId ? parseInt(tr.dataset.sensorId, 10) : null;
                showDetailVarContextMenu(inst, section, tr.getAttribute('data-var'), sensorId, e);
            }
        });
    });

    // Prev values for next flash diff.
    inst._prevVars = {};
    for (const p of sections.inputs) inst._prevVars[p.name] = p.value;
    for (const p of sections.outputs) inst._prevVars[p.name] = p.value;
    for (const v of sections.locals) inst._prevVars[v.name] = v.value;
    for (const v of sections.fb_instances) inst._prevVars[v.name] = v.value;
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
            renderVariables(inst);
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
