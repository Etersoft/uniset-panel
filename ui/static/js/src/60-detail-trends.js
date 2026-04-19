// ============================================================================
// UObject Detail Panel — Trends tab (client-side only; see Future Spec 5)
// ============================================================================

// Note: use var (not const) for top-level identifiers consumed across
// modules via loadSrc indirect-eval (see Task 3.2 finding).
var TREND_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
                    '#ff8a65', '#a1887f', '#90a4ae', '#dce775', '#4db6ac'];

function toggleTrendForDetail(inst, varName) {
    if (inst.selectedTrends.has(varName)) {
        inst.selectedTrends.delete(varName);
        delete inst.trendsBuffer[varName];
    } else {
        inst.selectedTrends.add(varName);
        inst.trendsBuffer[varName] = []; // empty; fills from snapshot poll
    }
    if (typeof saveDetailState === 'function') {
        saveDetailState(inst.serverId, inst.objectName, captureState(inst));
    }
    renderTrends(inst);
}

function updateTrendsFromSnapshot(inst) {
    if (!inst || !inst.snapshot) return;
    const now = Date.now();
    const windowSec = (inst.state && inst.state.trendsWindow) || 60;
    const cutoff = windowSec > 0 ? now - windowSec * 1000 : 0;

    const lookupValue = function(varName) {
        for (const p of (inst.snapshot.inputs || [])) if (p.name === varName) return p.value;
        for (const p of (inst.snapshot.outputs || [])) if (p.name === varName) return p.value;
        if (inst.snapshot.variables && varName in inst.snapshot.variables) {
            return inst.snapshot.variables[varName];
        }
        return undefined;
    };

    for (const varName of inst.selectedTrends) {
        const value = lookupValue(varName);
        if (value === undefined) continue;
        const buf = (inst.trendsBuffer[varName] ||= []);
        buf.push({ t: now, v: value });
        if (windowSec > 0) {
            while (buf.length && buf[0].t < cutoff) buf.shift();
        }
    }
    if (inst.state && inst.state.activeInnerTab === 'trends') {
        renderTrendsLive(inst);
    }
}

function renderTrends(inst) {
    const root = document.querySelector('#detail-tab-' +
        inst.key.replace(/:/g, '_') + ' [data-inner-panel="trends"]');
    if (!root) return;

    if (inst.selectedTrends.size === 0) {
        root.innerHTML = '<div class="detail-placeholder">' +
            'Select variables in the Variables tab to add to trend.</div>';
        return;
    }

    let html = '<div class="detail-trends-toolbar">';
    html += 'Window: <select class="trends-window">';
    const opts = [[30, '30s'], [60, '1m'], [300, '5m'], [0, 'All']];
    for (const [val, label] of opts) {
        const sel = (inst.state.trendsWindow === val) ? ' selected' : '';
        html += '<option value="' + val + '"' + sel + '>' + label + '</option>';
    }
    html += '</select>';
    html += ' <button class="trends-clear">Clear</button>';
    html += ' <button class="trends-export">Export CSV</button>';
    html += '</div>';

    html += '<div class="detail-trends-charts">';
    let colorIdx = 0;
    for (const varName of inst.selectedTrends) {
        const color = TREND_COLORS[colorIdx++ % TREND_COLORS.length];
        html += '<div class="trend-row" data-var="' + escapeDetailText(varName) + '">';
        html += '<div class="trend-row-header">' +
                '<span class="trend-color" style="background:' + color + '"></span>' +
                escapeDetailText(varName) + '</div>';
        html += '<canvas class="trend-canvas" height="120"></canvas>';
        html += '</div>';
    }
    html += '</div>';

    root.innerHTML = html;

    root.querySelector('.trends-window').addEventListener('change', function(e) {
        inst.state.trendsWindow = parseInt(e.target.value, 10) || 0;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderTrends(inst);
    });
    root.querySelector('.trends-clear').addEventListener('click', function() {
        for (const v of inst.selectedTrends) inst.trendsBuffer[v] = [];
        renderTrendsLive(inst);
    });
    root.querySelector('.trends-export').addEventListener('click', function() {
        exportTrendsCsv(inst);
    });

    renderTrendsLive(inst);
}

function renderTrendsLive(inst) {
    const root = document.querySelector('#detail-tab-' +
        inst.key.replace(/:/g, '_') + ' [data-inner-panel="trends"]');
    if (!root) return;
    let colorIdx = 0;
    for (const varName of inst.selectedTrends) {
        const safe = String(varName).replace(/["\\]/g, '\\$&');
        const canvas = root.querySelector('.trend-row[data-var="' + safe + '"] canvas');
        if (!canvas) continue;
        drawTrendCanvas(canvas, inst.trendsBuffer[varName] || [],
                        TREND_COLORS[colorIdx++ % TREND_COLORS.length]);
    }
}

function drawTrendCanvas(canvas, points, color) {
    if (typeof canvas.getContext !== 'function') return; // jsdom guard
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width = canvas.clientWidth || 400;
    const h = canvas.height;
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, w, h);
    if (points.length < 2) {
        ctx.fillStyle = '#888';
        ctx.font = '10px sans-serif';
        ctx.fillText('collecting...', 8, 16);
        return;
    }
    let minT = points[0].t, maxT = points[points.length - 1].t;
    let minV = Infinity, maxV = -Infinity;
    for (const p of points) {
        if (typeof p.v !== 'number') continue;
        if (p.v < minV) minV = p.v;
        if (p.v > maxV) maxV = p.v;
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return;
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const span = maxT - minT || 1;
    const vSpan = maxV - minV || 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = ((p.t - minT) / span) * (w - 4) + 2;
        const y = h - 4 - ((p.v - minV) / vSpan) * (h - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function trendsToCsv(inst) {
    const lines = ['timestamp_ms,variable,value'];
    for (const varName of inst.selectedTrends) {
        const buf = inst.trendsBuffer[varName] || [];
        for (const p of buf) lines.push(p.t + ',' + varName + ',' + p.v);
    }
    return lines.join('\n');
}

function exportTrendsCsv(inst) {
    const csv = trendsToCsv(inst);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = inst.objectName + '-trends.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 100);
}
