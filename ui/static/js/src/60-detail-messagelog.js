// ============================================================================
// UObject Detail Panel — Message Log tab
// ============================================================================

var LOG_HARD_CAP = 5000;

function subscribeTraceForDetail(inst) {
    if (inst.traceToken) return;
    if (!window.UnisetOverview || !window.UnisetOverview.trace) return;
    inst.traceToken = window.UnisetOverview.trace.subscribe(
        inst.serverId, inst.objectName, 500,
        function(batch) { onTraceBatch(inst, batch); }
    );
}

function unsubscribeTraceForDetail(inst) {
    if (!inst.traceToken) return;
    if (window.UnisetOverview && window.UnisetOverview.trace) {
        window.UnisetOverview.trace.unsubscribe(inst.traceToken);
    }
    inst.traceToken = null;
}

function onTraceBatch(inst, batch) {
    if (!batch) return;
    // If called from the SSE subscribe callback (58-overview-trace.js),
    // the argument is the full envelope {type, serverId, serverName,
    // objectName, data, timestamp}. Unwrap .data. Unit tests call this
    // with a flat TraceBatch directly — detect via shape (no .enabled
    // at top level, but .data present).
    if (batch.data && (typeof batch.enabled === 'undefined')) {
        batch = batch.data;
    }
    inst.logEnabled = !!batch.enabled;
    if (batch.overflow) inst.logOverflow = true;
    if (!batch.records || inst.logPaused) {
        renderMessageLog(inst);
        return;
    }

    for (const rec of batch.records) {
        inst.logBuffer.push(enrichLogRecord(inst, rec));
        if (inst.logBuffer.length > LOG_HARD_CAP) {
            inst.logBuffer.shift();
        }
    }
    renderMessageLog(inst);
}

function enrichLogRecord(inst, rec) {
    const snap = inst.snapshot;
    // Build reverse map (sensor id → name) from inputs + outputs once
    // per snapshot. Locals (variables) have no sensor id, so skipped.
    if (!inst._reverseSensorMap || inst._reverseSensorMapSrc !== snap) {
        const rev = {};
        if (snap) {
            for (const p of (snap.inputs || [])) rev[p.id] = p.name;
            for (const p of (snap.outputs || [])) rev[p.id] = p.name;
        }
        inst._reverseSensorMap = rev;
        inst._reverseSensorMapSrc = snap;
    }
    const out = Object.assign({}, rec);
    if (rec.id != null && inst._reverseSensorMap[rec.id]) {
        out.name = inst._reverseSensorMap[rec.id];
    }
    return out;
}

function matchesLogFilter(rec, query) {
    if (!query) return true;
    const haystack = [
        rec.type || '', rec.name || '', rec.supplier || '',
        String(rec.id != null ? rec.id : ''),
        String(rec.value != null ? rec.value : '')
    ].join(' ').toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
}

