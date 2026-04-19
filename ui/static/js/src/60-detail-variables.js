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

function startDetailSnapshotPoll(inst) {
    const fetchOnce = async function() {
        try {
            const url = '/api/servers/' + encodeURIComponent(inst.serverId) +
                        '/objects/' + encodeURIComponent(inst.objectName) + '/snapshot';
            const resp = await fetch(url);
            if (!resp.ok) {
                inst.snapshotError = 'status ' + resp.status;
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
