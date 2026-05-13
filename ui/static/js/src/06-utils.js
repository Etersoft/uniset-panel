// ============================================================================
// Общие утилиты
// ============================================================================

// Экранирование HTML для безопасной вставки текста
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Экранирование строки для вставки внутрь HTML-атрибута (`attr="..."`).
// escapeHtml() не покрывает кавычки/апострофы (textContent → innerHTML
// сериализует только <, >, &), поэтому в attribute context кавычка в
// значении ломает разметку. Используй здесь, когда подставляешь dynamic
// данные внутрь quoted attribute.
function escapeAttr(text) {
    if (text === null || text === undefined) return '';
    const s = String(text);
    if (s === '') return '';
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

if (typeof globalThis !== 'undefined') {
    globalThis.escapeHtml = escapeHtml;
    globalThis.escapeAttr = escapeAttr;
}

function buildObjectUrl(objectName, objectPath = '', serverId = null, query = null) {
    const normalizedPath = objectPath
        ? (objectPath.startsWith('/') ? objectPath : `/${objectPath}`)
        : '';
    const params = [];
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
            params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    });
    if (serverId) {
        params.push(`server=${encodeURIComponent(serverId)}`);
    }
    const queryString = params.length > 0 ? `?${params.join('&')}` : '';
    return `/api/objects/${encodeURIComponent(objectName)}${normalizedPath}${queryString}`;
}

// Универсальный resize-handle: mousedown → mousemove → mouseup паттерн
function setupResizeHandle(handle, container, minHeight, onSave, maxHeight = Infinity, onResize = null, options = {}) {
    if (!handle || !container) return;
    let startY = 0, startHeight = 0, isResizing = false;
    const direction = options.direction === -1 ? -1 : 1;
    const updateMaxHeight = options.updateMaxHeight !== false;

    const onMouseMove = (e) => {
        if (!isResizing) return;
        const delta = (e.clientY - startY) * direction;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + delta));
        container.style.height = `${newHeight}px`;
        if (updateMaxHeight) container.style.maxHeight = `${newHeight}px`;
        if (onResize) onResize(newHeight);
    };
    const onMouseUp = () => {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (onSave) onSave(container.offsetHeight);
    };
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        startHeight = container.offsetHeight;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });
}

// Универсальный debounce — возвращает обёртку, откладывающую вызов fn на delay мс
function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Возвращает id первого подключённого сервера из state.servers,
// или null если такого нет (или state ещё не инициализирован).
// Используется dashboard'ом и активными widget'ами для legacy fallback.
function getFirstConnectedServerId() {
    if (typeof state === 'undefined' || !state.servers) return null;
    for (const [id, server] of state.servers) {
        if (server.connected) return id;
    }
    return null;
}

// Возвращает массив id всех connected серверов в порядке state.servers.
// Используется для bootstrap-обходов (загрузка sensors per server, IONC objects).
function getConnectedServerIds() {
    if (typeof state === 'undefined' || !state.servers) return [];
    const ids = [];
    for (const [id, server] of state.servers) {
        if (server?.connected) ids.push(id);
    }
    return ids;
}

// === localStorage helpers ===
//
// Каждый из этих helpers глотает SyntaxError/SecurityError и логирует через
// console.warn — в SCADA-UI lost-write для пользовательской настройки лучше
// тихого падения, но не должен валить остальной flow.

// Прочитать JSON-объект из localStorage. Возвращает fallback при отсутствии
// ключа, broken-JSON или недоступности storage (private mode).
function loadJSON(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.warn(`loadJSON("${key}") failed:`, err);
        return fallback;
    }
}

// Записать JSON-объект в localStorage. true при успехе, false при ошибке.
function saveJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (err) {
        console.warn(`saveJSON("${key}") failed:`, err);
        return false;
    }
}

// Прочитать map-объект `{[k]: v}` из localStorage. Если значение есть, но не
// объект (массив/число/строка) — вернёт defaults (это защита от старого
// несовместимого формата).
function loadStorageMap(key, defaults = {}) {
    const v = loadJSON(key, defaults);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ...defaults };
    return v;
}

// Прочитать map-объект, передать его в mutator(map) для in-place мутации,
// записать обратно. Удобно для save-merge паттерна (saved[key] = value).
// Возвращает true при успехе.
function updateStorageMap(key, mutator) {
    const map = loadStorageMap(key);
    mutator(map);
    return saveJSON(key, map);
}