function renderMessageLog(inst) {
    const root = document.querySelector('#detail-tab-' +
        inst.key.replace(/:/g, '_') + ' [data-inner-panel="messagelog"]');
    if (!root) return;

    if (!root.dataset.built) {
        root.innerHTML =
            '<div class="detail-log-toolbar">' +
                'Trace: <button class="log-enable-toggle"></button>' +
                ' Size: <select class="log-size">' +
                    '<option>64</option><option>128</option>' +
                    '<option selected>256</option>' +
                    '<option>512</option><option>1024</option>' +
                '</select>' +
                ' <button class="log-pause"></button>' +
                ' <button class="log-clear">Clear</button>' +
                ' <button class="log-export">Export CSV</button>' +
            '</div>' +
            '<div class="detail-log-filter">' +
                'Filter: <input class="log-filter" type="text" placeholder="type/name/supplier"/>' +
            '</div>' +
            '<div class="detail-log-banner" hidden></div>' +
            '<div class="detail-log-scroll"><table class="detail-log-table">' +
                '<thead><tr>' +
                    '<th>Time</th><th>Event</th><th>Name (id)</th>' +
                    '<th>Val</th><th>From</th>' +
                '</tr></thead>' +
                '<tbody></tbody>' +
            '</table></div>';
        root.dataset.built = '1';
        wireLogToolbar(inst, root);
    }

    const enBtn = root.querySelector('.log-enable-toggle');
    enBtn.textContent = inst.logEnabled ? 'Disable' : 'Enable';
    const pauseBtn = root.querySelector('.log-pause');
    pauseBtn.textContent = inst.logPaused ? 'Resume' : 'Pause';
    const filterEl = root.querySelector('.log-filter');
    if (filterEl.value !== (inst.state.logFilter || '')) {
        filterEl.value = inst.state.logFilter || '';
    }

    const banner = root.querySelector('.detail-log-banner');
    if (inst.logOverflow) {
        banner.textContent = '⚠ Upstream overflow — some records dropped';
        banner.hidden = false;
    } else {
        banner.hidden = true;
    }

    const tbody = root.querySelector('tbody');
    const filter = inst.state.logFilter || '';
    const filtered = inst.logBuffer.filter(function(r) { return matchesLogFilter(r, filter); });
    const visible = filtered.slice(-500);
    let html = '';
    for (const rec of visible) {
        const time = formatLogTime(rec.time_us);
        const delay = (rec.event_time_us && rec.time_us > rec.event_time_us)
            ? '+' + ((rec.time_us - rec.event_time_us) / 1000).toFixed(1) + 'ms'
            : '';
        const name = rec.name || '';
        const id = rec.id != null ? rec.id : '';
        const val = rec.value != null ? rec.value : '';
        const supplier = rec.supplier || (rec.supplier_id != null ? rec.supplier_id : '');
        html += '<tr class="log-row log-type-' + escapeDetailText(rec.type || '') + '">';
        html += '<td>' + escapeDetailText(time) + ' <small>' +
                escapeDetailText(delay) + '</small></td>';
        html += '<td>' + escapeDetailText(rec.type || '') + '</td>';
        html += '<td>' + escapeDetailText(name) + ' (' + escapeDetailText(String(id)) + ')</td>';
        html += '<td>' + escapeDetailText(String(val)) + '</td>';
        html += '<td>' + escapeDetailText(String(supplier)) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function wireLogToolbar(inst, root) {
    root.querySelector('.log-enable-toggle').addEventListener('click', async function() {
        if (inst.logEnabled) {
            if (window.UnisetOverview && window.UnisetOverview.trace) {
                await window.UnisetOverview.trace.disable(inst.serverId, inst.objectName);
            }
            inst.state.logEnabled = false;
        } else {
            if (window.UnisetOverview && window.UnisetOverview.trace) {
                await window.UnisetOverview.trace.enable(inst.serverId, inst.objectName,
                    inst.state.logSize || 256);
            }
            inst.state.logEnabled = true;
            subscribeTraceForDetail(inst);
        }
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderMessageLog(inst);
    });

    root.querySelector('.log-size').addEventListener('change', async function(e) {
        const newSize = parseInt(e.target.value, 10);
        inst.state.logSize = newSize;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        if (inst.logEnabled && window.UnisetOverview && window.UnisetOverview.trace) {
            await window.UnisetOverview.trace.disable(inst.serverId, inst.objectName);
            await window.UnisetOverview.trace.enable(inst.serverId, inst.objectName, newSize);
        }
    });

    root.querySelector('.log-pause').addEventListener('click', function() {
        inst.logPaused = !inst.logPaused;
        inst.state.logPaused = inst.logPaused;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderMessageLog(inst);
    });

    root.querySelector('.log-clear').addEventListener('click', function() {
        inst.logBuffer = [];
        inst.logOverflow = false;
        renderMessageLog(inst);
    });

    root.querySelector('.log-export').addEventListener('click', function() {
        exportLogCsv(inst);
    });

    root.querySelector('.log-filter').addEventListener('input', function(e) {
        inst.state.logFilter = e.target.value;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderMessageLog(inst);
    });
}

function formatLogTime(timeUs) {
    if (!timeUs) return '—';
    const ms = Math.floor(timeUs / 1000);
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const mmm = String(d.getMilliseconds()).padStart(3, '0');
    return hh + ':' + mm + ':' + ss + '.' + mmm;
}

function logToCsv(inst) {
    const lines = ['time_us,type,id,value,supplier_id'];
    for (const rec of inst.logBuffer) {
        lines.push([
            rec.time_us != null ? rec.time_us : '',
            rec.type || '',
            rec.id != null ? rec.id : '',
            rec.value != null ? rec.value : '',
            rec.supplier_id != null ? rec.supplier_id : ''
        ].join(','));
    }
    return lines.join('\n');
}

function exportLogCsv(inst) {
    const csv = logToCsv(inst);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = inst.objectName + '-log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 100);
}
