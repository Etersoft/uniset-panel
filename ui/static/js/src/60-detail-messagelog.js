// ============================================================================
// UObject Detail Panel — Message Log tab
// ============================================================================

var LOG_HARD_CAP = 5000;
var LOG_FILTER_DEBOUNCE_MS = 150;

// sanitizeLogTypeSlug produces a safe CSS-class fragment from rec.type.
// Anything outside [A-Za-z0-9_-] is collapsed to a single dash so that
// whitespace or punctuation in the raw type string can't split the class
// attribute or inject new tokens.
function sanitizeLogTypeSlug(type) {
    return String(type || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

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

// matchesLogFilter accepts a query string and optional opts {regex, caseSensitive}.
// Returns true when the record matches by Event/Name/Supplier (and id/value
// for convenience, same as before). Empty query → match all.
function matchesLogFilter(rec, query, opts) {
    if (!query) return true;
    opts = opts || {};
    const haystack = [
        rec.type || '', rec.name || '',
        rec.supplier || (rec.supplier_id != null ? String(rec.supplier_id) : ''),
        String(rec.id != null ? rec.id : ''),
        String(rec.value != null ? rec.value : '')
    ].join(' ');
    if (opts.regex) {
        try {
            const re = new RegExp(query, opts.caseSensitive ? '' : 'i');
            return re.test(haystack);
        } catch (_) { /* fall through to substring on bad regex */ }
    }
    if (opts.caseSensitive) return haystack.indexOf(query) !== -1;
    return haystack.toLowerCase().indexOf(query.toLowerCase()) !== -1;
}

function renderMessageLog(inst) {
    const root = document.querySelector('#detail-tab-' +
        inst.key.replace(/:/g, '_') + ' [data-inner-panel="messagelog"]');
    if (!root) return;

    if (!root.dataset.built) {
        root.innerHTML =
            '<div class="detail-log-toolbar">' +
                '<span class="detail-log-label">Trace:</span>' +
                ' <button class="btn btn-sm log-enable-toggle" title="Start/stop trace collection on the server (saves resources when off)"></button>' +
                ' <span class="detail-log-label">Size:</span>' +
                ' <select class="btn btn-sm log-size" title="Server-side ring buffer size (records)">' +
                    '<option>64</option><option>128</option>' +
                    '<option selected>256</option>' +
                    '<option>512</option><option>1024</option>' +
                '</select>' +
                ' <button class="btn btn-sm log-pause" title="Pause/resume UI updates (server keeps recording)"></button>' +
                ' <button class="btn btn-sm log-clear" title="Clear the displayed buffer">Clear</button>' +
                ' <button class="btn btn-sm log-export" title="Download current buffer as CSV">Export CSV</button>' +
            '</div>' +
            '<div class="detail-log-filter log-filter-wrapper">' +
                '<span class="detail-log-label">Filter:</span>' +
                ' <input class="log-filter log-filter-input" type="text" ' +
                       'placeholder="event / name / supplier" ' +
                       'title="Filter by event/name/supplier (Esc to clear)"/>' +
                ' <div class="log-filter-options">' +
                    '<label class="log-filter-option" title="Treat query as a regular expression">' +
                        '<input type="checkbox" class="log-filter-regex"> Regex' +
                    '</label>' +
                    '<label class="log-filter-option" title="Case sensitive match">' +
                        '<input type="checkbox" class="log-filter-case"> Case' +
                    '</label>' +
                '</div>' +
                ' <span class="log-match-count log-filter-count"></span>' +
            '</div>' +
            '<div class="detail-log-banner" hidden></div>' +
            '<div class="detail-log-scroll"><table class="detail-log-table">' +
                '<thead><tr>' +
                    '<th>Time</th><th>Event</th><th>Name (id)</th>' +
                    '<th>Val</th><th>Supplier</th>' +
                '</tr></thead>' +
                '<tbody></tbody>' +
            '</table></div>';
        root.dataset.built = '1';
        wireLogToolbar(inst, root);
    }

    const enBtn = root.querySelector('.log-enable-toggle');
    enBtn.textContent = inst.logEnabled ? 'Disable' : 'Enable';
    enBtn.classList.toggle('btn-danger', !!inst.logEnabled);
    enBtn.classList.toggle('btn-primary', !inst.logEnabled);
    const pauseBtn = root.querySelector('.log-pause');
    pauseBtn.textContent = inst.logPaused ? 'Resume' : 'Pause';
    pauseBtn.classList.toggle('btn-primary', !!inst.logPaused);
    const filterEl = root.querySelector('.log-filter');
    if (filterEl.value !== (inst.state.logFilter || '')) {
        filterEl.value = inst.state.logFilter || '';
    }
    const regexCb = root.querySelector('.log-filter-regex');
    const caseCb  = root.querySelector('.log-filter-case');
    regexCb.checked = !!inst.state.logFilterRegex;
    caseCb.checked  = !!inst.state.logFilterCase;

    const banner = root.querySelector('.detail-log-banner');
    if (inst.logOverflow) {
        banner.textContent = '⚠ Upstream overflow — some records dropped';
        banner.hidden = false;
    } else {
        banner.hidden = true;
    }

    const tbody = root.querySelector('tbody');
    const filter = inst.state.logFilter || '';
    const filterOpts = {
        regex: !!inst.state.logFilterRegex,
        caseSensitive: !!inst.state.logFilterCase
    };
    const filtered = inst.logBuffer.filter(function(r) { return matchesLogFilter(r, filter, filterOpts); });
    // Newest first: take the last 500 records, then reverse so that new
    // events appear at the top of the table (standard log-viewer convention).
    const visible = filtered.slice(-500).reverse();
    const matchEl = root.querySelector('.log-filter-count');
    if (matchEl) {
        matchEl.textContent = filter
            ? (filtered.length + '/' + inst.logBuffer.length)
            : '';
    }
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
        html += '<tr class="log-row log-type-' + sanitizeLogTypeSlug(rec.type) + '">';
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
        // inst.logEnabled is the "live" flag surfaced by SSE batches; the UI
        // render reads it. Flipping it locally keeps the button in sync
        // immediately instead of waiting for the next batch (which won't
        // arrive at all once trace is disabled on the server).
        if (inst.logEnabled) {
            if (window.UnisetOverview && window.UnisetOverview.trace) {
                await window.UnisetOverview.trace.disable(inst.serverId, inst.objectName);
            }
            inst.logEnabled = false;
            inst.state.logEnabled = false;
            unsubscribeTraceForDetail(inst);
        } else {
            if (window.UnisetOverview && window.UnisetOverview.trace) {
                await window.UnisetOverview.trace.enable(inst.serverId, inst.objectName,
                    inst.state.logSize || 256);
            }
            inst.logEnabled = true;
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

    // Filter has a debounced re-render to avoid re-rendering the table on
    // every keystroke when the buffer is large. State is still saved
    // synchronously so the value survives tab switches.
    let filterDebounceTimer = null;
    const filterInput = root.querySelector('.log-filter');
    filterInput.addEventListener('input', function(e) {
        inst.state.logFilter = e.target.value;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
        filterDebounceTimer = setTimeout(function() {
            filterDebounceTimer = null;
            renderMessageLog(inst);
        }, LOG_FILTER_DEBOUNCE_MS);
    });
    // Esc clears the filter and drops focus (matches LogViewer convention).
    filterInput.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        if (filterInput.value !== '') {
            filterInput.value = '';
            inst.state.logFilter = '';
            if (filterDebounceTimer) {
                clearTimeout(filterDebounceTimer);
                filterDebounceTimer = null;
            }
            if (typeof saveDetailState === 'function') {
                saveDetailState(inst.serverId, inst.objectName, captureState(inst));
            }
            renderMessageLog(inst);
        }
        filterInput.blur();
    });

    // Regex / Case toggles — re-render immediately, no debounce.
    root.querySelector('.log-filter-regex').addEventListener('change', function(e) {
        inst.state.logFilterRegex = e.target.checked;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderMessageLog(inst);
    });
    root.querySelector('.log-filter-case').addEventListener('change', function(e) {
        inst.state.logFilterCase = e.target.checked;
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