// Regex-escape: спрятать в literal-строке метасимволы regex'а.
// Используется при построении динамического pattern из user input
// (журнал highlight, log-viewer search).
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Универсальный fetch с проверкой ok и парсингом JSON.
// Бросает Error('errPrefix: <details>') при HTTP-ошибке или сетевом сбое.
// Используется тонким обёртом в helpers модулях (40-charts.js, base-renderer fetchJSON).
async function fetchJSONOrThrow(url, opts = {}, errPrefix = 'Request') {
    const response = await fetch(url, opts);
    if (!response.ok) throw new Error(`${errPrefix}: HTTP ${response.status}`);
    return response.json();
}

function parseNumberOrDefault(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function parseDecimalInputOrDefault(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    const normalized = String(value).trim().replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
}

function parseIntegerOrDefault(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === '') return fallback;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function percentInRange(value, min, max, scale = 1) {
    const range = max - min;
    if (!Number.isFinite(value) || !Number.isFinite(range) || range <= 0) return 0;
    return Math.max(0, Math.min(scale, ((value - min) / range) * scale));
}

function createLineChartDataset(dataset) {
    const color = dataset.color || dataset.borderColor || '#3274d9';
    const isStepped = dataset.isDiscrete || dataset.stepped === true || dataset.stepped === 'before';
    const stepped = dataset.stepped !== undefined
        ? (dataset.stepped === true ? 'before' : dataset.stepped)
        : (dataset.isDiscrete ? 'before' : false);

    return {
        label: dataset.label,
        data: dataset.data || [],
        borderColor: color,
        backgroundColor: dataset.backgroundColor || `${color}20`,
        fill: dataset.fill !== undefined ? dataset.fill : true,
        tension: dataset.tension !== undefined ? dataset.tension : (isStepped ? 0 : CHART_LINE_TENSION),
        stepped,
        pointRadius: dataset.pointRadius ?? 0,
        borderWidth: dataset.borderWidth !== undefined ? dataset.borderWidth : (isStepped ? CHART_STEPPED_LINE_BORDER_WIDTH : CHART_LINE_BORDER_WIDTH)
    };
}

function createLineChartConfig({ datasets = [], timeRange = {}, options = {} }) {
    const discreteYAxis = options.discreteYAxis !== undefined
        ? options.discreteYAxis
        : datasets.length === 1 && Boolean(datasets[0]?.isDiscrete);

    const tooltip = {
        backgroundColor: CHART_THEME.tooltipBg,
        titleColor: CHART_THEME.tooltipText,
        bodyColor: CHART_THEME.tooltipText,
        borderColor: CHART_THEME.gridLine,
        borderWidth: 1
    };
    if (options.tooltipEnabled !== undefined) {
        tooltip.enabled = options.tooltipEnabled;
    }

    const plugins = {
        legend: options.legend || { display: false },
        tooltip
    };
    if (options.decimation) {
        plugins.decimation = {
            enabled: true,
            algorithm: options.decimationAlgorithm || 'min-max'
        };
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
            intersect: false,
            mode: options.interactionMode || 'index'
        },
        scales: {
            x: {
                type: 'time',
                display: true,
                grid: {
                    color: CHART_THEME.gridLine,
                    drawBorder: false
                },
                ticks: {
                    color: CHART_THEME.tickColor,
                    maxTicksLimit: options.xMaxTicksLimit ?? 10,
                    display: options.xTicksDisplay ?? true
                },
                time: {
                    displayFormats: {
                        second: 'HH:mm:ss',
                        minute: 'HH:mm',
                        hour: 'HH:mm'
                    }
                },
                min: timeRange.min,
                max: timeRange.max
            },
            y: {
                display: true,
                position: 'left',
                beginAtZero: discreteYAxis ? true : undefined,
                suggestedMin: discreteYAxis ? 0 : undefined,
                suggestedMax: discreteYAxis ? 1.1 : undefined,
                grid: {
                    color: CHART_THEME.gridLine,
                    drawBorder: false
                },
                ticks: {
                    color: CHART_THEME.tickColor,
                    stepSize: discreteYAxis ? 1 : undefined
                }
            }
        },
        plugins
    };

    if (options.yMaxTicksLimit !== undefined) {
        chartOptions.scales.y.ticks.maxTicksLimit = options.yMaxTicksLimit;
    }
    if (options.autoSkip !== undefined) {
        chartOptions.scales.x.ticks.autoSkip = options.autoSkip;
    }
    if (options.tickSource !== undefined) {
        chartOptions.scales.x.ticks.source = options.tickSource;
    }
    ['normalized', 'parsing', 'spanGaps'].forEach((key) => {
        if (options[key] !== undefined) {
            chartOptions[key] = options[key];
        }
    });

    return {
        type: 'line',
        data: {
            datasets: datasets.map(createLineChartDataset)
        },
        options: chartOptions
    };
}

