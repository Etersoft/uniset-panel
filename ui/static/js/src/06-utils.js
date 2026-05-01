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
        backgroundColor: '#22252a',
        titleColor: '#d8dce2',
        bodyColor: '#d8dce2',
        borderColor: '#333840',
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
                    color: '#333840',
                    drawBorder: false
                },
                ticks: {
                    color: '#8a9099',
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
                    color: '#333840',
                    drawBorder: false
                },
                ticks: {
                    color: '#8a9099',
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
                <input type="number" class="zone-input" name="zone-from-${index}" value="${escapeAttr(zone.from ?? 0)}" placeholder="From">
                <span class="zone-separator">→</span>
                <input type="number" class="zone-input" name="zone-to-${index}" value="${escapeAttr(zone.to ?? 100)}" placeholder="To">
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
}