function bindSingleDoubleClick(element, onSingle, onDouble, delay = DOUBLE_CLICK_THRESHOLD) {
    if (!element) return () => {};
    let clickTimer = null;
    const handler = () => {
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            onDouble();
            return;
        }
        clickTimer = setTimeout(() => {
            clickTimer = null;
            onSingle();
        }, delay);
    };
    element.addEventListener('click', handler);
    return () => {
        if (clickTimer) clearTimeout(clickTimer);
        element.removeEventListener('click', handler);
    };
}

function isDebugLogEnabled() {
    try {
        return window.UNISET_UI_DEBUG === true
            || localStorage.getItem(UI_DEBUG_LOG_STORAGE_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

function debugLog(...args) {
    if (isDebugLogEnabled()) {
        console.log(...args);
    }
}

function renderColorZoneItem(zone = {}, index = 0, defaultColor = '#ef4444') {
    return `
        <div class="zone-item">
            <input type="color" class="zone-color" name="zone-color-${index}" value="${escapeAttr(zone.color || defaultColor)}">
            <div class="zone-inputs">
                <input type="number" class="zone-input" name="zone-from-${index}" value="${escapeAttr(zone.from ?? WIDGET_DEFAULT_MIN)}" placeholder="From">
                <span class="zone-separator">→</span>
                <input type="number" class="zone-input" name="zone-to-${index}" value="${escapeAttr(zone.to ?? WIDGET_DEFAULT_MAX)}" placeholder="To">
            </div>
            <button type="button" class="zone-remove-btn" onclick="removeZoneField(this)">×</button>
        </div>
    `;
}

function renderColorZonesEditor(zones = [], defaultColor = '#ef4444') {
    return `
        <div class="zones-editor">
            <div class="zones-header">
                <label>Color Zones</label>
                <button type="button" class="zones-add-btn" onclick="addZoneField(this)">+ Add Zone</button>
            </div>
            <div class="zones-list" id="zones-list">
                ${zones.map((zone, index) => renderColorZoneItem(zone, index, defaultColor)).join('')}
            </div>
        </div>
    `;
}

function parseColorZones(container) {
    const zones = [];
    container.querySelectorAll('.zone-item').forEach((item) => {
        const color = item.querySelector('.zone-color')?.value;
        const inputs = item.querySelectorAll('.zone-input');
        const from = parseFloat(inputs[0]?.value);
        const to = parseFloat(inputs[1]?.value);
        if (color && !isNaN(from) && !isNaN(to)) zones.push({ from, to, color });
    });
    return zones;
}

function canonicalizeZones(zones) {
    if (!Array.isArray(zones)) return '';
    const normalized = zones
        .map(z => ({
            from:  Number(Number(z.from).toFixed(6)),
            to:    Number(Number(z.to).toFixed(6)),
            color: String(z.color || '').toLowerCase(),
        }))
        .sort((a, b) => a.from - b.from);
    return JSON.stringify(normalized);
}

function getZonesHistory() {
    try {
        const raw = localStorage.getItem(ZONES_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function addZonesToHistory(zones, sourceWidgetType) {
    if (!Array.isArray(zones) || zones.length === 0) return;
    const normalized = zones.map(z => ({
        from:  Number(Number(z.from).toFixed(6)),
        to:    Number(Number(z.to).toFixed(6)),
        color: String(z.color || '').toLowerCase(),
    }));
    const key = canonicalizeZones(normalized);
    const history = getZonesHistory();
    const filtered = history.filter(item => canonicalizeZones(item.zones) !== key);
    filtered.unshift({
        zones:            normalized,
        timestamp:        Date.now(),
        sourceWidgetType: sourceWidgetType || '',
    });
    const capped = filtered.slice(0, ZONES_HISTORY_MAX);
    try {
        localStorage.setItem(ZONES_HISTORY_STORAGE_KEY, JSON.stringify(capped));
    } catch (e) {
        console.warn('addZonesToHistory: localStorage write failed', e);
    }
}

function renderZoneChipBar(zones) {
    if (!Array.isArray(zones) || zones.length === 0) {
        return '<span class="zone-bar"></span>';
    }
    const spans = zones.map(z => {
        const weight = Math.max(1, Number(z.to) - Number(z.from));
        const color = escapeAttr(String(z.color || '#888'));
        // flex: <weight> 0 auto — grow proportionally, do NOT shrink, basis=natural-content.
        // Иначе при длинных labels (например '-180–0') flex-basis:0 + shrink:1 + overflow:hidden
        // на parent .zone-bar обрезали бы текст в узких диалогах.
        return `<span style="background:${color};flex:${weight} 0 auto">${escapeHtml(`${z.from}–${z.to}`)}</span>`;
    }).join('');
    return `<span class="zone-bar">${spans}</span>`;
}

function getDashboardZoneSources(currentDashboardId, excludeWidgetId) {
    const state = globalThis.dashboardState;
    if (!state || !state.dashboards) return [];
    const dash = state.dashboards.get(currentDashboardId);
    if (!dash || !Array.isArray(dash.widgets)) return [];
    // Dedup по canonical key — несколько widget'ов с одинаковыми zones
    // отображаются одним chip'ом (label = первый встреченный sensor).
    const seen = new Set();
    const result = [];
    for (const w of dash.widgets) {
        if (w.id === excludeWidgetId) continue;
        if (!Array.isArray(w.config?.zones) || w.config.zones.length === 0) continue;
        const key = canonicalizeZones(w.config.zones);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
            widgetId: w.id,
            widgetType: w.type,
            sensorLabel: w.config.sensor || w.config.label || w.id,
            zones: w.config.zones,
        });
    }
    return result;
}

function _renderZoneChipFromSource(zones, sourceLabel, sourceClass) {
    const json = escapeAttr(JSON.stringify(zones));
    const labelHtml = escapeHtml(sourceLabel);
    const labelClass = sourceClass === 'recent' ? 'chip-source recent-source' : 'chip-source';
    return `<div class="zone-chip" data-zones-json="${json}" role="button" tabindex="0">${renderZoneChipBar(zones)}<span class="${labelClass}">${labelHtml}</span></div>`;
}

function _formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return new Date(timestamp).toISOString().slice(0, 10);
}

function _widgetTypeDisplayName(type) {
    const types = globalThis.WIDGET_TYPES || {};
    return types[type]?.displayName || type;
}

function renderZonesReusePicker(currentWidgetType, currentDashboardId, currentWidgetId) {
    const dashSources = getDashboardZoneSources(currentDashboardId, currentWidgetId || '');
    const history = getZonesHistory();
    if (dashSources.length === 0 && history.length === 0) return '';

    // Group dashboard sources by widget type
    const byType = new Map();
    dashSources.forEach(src => {
        if (!byType.has(src.widgetType)) byType.set(src.widgetType, []);
        byType.get(src.widgetType).push(src);
    });

    // Order: current-type first, then alphabetical by displayName
    const orderedTypes = Array.from(byType.keys()).sort((a, b) => {
        if (a === currentWidgetType) return -1;
        if (b === currentWidgetType) return 1;
        return _widgetTypeDisplayName(a).localeCompare(_widgetTypeDisplayName(b));
    });

    const totalCount = dashSources.length + history.length;

    let groupsHtml = '';

    if (history.length > 0) {
        const recentChips = history.map(item => {
            const label = _formatRelativeTime(item.timestamp);
            return _renderZoneChipFromSource(item.zones, label, 'recent');
        }).join('');
        groupsHtml += `
            <div class="group-label group-recent">
                <span>★ Recent</span>
                <span class="group-count">(${history.length})</span>
                <span class="group-divider"></span>
            </div>
            <div>${recentChips}</div>
        `;
    }

    orderedTypes.forEach(type => {
        const list = byType.get(type);
        const isSame = type === currentWidgetType;
        const labelClass = isSame ? 'group-label group-same-class' : 'group-label';
        const typeName = escapeHtml(_widgetTypeDisplayName(type));
        const suffix = isSame ? ` · same type` : '';
        const chips = list.map(src => _renderZoneChipFromSource(src.zones, src.sensorLabel, '')).join('');
        groupsHtml += `
            <div class="${labelClass}">
                <span>${typeName}</span>
                <span class="group-count">(${list.length})${suffix}</span>
                <span class="group-divider"></span>
            </div>
            <div>${chips}</div>
        `;
    });

    return `
        <div class="reuse-picker">
            <div class="reuse-header">
                <span>Reuse zones</span>
                <span class="reuse-count">${totalCount} saved</span>
            </div>
            <div class="reuse-scroll" style="max-height:${ZONES_PICKER_MAX_HEIGHT_PX}px">${groupsHtml}</div>
        </div>
    `;
}

function applyZonesToEditor(form, zones) {
    if (!form || !Array.isArray(zones)) return;
    const list = form.querySelector('.zones-list');
    if (!list) return;
    list.innerHTML = zones.map((z, idx) => renderColorZoneItem(z, idx, '#888')).join('');
}

function setupZonesReusePicker(form) {
    if (!form || form.dataset.zonesPickerWired === '1') return;
    form.dataset.zonesPickerWired = '1';
    form.addEventListener('click', (e) => {
        const chip = e.target.closest('.zone-chip');
        if (!chip || !form.contains(chip)) return;
        const raw = chip.dataset.zonesJson;
        if (!raw) return;
        let zones;
        try { zones = JSON.parse(raw); } catch { return; }
        if (!Array.isArray(zones)) return;
        applyZonesToEditor(form, zones);
    });
}

function mountZonesReusePicker(form, widgetType) {
    if (!form) return;
    const dashId = globalThis.dashboardState?.currentDashboard ?? '';
    const widgetId = form.dataset.widgetId || '';
    const html = renderZonesReusePicker(widgetType, dashId, widgetId);
    // Render target: replace existing .reuse-picker (legacy placement) OR insert before .zones-editor.
    const existing = form.querySelector('.reuse-picker');
    if (existing) {
        existing.outerHTML = html;
    } else if (html) {
        const editor = form.querySelector('.zones-editor');
        if (editor) editor.insertAdjacentHTML('beforebegin', html);
    }
    setupZonesReusePicker(form);
}

if (typeof globalThis !== 'undefined') {
    globalThis.parseNumberOrDefault = parseNumberOrDefault;
    globalThis.parseDecimalInputOrDefault = parseDecimalInputOrDefault;
    globalThis.parseIntegerOrDefault = parseIntegerOrDefault;
    globalThis.createLineChartConfig = createLineChartConfig;
    globalThis.setupResizeHandle = setupResizeHandle;
    globalThis.bindSingleDoubleClick = bindSingleDoubleClick;
    globalThis.renderColorZoneItem = renderColorZoneItem;
    globalThis.renderColorZonesEditor = renderColorZonesEditor;
    globalThis.parseColorZones = parseColorZones;
    globalThis.getFirstConnectedServerId = getFirstConnectedServerId;
    globalThis.getConnectedServerIds = getConnectedServerIds;
    globalThis.loadJSON = loadJSON;
    globalThis.saveJSON = saveJSON;
    globalThis.loadStorageMap = loadStorageMap;
    globalThis.updateStorageMap = updateStorageMap;
    globalThis.escapeRegex = escapeRegex;
    globalThis.fetchJSONOrThrow = fetchJSONOrThrow;
    globalThis.canonicalizeZones = canonicalizeZones;
    globalThis.getZonesHistory = getZonesHistory;
    globalThis.addZonesToHistory = addZonesToHistory;
    globalThis.getDashboardZoneSources = getDashboardZoneSources;
    globalThis.renderZoneChipBar = renderZoneChipBar;
    globalThis.renderZonesReusePicker = renderZonesReusePicker;
    globalThis.applyZonesToEditor = applyZonesToEditor;
    globalThis.setupZonesReusePicker = setupZonesReusePicker;
    globalThis.mountZonesReusePicker = mountZonesReusePicker;
}
