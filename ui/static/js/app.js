// Auto-generated from src/*.js - DO NOT EDIT
// Run 'make app' or 'go generate ./ui' to rebuild

// === 00-constants.js ===
// ============================================================================
// Константы UI
// ============================================================================

// === Таймауты и интервалы (мс) ===
const FILTER_DEBOUNCE_DELAY = 300;
const DOUBLE_CLICK_THRESHOLD = 250;
const RESUBSCRIBE_DELAY = 1000;
const SIDEBAR_STATUS_REAPPLY_DELAY = 3000;
const ANIMATION_REMOVAL_DELAY = 500;
const AUTOCOMPLETE_DEBOUNCE_DELAY = 150;
const JOURNAL_SEARCH_DEBOUNCE_DELAY = 300;
const JOURNAL_HIGHLIGHT_DURATION = 2000;
const LAUNCHER_AUTO_REFRESH_INTERVAL = 5000;
const LAUNCHER_ACTION_REFRESH_DELAY = 1000;
const LAUNCHER_BULK_ACTION_REFRESH_DELAY = 1500;
const STATUS_DISPLAY_UPDATE_INTERVAL = 1000;
const RECORDING_STATUS_POLL_INTERVAL = 5000;
const CONTROL_PING_INTERVAL = 30000;
const SETTINGS_FILTER_DEBOUNCE_DELAY = 200;

// === SSE ===
const SSE_RESUBSCRIBE_DELAY = 1000;
const SSE_RECOVERY_PROBE_INTERVAL = 30000;

// === Retry ===
const RESTORE_SENSORS_MAX_ATTEMPTS = 30; // × 100ms = 3s max wait for tab init

// === Лимиты данных ===
const MAX_CHART_POINTS = 1000;
const MAX_LOG_LINES = 10000;
const VIRTUAL_SCROLL_CHUNK_SIZE = 200;
const JOURNAL_DEFAULT_LIMIT = 100;
const AUTOCOMPLETE_MIN_QUERY = 2;

// === Виртуальный скролл (px) ===
const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_BUFFER_ROWS = 10;
const VIRTUAL_SCROLL_LOAD_THRESHOLD = 200;

// === Высоты секций (px) ===
const DEFAULT_SECTION_HEIGHT = 300;
const MIN_SECTION_HEIGHT = 100;
const MAX_SECTION_HEIGHT = 800;
const LOGVIEWER_DEFAULT_HEIGHT = 200;
const LOGVIEWER_MIN_HEIGHT = 100;
const LOGVIEWER_MAX_HEIGHT = 600;
const CHARTS_CONTAINER_MIN_HEIGHT = 150;
const CHARTS_CONTAINER_DEFAULT_HEIGHT = 300;
const SENSORS_CONTAINER_MIN_HEIGHT = 200;

// === Dashboard сетка ===
const DASHBOARD_GRID_COLS = 48;
const DASHBOARD_GRID_ROW_HEIGHT = 30;
const DASHBOARD_GRID_GAP = 4;

// === Временные диапазоны (сек) ===
const DEFAULT_CHART_TIME_RANGE = 900;

// === Пороги formatTimeAgo ===
const TIME_AGO_MIN_SECONDS = 5;
const TIME_AGO_MINUTES_THRESHOLD = 60;

// ============================================================================
// Active dashboard widgets — состояния записи
// ============================================================================

// Сколько ждать ответа от POST /ionc/set до показа состояния error.
const WRITE_PENDING_TIMEOUT_MS = 5000;

// Сколько отображать состояние "success" (зелёный индикатор) после удачной записи,
// прежде чем вернуться в idle. Сделано короткой вспышкой — раньше 1500ms
// читалось как «фокусная рамка осталась», теперь 400ms — мгновенный flash.
const WRITE_SUCCESS_DISPLAY_MS = 400;


// === 00-state.js ===
// Идентификатор сервера для SharedMemory (SM) событий
// Соответствует SharedMemoryServerID в backend (internal/api/sse.go)
const SM_SERVER_ID = 'sm';

// Status приложения
// Экспортируем на window для тестов
const state = window.state = {
    objects: [],
    servers: new Map(), // serverId -> { id, url, name, connected, objectCount }
    nodes: new Map(), // nodeId -> { id, name, launcherUrl, connected, hasControl }
    tabs: new Map(), // tabKey -> { charts, updateInterval, chartStartTime, objectType, renderer, serverId, serverName, displayName }
    activeTab: null,
    sensors: new Map(), // sensorId -> sensorInfo
    // Legacy global registry — keyed by short sensorName. На multi-server панели
    // первый встретившийся sensor wins, остальные с тем же именем игнорируются.
    // Безопасен только для search/autocomplete (UI dedupe). Per-row metadata
    // (textname в renderer'ах) должна ходить через sensorsByKey, иначе при
    // одинаковых именах на разных серверах юзер видит metadata от чужого объекта.
    sensorsByName: new Map(), // sensorName -> sensorInfo
    // Multi-server-aware registry: key = sensorKey (`${serverId}|${objectName}|${sensorName}`).
    // Используется в renderer'ах и точечных lookup'ах, где известен полный context.
    sensorsByKey: new Map(), // sensorKey -> sensorInfo (см. 09-sensor-key.js)
    sensorValuesCache: new Map(), // sensorKey -> { value, error, timestamp } — cache for dashboard init. sensorKey = `${serverId}|${objectName}|${sensorName}` (см. 09-sensor-key.js)
    timeRange: DEFAULT_CHART_TIME_RANGE, // секунды (по умолчанию 15 минут)
    sidebarCollapsed: false, // свёрнутая боковая панель
    collapsedSections: {}, // состояние спойлеров
    collapsedServerGroups: new Set(), // свёрнутые группы серверов в списке объектов
    objectsSectionCollapsed: false, // свёрнута ли секция "Objects"
    serversSectionCollapsed: false, // свёрнута ли секция "Servers"
    journalsSectionCollapsed: false, // свёрнута ли секция "Journals"
    launchersSectionCollapsed: false, // свёрнута ли секция "Launchers"
    capabilities: {
        smEnabled: false // по умолчанию SM отключен
    },
    config: {
        controlsEnabled: false,
        ioncUISensorsFilter: false,  // false = серверная фильтрация (default)
        opcuaUISensorsFilter: false  // false = серверная фильтрация (default)
    },
    sse: {
        eventSource: null,
        connected: false,
        pollInterval: 5000, // будет обновлено с сервера
        reconnectAttempts: 0,
        maxReconnectAttempts: 10,
        baseReconnectDelay: 1000,   // начальная задержка (1s)
        maxReconnectDelay: 30000,   // максимальная задержка (30s)
        reconnectTimerId: null,     // ID таймера переподключения (для очистки)
        statusSyncInterval: null    // ID интервала периодической синхронизации статуса серверов
    },
    sidebarGroups: null,       // null = legacy mode, array = group mode
    groupCollapseState: {},    // { groupName: boolean } — collapse состояние групп sidebar
    control: {
        enabled: false,       // включён ли контроль на сервере
        token: null,          // текущий токен (из localStorage или URL)
        isController: false,  // я контроллер?
        hasController: false, // есть активный контроллер (кто-то другой)
        timeoutSec: 60,       // таймаут неактивности
        pingIntervalId: null  // ID интервала ping
    }
};


// === 01-sse-status.js ===
// ============================================================================
// SSE Status UI
// ============================================================================

// Обновление индикатора состояния SSE в header
function updateSSEStatus(status, lastUpdate = null) {
    const container = document.getElementById('sse-status');
    const textEl = container?.querySelector('.sse-status-text');
    if (!container || !textEl) return;

    // Убираем все классы состояния
    container.classList.remove('connected', 'reconnecting', 'polling', 'disconnected');

    let text = '';
    let title = '';

    switch (status) {
        case 'connected':
            container.classList.add('connected');
            text = 'SSE';
            title = 'Connected via Server-Sent Events';
            break;
        case 'reconnecting':
            container.classList.add('reconnecting');
            text = `Reconnecting (${state.sse.reconnectAttempts}/${state.sse.maxReconnectAttempts})`;
            title = 'Attempting to restore SSE connection';
            break;
        case 'polling':
            container.classList.add('polling');
            text = 'Polling';
            title = 'Fallback mode: periodic server polling';
            break;
        case 'disconnected':
            container.classList.add('disconnected');
            text = 'Disconnected';
            title = 'No connection to server';
            break;
        default:
            text = 'Connecting...';
            title = 'Establishing connection';
    }

    // Добавляем время последнего обновления если есть
    if (lastUpdate) {
        const timeStr = lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        text += ` · ${timeStr}`;
    }

    textEl.textContent = text;
    container.title = title;
}

// Обновить доступность кнопок "Add sensor" для всех открытых вкладок
function updateAddSensorButtons() {
    const buttons = document.querySelectorAll('.add-sensor-btn');
    buttons.forEach(btn => {
        if (state.capabilities.smEnabled) {
            btn.disabled = false;
            btn.title = '';
        } else {
            btn.disabled = true;
            btn.title = 'SM not connected (-sm-url not set)';
        }
    });
}

// Обновить статус конкретного сервера
function updateServerStatus(serverId, connected) {
    const server = state.servers.get(serverId);
    if (!server) return;

    server.connected = connected;

    // Обновляем группу сервера в списке объектов
    const serverGroup = document.querySelector(`.server-group[data-server-id="${serverId}"]`);
    if (serverGroup) {
        const statusDot = serverGroup.querySelector('.server-group-header .server-status-dot');
        if (statusDot) {
            statusDot.classList.toggle('disconnected', !connected);
        }
    }

    // Обновляем элемент сервера в секции "Servers"
    const serverItem = document.querySelector(`.server-item[data-server-id="${serverId}"]`);
    if (serverItem) {
        const statusDot = serverItem.querySelector('.server-status-dot');
        if (statusDot) {
            statusDot.classList.toggle('disconnected', !connected);
        }
        // Обновляем статистику
        const statsEl = serverItem.querySelector('.server-stats');
        if (statsEl) {
            const objectCount = server.objectCount || 0;
            const connectedCount = connected ? objectCount : 0;
            statsEl.textContent = objectCount > 0 ? `${connectedCount}/${objectCount}` : '-/-';

            statsEl.classList.remove('all-connected', 'some-disconnected', 'all-disconnected');
            if (objectCount > 0) {
                if (connectedCount === objectCount) {
                    statsEl.classList.add('all-connected');
                } else if (connectedCount === 0) {
                    statsEl.classList.add('all-disconnected');
                } else {
                    statsEl.classList.add('some-disconnected');
                }
            }
        }
    }

    // Обновляем бейджи серверов в табах
    document.querySelectorAll(`.tab-server-badge[data-server-id="${serverId}"]`)
        .forEach(el => el.classList.toggle('disconnected', !connected));

    // Обновляем состояние кнопок и панелей табов
    document.querySelectorAll(`.tab-btn[data-server-id="${serverId}"], .tab-panel[data-server-id="${serverId}"]`)
        .forEach(el => el.classList.toggle('server-disconnected', !connected));

    // Обновляем статус в sidebar группах
    if (typeof updateGroupEntityStatus === 'function') {
        updateGroupEntityStatus('server', serverId, connected);
    }
}


// === 02-control.js ===
// ============================================================================
// Session Control - управление сессиями записи
// ============================================================================

// Инициализация токена контроля
function initControlToken() {
    // 1. Проверяем URL параметр
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
        state.control.token = urlToken;
        localStorage.setItem('control-token', urlToken);
        // Убираем токен из URL (безопасность)
        urlParams.delete('token');
        const newUrl = urlParams.toString()
            ? `${window.location.pathname}?${urlParams.toString()}`
            : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        console.log('Control: Token loaded from URL');
    } else {
        // 2. Проверяем localStorage
        state.control.token = localStorage.getItem('control-token');
        if (state.control.token) {
            console.log('Control: Token loaded from localStorage');
        }
    }
}

// Проверка возможности управления
function canControl() {
    // Если контроль отключён - разрешено всем
    if (!state.control.enabled) return true;
    // Иначе только контроллеру
    return state.control.isController;
}

// Обновление статуса контроля из данных сервера
function updateControlStatus(status) {
    // Equality check — control_status SSE event прилетает на каждом poll,
    // не имеет смысла пересчитывать UI и dispatch'ить controlStatusChanged
    // если ничего по существу не изменилось (особенно важно для активных
    // widget'ов: каждый делает DOM mutations в _updateInteractivityClass).
    const changed =
        state.control.enabled       !== status.enabled       ||
        state.control.hasController !== status.hasController ||
        state.control.isController  !== status.isController;

    state.control.enabled = status.enabled;
    state.control.hasController = status.hasController;
    state.control.isController = status.isController;
    state.control.timeoutSec = status.timeoutSec || 60;

    if (!changed) return;

    updateControlUI();
    updateAllControlButtons();
    // Notify active dashboard widgets so they can refresh their interactivity class.
    document.dispatchEvent(new CustomEvent('controlStatusChanged', {
        detail: { ...state.control }
    }));
}

// Обновление UI контроля (компактный индикатор в шапке)
function updateControlUI() {
    const statusEl = document.getElementById('control-status');
    if (!statusEl) return;

    // Скрываем если контроль отключён
    if (!state.control.enabled) {
        statusEl.classList.add('hidden');
        return;
    }

    statusEl.classList.remove('hidden');
    statusEl.classList.remove('control-status-readonly', 'control-status-active');

    if (state.control.isController) {
        statusEl.classList.add('control-status-active');
        statusEl.innerHTML = `
            <span class="control-status-icon">✓</span>
            <span class="control-status-text">Control</span>
            <button class="control-status-btn" onclick="releaseControl()">Release</button>
        `;
    } else {
        statusEl.classList.add('control-status-readonly');
        statusEl.innerHTML = `
            <span class="control-status-icon">🔒</span>
            <span class="control-status-text">Read-only</span>
            <button class="control-status-btn" onclick="showControlDialog()">Take</button>
        `;
    }
}

// Обновление всех кнопок управления (disabled состояние)
function updateAllControlButtons() {
    const canCtrl = canControl();
    const readonlyTitle = canCtrl ? '' : 'Read-only mode - take control first';

    // IONC кнопки
    document.querySelectorAll('.ionc-btn-set, .ionc-btn-freeze, .ionc-btn-unfreeze, .ionc-btn-gen, .ionc-btn-gen-stop').forEach(btn => {
        // Не трогаем readonly сенсоры - они всегда disabled
        if (btn.closest('tr')?.classList.contains('ionc-sensor-readonly')) return;
        btn.disabled = !canCtrl;
        btn.title = readonlyTitle;
    });

    // Modbus/OPCUA control кнопки
    document.querySelectorAll('.btn-take-control, .btn-release-control').forEach(btn => {
        btn.disabled = !canCtrl;
    });

    // Кнопки сохранения параметров и команд логера
    document.querySelectorAll('[id^="mb-params-save-"], [id^="mbs-params-save-"], [id^="opcua-params-save-"], [id^="opcuasrv-params-save-"], .log-command-btn').forEach(btn => {
        btn.disabled = !canCtrl;
        btn.title = readonlyTitle;
    });
}

// Показать диалог ввода токена
function showControlDialog() {
    const overlay = document.getElementById('control-dialog-overlay');
    if (overlay) {
        overlay.classList.add('visible');
        const input = document.getElementById('control-token-input');
        if (input) {
            input.value = state.control.token || '';
            input.focus();
        }
    }
}

// Закрыть диалог
function closeControlDialog() {
    const overlay = document.getElementById('control-dialog-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
    }
    const error = document.getElementById('control-error');
    if (error) {
        error.textContent = '';
    }
}

// Попытка захвата управления
async function tryTakeControl(token) {
    if (!token) {
        token = document.getElementById('control-token-input')?.value?.trim();
    }
    if (!token) {
        showControlError('Token is required');
        return;
    }

    try {
        const resp = await fetch('/api/control/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await resp.json();

        if (!resp.ok) {
            showControlError(data.error || 'Failed to take control');
            return;
        }

        // Успешно
        state.control.token = token;
        localStorage.setItem('control-token', token);
        updateControlStatus(data);
        closeControlDialog();
        startControlPing();

        // Переподключаем SSE с токеном
        reconnectSSEWithToken();

    } catch (e) {
        showControlError('Network error: ' + e.message);
    }
}

// Освобождение управления
async function releaseControl() {
    if (!state.control.token) return;

    try {
        const resp = await fetch('/api/control/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: state.control.token })
        });

        const data = await resp.json();

        if (resp.ok) {
            stopControlPing();
            updateControlStatus(data);
        }
    } catch (e) {
        console.error('Failed to release control:', e);
    }
}

// Показать ошибку в диалоге
function showControlError(message) {
    const error = document.getElementById('control-error');
    if (error) {
        error.textContent = message;
    }
}

// Запуск периодического ping
function startControlPing() {
    stopControlPing();
    if (!state.control.isController || !state.control.token) return;

    // Ping каждые 30 секунд
    state.control.pingIntervalId = setInterval(async () => {
        try {
            await fetch('/api/control/ping', {
                method: 'POST',
                headers: { 'X-Control-Token': state.control.token }
            });
        } catch (e) {
            console.warn('Control ping failed:', e);
        }
    }, CONTROL_PING_INTERVAL);
}

// Остановка ping
function stopControlPing() {
    if (state.control.pingIntervalId) {
        clearInterval(state.control.pingIntervalId);
        state.control.pingIntervalId = null;
    }
}

// Переподключение SSE с токеном
function reconnectSSEWithToken() {
    if (state.sse.eventSource) {
        state.sse.eventSource.close();
    }
    initSSE();
}

// Fetch wrapper с автоматическим добавлением токена контроля
async function controlledFetch(url, options = {}) {
    // Добавляем токен для не-GET запросов
    if (options.method && options.method !== 'GET' && state.control.token) {
        options.headers = {
            ...options.headers,
            'X-Control-Token': state.control.token
        };
    }

    const response = await fetch(url, options);

    // Обработка ошибки контроля
    if (response.status === 403) {
        try {
            const data = await response.clone().json();
            if (data.code === 'CONTROL_REQUIRED') {
                showControlRequiredNotification();
                throw new Error('Control required');
            }
        } catch (e) {
            // Игнорируем ошибку парсинга
        }
    }

    return response;
}

// Показать уведомление о необходимости контроля
function showControlRequiredNotification() {
    // Показываем диалог контроля
    showControlDialog();
}


// === 03-recording.js ===
// ========== Recording Functions ==========

// State for recording
const recordingState = {
    enabled: false,
    isRecording: false,
    recordCount: 0,
    sizeBytes: 0,
    statusPollInterval: null
};

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

// Format number with abbreviation
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
}

// Initialize recording UI
function initRecordingUI() {
    const statusEl = document.getElementById('recording-status');
    const toggleBtn = document.getElementById('recording-toggle-btn');
    const downloadBtn = document.getElementById('recording-download-btn');
    const dropdownMenu = document.getElementById('recording-dropdown-menu');

    if (!statusEl) return;

    // Toggle recording button
    toggleBtn?.addEventListener('click', async () => {
        try {
            const endpoint = recordingState.isRecording ? '/api/recording/stop' : '/api/recording/start';
            const response = await fetch(endpoint, { method: 'POST' });
            if (response.ok) {
                await updateRecordingStatus();
            } else {
                console.error('Recording toggle failed:', response.status);
            }
        } catch (err) {
            console.error('Recording toggle error:', err);
        }
    });

    // Download dropdown toggle
    downloadBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu?.classList.toggle('hidden');
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
        dropdownMenu?.classList.add('hidden');
    });

    // Dropdown menu items
    dropdownMenu?.addEventListener('click', async (e) => {
        const item = e.target.closest('.recording-dropdown-item');
        if (!item) return;

        e.stopPropagation();
        dropdownMenu.classList.add('hidden');

        const format = item.dataset.format;
        const action = item.dataset.action;

        if (action === 'clear') {
            if (confirm('Clear all recording data?\n\nThis will delete all recorded history and cannot be undone.')) {
                try {
                    const response = await fetch('/api/recording/clear', { method: 'DELETE' });
                    if (response.ok) {
                        await updateRecordingStatus();
                    }
                } catch (err) {
                    console.error('Clear recording error:', err);
                }
            }
            return;
        }

        if (format) {
            // Download export file
            let url;
            switch (format) {
                case 'sqlite':
                    url = '/api/export/database';
                    break;
                case 'csv':
                    url = '/api/export/csv';
                    break;
                case 'json':
                    url = '/api/export/json';
                    break;
            }
            if (url) {
                window.location.href = url;
            }
        }
    });

    // Initial status fetch
    updateRecordingStatus();

    // Start polling for status updates (every 5 seconds)
    recordingState.statusPollInterval = setInterval(updateRecordingStatus, RECORDING_STATUS_POLL_INTERVAL);
}

// Update recording status from API
async function updateRecordingStatus() {
    try {
        const response = await fetch('/api/recording/status');
        if (!response.ok) {
            // API not available - hide UI
            recordingState.enabled = false;
            updateRecordingUI();
            return;
        }

        const data = await response.json();
        // Check if recording is configured on server
        recordingState.enabled = data.configured === true;
        recordingState.isRecording = data.isRecording || false;
        recordingState.recordCount = data.recordCount || 0;
        recordingState.sizeBytes = data.sizeBytes || 0;

        updateRecordingUI();
    } catch (err) {
        // API error - hide UI
        recordingState.enabled = false;
        updateRecordingUI();
    }
}

// Update recording UI based on state
function updateRecordingUI() {
    const statusEl = document.getElementById('recording-status');
    const badge = document.getElementById('recording-badge');
    const toggleBtn = document.getElementById('recording-toggle-btn');

    if (!statusEl) return;

    // Show/hide entire recording section
    if (!recordingState.enabled) {
        statusEl.classList.add('hidden');
        return;
    }
    statusEl.classList.remove('hidden');

    // Update recording state
    const isRec = recordingState.isRecording;
    const hasData = isRec || recordingState.recordCount > 0;

    statusEl.classList.toggle('recording', isRec);
    toggleBtn.textContent = isRec ? 'Stop' : 'Record';
    toggleBtn.title = isRec ? 'Stop recording' : 'Start recording';
    badge.classList.toggle('hidden', !hasData);
    if (hasData) {
        badge.textContent = `${formatNumber(recordingState.recordCount)} / ${formatBytes(recordingState.sizeBytes)}`;
    }
}


// === 04-sse.js ===
// Общая функция обновления графиков из SSE batch-события
// items - массив элементов с полями name, value, supplier (опционально)
// prefix - префикс для varName (mb, ext, ws, io)
// options.showSupplier - обновлять ли supplier в легенде
function updateChartsFromBatch(tabKey, items, prefix, timestamp, options = {}) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;
    const ts = timestamp ? new Date(timestamp) : new Date();
    const chartsToUpdate = new Set();
    const displayName = tabState.displayName || '';
    for (const item of items) {
        const varName = `${prefix}:${item.name}`;
        const chartData = tabState.charts.get(varName);
        if (!chartData) continue;
        chartData.chart.data.datasets[0].data.push({ x: ts, y: item.value });
        chartsToUpdate.add(varName);
        // Обновляем значение в легенде
        const safeVarName = varName.replace(/:/g, '-');
        const legendEl = getElementInTab(tabKey, `legend-value-${displayName}-${safeVarName}`);
        if (legendEl) legendEl.textContent = formatValue(item.value);
        // Поставщик (опционально — для IONC, UWSGate)
        if (options.showSupplier) {
            const supplierEl = getElementInTab(tabKey, `legend-supplier-${displayName}-${safeVarName}`);
            if (supplierEl) supplierEl.textContent = item.supplier || '';
        }
    }
    if (chartsToUpdate.size > 0) {
        // Обрезаем данные только у обновлённых графиков
        chartsToUpdate.forEach(varName => {
            const chartData = tabState.charts.get(varName);
            if (!chartData) return;
            const data = chartData.chart.data.datasets[0].data;
            while (data.length > MAX_CHART_POINTS) data.shift();
        });
        // Пропускаем отрисовку если на паузе (данные уже накоплены выше)
        if (!tabState.chartsPaused) {
            syncAllChartsTimeRange(tabKey);
        }
    }
}

function initSSE() {
    // Очищаем таймер переподключения (если есть)
    if (state.sse.reconnectTimerId) {
        clearTimeout(state.sse.reconnectTimerId);
        state.sse.reconnectTimerId = null;
    }

    if (state.sse.eventSource) {
        state.sse.eventSource.close();
    }

    // Формируем URL с токеном если есть
    let url = '/api/events';
    if (state.control.token) {
        url += `?token=${encodeURIComponent(state.control.token)}`;
    }
    console.log('SSE: Подключение к', url);

    const eventSource = new EventSource(url);
    state.sse.eventSource = eventSource;

    eventSource.addEventListener('connected', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.sse.connected = true;
            state.sse.reconnectAttempts = 0;
            state.sse.pollInterval = data.data?.pollInterval || 5000;

            // Сохраняем capabilities сервера
            state.capabilities.smEnabled = data.data?.smEnabled || false;
            console.log('SSE: Подключено, poll interval:', state.sse.pollInterval, 'ms, smEnabled:', state.capabilities.smEnabled);

            // Обновляем статус контроля
            if (data.data?.control) {
                updateControlStatus(data.data.control);
                // Если мы контроллер, запускаем ping
                if (state.control.isController) {
                    startControlPing();
                }
            }

            // Обновляем индикатор статуса
            updateSSEStatus('connected', new Date());

            // Обновляем доступность кнопок "Add sensor"
            updateAddSensorButtons();

            // Синхронизируем статусы серверов при переподключении
            // Это важно, т.к. могли пропустить события server_status во время отключения
            refreshObjectsList();

            // Переподписываемся на все SSE обновления (сервер мог потерять состояние подписок)
            setTimeout(resubscribeAll, SSE_RESUBSCRIBE_DELAY);

            // Отключаем polling fallback если был активен
            disablePollingFallback();

            // Запускаем периодическую синхронизацию статуса серверов
            // (ловит пропущенные server_status SSE-события)
            startServerStatusSync();

            // Обновляем статусы в sidebar группах
            if (typeof applySidebarStatuses === 'function') {
                applySidebarStatuses();
            }
        } catch (err) {
            console.warn('SSE: Error парсинга connected:', err);
        }
    });

    eventSource.addEventListener('object_data', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId, data, timestamp } = event;

            // Обновляем время последнего обновления в индикаторе
            updateSSEStatus('connected', new Date());

            // Формируем ключ вкладки: serverId:objectName
            const tabKey = `${serverId}:${objectName}`;

            // Обновляем UI только для открытых вкладок
            const tabState = state.tabs.get(tabKey);
            if (tabState) {
                // Обновляем рендерер (таблицы, статистика и т.д.)
                if (tabState.renderer) {
                    tabState.renderer.update(data);
                }

                // Обновляем графики напрямую из SSE данных (данные копятся всегда, отрисовка — если не на паузе)
                const eventTimestamp = new Date(timestamp);
                tabState.charts.forEach((chartData, varName) => {
                    // Пропускаем внешние датчики (ext:) - они обновляются через sensor_data
                    if (varName.startsWith('ext:')) {
                        return;
                    }

                    // Извлекаем значение из data в зависимости от типа переменной
                    let value = undefined;

                    // Проверяем io.in.* переменные
                    if (varName.startsWith('io.in.')) {
                        const ioKey = varName.substring('io.in.'.length);
                        if (data.io?.in?.[ioKey]) {
                            value = data.io.in[ioKey].value;
                        }
                    }
                    // Проверяем io.out.* переменные
                    else if (varName.startsWith('io.out.')) {
                        const ioKey = varName.substring('io.out.'.length);
                        if (data.io?.out?.[ioKey]) {
                            value = data.io.out[ioKey].value;
                        }
                    }

                    // Если нашли значение - добавляем точку на график
                    if (value !== undefined) {
                        const dataPoint = { x: eventTimestamp, y: value };
                        chartData.chart.data.datasets[0].data.push(dataPoint);

                        // Ограничиваем количество точек
                        if (chartData.chart.data.datasets[0].data.length > MAX_CHART_POINTS) {
                            chartData.chart.data.datasets[0].data.shift();
                        }
                    }
                });

                // Пропускаем отрисовку если на паузе (данные уже накоплены выше)
                if (tabState.chartsPaused) return;

                // Синхронизируем временную шкалу для всех графиков объекта
                syncAllChartsTimeRange(tabKey);

                // Обновляем все графики одним batch update
                tabState.charts.forEach((chartData, varName) => {
                    if (!varName.startsWith('ext:')) {
                        chartData.chart.update('none');
                    }
                });
            }
        } catch (err) {
            console.warn('SSE: Error обработки object_data:', err);
        }
    });

    // Обработка обновлений внешних датчиков из SM (SharedMemory)
    // Backend отправляет serverId="sm" для SM событий
    eventSource.addEventListener('sensor_data', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensor = event.data;

            // Формируем tabKey из serverId и objectName
            const tabKey = serverId
                ? `${serverId}:${objectName}`
                : findTabKeyByDisplayName(objectName); // fallback для legacy
            if (!tabKey) return;

            // Обновляем график (одиночный сенсор — оборачиваем в массив)
            updateChartsFromBatch(tabKey, [sensor], 'ext', event.timestamp);
        } catch (err) {
            console.warn('SSE: Error обработки sensor_data:', err);
        }
    });

    // Обработка батча обновлений IONC датчиков (SharedMemory и подобные)
    eventSource.addEventListener('ionc_sensor_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensors = event.data;

            // Cache sensor values for dashboard initialization (по sensorKey).
            const now = Date.now();
            for (const sensor of sensors) {
                const key = makeSensorKey(serverId, objectName, sensor.name);
                state.sensorValuesCache.set(key, {
                    value: sensor.value,
                    error: sensor.error || null,
                    timestamp: now
                });
            }

            // Обновляем виджеты на dashboard (с контекстом для построения sensorKey).
            updateDashboardWidgets(sensors, { serverId, objectName, timestamp: event.timestamp || null });

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            // Обновляем таблицу датчиков
            for (const sensor of sensors) {
                if (tabState.renderer?.handleIONCSensorUpdate) {
                    tabState.renderer.handleIONCSensorUpdate(sensor);
                }
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, sensors, 'io', event.timestamp, { showSupplier: true });
        } catch (err) {
            console.warn('SSE: Error обработки ionc_sensor_batch:', err);
        }
    });

    // Обработка батча обновлений Modbus регистров (ModbusMaster, ModbusSlave)
    eventSource.addEventListener('modbus_register_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const registers = event.data;

            updateDashboardWidgets(registers, { serverId, objectName, timestamp: event.timestamp || null });

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            const renderer = tabState.renderer;
            if (!renderer) return;
            const isMaster = renderer.constructor.name === 'ModbusMasterRenderer';
            const isSlave = renderer.constructor.name === 'ModbusSlaveRenderer';
            if (!isMaster && !isSlave) return;

            // Обновляем таблицу регистров
            if (typeof renderer.handleModbusRegisterUpdates === 'function') {
                renderer.handleModbusRegisterUpdates(registers);
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, registers, 'mb', event.timestamp);
        } catch (err) {
            console.warn('SSE: Error обработки modbus_register_batch:', err);
        }
    });

    // Обработка батча обновлений OPCUA датчиков (OPCUAExchange, OPCUAServer)
    eventSource.addEventListener('opcua_sensor_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensors = event.data;

            updateDashboardWidgets(sensors, { serverId, objectName, timestamp: event.timestamp || null });

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            const renderer = tabState.renderer;
            const isExchange = renderer && renderer.constructor.name === 'OPCUAExchangeRenderer';
            const isServer = renderer && renderer.constructor.name === 'OPCUAServerRenderer';
            if (!isExchange && !isServer) return;

            // Обновляем таблицу датчиков
            if (typeof renderer.handleOPCUASensorUpdates === 'function') {
                renderer.handleOPCUASensorUpdates(sensors);
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, sensors, 'ext', event.timestamp);
        } catch (err) {
            console.warn('SSE: Error обработки opcua_sensor_batch:', err);
        }
    });

    // Обработка батча обновлений UWebSocketGate датчиков
    eventSource.addEventListener('uwsgate_sensor_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensors = event.data;

            updateDashboardWidgets(sensors, { serverId, objectName, timestamp: event.timestamp || null });

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            const renderer = tabState.renderer;
            if (!renderer || renderer.constructor.name !== 'UWebSocketGateRenderer') return;

            // Обновляем таблицу датчиков
            if (typeof renderer.handleSSEUpdate === 'function') {
                renderer.handleSSEUpdate(sensors);
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, sensors, 'ws', event.timestamp, { showSupplier: true });
        } catch (err) {
            console.warn('SSE: Error обработки uwsgate_sensor_batch:', err);
        }
    });

    // Обработка изменений статуса серверов
    eventSource.addEventListener('server_status', (e) => {
        try {
            const event = JSON.parse(e.data);
            const serverId = event.serverId;
            const connected = event.data?.connected ?? false;
            console.log(`SSE: Сервер ${serverId} ${connected ? 'подключен' : 'отключен'}`);
            updateServerStatus(serverId, connected);
        } catch (err) {
            console.warn('SSE: Error обработки server_status:', err);
        }
    });

    // Обработка обновления списка объектов (при восстановлении связи)
    eventSource.addEventListener('objects_list', (e) => {
        try {
            const event = JSON.parse(e.data);
            const serverId = event.serverId;
            const serverName = event.serverName;
            const objects = event.data?.objects ?? [];
            console.log(`SSE: Сервер ${serverId} восстановил связь, объектов: ${objects.length}`);

            // Обновляем статус сервера
            updateServerStatus(serverId, true);

            // Обновляем список объектов в sidebar
            refreshObjectsList();

            // Обновляем sidebar группы (могли появиться новые объекты)
            if (typeof refreshSidebarGroups === 'function') {
                refreshSidebarGroups();
            }
        } catch (err) {
            console.warn('SSE: Error обработки objects_list:', err);
        }
    });

    // Обработка изменения статуса контроля
    eventSource.addEventListener('control_status', (e) => {
        try {
            const event = JSON.parse(e.data);
            console.log('SSE: Control status changed:', event.data);
            // Обновляем isController на основе нашего токена
            const status = event.data;
            status.isController = state.control.token &&
                status.hasController &&
                state.control.isController; // сохраняем если мы были контроллером

            // Сервер не знает чей это токен, нужно запросить статус
            fetch('/api/control/status', {
                headers: { 'X-Control-Token': state.control.token || '' }
            })
                .then(r => r.json())
                .then(data => {
                    updateControlStatus(data);
                })
                .catch(err => {
                    console.warn('Failed to refresh control status:', err);
                    // Fallback: используем данные из события
                    updateControlStatus(status);
                });
        } catch (err) {
            console.warn('SSE: Error обработки control_status:', err);
        }
    });

    // Обработка статуса Launcher'а
    eventSource.addEventListener('launcher_status', (e) => {
        try {
            const event = JSON.parse(e.data);
            const tabKey = `launcher:${event.serverId}`;
            const tabState = state.tabs.get(tabKey);
            if (tabState?.renderer?.updateStatus) {
                tabState.renderer.updateStatus(event.data);
            }
            // Обновляем индикатор в sidebar
            updateLauncherNodeStatus(event.serverId, true);
        } catch (err) {
            console.warn('SSE: Error обработки launcher_status:', err);
        }
    });

    // Обработка connectivity Launcher'а
    eventSource.addEventListener('launcher_connection', (e) => {
        try {
            const event = JSON.parse(e.data);
            const connected = event.data?.connected ?? false;
            updateLauncherNodeStatus(event.serverId, connected);

            // Обновляем renderer если вкладка открыта
            const tabKey = `launcher:${event.serverId}`;
            const tabState = state.tabs.get(tabKey);
            if (tabState?.renderer?.updateConnectionStatus) {
                tabState.renderer.updateConnectionStatus(connected);
            }
        } catch (err) {
            console.warn('SSE: Error обработки launcher_connection:', err);
        }
    });

    // Обработка изменения connectivity журнала
    eventSource.addEventListener('journal_connection', (e) => {
        try {
            const event = JSON.parse(e.data);
            const journalId = event.data?.journalId;
            const connected = event.data?.connected ?? false;
            if (journalId && typeof updateJournalConnectionStatus === 'function') {
                updateJournalConnectionStatus(journalId, connected);
            }
        } catch (err) {
            console.warn('SSE: Error обработки journal_connection:', err);
        }
    });

    // Обработка сообщений журнала
    eventSource.addEventListener('journal_messages', (e) => {
        try {
            const event = JSON.parse(e.data);
            const data = event.data;
            if (data && journalManager) {
                journalManager.handleSSEMessage(data);
            }
        } catch (err) {
            console.warn('SSE: Error обработки journal_messages:', err);
        }
    });

    eventSource.onerror = (e) => {
        console.warn('SSE: Error соединения');
        state.sse.connected = false;
        stopServerStatusSync();

        // Закрываем EventSource чтобы предотвратить нативный auto-reconnect браузера,
        // который стреляет дополнительными onerror и быстро расходует счётчик попыток
        // (аналогично handleConnectionError в LogViewer)
        if (state.sse.eventSource) {
            state.sse.eventSource.close();
            state.sse.eventSource = null;
        }

        if (state.sse.reconnectAttempts < state.sse.maxReconnectAttempts) {
            state.sse.reconnectAttempts++;
            // Exponential backoff: baseDelay * 2^(attempt-1) с jitter ±10%
            const expDelay = state.sse.baseReconnectDelay * Math.pow(2, state.sse.reconnectAttempts - 1);
            const cappedDelay = Math.min(expDelay, state.sse.maxReconnectDelay);
            const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1); // ±10%
            const delay = Math.round(cappedDelay + jitter);
            console.log(`SSE: Переподключение через ${delay}ms (попытка ${state.sse.reconnectAttempts}/${state.sse.maxReconnectAttempts})`);
            updateSSEStatus('reconnecting');
            state.sse.reconnectTimerId = setTimeout(initSSE, delay);
        } else {
            console.warn('SSE: Превышено количество попыток, переход на polling');
            updateSSEStatus('polling');
            enablePollingFallback();
        }
    };

    eventSource.onopen = () => {
        console.log('SSE: Соединение открыто');
    };
}

// Включить polling как fallback при недоступности SSE
function enablePollingFallback() {
    console.log('Polling: Включение fallback режима');

    // Периодически обновляем sidebar (статусы серверов и список объектов)
    state.sse.sidebarPollInterval = setInterval(() => {
        refreshObjectsList();
    }, state.sse.pollInterval * 6); // Реже чем данные объектов

    state.tabs.forEach((tabState, tabKey) => {
        // Включаем polling для данных объекта
        if (!tabState.updateInterval) {
            tabState.updateInterval = setInterval(
                () => loadObjectData(tabKey),
                state.sse.pollInterval
            );
            console.log('Polling: Включен для', tabState.displayName, '(tab:', tabKey, ')');
        }

        // Включаем polling для графиков
        const displayName = tabState.displayName;
        tabState.charts.forEach((chartData, varName) => {
            if (!chartData.updateInterval) {
                chartData.updateInterval = setInterval(async () => {
                    await updateChart(displayName, varName, chartData.chart);
                }, state.sse.pollInterval);
            }
        });
    });

    // Запускаем периодическую проверку доступности SSE
    startSSERecoveryProbe();
}

// Отключить polling fallback (при восстановлении SSE)
function disablePollingFallback() {
    console.log('Polling: Отключение fallback режима');

    // Останавливаем polling sidebar
    if (state.sse.sidebarPollInterval) {
        clearInterval(state.sse.sidebarPollInterval);
        state.sse.sidebarPollInterval = null;
    }

    // Останавливаем recovery probe
    if (state.sse.recoveryProbeInterval) {
        clearInterval(state.sse.recoveryProbeInterval);
        state.sse.recoveryProbeInterval = null;
    }

    // Очищаем таймер переподключения
    if (state.sse.reconnectTimerId) {
        clearTimeout(state.sse.reconnectTimerId);
        state.sse.reconnectTimerId = null;
    }

    // Останавливаем polling для всех вкладок
    state.tabs.forEach((tabState, tabKey) => {
        if (tabState.updateInterval) {
            clearInterval(tabState.updateInterval);
            tabState.updateInterval = null;
        }
        tabState.charts.forEach((chartData) => {
            if (chartData.updateInterval) {
                clearInterval(chartData.updateInterval);
                chartData.updateInterval = null;
            }
        });
    });
}

// Периодическая проверка доступности сервера для восстановления SSE
function startSSERecoveryProbe() {
    if (state.sse.recoveryProbeInterval) return;

    console.log('SSE: Запуск recovery probe каждые', SSE_RECOVERY_PROBE_INTERVAL, 'ms');

    state.sse.recoveryProbeInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/version', { method: 'HEAD' });
            if (response.ok) {
                console.log('SSE: Сервер доступен, восстанавливаем SSE');
                disablePollingFallback();
                state.sse.reconnectAttempts = 0;
                initSSE();
            }
        } catch (err) {
            // Сервер всё ещё недоступен
        }
    }, SSE_RECOVERY_PROBE_INTERVAL);
}

// Периодическая синхронизация статуса серверов, launcher'ов и журналов (каждые 30с)
function startServerStatusSync() {
    stopServerStatusSync();
    state.sse.statusSyncInterval = setInterval(async () => {
        // Серверы
        try {
            const resp = await fetchServers();
            if (resp?.servers) {
                resp.servers.forEach(s => updateServerStatus(s.id, s.connected));
            }
        } catch (err) { /* фоновая синхронизация */ }

        // Launcher'ы
        try {
            const lr = await fetch('/api/launchers');
            if (lr.ok) {
                const data = await lr.json();
                (data?.launchers || []).forEach(l => updateLauncherNodeStatus(l.id, l.connected));
            }
        } catch (err) { /* фоновая синхронизация */ }

        // Журналы
        try {
            const jr = await fetch('/api/journals');
            if (jr.ok) {
                const data = await jr.json();
                if (typeof updateJournalConnectionStatus === 'function') {
                    (data || []).forEach(j => updateJournalConnectionStatus(j.id, j.connected));
                }
            }
        } catch (err) { /* фоновая синхронизация */ }
    }, SSE_RECOVERY_PROBE_INTERVAL);
}

function stopServerStatusSync() {
    if (state.sse.statusSyncInterval) {
        clearInterval(state.sse.statusSyncInterval);
        state.sse.statusSyncInterval = null;
    }
}

// Переподписка всех открытых вкладок после восстановления SSE
function resubscribeAll() {
    console.log('SSE: Переподписка всех вкладок после переподключения');
    state.tabs.forEach((tabState, tabKey) => {
        const renderer = tabState.renderer;
        if (renderer?.resubscribeIfNeeded) {
            renderer.resubscribeIfNeeded();
        }
    });
}

// Обновление графиков при возврате на вкладку браузера
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        state.tabs.forEach((tabState, tabKey) => {
            if (tabState.charts && tabState.charts.size > 0) {
                tabState.charts.forEach((chartData, varName) => {
                    if (chartData.chart) {
                        try {
                            syncAllChartsTimeRange(tabKey);
                            chartData.chart.update();
                        } catch (err) {
                            console.warn('Chart visibility update error:', varName, err);
                        }
                    }
                });
            }
        });
    }
});



// === 06-utils.js ===
// ============================================================================
// Общие утилиты
// ============================================================================

// Экранирование HTML для безопасной вставки текста
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
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

// Универсальный resize-handle: mousedown → mousemove → mouseup паттерн
function setupResizeHandle(handle, container, minHeight, onSave) {
    if (!handle || !container) return;
    let startY = 0, startHeight = 0, isResizing = false;

    const onMouseMove = (e) => {
        if (!isResizing) return;
        const newHeight = Math.max(minHeight, startHeight + e.clientY - startY);
        container.style.height = `${newHeight}px`;
        container.style.maxHeight = `${newHeight}px`;
    };
    const onMouseUp = () => {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onSave(container.offsetHeight);
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


// === 08-signal-generator.js ===
// ============================================================================
// SignalGenerator — общий движок генерации сигналов
// (square/sin/cos/linear/random) с lifecycle тиков.
//
// Используется IONC renderer'ом (20-ionc-renderer.js) и активными виджетами
// dashboard'а (61-active-generator.js).
//
// Контракт: pure value-functions + setInterval-менеджер + onTick колбэк.
// ============================================================================

class SignalGenerator {
    /**
     * @param {Object} cfg
     * @param {string} cfg.type   'square' | 'sin' | 'cos' | 'linear' | 'random'
     * @param {number} cfg.min
     * @param {number} cfg.max
     * @param {number} [cfg.step]         для linear/sin/cos
     * @param {number} [cfg.pause]        для linear/sin/cos/square (мс)
     * @param {number} [cfg.pulseWidth]   для square (мс)
     * @param {number} [cfg.period]       для random (мс)
     * @param {Function} cfg.onTick       (value) => void
     */
    constructor(cfg) {
        this.type = cfg.type;
        this.min = cfg.min;
        this.max = cfg.max;
        this.step = cfg.step;
        this.pause = cfg.pause;
        this.pulseWidth = cfg.pulseWidth;
        this.period = cfg.period;
        this.onTick = cfg.onTick;

        this.intervalId = null;
        this.startTime = 0;
    }

    // Интервал обновления подбирается по типу — ~20 обновлений за период.
    computeUpdateInterval() {
        if (this.type === 'square') {
            return Math.max(50, Math.floor((this.pulseWidth + this.pause) / 20));
        }
        if (this.type === 'linear' || this.type === 'sin' || this.type === 'cos') {
            return Math.min(this.pause, 50);
        }
        // random
        return Math.max(50, Math.floor(this.period / 20));
    }

    // Чистая функция — текущее значение по elapsed-ms от startTime.
    computeValue(elapsed) {
        const range = this.max - this.min;
        let value;

        switch (this.type) {
            case 'sin':
            case 'cos': {
                const numPoints = this.step;
                const fullCycle = numPoints * this.pause;
                const positionInCycle = elapsed % fullCycle;
                const pointIndex = Math.floor(positionInCycle / this.pause);
                const phase = (pointIndex / numPoints) * 2 * Math.PI;
                const wave = this.type === 'sin' ? Math.sin(phase) : Math.cos(phase);
                value = Math.round(this.min + (wave + 1) / 2 * range);
                break;
            }
            case 'linear': {
                const absStep = Math.abs(this.step);
                const numStepsFirst = Math.floor(range / absStep) + 1;
                const numStepsSecond = Math.floor(range / absStep) - 1;
                const totalSteps = numStepsFirst + numStepsSecond;
                const fullCycle = totalSteps * this.pause;
                const positionInCycle = elapsed % fullCycle;
                const stepNumber = Math.floor(positionInCycle / this.pause);

                if (this.step > 0) {
                    if (stepNumber < numStepsFirst) {
                        value = this.min + stepNumber * absStep;
                    } else {
                        const downStepNumber = stepNumber - numStepsFirst;
                        value = this.max - (downStepNumber + 1) * absStep;
                    }
                } else {
                    if (stepNumber < numStepsFirst) {
                        value = this.max - stepNumber * absStep;
                    } else {
                        const upStepNumber = stepNumber - numStepsFirst;
                        value = this.min + (upStepNumber + 1) * absStep;
                    }
                }
                break;
            }
            case 'random': {
                value = Math.round(this.min + Math.random() * range);
                break;
            }
            case 'square': {
                const totalPeriod = this.pulseWidth + this.pause;
                const positionInCycle = elapsed % totalPeriod;
                value = positionInCycle < this.pulseWidth ? this.max : this.min;
                break;
            }
            default:
                value = this.min;
        }

        return Math.max(this.min, Math.min(this.max, value));
    }

    start() {
        if (this.intervalId !== null) return; // уже запущен
        this.startTime = Date.now();

        const tick = () => {
            const value = this.computeValue(Date.now() - this.startTime);
            try {
                this.onTick(value);
            } catch (e) {
                console.error('SignalGenerator: onTick error', e);
            }
        };

        this.intervalId = setInterval(tick, this.computeUpdateInterval());
        tick(); // первое значение сразу
    }

    stop() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    isRunning() {
        return this.intervalId !== null;
    }
}

// Экспорт в глобальную область (соответствует style остальных файлов src/)
window.SignalGenerator = SignalGenerator;


// === 09-sensor-key.js ===
// ============================================================================
// Sensor key — canonical identity для датчика во frontend.
// Формат: ${serverId}|${objectName}|${sensorName}
// Разделитель `|` (не `:`), чтобы не путать с tabKey (serverId:objectName).
// Используется как ключ в dashboard cache/subscription Map'ах и SSE update routing.
// См. CLAUDE.md "Sensor identity (multi-server)" + spec
// docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
// ============================================================================

function makeSensorKey(serverId, objectName, sensorName) {
    return `${serverId}|${objectName}|${sensorName}`;
}

function parseSensorKey(key) {
    if (typeof key !== 'string') return null;
    const parts = key.split('|');
    if (parts.length !== 3) return null;
    return { serverId: parts[0], objectName: parts[1], sensorName: parts[2] };
}

// Прикрепляем к globalThis (работает в browser и node test env).
globalThis.makeSensorKey = makeSensorKey;
globalThis.parseSensorKey = parseSensorKey;


// === 10-base-renderer.js ===
// ============================================================================
// Система рендереров для разных типов объектов
// ============================================================================

// Реестр рендереров по типу объекта
const objectRenderers = new Map();

// ============================================================================
// Миксины для переиспользования общей функциональности
// ============================================================================

/**
 * Миксин для виртуального скролла и бесконечной подгрузки
 *
 * Группа A (полный виртуальный скролл): setupFullVirtualScroll()
 *   RAF-throttled скролл, расчёт startIndex/endIndex, spacer, бесконечная подгрузка.
 *   Рендерер должен реализовать: getVScrollItems(), vscrollRenderVisible(), vscrollLoadMore()
 *
 * Группа B (простой бесконечный скролл): setupSimpleInfiniteScroll()
 *   Только подгрузка при приближении к низу, без windowing.
 *   Рендерер должен реализовать: getVScrollItems(), vscrollLoadMore()
 */
const VirtualScrollMixin = {
    // Инициализация свойств виртуального скролла
    initVirtualScrollProps() {
        this.rowHeight = this.rowHeight || DEFAULT_ROW_HEIGHT;
        this.bufferRows = this.bufferRows || DEFAULT_BUFFER_ROWS;
        this.startIndex = 0;
        this.endIndex = 0;
        this.chunkSize = this.chunkSize || VIRTUAL_SCROLL_CHUNK_SIZE;
        this.hasMore = true;
        this.isLoadingChunk = false;
    },

    // Группа A: RAF-throttled скролл + windowing + infinite scroll
    // config: { viewportId, threshold?, thresholdType? }
    //   viewportId - ID viewport-элемента (без objectName, будет добавлен)
    //   threshold - порог подгрузки (default: VIRTUAL_SCROLL_LOAD_THRESHOLD px или 80%)
    //   thresholdType - 'px' (default) или 'percent'
    setupFullVirtualScroll(config) {
        this._vscrollViewportId = config.viewportId;
        const viewport = this.getEl(config.viewportId);
        if (!viewport) return;

        const threshold = config.threshold ?? VIRTUAL_SCROLL_LOAD_THRESHOLD;
        const thresholdType = config.thresholdType || 'px';

        let ticking = false;
        viewport.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    this._updateVisibleRows(viewport);
                    this._checkInfiniteScroll(viewport, threshold, thresholdType);
                    ticking = false;
                });
                ticking = true;
            }
        });
    },

    // Публичный метод для пересчёта видимых строк (вызывается из loadSensors/loadMoreSensors)
    updateVisibleRows() {
        const viewport = this.getEl(this._vscrollViewportId);
        if (!viewport) return;
        this._updateVisibleRows(viewport);
    },

    // Группа B: простой scroll listener для infinite scroll (без windowing)
    // config: { viewportId, threshold? }
    setupSimpleInfiniteScroll(config) {
        const viewport = this.getEl(config.viewportId);
        if (!viewport) return;

        const threshold = config.threshold || 100;
        viewport.addEventListener('scroll', () => {
            const scrollTop = viewport.scrollTop;
            const viewportHeight = viewport.clientHeight;
            const scrollHeight = viewport.scrollHeight;

            if (scrollHeight - scrollTop - viewportHeight < threshold) {
                this.vscrollLoadMore();
            }
        });
    },

    // Расчёт видимого диапазона строк
    _updateVisibleRows(viewport) {
        const scrollTop = viewport.scrollTop;
        const viewportHeight = viewport.clientHeight;
        const totalRows = this.getVScrollItems().length;
        const visibleRows = Math.ceil(viewportHeight / this.rowHeight);

        this.startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.bufferRows);
        this.endIndex = Math.min(totalRows, this.startIndex + visibleRows + 2 * this.bufferRows);

        this.vscrollRenderVisible();
    },

    // Проверка необходимости подгрузки
    _checkInfiniteScroll(viewport, threshold, thresholdType) {
        if (this.isLoadingChunk || !this.hasMore) return;

        if (thresholdType === 'percent') {
            const scrollTop = viewport.scrollTop;
            const scrollHeight = viewport.scrollHeight;
            const clientHeight = viewport.clientHeight;
            if (scrollTop + clientHeight >= scrollHeight * (threshold / 100)) {
                this.vscrollLoadMore();
            }
        } else {
            const scrollBottom = viewport.scrollTop + viewport.clientHeight;
            const totalHeight = this.getVScrollItems().length * this.rowHeight;
            if (totalHeight - scrollBottom < threshold) {
                this.vscrollLoadMore();
            }
        }
    },

    // Показать/скрыть индикатор загрузки
    showVScrollLoadingIndicator(loadingId, show) {
        const el = this.getEl(loadingId);
        if (el) el.style.display = show ? 'block' : 'none';
    }
};

/**
 * Миксин для SSE подписок на обновления датчиков/регистров
 * Требует: objectName, apiPath, idField
 */
const SSESubscriptionMixin = {
    // Подписка на SSE обновления
    // apiPath - путь API (например '/ionc', '/opcua', '/modbus')
    // ids - массив ID для подписки
    // idField - имя поля в теле запроса (например 'sensor_ids', 'register_ids')
    // logPrefix - префикс для логов
    // extraBody - дополнительные поля для тела запроса (опционально)
    async subscribeToSSEFor(apiPath, ids, idField = 'sensor_ids', logPrefix = 'SSE', extraBody = {}) {
        if (!ids || ids.length === 0) return;

        // Сохраняем параметры подписки для повторной подписки (resubscribeIfNeeded)
        this._sseSubscriptionParams = { apiPath, idField, logPrefix, extraBody };

        // Пропускаем если уже подписаны на те же ID
        const newIds = new Set(ids);
        if (this.subscribedSensorIds.size === newIds.size &&
            [...newIds].every(id => this.subscribedSensorIds.has(id))) {
            return;
        }

        try {
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}${apiPath}/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [idField]: ids, ...extraBody })
            });

            this.subscribedSensorIds = newIds;
            console.log(`${logPrefix}: подписка на ${ids.length} элементов для ${this.objectName}`);
        } catch (err) {
            console.warn(`${logPrefix}: ошибка подписки:`, err);
        }
    },

    // Отписка от SSE обновлений
    async unsubscribeFromSSEFor(apiPath, idField = 'sensor_ids', logPrefix = 'SSE') {
        if (this.subscribedSensorIds.size === 0) return;

        try {
            const ids = [...this.subscribedSensorIds];
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}${apiPath}/unsubscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [idField]: ids })
            });

            console.log(`${logPrefix}: отписка от ${ids.length} элементов для ${this.objectName}`);
            this.subscribedSensorIds.clear();
        } catch (err) {
            console.warn(`${logPrefix}: ошибка отписки:`, err);
        }
    },

    // Повторная подписка после переподключения SSE
    // Сервер мог потерять состояние подписок при рестарте
    async resubscribeIfNeeded() {
        if (this.subscribedSensorIds.size === 0) return;
        if (!this._sseSubscriptionParams) return;

        const ids = [...this.subscribedSensorIds];
        const { apiPath, idField, logPrefix, extraBody } = this._sseSubscriptionParams;

        console.log(`${logPrefix}: Переподписка ${ids.length} элементов для ${this.objectName}`);
        this.subscribedSensorIds.clear(); // Очищаем кэш чтобы subscribeToSSEFor не пропустил
        await this.subscribeToSSEFor(apiPath, ids, idField, logPrefix, extraBody);
    }
};

/**
 * Миксин для изменяемых по высоте секций с сохранением в localStorage
 */
const ResizableSectionMixin = {
    // Loading сохранённой высоты
    loadSectionHeight(storageKey, defaultHeight = DEFAULT_SECTION_HEIGHT) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const value = saved[this.tabKey] ?? saved[this.objectName];
            if (typeof value === 'number' && value > 0) {
                return value;
            }
        } catch (err) {
            console.warn('Failed to load section height:', err);
        }
        return defaultHeight;
    },

    // Сохранение высоты
    saveSectionHeight(storageKey, value) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            saved[this.tabKey] = value;
            localStorage.setItem(storageKey, JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save section height:', err);
        }
    },

    // Настройка resize для секции
    // handleId - ID элемента resize-ручки
    // containerId - ID контейнера секции
    // storageKey - ключ для localStorage
    // heightProp - имя свойства для высоты (например 'sensorsHeight')
    // options - дополнительные параметры { minHeight, maxHeight }
    setupSectionResize(handleId, containerId, storageKey, heightProp, options = {}) {
        const handle = this.getEl(handleId);
        const container = this.getEl(containerId);
        if (!handle || !container) return;

        const minHeight = options.minHeight || MIN_SECTION_HEIGHT;
        const maxHeight = options.maxHeight || MAX_SECTION_HEIGHT;

        container.style.height = `${this[heightProp]}px`;

        let startY = 0;
        let startHeight = 0;
        let isResizing = false;

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const delta = e.clientY - startY;
            const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + delta));
            container.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            const newHeight = parseInt(container.style.height, 10);
            if (!Number.isNaN(newHeight)) {
                this[heightProp] = newHeight;
                this.saveSectionHeight(storageKey, newHeight);
            }
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
};

/**
 * Миксин для фильтрации списка элементов
 */
const FilterMixin = {
    // Применение локальных фильтров к списку
    // extraFields - дополнительные поля для текстового поиска (например, ['mbreg'] для Modbus)
    // fieldAccessor - функция для получения значения поля (для вложенных объектов)
    applyFilters(items, nameField = 'name', typeField = 'type', statusField = null, extraFields = [], fieldAccessor = null) {
        let result = items;

        if (this.filter) {
            const filterLower = this.filter.toLowerCase();
            result = result.filter(item => {
                // Поиск по name
                if ((item[nameField] || '').toLowerCase().includes(filterLower)) return true;
                // Поиск по id
                if (String(item.id || '').includes(filterLower)) return true;
                // Поиск по дополнительным полям
                for (const field of extraFields) {
                    const value = fieldAccessor ? fieldAccessor(item, field) : item[field];
                    if (String(value || '').toLowerCase().includes(filterLower)) return true;
                }
                return false;
            });
        }

        if (this.typeFilter && this.typeFilter !== 'all') {
            result = result.filter(item => item[typeField] === this.typeFilter);
        }

        if (statusField && this.statusFilter && this.statusFilter !== 'all') {
            result = result.filter(item =>
                (item[statusField] || '').toLowerCase() === this.statusFilter.toLowerCase()
            );
        }

        return result;
    },

    // Полная настройка фильтров с ESC, type filter и опциональным status filter
    // onTextFilter — опциональный отдельный callback для текстового фильтра (если отличается от onFilter)
    setupFilterListeners(filterInputId, typeFilterId, onFilter, delay = FILTER_DEBOUNCE_DELAY, statusFilterId = null, onTextFilter = null) {
        const filterInput = this.getEl(filterInputId);
        const typeFilter = this.getEl(typeFilterId);
        const statusFilter = statusFilterId ? this.getEl(statusFilterId) : null;
        const textCallback = onTextFilter || onFilter;

        if (filterInput) {
            // Debounced input
            filterInput.addEventListener('input', (e) => {
                clearTimeout(this.filterDebounce);
                this.filterDebounce = setTimeout(() => {
                    this.filter = e.target.value.trim();
                    textCallback();
                }, delay);
            });

            // ESC сбрасывает фильтр
            filterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (filterInput.value) {
                        filterInput.value = '';
                        this.filter = '';
                        textCallback();
                    }
                    filterInput.blur();
                    e.preventDefault();
                }
            });
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                this.typeFilter = typeFilter.value;
                onFilter();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.statusFilter = statusFilter.value;
                onFilter();
            });
        }
    },

    // Настройка ESC на контейнере для сброса фильтра
    setupContainerEscHandler(containerId, filterInputId, onFilter) {
        const container = this.getEl(containerId);
        const filterInput = this.getEl(filterInputId);
        if (!container || !filterInput) return;

        container.setAttribute('tabindex', '0');
        container.addEventListener('click', () => container.focus());
        container.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.filter) {
                filterInput.value = '';
                this.filter = '';
                onFilter();
                e.preventDefault();
            }
        });
    }
};

// Миксин для управления доступностью секции параметров на основе httpEnabledSetParams
const ParamsAccessibilityMixin = {
    /**
     * Обновляет доступность секции параметров на основе флага httpEnabledSetParams в статусе.
     * Если httpEnabledSetParams === false:
     * - Секция сворачивается
     * - Кнопка "Apply" блокируется
     * - Все input/select в таблице параметров блокируются
     * - Показывается предупреждающее сообщение
     * - Обновляется индикатор в шапке (если есть)
     *
     * @param {string} prefix - Префикс элементов (например, 'opcua', 'opcuasrv', 'mb', 'mbs')
     */
    updateParamsAccessibility(prefix) {
        // httpEnabledSetParams может быть: true/false, 1/0, или отсутствовать
        // Если статус не загружен - не меняем состояние секции
        if (!this.status) return;

        const val = this.status.httpEnabledSetParams;
        // Разрешено если значение === true или === 1
        // Также разрешено если значение не определено (для совместимости со старыми версиями)
        const enabled = val === true || val === 1 || val === undefined;
        const explicitlyDisabled = val === false || val === 0;

        // Заблокировать кнопку "Apply" (учитываем и httpEnabledSetParams, и control token)
        const saveBtn = this.getEl(`${prefix}-params-save-${this.objectName}`);
        if (saveBtn) {
            const blocked = explicitlyDisabled || !canControl();
            saveBtn.disabled = blocked;
            if (explicitlyDisabled) {
                saveBtn.title = 'Parameter modification disabled';
            } else if (!canControl()) {
                saveBtn.title = 'Read-only mode - take control first';
            } else {
                saveBtn.title = '';
            }
        }

        // Заблокировать все input в таблице параметров
        const paramsTable = this.getEl(`${prefix}-params-${this.objectName}`);
        if (paramsTable) {
            const inputs = paramsTable.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.disabled = explicitlyDisabled || !canControl();
            });
        }

        // Обновить индикатор в шапке (если есть)
        const indParams = this.getEl(`${prefix}-ind-params-${this.objectName}`);
        if (indParams) {
            indParams.className = `header-indicator-dot ${enabled ? 'ok' : 'fail'}`;
            indParams.title = enabled ? 'Parameters: Yes' : 'Parameters: No';
        }

        // Показать предупреждение только если явно запрещено
        this.setNote(`${prefix}-params-note-${this.objectName}`,
            explicitlyDisabled ? 'Parameter modification disabled (httpEnabledSetParams=false)' : '',
            explicitlyDisabled);
    }
};

/**
 * Миксин для загрузки/сохранения параметров объекта через API
 * Требует: this.paramsApiPath ('modbus' или 'opcua'), this.paramsPrefix ('mb', 'mbs', 'opcua', 'opcuasrv'),
 *          this.paramNames (массив имён), this.renderParams() (метод рендеринга)
 */
const ParamsManagerMixin = {
    // Загрузка параметров с сервера
    async loadParams() {
        try {
            const query = this.paramNames.map(n => `name=${encodeURIComponent(n)}`).join('&');
            const data = await this.fetchJSON(
                `/api/objects/${encodeURIComponent(this.objectName)}/${this.paramsApiPath}/params?${query}`
            );
            this.params = data.params || {};
            this.renderParams();
            this.updateParamsAccessibility(this.paramsPrefix);
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, err.message, true);
        }
    },

    // Сохранение изменённых параметров на сервер
    async saveParams() {
        // Контейнер: ${prefix}-params-${obj} или ${prefix}-params-writable-${obj} (OPCUA Exchange)
        const container = this.getEl(`${this.paramsPrefix}-params-${this.objectName}`)
            || this.getEl(`${this.paramsPrefix}-params-writable-${this.objectName}`);
        if (!container) return;

        const changed = {};

        // Текстовые и числовые inputs
        container.querySelectorAll('input[data-param], input[data-name]').forEach(input => {
            if (input.type === 'checkbox') return;
            const name = input.dataset.param || input.dataset.name;
            const val = input.value.trim();
            if (val === '') return;
            if (String(this.params[name]) !== val) {
                changed[name] = val;
            }
        });

        // Selects (exchangeMode и др.)
        container.querySelectorAll('select[data-param], select[data-name]').forEach(select => {
            const name = select.dataset.param || select.dataset.name;
            const newValue = parseInt(select.value);
            if (this.params[name] !== newValue) {
                changed[name] = newValue;
            }
        });

        // Чекбоксы (writeToAllChannels и др.)
        container.querySelectorAll('input[type="checkbox"][data-param], input[type="checkbox"][data-name]').forEach(cb => {
            const name = cb.dataset.param || cb.dataset.name;
            const newValue = cb.checked ? 1 : 0;
            if (this.params[name] !== newValue) {
                changed[name] = newValue;
            }
        });

        if (Object.keys(changed).length === 0) {
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, 'No changes');
            return;
        }

        try {
            const data = await this.fetchJSON(
                `/api/objects/${encodeURIComponent(this.objectName)}/${this.paramsApiPath}/params`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ params: changed })
                }
            );
            this.params = { ...this.params, ...(data.updated || {}) };
            this.renderParams();
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, 'Parameters applied');
            this.loadStatus();
        } catch (err) {
            this.setNote(`${this.paramsPrefix}-params-note-${this.objectName}`, err.message, true);
        }
    },

    // Подключение кнопок Refresh и Apply
    setupParamsListeners() {
        const refreshBtn = this.getEl(`${this.paramsPrefix}-params-refresh-${this.objectName}`);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadParams());
        }
        const saveBtn = this.getEl(`${this.paramsPrefix}-params-save-${this.objectName}`);
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveParams());
        }
    }
};

/**
 * Миксин для отображения счётчика загруженных/всего элементов
 * Показывает "loaded / total" или просто "total" когда всё загружено
 */
const ItemCounterMixin = {
    /**
     * Обновляет счётчик элементов
     * @param {string} elementId - ID элемента счётчика
     * @param {number} loaded - Количество загруженных элементов
     * @param {number} total - Общее количество элементов
     */
    updateItemCount(elementId, loaded, total) {
        const countEl = this.getEl(elementId);
        if (countEl) {
            countEl.textContent = loaded === total ? `${total}` : `${loaded} / ${total}`;
        }
    }
};

const PinManagementMixin = {
    /**
     * Получает закрепленные элементы (датчики/регистры)
     * @param {string} storageKey - Ключ в localStorage
     * @returns {Set<string>}
     */
    getPinnedItems(storageKey) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return new Set(saved[this.tabKey] || saved[this.objectName] || []);
        } catch (err) {
            return new Set();
        }
    },

    /**
     * Сохраняет закрепленные элементы
     * @param {string} storageKey - Ключ в localStorage
     * @param {Set<string>} pinnedSet - Множество ID закрепленных элементов
     */
    savePinnedItems(storageKey, pinnedSet) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            saved[this.tabKey] = Array.from(pinnedSet);
            localStorage.setItem(storageKey, JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save pinned items:', err);
        }
    },

    /**
     * Переключает закрепление элемента
     * @param {string} storageKey - Ключ в localStorage
     * @param {number|string} itemId - ID элемента
     * @param {Function} renderCallback - Callback для перерисовки
     */
    toggleItemPin(storageKey, itemId, renderCallback) {
        const pinned = this.getPinnedItems(storageKey);
        const idStr = String(itemId);

        if (pinned.has(idStr)) {
            pinned.delete(idStr);
        } else {
            pinned.add(idStr);
        }

        this.savePinnedItems(storageKey, pinned);
        if (renderCallback) {
            renderCallback.call(this);
        }
    },

    /**
     * Снимает закрепление со всех элементов
     * @param {string} storageKey - Ключ в localStorage
     * @param {Function} renderCallback - Callback для перерисовки
     */
    unpinAllItems(storageKey, renderCallback) {
        this.savePinnedItems(storageKey, new Set());
        if (renderCallback) {
            renderCallback.call(this);
        }
    },

    // Сокращённые методы, использующие this.pinStorageKey и this.renderAfterPinChange
    getPinned()    { return this.getPinnedItems(this.pinStorageKey); },
    togglePin(id)  { this.toggleItemPin(this.pinStorageKey, id, this.renderAfterPinChange); },
    unpinAll()     { this.unpinAllItems(this.pinStorageKey, this.renderAfterPinChange); }
};

/**
 * Миксин для сортировки таблиц по колонкам
 * Требует: sortColumnDefs - объект с описанием колонок
 */
const TableSortMixin = {
    /**
     * Инициализация свойств сортировки
     * Вызывать в конструкторе рендерера
     */
    initSortProps() {
        this.sortColumn = 'name';      // Текущая колонка сортировки
        this.sortDirection = 'asc';    // Направление: 'asc' | 'desc'
        this.sortStorageKey = null;    // Ключ для localStorage (устанавливается в loadSortState)
    },

    /**
     * Загрузка состояния сортировки из localStorage
     * @param {string} storageKey - Ключ в localStorage
     */
    loadSortState(storageKey) {
        this.sortStorageKey = storageKey;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const sortState = saved[this.tabKey] || saved[this.objectName];
            if (sortState) {
                this.sortColumn = sortState.column || 'name';
                this.sortDirection = sortState.direction || 'asc';
            }
        } catch (err) {
            console.warn('Failed to load sort state:', err);
        }
    },

    /**
     * Сохранение состояния сортировки в localStorage
     */
    saveSortState() {
        if (!this.sortStorageKey) return;
        try {
            const saved = JSON.parse(localStorage.getItem(this.sortStorageKey) || '{}');
            saved[this.tabKey] = {
                column: this.sortColumn,
                direction: this.sortDirection
            };
            localStorage.setItem(this.sortStorageKey, JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save sort state:', err);
        }
    },

    /**
     * Переключение сортировки по колонке
     * @param {string} column - Имя колонки
     */
    toggleSort(column) {
        if (this.sortColumn === column) {
            // Toggle direction
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.saveSortState();
        // Вызываем метод перерисовки (должен быть определён в рендерере)
        if (typeof this.renderAfterSort === 'function') {
            this.renderAfterSort();
        }
    },

    /**
     * Сортировка элементов с учётом закреплённых записей
     * @param {Array} items - Массив элементов для сортировки
     * @param {Set} pinnedSet - Множество ID закреплённых элементов
     * @param {Object} columnDefs - Определения колонок: { columnName: { field, type, accessor } }
     * @param {string} pinnedKey - Поле для проверки закреплённости (по умолчанию 'id')
     * @returns {Array} - Отсортированный массив
     */
    sortItems(items, pinnedSet, columnDefs, pinnedKey = 'id') {
        if (!items || items.length === 0) return items;

        const colDef = columnDefs[this.sortColumn];
        if (!colDef) return items;

        const { field, type = 'string', accessor } = colDef;

        // Функция получения значения
        const getValue = (item) => {
            if (accessor) return accessor(item);
            return item[field];
        };

        // Функция сравнения
        const compare = (a, b) => {
            let valA = getValue(a);
            let valB = getValue(b);

            // Обработка null/undefined
            if (valA == null && valB == null) return 0;
            if (valA == null) return 1;
            if (valB == null) return -1;

            // Сравнение по типу
            if (type === 'number') {
                valA = Number(valA) || 0;
                valB = Number(valB) || 0;
                return valA - valB;
            } else {
                // string comparison (case-insensitive)
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                return valA.localeCompare(valB);
            }
        };

        // Разделяем на закреплённые и обычные
        const pinned = [];
        const unpinned = [];

        items.forEach(item => {
            const keyValue = String(item[pinnedKey]);
            if (pinnedSet && pinnedSet.has(keyValue)) {
                pinned.push(item);
            } else {
                unpinned.push(item);
            }
        });

        // Сортируем каждую группу
        const sortFn = this.sortDirection === 'asc' ? compare : (a, b) => -compare(a, b);
        pinned.sort(sortFn);
        unpinned.sort(sortFn);

        // Объединяем: закреплённые всегда вверху
        return [...pinned, ...unpinned];
    },

    /**
     * Рендеринг заголовка колонки с индикатором сортировки
     * @param {string} column - Имя колонки (ключ в sortColumnDefs)
     * @param {string} label - Отображаемый текст
     * @param {boolean} sortable - Можно ли сортировать по этой колонке
     * @param {string} className - Дополнительные CSS классы
     * @returns {string} HTML
     */
    renderSortableHeader(column, label, sortable = true, className = '') {
        if (!sortable) {
            return `<th class="${className}">${label}</th>`;
        }

        const isActive = this.sortColumn === column;
        const arrow = isActive ? (this.sortDirection === 'asc' ? ' ↑' : ' ↓') : '';
        const sortedClass = isActive ? 'th-sorted' : '';

        return `<th class="th-sortable ${sortedClass} ${className}" data-column="${column}">${label}<span class="sort-arrow">${arrow}</span></th>`;
    },

    /**
     * Привязка обработчиков сортировки к заголовкам таблицы
     * @param {HTMLElement} tableElement - Элемент таблицы или её контейнера
     */
    attachSortHandlers(tableElement) {
        if (!tableElement) return;

        const headers = tableElement.querySelectorAll('.th-sortable');
        headers.forEach(th => {
            // Удаляем старый обработчик если есть
            if (th._sortHandler) {
                th.removeEventListener('click', th._sortHandler);
            }

            const handler = () => {
                const column = th.dataset.column;
                if (column) {
                    this.toggleSort(column);
                }
            };

            th._sortHandler = handler;
            th.addEventListener('click', handler);
        });
    },

    /**
     * Обновление визуальных индикаторов сортировки
     * Требует: this.sortTableId — полный ID таблицы (задаётся в конструкторе рендерера)
     */
    updateSortHeaders() {
        const table = this.getEl(this.sortTableId);
        if (!table) return;
        table.querySelectorAll('th.th-sortable').forEach(th => {
            const column = th.dataset.column;
            th.classList.toggle('th-sorted', column === this.sortColumn);
            const arrow = th.querySelector('.sort-arrow');
            if (arrow) {
                if (column === this.sortColumn) {
                    arrow.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                } else {
                    arrow.textContent = '';
                }
            }
        });
    },

    /**
     * Перерисовка таблицы после смены сортировки
     * Требует: sortRenderVisible() — мост к render-методу рендерера
     */
    renderAfterSort() {
        this.sortRenderVisible();
        this.updateSortHeaders();
    }
};

/**
 * Миксин для батчевого рендеринга SSE-обновлений
 *
 * Контракт рендерера:
 *   - this.batchTbodyId  — ID элемента tbody (задаётся в конструкторе)
 *   - getBatchItems()     — возвращает backing-массив (this.allSensors / this.allRegisters)
 *   - updateRowCells(row, update) — обновление ячеек конкретной строки (renderer-specific)
 */
const BatchRenderMixin = {
    initBatchRenderProps() {
        this.pendingUpdates = [];
        this.renderScheduled = false;
    },

    /**
     * Общий SSE-обработчик: валидация, добавление в очередь, планирование RAF
     * @param {Array} items - Массив обновлений из SSE
     */
    handleBatchUpdates(items) {
        if (!Array.isArray(items) || items.length === 0) return;
        this.pendingUpdates.push(...items);
        if (!this.renderScheduled) {
            this.renderScheduled = true;
            requestAnimationFrame(() => this.batchRenderUpdates());
        }
    },

    /**
     * Общий batchRenderUpdates: drain → tbody → iterate rows → updateRowCells
     * Рендерер может переопределить если нужна нестандартная логика.
     */
    batchRenderUpdates() {
        const updateMap = this._drainPendingUpdates(this.getBatchItems());
        if (!updateMap) return;

        const tbody = this.getEl(this.batchTbodyId);
        if (!tbody) return;

        tbody.querySelectorAll('tr[data-sensor-id]').forEach(row => {
            const id = parseInt(row.dataset.sensorId);
            if (!id) return;

            const update = updateMap.get(id);
            if (!update) return;

            this.updateRowCells(row, update);
        });
    },

    /**
     * Утилита: обновить текст ячейки с CSS-анимацией при изменении
     * @param {HTMLElement} row - Строка таблицы
     * @param {string} selector - CSS-селектор ячейки
     * @param {string} newValue - Новое значение
     * @param {string} animationClass - CSS-класс для анимации
     */
    _animateCellValue(row, selector, newValue, animationClass) {
        const cell = row.querySelector(selector);
        if (!cell) return;
        if (cell.textContent !== newValue) {
            cell.textContent = newValue;
            cell.classList.remove(animationClass);
            void cell.offsetWidth;
            cell.classList.add(animationClass);
        }
    },

    /**
     * Слить очередь → обновить backing-массив → вернуть updateMap
     * @param {Array} items - Backing-массив (this.allSensors / this.allRegisters)
     * @returns {Map|null} updateMap или null если очередь пуста
     */
    _drainPendingUpdates(items) {
        this.renderScheduled = false;
        if (this.pendingUpdates.length === 0) return null;

        const updates = this.pendingUpdates;
        this.pendingUpdates = [];

        const updateMap = new Map();
        updates.forEach(item => updateMap.set(item.id, item));

        items.forEach((item, index) => {
            const update = updateMap.get(item.id);
            if (update) {
                items[index] = { ...item, ...update };
            }
        });

        return updateMap;
    }
};

const ModbusRegistersMixin = {
    async loadRegisterChunk(offset) {
        if (this.isLoadingChunk || !this.hasMore) return;
        this.isLoadingChunk = true;

        const prefix = this.paramsPrefix;
        const loadingEl = this.getEl(`${prefix}-loading-more-${this.objectName}`);
        if (loadingEl) loadingEl.style.display = 'block';

        try {
            let url = `/api/objects/${encodeURIComponent(this.objectName)}/modbus/registers?offset=${offset}&limit=${this.chunkSize}`;
            if (this.typeFilter && this.typeFilter !== 'all') {
                url += `&iotype=${encodeURIComponent(this.typeFilter)}`;
            }

            const data = await this.fetchJSON(url);
            const registers = data.registers || [];
            this.registersTotal = data.total || 0;

            // Merge devices dictionary
            if (data.devices) {
                Object.assign(this.devicesDict, data.devices);
            }

            if (offset === 0) {
                this.allRegisters = registers;
                this.registerMap.clear();
                registers.forEach(r => this.registerMap.set(r.id, r));

                // Если нет фильтра и есть закреплённые регистры - загрузить их отдельно
                if (!this.filter) {
                    await this.loadPinnedRegisters();
                }
            } else {
                this.allRegisters = this.allRegisters.concat(registers);
                registers.forEach(r => this.registerMap.set(r.id, r));
            }

            this.hasMore = this.allRegisters.length < this.registersTotal;
            this.renderRegisters();
            this.setNote(`${prefix}-registers-note-${this.objectName}`, '');

            this.updateItemCount(`${prefix}-register-count-${this.objectName}`, this.allRegisters.length, this.registersTotal);

            // Подписываемся на SSE обновления после загрузки
            this.subscribeToSSE();

            // Обработчики сортировки (только при первой загрузке)
            if (offset === 0) {
                const table = this.getEl(`${prefix}-registers-table-${this.objectName}`);
                if (table) {
                    this.attachSortHandlers(table);
                    this.updateSortHeaders();
                }
            }
        } catch (err) {
            this.setNote(`${prefix}-registers-note-${this.objectName}`, err.message, true);
        } finally {
            this.isLoadingChunk = false;
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    // Загружает закреплённые регистры, если они не в текущем списке
    async loadPinnedRegisters() {
        const pinnedIds = this.getPinned();
        if (pinnedIds.size === 0) return;

        // Найти ID, которых нет в загруженных регистрах
        const missingIds = [];
        for (const idStr of pinnedIds) {
            const id = parseInt(idStr);
            if (!this.registerMap.has(id)) {
                missingIds.push(id);
            }
        }

        if (missingIds.length === 0) return;

        // Загрузить отсутствующие регистры по ID
        try {
            const idsParam = missingIds.join(',');
            const url = `/api/objects/${encodeURIComponent(this.objectName)}/modbus/get?filter=${idsParam}`;
            const response = await this.fetchJSON(url);
            const pinnedRegisters = response.registers || [];

            // Добавить закреплённые регистры в начало списка
            for (const reg of pinnedRegisters) {
                if (!this.registerMap.has(reg.id)) {
                    this.allRegisters.unshift(reg);
                    this.registerMap.set(reg.id, reg);
                }
            }
        } catch (err) {
            console.warn('Failed to load pinned registers:', err);
        }
    }
};

// Функция для применения миксина к классу
function applyMixin(targetClass, mixin) {
    Object.getOwnPropertyNames(mixin).forEach(name => {
        if (name !== 'constructor') {
            Object.defineProperty(
                targetClass.prototype,
                name,
                Object.getOwnPropertyDescriptor(mixin, name)
            );
        }
    });
}

// ============================================================================

// Базовый класс рендерера (общий функционал)
class BaseObjectRenderer {
    constructor(objectName, tabKey = null) {
        this.objectName = objectName;
        this.tabKey = tabKey || objectName; // tabKey для доступа к state.tabs

        // Префикс для ID элементов статуса (для updateStatusTimestamp)
        const typeName = this.constructor.getTypeName().toLowerCase();
        this.statusLastIdPrefix = `${typeName}-status-last`;

        // Timestamp последнего обновления статуса (для относительного времени)
        this.statusLastUpdate = null;
        this.statusDisplayTimer = null;

        // Показывать ли кнопку "+ Sensor" в секции Charts
        this.showAddSensorButton = true;
    }

    // Найти элемент по ID внутри панели своей вкладки
    getEl(id) {
        return getElementInTab(this.tabKey, id);
    }

    // Найти все элементы по CSS-селектору внутри панели своей вкладки
    getEls(selector) {
        return getElementsInTab(this.tabKey, selector);
    }

    // Получить тип объекта (для отображения)
    static getTypeName() {
        return 'Object';
    }

    // Создать HTML-структуру панели
    createPanelHTML() {
        return `
            <div class="tab-panel-loading">Loading...</div>
        `;
    }

    // Инициализация после создания DOM
    initialize() {
        // Переопределяется в наследниках
    }

    // Обновить данные (default: renderObjectInfo + updateChartLegends + handleLogServer)
    // Переопределяется в наследниках с уникальной логикой
    update(data) {
        renderObjectInfo(this.tabKey, data.object);
        updateChartLegends(this.tabKey, data);
        this.handleLogServer(data.LogServer);
    }

    // Очистка при закрытии
    destroy() {
        this.stopStatusAutoRefresh();
        this.stopStatusDisplayTimer();
    }

    // Форматирование относительного времени
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < TIME_AGO_MIN_SECONDS) return '';
        if (seconds < TIME_AGO_MINUTES_THRESHOLD) return `Updated ${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Updated ${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `Updated ${hours}h ago`;
    }

    // Запуск таймера обновления отображения относительного времени
    startStatusDisplayTimer() {
        this.stopStatusDisplayTimer();
        this.statusDisplayTimer = setInterval(() => this.updateStatusDisplay(), STATUS_DISPLAY_UPDATE_INTERVAL);
    }

    // Остановка таймера обновления отображения
    stopStatusDisplayTimer() {
        if (this.statusDisplayTimer) {
            clearInterval(this.statusDisplayTimer);
            this.statusDisplayTimer = null;
        }
    }

    // Обновить отображение относительного времени
    updateStatusDisplay() {
        const el = this.getEl(`${this.statusLastIdPrefix}-${this.objectName}`);
        if (!el) return;
        el.textContent = this.formatTimeAgo(this.statusLastUpdate);
    }

    // --- Методы для автообновления статуса ---

    // Создать HTML для отображения времени последнего обновления статуса
    // Используется в headerExtra секций статуса
    createStatusHeaderExtra() {
        return `<span class="status-last" id="${this.statusLastIdPrefix}-${this.objectName}"></span>`;
    }

    // Инициализация автообновления статуса
    // Использует глобальный интервал state.sse.pollInterval
    initStatusAutoRefresh() {
        // Проверяем есть ли метод loadStatus у рендерера
        if (typeof this.loadStatus !== 'function') return;
        this.startStatusAutoRefresh();
        this.startStatusDisplayTimer();
    }

    // Вспомогательные методы для создания секций
    createCollapsibleSection(id, title, content, options = {}) {
        const { badge = false, hidden = false, headerExtra = '' } = options;
        const badgeHtml = badge ? `<span class="io-section-badge" id="${id}-count-${this.objectName}">0</span>` : '';
        const style = hidden ? 'style="display:none"' : '';
        const sectionId = options.sectionId || `${id}-section-${this.objectName}`;

        return `
            <div class="collapsible-section reorderable-section" data-section="${id}-${this.objectName}" data-section-id="${id}" id="${sectionId}" ${style}>
                <div class="collapsible-header" onclick="toggleSection('${id}-${this.objectName}')">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">${title}</span>
                    ${badgeHtml}
                    ${headerExtra}
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', '${id}')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', '${id}')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-${id}-${this.objectName}">
                    ${content}
                </div>
            </div>
        `;
    }

    createChartsSection() {
        return `
            <div class="collapsible-section reorderable-section" data-section="charts-${this.objectName}" data-section-id="charts" id="charts-section-${this.objectName}">
                <div class="collapsible-header" onclick="toggleSection('charts-${this.objectName}')">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">Charts</span>
                    ${this.showAddSensorButton ? `<button class="add-sensor-btn" id="add-sensor-btn-${this.objectName}"
                            onclick="event.stopPropagation(); openSensorDialog('${this.tabKey}')"
                            ${!state.capabilities.smEnabled ? 'disabled title="SM not connected (-sm-url not set)"' : ''}>+ Sensor</button>` : ''}
                    <div class="charts-time-range" onclick="event.stopPropagation()">
                        <div class="time-range-selector">
                            <button class="charts-pause-btn" id="charts-pause-${this.objectName}" onclick="toggleChartsPause('${this.tabKey}')" title="Pause chart updates">||</button>
                            <button class="time-range-btn${state.timeRange === 60 ? ' active' : ''}" onclick="setTimeRange(60)">1m</button>
                            <button class="time-range-btn${state.timeRange === 180 ? ' active' : ''}" onclick="setTimeRange(180)">3m</button>
                            <button class="time-range-btn${state.timeRange === 300 ? ' active' : ''}" onclick="setTimeRange(300)">5m</button>
                            <button class="time-range-btn${state.timeRange === 900 ? ' active' : ''}" onclick="setTimeRange(900)">15m</button>
                            <button class="time-range-btn${state.timeRange === 3600 ? ' active' : ''}" onclick="setTimeRange(3600)">1h</button>
                            <button class="time-range-btn${state.timeRange === 10800 ? ' active' : ''}" onclick="setTimeRange(10800)">3h</button>
                        </div>
                    </div>
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', 'charts')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', 'charts')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-charts-${this.objectName}">
                    <div class="charts-container" id="charts-container-${this.objectName}">
                        <div id="charts-${this.objectName}" class="charts-grid"></div>
                    </div>
                    <div class="charts-resize-handle" id="charts-resize-${this.objectName}"></div>
                </div>
            </div>
        `;
    }

    createIOTimersSection() {
        return `
            <div class="collapsible-section io-timers-section reorderable-section" data-section="io-timers-${this.objectName}" data-section-id="io-timers" id="io-timers-section-${this.objectName}">
                <div class="collapsible-header" onclick="toggleSection('io-timers-${this.objectName}')">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">I/O</span>
                    <div class="io-filter-wrapper" onclick="event.stopPropagation()">
                        <input type="text" class="io-filter-input io-filter-global" id="io-filter-global-${this.objectName}"
                               placeholder="Filter..." data-object="${this.objectName}">
                    </div>
                    <label class="io-sequential-toggle" onclick="event.stopPropagation()">
                        <input type="checkbox" id="io-sequential-${this.objectName}" onchange="toggleIOLayout('${this.tabKey}', '${this.objectName}')">
                        <span>Sequential</span>
                    </label>
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', 'io-timers')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', 'io-timers')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-io-timers-${this.objectName}">
                    <div class="io-grid io-grid-3" id="io-grid-${this.objectName}">
                        ${this.createIOSection('inputs', 'Inputs')}
                        ${this.createIOSection('outputs', 'Outputs')}
                        ${this.createTimersSection()}
                    </div>
                </div>
            </div>
        `;
    }

    createIOSection(type, title) {
        const typeLower = type.toLowerCase();
        return `
            <div class="io-section" id="${typeLower}-section-${this.objectName}" data-section="${typeLower}-${this.objectName}">
                <div class="io-table-container" id="io-container-${typeLower}-${this.objectName}">
                    <table class="variables-table io-table io-table-io">
                        <thead>
                            <tr>
                                <th class="io-pin-col">
                                    <span class="io-unpin-all" id="io-unpin-${typeLower}-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="io-section-title io-section-toggle" data-section="${typeLower}-${this.objectName}">
                                    <svg class="io-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                    ${title} <span class="io-section-badge" id="${typeLower}-count-${this.objectName}">0</span>
                                </th>
                                <th class="io-spacer-col"></th>
                                <th>Type</th>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody id="${typeLower}-${this.objectName}"></tbody>
                    </table>
                </div>
                <div class="io-resize-handle" id="io-resize-${typeLower}-${this.objectName}"></div>
            </div>
        `;
    }

    createTimersSection() {
        return `
            <div class="io-section" id="timers-section-${this.objectName}" data-section="timers-${this.objectName}">
                <div class="io-table-container" id="io-container-timers-${this.objectName}">
                    <table class="variables-table io-table">
                        <thead>
                            <tr>
                                <th class="io-pin-col">
                                    <span class="io-unpin-all" id="io-unpin-timers-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="io-section-title io-section-toggle" data-section="timers-${this.objectName}">
                                    <svg class="io-collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                    Timers <span class="io-section-badge" id="timers-count-${this.objectName}">0</span>
                                </th>
                                <th>Name</th>
                                <th>Interval</th>
                                <th>Remaining</th>
                                <th>Tick</th>
                            </tr>
                        </thead>
                        <tbody id="timers-${this.objectName}"></tbody>
                    </table>
                </div>
                <div class="io-resize-handle" id="io-resize-timers-${this.objectName}"></div>
            </div>
        `;
    }

    createVariablesSection() {
        return this.createCollapsibleSection('variables', 'Settings', `
            <table class="variables-table">
                <thead>
                    <tr>
                        <th colspan="2">
                            <input type="text"
                                   class="filter-input"
                                   id="filter-variables-${this.objectName}"
                                   placeholder="Filter by name..."
                                   data-object="${this.objectName}">
                        </th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="variables-${this.objectName}"></tbody>
            </table>
        `);
    }

    createLogServerSection() {
        return this.createCollapsibleSection('logserver', 'LogServer', `
            <table class="info-table">
                <tbody id="logserver-${this.objectName}"></tbody>
            </table>
        `, { hidden: true, sectionId: `logserver-section-${this.objectName}` });
    }

    createLogViewerSection() {
        // Контейнер для LogViewer - будет инициализирован позже
        // Обёртка reorderable-section для возможности перемещения
        return `<div class="reorderable-section logviewer-wrapper" data-section-id="logviewer" id="logviewer-wrapper-${this.objectName}">
            <div id="logviewer-container-${this.objectName}"></div>
        </div>`;
    }

    // Инициализация LogViewer (вызывается после создания DOM если LogServer доступен)
    initLogViewer(logServerData) {
        if (!logServerData || !logServerData.host) {
            return;
        }

        const container = this.getEl(`logviewer-container-${this.objectName}`);
        if (!container) return;

        // Создаём LogViewer только если его ещё нет
        if (!this.logViewer) {
            // Извлекаем serverId из tabKey (формат: serverId:objectName)
            const tabState = state.tabs.get(this.tabKey);
            const serverId = tabState ? tabState.serverId : null;
            this.logViewer = new LogViewer(this.objectName, container, serverId, this.tabKey);
            this.logViewer.restoreCollapsedState();
        }
    }

    // Уничтожение LogViewer
    destroyLogViewer() {
        if (this.logViewer) {
            this.logViewer.destroy();
            this.logViewer = null;
        }
    }

    // Общий метод для обработки LogServer (рендеринг секции + инициализация LogViewer)
    handleLogServer(logServerData) {
        renderLogServer(this.tabKey, logServerData);
        this.initLogViewer(logServerData);
    }

    // ========== Общие методы для работы с графиками ==========

    // Проверить, добавлен ли датчик на график.
    // Read по tabKey с fallback на objectName (внутри функции) для legacy данных.
    isSensorOnChart(sensorName) {
        const addedSensors = getExternalSensorsFromStorage(this.tabKey, this.objectName);
        return addedSensors.has(sensorName);
    }

    // Переключить датчик на графике (добавить/удалить)
    // sensor должен содержать: id, name, iotype (или type), value
    toggleSensorChart(sensor) {
        if (!sensor || !sensor.name) return;

        // Read по tabKey (с legacy fallback внутри функции).
        const addedSensors = getExternalSensorsFromStorage(this.tabKey, this.objectName);

        if (addedSensors.has(sensor.name)) {
            // Удаляем с графика
            removeExternalSensor(this.tabKey, sensor.name, this.getChartOptions());
        } else {
            // Добавляем на график
            const chartOptions = this.getChartOptions();
            const sensorForChart = {
                id: sensor.id,
                name: sensor.name,
                textname: sensor.textname || sensor.name,
                iotype: sensor.iotype || sensor.type,
                value: sensor.value,
                // Сохраняем опции графика для восстановления после перезагрузки
                chartOptions: chartOptions
            };

            // Добавляем в список внешних датчиков (сохраняем полные данные).
            // Write всегда по tabKey, чтобы дубликат objectName на разных серверах
            // не смешивался.
            addedSensors.set(sensor.name, sensorForChart);
            saveExternalSensorsToStorage(this.tabKey, addedSensors);

            // Добавляем в state.sensorsByName если его там нет
            if (!state.sensorsByName.has(sensor.name)) {
                state.sensorsByName.set(sensor.name, sensorForChart);
                state.sensors.set(sensor.id, sensorForChart);
            }
            // Multi-server-aware: всегда обновляем scoped запись по
            // (serverId, this.objectName, sensor.name) — позволяет render'у
            // подтянуть правильный textname/comment без коллизии с одноимёнными
            // sensor'ами на других серверах.
            const _serverId = state.tabs.get(this.tabKey)?.serverId || '';
            state.sensorsByKey.set(
                makeSensorKey(_serverId, this.objectName, sensor.name),
                sensorForChart
            );

            // Создаём график с опциями, специфичными для типа рендерера
            createExternalSensorChart(this.tabKey, sensorForChart, this.getChartOptions());

            // Подписываемся на обновления датчика
            this.subscribeToChartSensor(sensor.id);
        }
    }

    // Получить опции для создания графика
    // Переопределяется в наследниках для специфичных badge и prefix
    getChartOptions() {
        return { badge: 'SM', prefix: 'ext' };
    }

    // Подписаться на обновления датчика для графика
    // Переопределяется в наследниках для специфичных API
    subscribeToChartSensor(sensorId) {
        // По умолчанию используем IONC подписку
        subscribeToIONCSensor(this.tabKey, sensorId);
    }

    // Сгенерировать HTML для объединённой ячейки кнопок (Chart + Dashboard)
    renderAddButtonsCell(sensorId, sensorName, prefix = 'sensor', sensorLabel = null) {
        const isOnChart = this.isSensorOnChart(sensorName);
        const varName = `${prefix}-${sensorId}`;
        const checkboxId = `chart-${this.objectName}-${varName}`;
        const label = sensorLabel || sensorName;
        return `
            <td class="add-buttons-col">
                <span class="chart-toggle">
                    <input type="checkbox"
                           class="chart-checkbox chart-toggle-input"
                           id="${checkboxId}"
                           data-sensor-id="${sensorId}"
                           data-sensor-name="${escapeAttr(sensorName)}"
                           ${isOnChart ? 'checked' : ''}>
                    <label class="chart-toggle-label" for="${checkboxId}" title="Add to Chart">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3v18h18"/>
                            <path d="M18 9l-5 5-4-4-3 3"/>
                        </svg>
                    </label>
                </span>
                <button class="dashboard-add-btn"
                        data-sensor-name="${escapeAttr(sensorName)}"
                        data-sensor-label="${escapeAttr(label)}"
                        title="Add to Dashboard">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7" rx="1"/>
                        <rect x="14" y="3" width="7" height="7" rx="1"/>
                        <rect x="3" y="14" width="7" height="7" rx="1"/>
                        <rect x="14" y="14" width="7" height="7" rx="1"/>
                    </svg>
                </button>
            </td>
        `;
    }

    // Привязать обработчики событий для checkbox графиков
    // sensorMap - Map с данными датчиков по id
    attachChartToggleListeners(container, sensorMap) {
        if (!container) return;
        container.querySelectorAll('.chart-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const sensorId = parseInt(cb.dataset.sensorId, 10);
                const sensor = sensorMap.get(sensorId);
                if (sensor) {
                    this.toggleSensorChart(sensor);
                }
            });
        });
    }

    // Привязать обработчики для кнопок добавления на dashboard
    attachDashboardToggleListeners(container) {
        if (!container) return;
        container.querySelectorAll('.dashboard-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sensorName = btn.dataset.sensorName;
                const sensorLabel = btn.dataset.sensorLabel;
                showAddToDashboardDialog(sensorName, sensorLabel);
            });
        });
    }

    createStatisticsSection() {
        return this.createCollapsibleSection('statistics', 'Statistics', `
            <div id="statistics-${this.objectName}"></div>
        `, { hidden: true, sectionId: `statistics-section-${this.objectName}` });
    }

    createObjectInfoSection() {
        return this.createCollapsibleSection('object', 'Object Information', `
            <table class="info-table">
                <tbody id="object-info-${this.objectName}"></tbody>
            </table>
        `);
    }

    // Построение URL с параметром server для multi-server режима
    buildUrl(path) {
        const tabState = state.tabs.get(this.tabKey);
        const serverId = tabState?.serverId;
        if (serverId) {
            return `${path}${path.includes('?') ? '&' : '?'}server=${encodeURIComponent(serverId)}`;
        }
        return path;
    }

    // Выполнить запрос и вернуть JSON
    async fetchJSON(path, options = {}) {
        const url = this.buildUrl(path);
        const response = await fetch(url, options);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        return response.json();
    }

    // Set текст уведомления
    setNote(id, text, isError = false) {
        const el = this.getEl(id);
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('note-error', !!(text && isError));
    }

    // Базовый resize handler для секций
    setupResize(containerSelector, handleSelector, storageKey, minHeight = 100, maxHeight = 800) {
        const panel = document.querySelector(`.tab-panel[data-name="${this.tabKey}"]`);
        const container = panel ? panel.querySelector(containerSelector) : document.querySelector(containerSelector);
        const handle = panel ? panel.querySelector(handleSelector) : document.querySelector(handleSelector);
        if (!container || !handle) return;

        let startY, startHeight;

        const onMouseMove = (e) => {
            const delta = e.clientY - startY;
            const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + delta));
            container.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            localStorage.setItem(storageKey, container.style.height);
        };

        handle.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startHeight = container.offsetHeight;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        // Восстановить из localStorage
        const savedHeight = localStorage.getItem(storageKey);
        if (savedHeight) {
            container.style.height = savedHeight;
        }
    }

    // --- Status auto-refresh (использует глобальный state.sse.pollInterval) ---

    startStatusAutoRefresh() {
        this.stopStatusAutoRefresh();
        const interval = state.sse.pollInterval || 5000;
        if (interval <= 0) return;
        this.statusTimer = setInterval(() => this.loadStatus(), interval);
    }

    stopStatusAutoRefresh() {
        if (this.statusTimer) {
            clearInterval(this.statusTimer);
            this.statusTimer = null;
        }
    }

    updateStatusTimestamp() {
        this.statusLastUpdate = Date.now();
        this.updateStatusDisplay();
    }
}

// Рендерер для UniSetManager (полный функционал)


// === 11-simple-renderers.js ===
class UniSetManagerRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'UniSetManager';
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createIOTimersSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createVariablesSection()}
            ${this.createStatisticsSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        setupFilterHandlers(this.tabKey);
        setupChartsResize(this.tabKey);
        loadIOLayoutState(this.tabKey, this.objectName);
        setupIOSections(this.tabKey);
    }

    update(data) {
        // Сохраняем данные для повторного рендеринга с фильтрами
        const tabState = state.tabs.get(this.tabKey);
        if (tabState) {
            tabState.ioData = data.io || {};
            tabState.timersData = data.Timers || {};
        }

        // Объединяем Variables и extra (дополнительные переменные не входящие в стандартные поля)
        const allVariables = { ...(data.Variables || {}), ...(data.extra || {}) };
        renderVariables(this.tabKey, allVariables);
        renderIO(this.tabKey, 'inputs', data.io?.in || {});
        renderIO(this.tabKey, 'outputs', data.io?.out || {});
        renderTimers(this.tabKey, data.Timers || {});
        renderObjectInfo(this.tabKey, data.object);
        renderStatistics(this.tabKey, data.Statistics);
        updateChartLegends(this.tabKey, data);
        this.handleLogServer(data.LogServer);
    }

    destroy() {
        this.destroyLogViewer();
    }
}

// Рендерер для UniSetObject (базовый объект без IO/Timers)
class UniSetObjectRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'UniSetObject';
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createVariablesSection()}
            ${this.createStatisticsSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        setupFilterHandlers(this.tabKey);
        setupChartsResize(this.tabKey);
    }

    update(data) {
        // Объединяем Variables и extra (дополнительные переменные не входящие в стандартные поля)
        const allVariables = { ...(data.Variables || {}), ...(data.extra || {}) };
        renderVariables(this.tabKey, allVariables);
        renderObjectInfo(this.tabKey, data.object);
        renderStatistics(this.tabKey, data.Statistics);
        updateChartLegends(this.tabKey, data);
        this.handleLogServer(data.LogServer);
    }

    destroy() {
        this.destroyLogViewer();
    }
}

// Fallback рендерер для неподдерживаемых типов объектов
class FallbackRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'Unknown';
    }

    createPanelHTML() {
        return `
            <div class="fallback-warning">
                <div class="fallback-icon">⚠️</div>
                <div class="fallback-message">
                    Object type "<span class="fallback-type"></span>" is not supported
                </div>
                <div class="fallback-hint">Raw JSON response displayed</div>
            </div>
            <div class="fallback-json-container">
                <pre class="fallback-json" id="fallback-json-${this.objectName}"></pre>
            </div>
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        // Ничего дополнительного не требуется
    }

    update(data) {
        // Обновляем тип объекта в сообщении (используем tabKey для поиска панели)
        const typeSpan = document.querySelector(`.tab-panel[data-name="${this.tabKey}"] .fallback-type`);
        const typeLabel = data.object?.extensionType || data.object?.extensionsType || data.object?.objectType;
        if (typeSpan && typeLabel) {
            typeSpan.textContent = typeLabel;
        }

        // Выводим JSON - используем raw_data если есть, иначе весь data
        const jsonPre = this.getEl(`fallback-json-${this.objectName}`);
        if (jsonPre) {
            const displayData = data.raw_data || data;
            jsonPre.textContent = JSON.stringify(displayData, null, 2);
        }

        // Обновляем информацию об объекте
        renderObjectInfo(this.tabKey, data.object);
    }
}

// Рендерер по умолчанию - теперь использует FallbackRenderer
class DefaultObjectRenderer extends FallbackRenderer {
    static getTypeName() {
        return 'Default';
    }
}

// Регистрация рендереров
function registerRenderer(objectType, rendererClass) {
    objectRenderers.set(objectType, rendererClass);
}

// Получить рендерер для типа объекта
function getRendererClass(objectType) {
    return objectRenderers.get(objectType) || DefaultObjectRenderer;
}

// Выбор рендерера: сначала extensionType, затем objectType
function resolveRenderer(objectInfo = {}) {
    const extensionType = objectInfo.extensionType || objectInfo.extensionsType;
    const objectType = objectInfo.objectType || 'Default';

    if (extensionType && objectRenderers.has(extensionType)) {
        return {
            RendererClass: objectRenderers.get(extensionType),
            rendererType: extensionType,
            badgeType: extensionType,
            extensionType,
            objectType
        };
    }

    return {
        RendererClass: getRendererClass(objectType),
        rendererType: objectType,
        badgeType: extensionType || objectType,
        extensionType,
        objectType
    };
}

// ============================================================================
// IONotifyControllerRenderer - рендерер для SharedMemory и подобных объектов
// ============================================================================



// === 20-ionc-renderer.js ===
// ============================================================================
// IONotifyControllerRenderer - рендерер для SharedMemory и подобных объектов
// ============================================================================

class IONotifyControllerRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'IONotifyController';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.sensors = [];
        this.sensorMap = new Map();
        this.filter = '';
        this.typeFilter = 'all';
        this.totalCount = 0;
        this.loading = false;
        this.subscribedSensorIds = new Set();

        // IONC владеет всеми датчиками, добавление через таблицу
        this.showAddSensorButton = false;
        // Для батчевого рендеринга
        this.pendingUpdates = new Map(); // id -> sensor
        this.renderScheduled = false;

        // Virtual scroll properties
        this.allSensors = [];
        this.initVirtualScrollProps();

        // Генераторы значений: Map<sensorId, GeneratorState>
        this.activeGenerators = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `ionc-sensors-table-${objectName}`;
        // Определение колонок для сортировки
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'type', type: 'string' },
            value: { field: 'value', type: 'number' }
        };
    }

    // IONotifyController датчики - показываем badge "IO" и prefix "io"
    getChartOptions() {
        return { badge: 'IO', prefix: 'io' };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createSensorsSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createLostConsumersSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-ionc-sort');
        this.setupEventListeners();
        this.loadSensors();
        this.loadLostConsumers();
        setupChartsResize(this.tabKey);
        setupIONCSensorsResize(this.tabKey, this.objectName);
        this.setupFullVirtualScroll({
            viewportId: `ionc-sensors-viewport-${this.objectName}`,
        });
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allSensors; }
    vscrollRenderVisible() { this.renderVisibleSensors(); }
    vscrollLoadMore() { this.loadMoreSensors(); }

    createSensorsSection() {
        return `
            <div class="collapsible-section reorderable-section ionc-sensors-section" data-section="ionc-sensors-${this.objectName}" data-section-id="ionc-sensors">
                <div class="collapsible-header" onclick="toggleSection('ionc-sensors-${this.objectName}')">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="collapsible-title">Sensors</span>
                    <span class="sensor-count" id="ionc-sensor-count-${this.objectName}">0</span>
                    <div class="filter-bar" onclick="event.stopPropagation()">
                        <input type="text" class="filter-input" id="ionc-filter-${this.objectName}" placeholder="Filter...">
                        <select class="type-filter" id="ionc-type-filter-${this.objectName}">
                            <option value="all">All</option>
                            <option value="AI">AI</option>
                            <option value="DI">DI</option>
                            <option value="AO">AO</option>
                            <option value="DO">DO</option>
                        </select>
                    </div>
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', 'ionc-sensors')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', 'ionc-sensors')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="collapsible-content" id="section-ionc-sensors-${this.objectName}">
                    <div class="ionc-sensors-table-container" id="ionc-sensors-container-${this.objectName}">
                        <div class="ionc-sensors-viewport" id="ionc-sensors-viewport-${this.objectName}">
                            <div class="ionc-sensors-spacer" id="ionc-sensors-spacer-${this.objectName}"></div>
                            <table class="sensors-table ionc-sensors-table" id="ionc-sensors-table-${this.objectName}">
                                <thead>
                                    <tr>
                                        <th class="ionc-col-pin">
                                            <span class="ionc-unpin-all" id="ionc-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                        </th>
                                        <th class="ionc-col-add-buttons"></th>
                                        ${this.renderSortableHeader('id', 'ID', true, 'ionc-col-id')}
                                        ${this.renderSortableHeader('name', 'Name', true, 'ionc-col-name')}
                                        ${this.renderSortableHeader('type', 'Type', true, 'ionc-col-type')}
                                        ${this.renderSortableHeader('value', 'Value', true, 'ionc-col-value')}
                                        <th class="ionc-col-flags">Status</th>
                                        <th class="ionc-col-supplier">Supplier</th>
                                        <th class="ionc-col-consumers">Consumers</th>
                                        <th class="ionc-col-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="ionc-sensors-tbody" id="ionc-sensors-tbody-${this.objectName}">
                                    <tr><td colspan="10" class="ionc-loading">Loading...</td></tr>
                                </tbody>
                            </table>
                            <div class="ionc-loading-more" id="ionc-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                        </div>
                    </div>
                    <div class="resize-handle" id="ionc-resize-${this.objectName}"></div>
                </div>
            </div>
        `;
    }

    createLostConsumersSection() {
        return this.createCollapsibleSection(
            'ionc-lost',
            'Lost consumers',
            `<div class="ionc-lost-list" id="ionc-lost-list-${this.objectName}">
                <span class="ionc-lost-empty">No lost consumers</span>
            </div>`,
            { badge: true }
        );
    }

    setupEventListeners() {
        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `ionc-filter-${this.objectName}`,
            `ionc-type-filter-${this.objectName}`,
            () => this.loadSensors()
        );
        this.setupContainerEscHandler(
            `ionc-sensors-container-${this.objectName}`,
            `ionc-filter-${this.objectName}`,
            () => this.loadSensors()
        );

        // Делегирование событий для кнопки добавления на dashboard
        // устанавливается в setupDashboardClickHandler после загрузки данных
    }

    // Устанавливает делегирование событий для кнопки добавления на dashboard
    setupDashboardClickHandler() {
        const tbody = getElementInTab(this.tabKey, `ionc-sensors-tbody-${this.objectName}`);
        if (tbody && !tbody._dashboardClickHandlerAttached) {
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('.dashboard-add-btn');
                if (btn) {
                    e.stopPropagation();
                    showAddToDashboardDialog(btn.dataset.sensorName, btn.dataset.sensorLabel);
                }
            });
            tbody._dashboardClickHandlerAttached = true;
        }
    }

    async loadSensors() {
        if (this.loading) return;
        this.loading = true;

        // Reset state
        this.allSensors = [];
        this.hasMore = true;
        this.startIndex = 0;
        this.endIndex = 0;

        const viewport = this.getEl(`ionc-sensors-viewport-${this.objectName}`);
        if (viewport) viewport.scrollTop = 0;

        const tbody = this.getEl(`ionc-sensors-tbody-${this.objectName}`);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="11" class="ionc-loading">Loading...</td></tr>';
        }

        // Проверяем режим фильтрации: false = серверная (default), true = UI
        const useUIFilter = state.config.ioncUISensorsFilter;

        try {
            let url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/sensors?offset=0&limit=${this.chunkSize}`);

            // Серверная фильтрация (если не включена UI фильтрация)
            if (!useUIFilter) {
                if (this.filter) {
                    url += `&search=${encodeURIComponent(this.filter)}`;
                }
                if (this.typeFilter && this.typeFilter !== 'all') {
                    url += `&iotype=${this.typeFilter}`;
                }
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load sensors');

            const data = await response.json();
            this.totalCount = data.size || 0;

            let sensors = data.sensors || [];

            // UI фильтрация (если включена)
            if (useUIFilter) {
                sensors = this.applyLocalFilters(sensors);
            }

            this.allSensors = sensors;
            this.sensors = sensors; // Для совместимости с существующим кодом
            this.sensorMap.clear();
            sensors.forEach(s => this.sensorMap.set(s.id, s));

            // Если нет фильтра и есть закреплённые датчики - загрузить их отдельно
            if (!this.filter) {
                await this.loadPinnedSensors();
            }

            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();

            // Подписываемся на SSE обновления для загруженных датчиков
            this.subscribeToSSE();

            // Устанавливаем делегирование для кнопки добавления на dashboard
            this.setupDashboardClickHandler();

            // Привязываем обработчики сортировки
            const table = this.getEl(`ionc-sensors-table-${this.objectName}`);
            this.attachSortHandlers(table);
        } catch (err) {
            console.error('Error loading IONC sensors:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9" class="ionc-error">Error загрузки: ${escapeHtml(err.message)}</td></tr>`;
            }
        } finally {
            this.loading = false;
        }
    }

    // Загружает закреплённые датчики, если они не в текущем списке
    async loadPinnedSensors() {
        const pinnedIds = this.getPinnedSensors();
        if (pinnedIds.size === 0) return;

        // Найти ID, которых нет в загруженных датчиках
        const missingIds = [];
        for (const idStr of pinnedIds) {
            const id = parseInt(idStr);
            if (!this.sensorMap.has(id)) {
                missingIds.push(id);
            }
        }

        if (missingIds.length === 0) return;

        // Загрузить отсутствующие датчики по ID (используем /ionc/get с filter)
        try {
            const idsParam = missingIds.join(',');
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/get?filter=${idsParam}`);
            const response = await fetch(url);
            if (!response.ok) return;

            const data = await response.json();
            const pinnedSensors = data.sensors || [];

            // Добавить закреплённые датчики в начало списка
            for (const sensor of pinnedSensors) {
                if (!this.sensorMap.has(sensor.id)) {
                    this.allSensors.unshift(sensor);
                    this.sensorMap.set(sensor.id, sensor);
                }
            }
        } catch (err) {
            console.warn('Failed to load pinned sensors:', err);
        }
    }

    applyLocalFilters(sensors) {
        let result = sensors;
        if (this.filter) {
            const filterLower = this.filter.toLowerCase();
            result = result.filter(s =>
                s.name.toLowerCase().includes(filterLower) ||
                String(s.id).includes(filterLower)
            );
        }
        if (this.typeFilter !== 'all') {
            result = result.filter(s => s.type === this.typeFilter);
        }
        return result;
    }

    async loadMoreSensors() {
        if (this.isLoadingChunk || !this.hasMore) return;

        this.isLoadingChunk = true;
        this.showLoadingIndicator(true);

        // Проверяем режим фильтрации: false = серверная (default), true = UI
        const useUIFilter = state.config.ioncUISensorsFilter;

        try {
            const nextOffset = this.allSensors.length;
            let url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/sensors?offset=${nextOffset}&limit=${this.chunkSize}`);

            // Серверная фильтрация (если не включена UI фильтрация)
            if (!useUIFilter) {
                if (this.filter) {
                    url += `&search=${encodeURIComponent(this.filter)}`;
                }
                if (this.typeFilter && this.typeFilter !== 'all') {
                    url += `&iotype=${this.typeFilter}`;
                }
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load more sensors');

            const data = await response.json();
            let newSensors = data.sensors || [];

            // UI фильтрация (если включена)
            if (useUIFilter) {
                newSensors = this.applyLocalFilters(newSensors);
            }

            // Дедупликация: добавляем только датчики которых еще нет
            const existingIds = new Set(this.allSensors.map(s => s.id));
            const uniqueNewSensors = newSensors.filter(s => !existingIds.has(s.id));

            // Добавить к уже загруженным
            this.allSensors = [...this.allSensors, ...uniqueNewSensors];
            this.sensors = this.allSensors; // Для совместимости
            uniqueNewSensors.forEach(s => this.sensorMap.set(s.id, s));

            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();
        } catch (err) {
            console.error('Failed to load more sensors:', err);
        } finally {
            this.isLoadingChunk = false;
            this.showLoadingIndicator(false);
        }
    }

    showLoadingIndicator(show) {
        const el = this.getEl(`ionc-loading-more-${this.objectName}`);
        if (el) el.style.display = show ? 'block' : 'none';
    }

    renderVisibleSensors() {
        const tbody = this.getEl(`ionc-sensors-tbody-${this.objectName}`);
        const spacer = this.getEl(`ionc-sensors-spacer-${this.objectName}`);
        if (!tbody || !spacer) return;

        // Set высоту spacer для позиционирования
        spacer.style.height = `${this.startIndex * this.rowHeight}px`;

        // Получаем закреплённые датчики
        const pinnedSensors = this.getPinnedSensors();
        const hasPinned = pinnedSensors.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`ionc-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Filterуем датчики:
        // - если есть текстовый фильтр — показываем все (для поиска новых датчиков)
        // - иначе если есть закреплённые — показываем только их
        let sensorsToShow = this.allSensors;
        if (!this.filter && hasPinned) {
            sensorsToShow = this.allSensors.filter(s => pinnedSensors.has(String(s.id)));
        }

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        sensorsToShow = this.sortItems(sensorsToShow, pinnedSensors, this.sortColumnDefs);

        if (sensorsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="ionc-empty">No sensors</td></tr>';
            return;
        }

        // Virtual scroll: показываем только видимые строки
        const visibleSensors = sensorsToShow.slice(this.startIndex, this.endIndex);

        tbody.innerHTML = visibleSensors.map(sensor => this.renderSensorRow(sensor, pinnedSensors.has(String(sensor.id)))).join('');

        // Привязать события к строкам
        this.bindRowEvents(tbody);

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAll();
        }
    }

    bindRowEvents(tbody) {
        // Добавляем обработчики событий
        tbody.querySelectorAll('.ionc-btn-set').forEach(btn => {
            btn.addEventListener('click', () => this.showSetDialog(parseInt(btn.dataset.id)));
        });
        // Кнопка заморозки: одинарный клик = диалог, двойной клик = быстрая заморозка
        tbody.querySelectorAll('.ionc-btn-freeze').forEach(btn => {
            let clickTimer = null;
            const sensorId = parseInt(btn.dataset.id);
            btn.addEventListener('click', () => {
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    this.quickFreeze(sensorId);
                } else {
                    clickTimer = setTimeout(() => {
                        clickTimer = null;
                        this.showFreezeDialog(sensorId);
                    }, DOUBLE_CLICK_THRESHOLD);
                }
            });
        });
        // Кнопка разморозки: одинарный клик = диалог, двойной клик = быстрая разморозка
        tbody.querySelectorAll('.ionc-btn-unfreeze').forEach(btn => {
            let clickTimer = null;
            const sensorId = parseInt(btn.dataset.id);
            btn.addEventListener('click', () => {
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    this.quickUnfreeze(sensorId);
                } else {
                    clickTimer = setTimeout(() => {
                        clickTimer = null;
                        this.showUnfreezeDialog(sensorId);
                    }, DOUBLE_CLICK_THRESHOLD);
                }
            });
        });
        tbody.querySelectorAll('.ionc-btn-consumers').forEach(btn => {
            btn.addEventListener('click', () => this.showConsumersDialog(parseInt(btn.dataset.id)));
        });
        // Кнопки генератора
        tbody.querySelectorAll('.ionc-btn-gen').forEach(btn => {
            btn.addEventListener('click', () => this.showGeneratorDialog(parseInt(btn.dataset.id)));
        });
        tbody.querySelectorAll('.ionc-btn-gen-stop').forEach(btn => {
            btn.addEventListener('click', () => this.stopGenerator(parseInt(btn.dataset.id)));
        });
        tbody.querySelectorAll('.pin-toggle').forEach(btn => {
            btn.addEventListener('click', () => this.togglePin(parseInt(btn.dataset.id)));
        });
        tbody.querySelectorAll('.ionc-chart-checkbox').forEach(cb => {
            cb.addEventListener('change', () => this.toggleSensorChartById(parseInt(cb.dataset.id)));
        });
        // Кнопки добавления на dashboard обрабатываются через делегирование в setupDashboardClickHandler
    }

    // Legacy alias for compatibility
    renderSensorsTable() {
        this.renderVisibleSensors();
    }

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderVisibleSensors(); }

    renderSensorRow(sensor, isPinned) {
        // Multi-server-aware lookup: те же sensor.name могут существовать на
        // разных серверах с разными textname. Берём scoped запись по
        // (serverId, objectName, name); fallback на legacy by-name внутри helper.
        const serverId = state.tabs.get(this.tabKey)?.serverId || '';
        const sensorInfo = getSensorInfoByKey(serverId, this.objectName, sensor.name);
        const textname = sensorInfo?.textname || sensor.textname || '';

        const frozenClass = sensor.frozen ? 'ionc-sensor-frozen' : '';
        const blockedClass = sensor.blocked ? 'ionc-sensor-blocked' : '';
        const readonlyClass = sensor.readonly ? 'ionc-sensor-readonly' : '';

        // Проверяем активный генератор
        const hasGenerator = this.activeGenerators.has(sensor.id);
        const generatorClass = hasGenerator ? 'ionc-sensor-generating' : '';
        const genState = hasGenerator ? this.activeGenerators.get(sensor.id) : null;

        const flags = [];
        if (hasGenerator) flags.push(`<span class="ionc-flag ionc-flag-generator" title="Генератор: ${genState.type} (${genState.min}-${genState.max})">⟳</span>`);
        if (sensor.frozen) flags.push('<span class="ionc-flag ionc-flag-frozen" title="Frozen">❄</span>');
        if (sensor.blocked) flags.push('<span class="ionc-flag ionc-flag-blocked" title="Blocked">🔒</span>');
        if (sensor.readonly) flags.push('<span class="ionc-flag ionc-flag-readonly" title="Read only">👁</span>');
        if (sensor.undefined) flags.push('<span class="ionc-flag ionc-flag-undefined" title="Undefined">?</span>');

        // Проверка возможности управления
        const canCtrl = canControl();
        const ctrlDisabled = !canCtrl ? 'disabled' : '';
        const ctrlTitle = !canCtrl ? 'Read-only mode' : '';

        const freezeBtn = sensor.frozen
            ? `<button class="ionc-btn ionc-btn-unfreeze" data-id="${sensor.id}" title="${ctrlTitle || 'Frozen at: ' + sensor.value + '. Click to unfreeze'}" ${ctrlDisabled}>🔥</button>`
            : `<button class="ionc-btn ionc-btn-freeze" data-id="${sensor.id}" title="${ctrlTitle || 'Freeze'}" ${ctrlDisabled}>❄</button>`;

        // Кнопка генератора
        const genBtn = hasGenerator
            ? `<button class="ionc-btn ionc-btn-gen-stop" data-id="${sensor.id}" title="${ctrlTitle || 'Остановить генератор'}" ${ctrlDisabled}>⏹</button>`
            : `<button class="ionc-btn ionc-btn-gen" data-id="${sensor.id}" title="${ctrlTitle || 'Генератор значений'}" ${sensor.readonly || !canCtrl ? 'disabled' : ''}>⟳</button>`;

        // Кнопка закрепления (pin)
        const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
        const pinIcon = isPinned ? '📌' : '○';
        const pinTitle = isPinned ? 'Unpin' : 'Pin';

        // Checkbox для графика
        const isOnChart = this.isSensorOnChart(sensor.name);
        const varName = `ionc-${sensor.id}`;

        // Supplier с fallback на supplier_id
        const supplierValue = sensor.supplier || (sensor.supplier_id ? String(sensor.supplier_id) : '');

        return `
            <tr class="ionc-sensor-row ${frozenClass} ${blockedClass} ${readonlyClass} ${generatorClass}" data-sensor-id="${sensor.id}">
                <td class="ionc-col-pin">
                    <span class="${pinToggleClass}" data-id="${sensor.id}" title="${pinTitle}">
                        ${pinIcon}
                    </span>
                </td>
                <td class="ionc-col-add-buttons add-buttons-col">
                    <span class="chart-toggle">
                        <input type="checkbox"
                               class="ionc-chart-checkbox chart-toggle-input"
                               id="ionc-chart-${this.objectName}-${varName}"
                               data-id="${sensor.id}"
                               data-name="${escapeAttr(sensor.name)}"
                               ${isOnChart ? 'checked' : ''}>
                        <label class="chart-toggle-label" for="ionc-chart-${this.objectName}-${varName}" title="Add to Chart">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3v18h18"/>
                                <path d="M18 9l-5 5-4-4-3 3"/>
                            </svg>
                        </label>
                    </span>
                    <button class="dashboard-add-btn"
                            data-sensor-name="${escapeAttr(sensor.name)}"
                            data-sensor-label="${escapeAttr(textname || sensor.name)}"
                            title="Add to Dashboard">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/>
                        </svg>
                    </button>
                </td>
                <td class="ionc-col-id">${sensor.id}</td>
                <td class="ionc-col-name" title="${escapeAttr(textname)}">${escapeHtml(sensor.name)}</td>
                <td class="ionc-col-type"><span class="type-badge type-${sensor.type}">${sensor.type}</span></td>
                <td class="ionc-col-value">
                    ${sensor.frozen && sensor.real_value !== undefined && sensor.real_value !== sensor.value
                        ? `<span class="ionc-value ionc-value-frozen" id="ionc-value-${this.objectName}-${sensor.id}">
                               <span class="ionc-real-value">${sensor.real_value}</span>
                               <span class="ionc-frozen-arrow">→</span>
                               <span class="ionc-frozen-value">${sensor.value}❄</span>
                           </span>`
                        : `<span class="ionc-value" id="ionc-value-${this.objectName}-${sensor.id}">${sensor.value}</span>`
                    }
                </td>
                <td class="ionc-col-flags">${flags.join(' ') || '—'}</td>
                <td class="ionc-col-supplier" id="ionc-supplier-${this.objectName}-${sensor.id}" title="${escapeAttr(supplierValue)}">${escapeHtml(supplierValue)}</td>
                <td class="ionc-col-consumers">
                    <button class="ionc-btn ionc-btn-consumers" data-id="${sensor.id}" title="Show consumers">👥</button>
                </td>
                <td class="ionc-col-actions">
                    <button class="ionc-btn ionc-btn-set" data-id="${sensor.id}" title="${ctrlTitle || 'Set value'}" ${sensor.readonly || !canCtrl ? 'disabled' : ''}>✎</button>
                    ${genBtn}
                    ${freezeBtn}
                </td>
            </tr>
        `;
    }

    // Управление закреплёнными датчиками
    getPinnedSensors() {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-ionc-pinned') || '{}');
            return new Set(saved[this.tabKey] || saved[this.objectName] || []);
        } catch (err) {
            return new Set();
        }
    }

    savePinnedSensors(pinnedSet) {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-ionc-pinned') || '{}');
            saved[this.tabKey] = Array.from(pinnedSet);
            localStorage.setItem('uniset-panel-ionc-pinned', JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save pinned sensors:', err);
        }
    }

    togglePin(sensorId) {
        const pinned = this.getPinnedSensors();
        const idStr = String(sensorId);

        if (pinned.has(idStr)) {
            pinned.delete(idStr);
        } else {
            pinned.add(idStr);
        }

        this.savePinnedSensors(pinned);
        this.renderSensorsTable();
    }

    unpinAll() {
        this.savePinnedSensors(new Set());
        this.renderSensorsTable();
    }

    // Используем метод toggleSensorChart из базового класса
    // isSensorOnChart также наследуется из BaseObjectRenderer
    toggleSensorChartById(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;
        // Приводим к формату базового метода (iotype вместо type)
        const sensorData = { ...sensor, iotype: sensor.type };
        this.toggleSensorChart(sensorData);
    }

    updateSensorCount() {
        this.updateItemCount(`ionc-sensor-count-${this.objectName}`, this.allSensors.length, this.totalCount);
    }

    showSetDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const objectName = this.objectName;
        const self = this;

        // Предупреждение если датчик заморожен
        const frozenWarning = sensor.frozen
            ? `<div class="ionc-dialog-warning">⚠️ Sensor is frozen. Value will not be changed until you unfreeze the sensor.</div>`
            : '';

        const body = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                Current value: <strong>${sensor.value}</strong>
            </div>
            ${frozenWarning}
            <div class="ionc-dialog-field">
                <label for="ionc-set-value">New value:</label>
                <input type="number" id="ionc-set-value" value="${sensor.value}">
            </div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Cancel</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-primary" id="ionc-set-confirm">Apply</button>
        `;

        const doSetValue = async () => {
            const input = document.getElementById('ionc-set-value');
            const value = parseInt(input.value, 10);

            if (isNaN(value)) {
                showIoncDialogError('Enter an integer');
                input.classList.add('error');
                return;
            }

            try {
                const url = self.buildUrl(`/api/objects/${encodeURIComponent(objectName)}/ionc/set`);
                const response = await controlledFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensor_id: sensorId, value: value })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to set value');
                }

                // Обновляем локально
                if (sensor.frozen) {
                    // Если заморожен - обновляем real_value (значение SM), value остаётся замороженным
                    sensor.real_value = value;
                } else {
                    sensor.value = value;
                }
                // Перерисовываем строку для корректного отображения формата
                self.reRenderSensorRow(sensorId);

                closeIoncDialog();
            } catch (err) {
                showIoncDialogError(`Error: ${err.message}`);
            }
        };

        openIoncDialog({
            title: 'Set value',
            body,
            footer,
            focusInput: true,
            onConfirm: doSetValue
        });

        // Attach button handler
        document.getElementById('ionc-set-confirm').addEventListener('click', doSetValue);
    }

    // Показать диалог заморозки (одинарный клик на ❄)
    showFreezeDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const objectName = this.objectName;
        const self = this;

        const body = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                Current value: <strong>${sensor.value}</strong>
            </div>
            <div class="ionc-dialog-field">
                <label for="ionc-freeze-value">Freeze value:</label>
                <input type="number" id="ionc-freeze-value" value="${sensor.value}">
                <div class="ionc-dialog-hint">Double click on ❄ — quick freeze at current value</div>
            </div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Cancel</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-freeze" id="ionc-freeze-confirm">❄ Freeze</button>
        `;

        const doFreeze = async () => {
            const input = document.getElementById('ionc-freeze-value');
            const value = parseInt(input.value, 10);

            if (isNaN(value)) {
                showIoncDialogError('Enter an integer');
                input.classList.add('error');
                return;
            }

            try {
                const url = self.buildUrl(`/api/objects/${encodeURIComponent(objectName)}/ionc/freeze`);
                const response = await controlledFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensor_id: sensorId, value: value })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to freeze');
                }

                // Локальное обновление для мгновенной обратной связи
                // SSE обновления подтвердят состояние из API
                sensor.real_value = sensor.value;
                sensor.frozen = true;
                sensor.value = value;
                self.reRenderSensorRow(sensorId);
                closeIoncDialog();
            } catch (err) {
                showIoncDialogError(`Error: ${err.message}`);
            }
        };

        openIoncDialog({
            title: 'Freeze sensor',
            body,
            footer,
            focusInput: true,
            onConfirm: doFreeze
        });

        document.getElementById('ionc-freeze-confirm').addEventListener('click', doFreeze);
    }

    // Быстрая заморозка на текущем значении (двойной клик на ❄)
    async quickFreeze(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/freeze`);
            const response = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, value: sensor.value })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to freeze');
            }

            // Локальное обновление для мгновенной обратной связи
            sensor.real_value = sensor.value;
            sensor.frozen = true;
            this.reRenderSensorRow(sensorId);
        } catch (err) {
            showIoncDialogError(`Error: ${err.message}`);
        }
    }

    // Показать диалог разморозки (клик на 🔥)
    showUnfreezeDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const objectName = this.objectName;
        const self = this;

        const realValue = sensor.real_value !== undefined ? sensor.real_value : '—';
        const frozenValue = sensor.value;

        const body = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})
            </div>
            <div class="ionc-unfreeze-values">
                <div class="ionc-unfreeze-row">
                    <span class="ionc-unfreeze-label">Real value (SM):</span>
                    <span class="ionc-unfreeze-value">${realValue}</span>
                </div>
                <div class="ionc-unfreeze-row">
                    <span class="ionc-unfreeze-label">Frozen value:</span>
                    <span class="ionc-unfreeze-value ionc-unfreeze-frozen">${frozenValue}❄</span>
                </div>
            </div>
            <div class="ionc-dialog-hint">After unfreezing, the sensor will return to its real value</div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Cancel</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-unfreeze" id="ionc-unfreeze-confirm">🔥 Unfreeze</button>
        `;

        const doUnfreeze = async () => {
            try {
                const url = self.buildUrl(`/api/objects/${encodeURIComponent(objectName)}/ionc/unfreeze`);
                const response = await controlledFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensor_id: sensorId })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to unfreeze');
                }

                // Локальное обновление для мгновенной обратной связи
                sensor.frozen = false;
                if (sensor.real_value !== undefined) {
                    sensor.value = sensor.real_value;
                }
                self.reRenderSensorRow(sensorId);
                closeIoncDialog();
            } catch (err) {
                showIoncDialogError(`Error: ${err.message}`);
            }
        };

        openIoncDialog({
            title: 'Unfreeze sensor',
            body,
            footer,
            focusInput: false,
            onConfirm: doUnfreeze
        });

        document.getElementById('ionc-unfreeze-confirm').addEventListener('click', doUnfreeze);
    }

    // Быстрая разморозка (двойной клик на 🔥)
    async quickUnfreeze(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/unfreeze`);
            const response = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to unfreeze');
            }

            // Локальное обновление для мгновенной обратной связи
            sensor.frozen = false;
            if (sensor.real_value !== undefined) {
                sensor.value = sensor.real_value;
            }
            this.reRenderSensorRow(sensorId);
        } catch (err) {
            showIoncDialogError(`Error: ${err.message}`);
        }
    }

    // ===== Генератор значений =====

    // Значения по умолчанию для параметров генератора
    getDefaultGeneratorParams() {
        return {
            sin: { min: -50, max: 50, pause: 100, step: 100 },
            cos: { min: -50, max: 50, pause: 100, step: 100 },
            linear: { min: 0, max: 100, pause: 100, step: 1 },
            random: { min: 0, max: 100, period: 5000 },
            square: { min: 0, max: 100, pulseWidth: 2000, pause: 2000 }
        };
    }

    // Загрузка preferences из localStorage с миграцией
    loadGeneratorPreferences() {
        const newPrefs = localStorage.getItem('ionc-gen-preferences');

        if (newPrefs) {
            try {
                return JSON.parse(newPrefs);
            } catch (e) {
                console.error('Failed to parse generator preferences:', e);
            }
        }

        // Миграция со старого формата
        const oldType = localStorage.getItem('ionc-gen-last-type');
        if (oldType) {
            const prefs = {
                lastType: oldType,
                params: this.getDefaultGeneratorParams()
            };
            localStorage.setItem('ionc-gen-preferences', JSON.stringify(prefs));
            localStorage.removeItem('ionc-gen-last-type');
            return prefs;
        }

        // Первый запуск - используем defaults
        return {
            lastType: 'sin',
            params: this.getDefaultGeneratorParams()
        };
    }

    // Сохранение preferences в localStorage
    saveGeneratorPreferences(type, params) {
        const prefs = this.loadGeneratorPreferences();
        prefs.lastType = type;
        prefs.params[type] = params;
        localStorage.setItem('ionc-gen-preferences', JSON.stringify(prefs));
    }

    // Обновление расчётного периода для sin/cos
    updateCalculatedPeriod() {
        const calcPeriodValue = document.getElementById('ionc-gen-calc-period-value');
        const pauseInput = document.getElementById('ionc-gen-period');
        const pointsInput = document.getElementById('ionc-gen-step');

        if (!calcPeriodValue || !pauseInput || !pointsInput) return;

        const pause = parseInt(pauseInput.value, 10) || 0;
        const points = parseInt(pointsInput.value, 10) || 0;
        const totalPeriod = pause * points;

        if (totalPeriod > 0) {
            const seconds = (totalPeriod / 1000).toFixed(1);
            calcPeriodValue.textContent = `${totalPeriod} мс (${seconds} сек)`;
        } else {
            calcPeriodValue.textContent = '-';
        }
    }

    // Управление видимостью полей формы в зависимости от типа функции
    updateFormFieldsVisibility(type) {
        const periodField = document.getElementById('ionc-gen-period-field');
        const stepField = document.getElementById('ionc-gen-step-field');
        const pulseFields = document.getElementById('ionc-gen-pulse-fields');
        const calcPeriodField = document.getElementById('ionc-gen-calc-period');
        const periodLabel = document.getElementById('ionc-gen-period-label');
        const periodHint = document.getElementById('ionc-gen-period-hint');
        const stepLabel = document.getElementById('ionc-gen-step-label');
        const stepHint = document.getElementById('ionc-gen-step-hint');

        if (!periodField || !stepField || !pulseFields) return;

        // Скрываем все условные поля
        periodField.style.display = 'none';
        stepField.style.display = 'none';
        pulseFields.style.display = 'none';
        if (calcPeriodField) calcPeriodField.style.display = 'none';

        // Показываем нужные поля в зависимости от типа
        if (type === 'linear') {
            // linear: пилообразный с шагом-инкрементом
            periodField.style.display = 'block';
            stepField.style.display = 'block';
            if (periodLabel) periodLabel.textContent = 'Пауза между шагами (мс)';
            if (periodHint) periodHint.textContent = 'Задержка перед следующим шагом. Мин: 10мс';
            if (stepLabel) stepLabel.textContent = 'Шаг';
            if (stepHint) stepHint.textContent = 'Размер одного шага изменения значения';
        } else if (type === 'sin' || type === 'cos') {
            // sin/cos: синусоида с заданным количеством точек
            periodField.style.display = 'block';
            stepField.style.display = 'block';
            if (calcPeriodField) calcPeriodField.style.display = 'block';
            if (periodLabel) periodLabel.textContent = 'Шаг обновления (мс)';
            if (periodHint) periodHint.textContent = 'Время между обновлениями значения. Мин: 10мс';
            if (stepLabel) stepLabel.textContent = 'Количество точек на период';
            if (stepHint) stepHint.textContent = 'Сколько точек отрисует синусоида за один полный период';
            // Обновляем расчётный период
            this.updateCalculatedPeriod();
        } else if (type === 'square') {
            pulseFields.style.display = 'block';
        } else {
            // random
            periodField.style.display = 'block';
            // Восстанавливаем подпись для периода
            if (periodLabel) periodLabel.textContent = 'Период (мс)';
            if (periodHint) periodHint.textContent = 'Длительность полного цикла. Мин: 100мс';
        }
    }

    showGeneratorDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const self = this;
        const existingGen = this.activeGenerators.get(sensorId);

        // Предупреждение если датчик заморожен
        const frozenWarning = sensor.frozen
            ? `<div class="ionc-dialog-warning">Датчик заморожен. Значения будут записываться в SM, но не отобразятся до разморозки.</div>`
            : '';

        const body = `
            <div class="ionc-dialog-info">
                Датчик: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                Текущее значение: <strong>${sensor.value}</strong>
            </div>
            ${frozenWarning}
            ${existingGen ? (() => {
                const genInfo = `${existingGen.type} (min: ${existingGen.min}, max: ${existingGen.max}`;
                const timing = existingGen.type === 'square'
                    ? `, импульс: ${existingGen.pulseWidth}мс, пауза: ${existingGen.pause}мс)`
                    : (existingGen.type === 'linear' || existingGen.type === 'sin' || existingGen.type === 'cos')
                    ? `, пауза: ${existingGen.pause}мс, шаг: ${existingGen.step})`
                    : `, период: ${existingGen.period}мс)`;

                return `
                <div class="ionc-dialog-warning ionc-dialog-warning-active">
                    <strong>Генератор активен:</strong> ${genInfo}${timing}
                </div>
            `;
            })() : (() => {
                // Загружаем preferences из localStorage
                const prefs = this.loadGeneratorPreferences();
                const lastType = prefs.lastType;
                const params = prefs.params[lastType] || this.getDefaultGeneratorParams()[lastType];

                const options = [
                    { value: 'sin', label: 'sin(t) - Синусоида' },
                    { value: 'cos', label: 'cos(t) - Косинусоида' },
                    { value: 'linear', label: 'linear - Пилообразный' },
                    { value: 'random', label: 'random - Случайные значения' },
                    { value: 'square', label: 'square - Прямоугольный' }
                ];
                const optionsHtml = options.map(o =>
                    `<option value="${o.value}"${o.value === lastType ? ' selected' : ''}>${o.label}</option>`
                ).join('');
                return `
                <div class="ionc-dialog-field">
                    <label for="ionc-gen-type">Тип функции:</label>
                    <select id="ionc-gen-type" class="ionc-dialog-select">
                        ${optionsHtml}
                    </select>
                </div>
                <div class="ionc-dialog-field-row">
                    <div class="ionc-dialog-field ionc-dialog-field-half">
                        <label for="ionc-gen-min">Min:</label>
                        <input type="number" id="ionc-gen-min" value="${params.min}">
                    </div>
                    <div class="ionc-dialog-field ionc-dialog-field-half">
                        <label for="ionc-gen-max">Max:</label>
                        <input type="number" id="ionc-gen-max" value="${params.max}">
                    </div>
                </div>
                <div class="ionc-dialog-field" id="ionc-gen-period-field">
                    <label for="ionc-gen-period"><span id="ionc-gen-period-label">Период (мс)</span>:</label>
                    <input type="number" id="ionc-gen-period" value="${params.period || params.pause || 5000}" step="100">
                    <div class="ionc-dialog-hint" id="ionc-gen-period-hint">Длительность полного цикла. Мин: 100мс</div>
                </div>
                <div class="ionc-dialog-field" id="ionc-gen-step-field" style="display: none;">
                    <label for="ionc-gen-step"><span id="ionc-gen-step-label">Шаг</span>:</label>
                    <input type="number" id="ionc-gen-step" value="${params.step || 20}" step="1">
                    <div class="ionc-dialog-hint" id="ionc-gen-step-hint">Размер одного шага изменения значения</div>
                </div>
                <div class="ionc-dialog-field" id="ionc-gen-calc-period" style="display: none;">
                    <div class="ionc-dialog-hint" style="color: #4a9eff; font-weight: 500;">
                        💡 Полный период: <span id="ionc-gen-calc-period-value">-</span>
                    </div>
                </div>
                <div id="ionc-gen-pulse-fields" style="display: none;">
                    <div class="ionc-dialog-field-row">
                        <div class="ionc-dialog-field ionc-dialog-field-half">
                            <label for="ionc-gen-pulse-width">Ширина импульса (мс):</label>
                            <input type="number" id="ionc-gen-pulse-width" value="${params.pulseWidth || 2500}" step="100" min="1">
                        </div>
                        <div class="ionc-dialog-field ionc-dialog-field-half">
                            <label for="ionc-gen-pause">Пауза (мс):</label>
                            <input type="number" id="ionc-gen-pause" value="${params.pause || 2500}" step="100" min="1">
                        </div>
                    </div>
                    <div class="ionc-dialog-hint">Период = Ширина импульса + Пауза</div>
                </div>
            `;
            })()}
        `;

        const footer = existingGen ? `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Закрыть</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-danger" id="ionc-gen-stop">Остановить</button>
        ` : `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Отмена</button>
            <button class="ionc-dialog-btn ionc-dialog-btn-primary" id="ionc-gen-start">Запустить</button>
        `;

        openIoncDialog({
            title: existingGen ? 'Генератор активен' : 'Генератор значений',
            body,
            footer,
            focusInput: !existingGen
        });

        // Обработчики кнопок
        if (existingGen) {
            document.getElementById('ionc-gen-stop')?.addEventListener('click', () => {
                this.stopGenerator(sensorId);
                closeIoncDialog();
            });
        } else {
            document.getElementById('ionc-gen-start')?.addEventListener('click', () => {
                this.startGenerator(sensorId);
            });

            // Обработчик смены типа функции
            const typeSelect = document.getElementById('ionc-gen-type');
            if (typeSelect) {
                typeSelect.addEventListener('change', (e) => {
                    this.updateFormFieldsVisibility(e.target.value);
                });

                // Устанавливаем начальную видимость полей
                this.updateFormFieldsVisibility(typeSelect.value);
            }

            // Обработчики для автоматического расчёта периода (sin/cos)
            const pauseInput = document.getElementById('ionc-gen-period');
            const pointsInput = document.getElementById('ionc-gen-step');
            if (pauseInput && pointsInput) {
                const updateCalc = () => this.updateCalculatedPeriod();
                pauseInput.addEventListener('input', updateCalc);
                pointsInput.addEventListener('input', updateCalc);
            }
        }
    }

    startGenerator(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        // Парсим значения формы
        const type = document.getElementById('ionc-gen-type').value;
        const min = parseInt(document.getElementById('ionc-gen-min').value, 10);
        const max = parseInt(document.getElementById('ionc-gen-max').value, 10);

        // Парсим специфичные для типа параметры
        let period, step, pulseWidth, pause;
        if (type === 'linear' || type === 'sin' || type === 'cos') {
            pause = parseInt(document.getElementById('ionc-gen-period').value, 10);
            step = parseInt(document.getElementById('ionc-gen-step').value, 10);
        } else if (type === 'square') {
            pulseWidth = parseInt(document.getElementById('ionc-gen-pulse-width').value, 10);
            pause = parseInt(document.getElementById('ionc-gen-pause').value, 10);
        } else {
            // random
            period = parseInt(document.getElementById('ionc-gen-period').value, 10);
        }

        // Валидация общих параметров
        if (isNaN(min) || isNaN(max)) {
            showIoncDialogError('Min и Max должны быть числами');
            return;
        }
        if (min >= max) {
            showIoncDialogError('Min должен быть меньше Max');
            return;
        }

        // Валидация специфичных для типа параметров
        if (type === 'linear') {
            if (isNaN(pause) || isNaN(step)) {
                showIoncDialogError('Пауза и Шаг должны быть числами');
                return;
            }
            if (pause < 10) {
                showIoncDialogError('Пауза должна быть не менее 10мс');
                return;
            }
            if (step === 0) {
                showIoncDialogError('Шаг не может быть равен 0');
                return;
            }
            if (Math.abs(step) > (max - min)) {
                showIoncDialogError('Шаг должен быть меньше или равен разности Max - Min');
                return;
            }
        } else if (type === 'sin' || type === 'cos') {
            if (isNaN(pause) || isNaN(step)) {
                showIoncDialogError('Шаг обновления и Количество точек должны быть числами');
                return;
            }
            if (pause < 10) {
                showIoncDialogError('Шаг обновления должен быть не менее 10мс');
                return;
            }
            if (step < 4) {
                showIoncDialogError('Количество точек должно быть не менее 4');
                return;
            }
        } else if (type === 'square') {
            if (isNaN(pulseWidth) || isNaN(pause)) {
                showIoncDialogError('Ширина импульса и Пауза должны быть числами');
                return;
            }
            if (pulseWidth <= 0) {
                showIoncDialogError('Ширина импульса должна быть больше 0');
                return;
            }
            if (pause <= 0) {
                showIoncDialogError('Пауза должна быть больше 0');
                return;
            }
        } else {
            // sin, cos, random
            if (isNaN(period)) {
                showIoncDialogError('Период должен быть числом');
                return;
            }
            if (period < 100) {
                showIoncDialogError('Период должен быть не менее 100мс');
                return;
            }
        }

        // Останавливаем существующий генератор если есть
        this.stopGenerator(sensorId);

        const generator = new SignalGenerator({
            type, min, max, step, pause, pulseWidth, period,
            onTick: (value) => {
                this.setValueForGenerator(sensorId, value);
            }
        });

        // Сохраняем минимальное состояние для UI (тип для setChartStepped,
        // параметры для отображения в "active generator" баннере и сохранения preferences).
        const genState = {
            sensorId,
            type,
            min,
            max,
            generator,        // ссылка на SignalGenerator — будет stop()'нута в stopGenerator
        };

        // Тип-специфичные параметры — для отображения и сохранения preferences
        if (type === 'linear' || type === 'sin' || type === 'cos') {
            genState.pause = pause;
            genState.step = step;
        } else if (type === 'square') {
            genState.pulseWidth = pulseWidth;
            genState.pause = pause;
        } else {
            genState.period = period;
        }

        generator.start();
        this.activeGenerators.set(sensorId, genState);

        // Для square генератора включаем stepped режим на графике (меандр)
        if (type === 'square') {
            this.setChartStepped(sensorId, true);
        }

        // Перерисовываем строку для отображения индикатора
        this.reRenderSensorRow(sensorId);

        // Сохраняем preferences (разные параметры для разных типов)
        let params = { min, max };
        if (type === 'linear' || type === 'sin' || type === 'cos') {
            params.pause = pause;
            params.step = step;
        } else if (type === 'square') {
            params.pulseWidth = pulseWidth;
            params.pause = pause;
        } else {
            // random
            params.period = period;
        }
        this.saveGeneratorPreferences(type, params);

        closeIoncDialog();
    }

    async setValueForGenerator(sensorId, value) {
        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/set`);
            await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, value: value })
            });
        } catch (err) {
            console.error('Generator: ошибка установки значения', err);
        }
    }

    stopGenerator(sensorId) {
        const genState = this.activeGenerators.get(sensorId);
        if (genState) {
            if (genState.generator) {
                genState.generator.stop();
            }

            // Возвращаем stepped режим к значению по умолчанию (isDiscrete)
            if (genState.type === 'square') {
                this.setChartStepped(sensorId, null); // null = вернуть к isDiscrete
            }

            this.activeGenerators.delete(sensorId);
            this.reRenderSensorRow(sensorId);
        }
    }

    stopAllGenerators() {
        this.activeGenerators.forEach((genState) => {
            if (genState.generator) genState.generator.stop();
        });
        this.activeGenerators.clear();
    }

    // Установка stepped режима для графика сенсора
    // stepped: true = включить, false = выключить, null = вернуть к isDiscrete
    setChartStepped(sensorId, stepped) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const tabState = state.tabs.get(this.tabKey);
        if (!tabState) return;

        const varName = `io:${sensor.name}`;
        const chartData = tabState.charts.get(varName);
        if (!chartData) return;

        let newStepped;
        if (stepped === null) {
            // Вернуть к значению по умолчанию (isDiscrete)
            newStepped = chartData.isDiscrete ? 'before' : false;
        } else {
            newStepped = stepped ? 'before' : false;
        }

        chartData.chart.data.datasets[0].stepped = newStepped;
        chartData.chart.update('none');
    }

    // Перерисовка строки датчика и переподключение обработчиков
    reRenderSensorRow(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        const row = document.querySelector(`tr[data-sensor-id="${sensorId}"]`);
        if (row) {
            row.outerHTML = this.renderSensorRow(sensor);
            this.attachRowEventListeners(sensorId);
        }
    }

    // Подключение обработчиков к строке датчика
    attachRowEventListeners(sensorId) {
        const row = document.querySelector(`tr[data-sensor-id="${sensorId}"]`);
        if (!row) return;

        row.querySelector('.ionc-btn-set')?.addEventListener('click', () => this.showSetDialog(sensorId));
        row.querySelector('.ionc-btn-consumers')?.addEventListener('click', () => this.showConsumersDialog(sensorId));

        // Кнопка заморозки — одинарный/двойной клик
        const freezeBtn = row.querySelector('.ionc-btn-freeze');
        if (freezeBtn) {
            let clickTimer = null;
            freezeBtn.addEventListener('click', (e) => {
                if (clickTimer) {
                    // Двойной клик — быстрая заморозка
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    this.quickFreeze(sensorId);
                } else {
                    // Одинарный клик — ждём второй клик или открываем диалог
                    clickTimer = setTimeout(() => {
                        clickTimer = null;
                        this.showFreezeDialog(sensorId);
                    }, DOUBLE_CLICK_THRESHOLD);
                }
            });
        }

        // Кнопка разморозки — одинарный/двойной клик
        const unfreezeBtn = row.querySelector('.ionc-btn-unfreeze');
        if (unfreezeBtn) {
            let clickTimer = null;
            unfreezeBtn.addEventListener('click', (e) => {
                if (clickTimer) {
                    // Двойной клик — быстрая разморозка
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    this.quickUnfreeze(sensorId);
                } else {
                    // Одинарный клик — ждём второй клик или открываем диалог
                    clickTimer = setTimeout(() => {
                        clickTimer = null;
                        this.showUnfreezeDialog(sensorId);
                    }, DOUBLE_CLICK_THRESHOLD);
                }
            });
        }

        // Кнопки генератора
        row.querySelector('.ionc-btn-gen')?.addEventListener('click', () => this.showGeneratorDialog(sensorId));
        row.querySelector('.ionc-btn-gen-stop')?.addEventListener('click', () => this.stopGenerator(sensorId));

        // Чекбокс графика
        row.querySelector('.ionc-chart-checkbox')?.addEventListener('change', () => this.toggleSensorChartById(sensorId));

        // Кнопка добавления на dashboard
        row.querySelector('.dashboard-add-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const sensorName = btn.dataset.sensorName;
            const sensorLabel = btn.dataset.sensorLabel;
            showAddToDashboardDialog(sensorName, sensorLabel);
        });
    }

    async showConsumersDialog(sensorId) {
        const sensor = this.sensorMap.get(sensorId);
        if (!sensor) return;

        // Показываем диалог с индикатором загрузки
        const loadingBody = `
            <div class="ionc-dialog-info">
                Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})
            </div>
            <div class="ionc-dialog-empty">Loading подписчиков...</div>
        `;

        const footer = `
            <button class="ionc-dialog-btn ionc-dialog-btn-cancel" onclick="closeIoncDialog()">Close</button>
        `;

        openIoncDialog({
            title: 'Sensor consumers',
            body: loadingBody,
            footer,
            focusInput: false
        });

        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/consumers?sensors=${sensorId}`);
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load consumers');

            const data = await response.json();
            const sensorData = data.sensors?.[0];
            const consumers = sensorData?.consumers || [];

            let contentHtml;
            if (consumers.length === 0) {
                contentHtml = `
                    <div class="ionc-dialog-info">
                        Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})
                    </div>
                    <div class="ionc-dialog-empty">No consumers</div>
                `;
            } else {
                const rows = consumers.map(c => `
                    <tr>
                        <td>${escapeHtml(c.name)}</td>
                        <td>${escapeHtml(c.node_name || '')}</td>
                        <td>${c.smCount ?? 0}</td>
                        <td>${c.lostEvents ?? 0}</td>
                    </tr>
                `).join('');

                contentHtml = `
                    <div class="ionc-dialog-info">
                        Sensor: <strong>${escapeHtml(sensor.name)}</strong> (ID: ${sensorId})<br>
                        Подписчиков: <strong>${consumers.length}</strong>
                    </div>
                    <div class="ionc-dialog-consumers">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Узел</th>
                                    <th>smCount</th>
                                    <th>lostEvents</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
            }

            document.getElementById('ionc-dialog-body').innerHTML = contentHtml;
        } catch (err) {
            showIoncDialogError(`Error: ${err.message}`);
        }
    }

    async loadLostConsumers() {
        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/ionc/lost`);
            const response = await fetch(url);
            if (!response.ok) return;

            const data = await response.json();
            const lost = data['lost consumers'] || [];

            const listEl = this.getEl(`ionc-lost-list-${this.objectName}`);
            const countEl = this.getEl(`ionc-lost-count-${this.objectName}`);

            if (countEl) countEl.textContent = lost.length;

            if (listEl) {
                if (lost.length === 0) {
                    listEl.innerHTML = '<span class="ionc-lost-empty">No lost consumers</span>';
                } else {
                    listEl.innerHTML = lost.map(c =>
                        `<div class="ionc-lost-item">${escapeHtml(c.name)} (ID: ${c.id})</div>`
                    ).join('');
                }
            }
        } catch (err) {
            console.error('Error loading lost consumers:', err);
        }
    }

    update(data) {
        // При обновлении объекта обновляем информацию
        renderObjectInfo(this.tabKey, data.object);
        this.handleLogServer(data.LogServer);
    }

    // Обработка SSE обновления датчика (батчевая версия)
    handleIONCSensorUpdate(sensor) {
        // Обновляем в sensorMap
        if (this.sensorMap.has(sensor.id)) {
            const oldSensor = this.sensorMap.get(sensor.id);

            // API возвращает всю информацию:
            // - frozen: флаг заморозки
            // - value: замороженное значение (если frozen) или текущее (если нет)
            // - real_value: реальное значение SM
            Object.assign(oldSensor, sensor);

            // Добавляем в очередь на рендеринг
            this.pendingUpdates.set(sensor.id, oldSensor);
        }

        // Планируем батчевый рендеринг
        if (!this.renderScheduled) {
            this.renderScheduled = true;
            requestAnimationFrame(() => this.batchRenderUpdates());
        }
    }

    // Батчевый рендеринг обновлений DOM
    batchRenderUpdates() {
        this.renderScheduled = false;

        if (this.pendingUpdates.size === 0) return;

        // Обновляем DOM для всех ожидающих датчиков
        for (const [id, sensor] of this.pendingUpdates) {
            // Обновляем значение с учётом формата frozen
            const valueEl = getElementInTab(this.tabKey, `ionc-value-${this.objectName}-${id}`);
            if (valueEl) {
                // Рендерим правильный формат в зависимости от состояния frozen
                if (sensor.frozen && sensor.real_value !== undefined && sensor.real_value !== sensor.value) {
                    // Формат: real_value → frozen_value❄
                    valueEl.className = 'ionc-value ionc-value-frozen ionc-value-updated';
                    valueEl.innerHTML = `
                        <span class="ionc-real-value">${sensor.real_value}</span>
                        <span class="ionc-frozen-arrow">→</span>
                        <span class="ionc-frozen-value">${sensor.value}❄</span>
                    `;
                } else {
                    // Обычный формат
                    valueEl.className = 'ionc-value ionc-value-updated';
                    valueEl.textContent = sensor.value;
                }
            }

            // Обновляем флаги если изменились
            const row = getElementsInTab(this.tabKey, `tr[data-sensor-id="${id}"]`);
            if (row.length > 0) {
                row[0].classList.toggle('ionc-sensor-frozen', sensor.frozen);
                row[0].classList.toggle('ionc-sensor-blocked', sensor.blocked);
                row[0].classList.toggle('ionc-sensor-readonly', sensor.readonly);
            }

            // Обновляем supplier
            const supplierEl = getElementInTab(this.tabKey, `ionc-supplier-${this.objectName}-${id}`);
            if (supplierEl) {
                const supplierValue = sensor.supplier || (sensor.supplier_id ? String(sensor.supplier_id) : '');
                supplierEl.textContent = supplierValue;
                supplierEl.title = supplierValue;
            }
        }

        // Очищаем очередь
        this.pendingUpdates.clear();

        // Убираем анимацию через ANIMATION_REMOVAL_DELAY
        setTimeout(() => {
            const panel = document.querySelector(`.tab-panel[data-name="${this.tabKey}"]`);
            if (panel) {
                panel.querySelectorAll('.ionc-value-updated').forEach(el => el.classList.remove('ionc-value-updated'));
            }
        }, ANIMATION_REMOVAL_DELAY);
    }

    // Подписка на SSE обновления для видимых датчиков (использует SSESubscriptionMixin)
    async subscribeToSSE() {
        const sensorIds = this.sensors.map(s => s.id);
        await this.subscribeToSSEFor('/ionc', sensorIds, 'sensor_ids', 'IONC');
    }

    // Отписка от SSE обновлений (использует SSESubscriptionMixin)
    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/ionc', 'sensor_ids', 'IONC');
    }

    destroy() {
        // Останавливаем все генераторы значений
        this.stopAllGenerators();
        // Отписываемся от SSE обновлений при закрытии
        this.unsubscribeFromSSE();
        // Уничтожаем LogViewer
        this.destroyLogViewer();
    }
}

// Apply mixins to IONotifyControllerRenderer
applyMixin(IONotifyControllerRenderer, VirtualScrollMixin);
applyMixin(IONotifyControllerRenderer, SSESubscriptionMixin);
applyMixin(IONotifyControllerRenderer, ResizableSectionMixin);
applyMixin(IONotifyControllerRenderer, FilterMixin);
applyMixin(IONotifyControllerRenderer, ItemCounterMixin);
applyMixin(IONotifyControllerRenderer, TableSortMixin);



// === 21-opcua-exchange.js ===
// ============================================================================
// OPCUAExchangeRenderer - рендерер для OPCUAExchange extensionType
// ============================================================================

class OPCUAExchangeRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'OPCUAExchange';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.status = null;
        this.params = {};
        this.paramsApiPath = 'opcua';
        this.paramsPrefix = 'opcua';
        // Параметры только для чтения (статус)
        this.readonlyParams = [
            'currentChannel',
            'connectCount',
            'activated',
            'iolistSize',
            'errorHistoryMax'
        ];
        // Параметры для записи (требуют httpEnabledSetParams=1)
        // exchangeMode первым - он самый важный и требует httpControlActive=1
        this.writableParams = [
            'exchangeMode',
            'polltime',
            'updatetime',
            'reconnectPause',
            'timeoutIterate',
            'writeToAllChannels'
        ];
        // Все параметры для загрузки
        this.paramNames = [...this.readonlyParams, ...this.writableParams];
        // Режимы обмена
        this.exchangeModes = [
            { value: 0, name: 'emNone', label: 'Normal' },
            { value: 1, name: 'emWriteOnly', label: 'Write only' },
            { value: 2, name: 'emReadOnly', label: 'Read only' },
            { value: 3, name: 'emSkipSaveToSM', label: 'Skip save to SM' },
            { value: 4, name: 'emSkipExchange', label: 'Disable exchange' }
        ];
        this.diagnostics = null;
        this.loadingNote = '';
        this.diagnosticsHeight = this.loadDiagnosticsHeight();
        this.sensorsHeight = this.loadSensorsHeight();

        // SSE подписки
        this.subscribedSensorIds = new Set();
        this.batchTbodyId = `opcua-sensors-${objectName}`;
        this.initBatchRenderProps();

        // Virtual scroll properties
        this.allSensors = [];
        this.sensorsTotal = 0;
        this.initVirtualScrollProps();

        // Filter state
        this.filter = '';
        this.typeFilter = 'all';
        this.filterDebounce = null;

        // Pin management
        this.pinStorageKey = 'uniset-panel-opcua-pinned';
        this.renderAfterPinChange = this.renderVisibleSensors;

        // Sensor map for chart support
        this.sensorMap = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `opcua-sensors-table-${objectName}`;
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'iotype', type: 'string' },
            value: { field: 'value', type: 'number' },
            tick: { field: 'tick', type: 'number' },
            vtype: { field: 'vtype', type: 'string' },
            precision: { field: 'precision', type: 'number' },
            status: { field: 'status', type: 'string' }
        };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createOPCUAControlSection()}
            ${this.createOPCUAStatusSection()}
            ${this.createOPCUAParamsSection()}
            ${this.createOPCUASensorsSection()}
            ${this.createOPCUADiagnosticsSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-opcua-sort');
        this.bindEvents();
        this.reloadAll();
        setupChartsResize(this.tabKey);
        this.setupDiagnosticsResize();
        this.setupSensorsResize();
        this.setupFullVirtualScroll({
            viewportId: `opcua-sensors-viewport-${this.objectName}`,
        });
        this.initStatusAutoRefresh();
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allSensors; }
    vscrollRenderVisible() { this.renderVisibleSensors(); }
    vscrollLoadMore() { this.loadMoreSensors(); }

    destroy() {
        this.stopStatusAutoRefresh();
        this.destroyLogViewer();
        this.unsubscribeFromSSE();
    }

    async reloadAll() {
        await Promise.allSettled([
            this.loadStatus(),
            this.loadParams(),
            this.loadSensors(),
            this.loadDiagnostics()
        ]);
    }

    bindEvents() {
        this.setupParamsListeners();

        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `opcua-sensors-filter-${this.objectName}`,
            `opcua-type-filter-${this.objectName}`,
            () => this.loadSensors(),
            300,
            `opcua-status-filter-${this.objectName}`
        );

        const refreshDiag = this.getEl(`opcua-diagnostics-refresh-${this.objectName}`);
        if (refreshDiag) {
            refreshDiag.addEventListener('click', () => this.loadDiagnostics());
        }

        const takeControl = this.getEl(`opcua-control-take-${this.objectName}`);
        if (takeControl) {
            takeControl.addEventListener('click', () => this.takeControl());
        }

        const releaseControl = this.getEl(`opcua-control-release-${this.objectName}`);
        if (releaseControl) {
            releaseControl.addEventListener('click', () => this.releaseControl());
        }
    }

    createOPCUAStatusSection() {
        const headerExtra = `
            ${this.createStatusHeaderExtra()}
            <div class="header-channels" id="opcua-header-channels-${this.objectName}" onclick="event.stopPropagation()"></div>
        `;
        return this.createCollapsibleSection('opcua-status', 'OPC UA Status', `
            <div class="opcua-actions">
                <span class="opcua-note" id="opcua-status-note-${this.objectName}"></span>
            </div>
            <div class="opcua-stats-row" id="opcua-stats-${this.objectName}"></div>
            <div class="opcua-monitor-grid" id="opcua-monitor-${this.objectName}"></div>
        `, { sectionId: `opcua-status-section-${this.objectName}`, headerExtra });
    }

    createOPCUAControlSection() {
        const headerIndicators = `
            <div class="header-indicators" id="opcua-control-indicators-${this.objectName}" onclick="event.stopPropagation()">
                <div class="header-indicator">
                    <span class="header-indicator-label">Allowed</span>
                    <span class="header-indicator-dot" id="opcua-ind-allow-${this.objectName}"></span>
                </div>
                <div class="header-indicator">
                    <span class="header-indicator-label">Active</span>
                    <span class="header-indicator-dot" id="opcua-ind-active-${this.objectName}"></span>
                </div>
                <div class="header-indicator">
                    <span class="header-indicator-label">Parameters</span>
                    <span class="header-indicator-dot" id="opcua-ind-params-${this.objectName}"></span>
                </div>
            </div>
        `;
        return this.createCollapsibleSection('opcua-control', 'HTTP Control', `
            <div class="opcua-actions">
                <button class="btn btn-take-control" id="opcua-control-take-${this.objectName}">Take control</button>
                <button class="btn btn-release-control" id="opcua-control-release-${this.objectName}">Release</button>
                <span class="opcua-note" id="opcua-control-note-${this.objectName}"></span>
            </div>
        `, { sectionId: `opcua-control-section-${this.objectName}`, headerExtra: headerIndicators });
    }

    createOPCUAParamsSection() {
        const headerIndicator = `
            <span class="header-indicator-dot fail" id="opcua-ind-params-${this.objectName}" onclick="event.stopPropagation()" title="Parameters: loading..."></span>
        `;
        return this.createCollapsibleSection('opcua-params', 'Exchange Parameters', `
            <div class="opcua-actions">
                <button class="btn" id="opcua-params-refresh-${this.objectName}">Refresh</button>
                <button class="btn primary" id="opcua-params-save-${this.objectName}">Apply</button>
                <span class="opcua-note" id="opcua-params-note-${this.objectName}"></span>
            </div>
            <div class="opcua-params-grid">
                <div class="opcua-params-column">
                    <div class="opcua-params-subtitle">Status</div>
                    <table class="variables-table opcua-params-table compact">
                        <tbody id="opcua-params-readonly-${this.objectName}"></tbody>
                    </table>
                </div>
                <div class="opcua-params-column">
                    <div class="opcua-params-subtitle">Settings</div>
                    <table class="variables-table opcua-params-table">
                        <tbody id="opcua-params-writable-${this.objectName}"></tbody>
                    </table>
                </div>
            </div>
        `, { sectionId: `opcua-params-section-${this.objectName}`, headerExtra: headerIndicator });
    }

    createOPCUASensorsSection() {
        return this.createCollapsibleSection('opcua-sensors', 'Sensors', `
            <div class="filter-bar opcua-actions">
                <input type="text" class="filter-input" id="opcua-sensors-filter-${this.objectName}" placeholder="Filter...">
                <select class="type-filter" id="opcua-type-filter-${this.objectName}">
                    <option value="all">All types</option>
                    <option value="AI">AI</option>
                    <option value="AO">AO</option>
                    <option value="DI">DI</option>
                    <option value="DO">DO</option>
                </select>
                <select class="type-filter" id="opcua-status-filter-${this.objectName}">
                    <option value="all">All statuses</option>
                    <option value="ok">Ok</option>
                    <option value="bad">Bad</option>
                </select>
                <span class="sensor-count" id="opcua-sensor-count-${this.objectName}">0</span>
                <span class="opcua-note" id="opcua-sensors-note-${this.objectName}"></span>
            </div>
            <div class="opcua-sensors-container" id="opcua-sensors-container-${this.objectName}" style="height: ${this.sensorsHeight}px">
                <div class="opcua-sensors-viewport" id="opcua-sensors-viewport-${this.objectName}">
                    <div class="opcua-sensors-spacer" id="opcua-sensors-spacer-${this.objectName}"></div>
                    <table class="sensors-table variables-table opcua-sensors-table" id="opcua-sensors-table-${this.objectName}">
                        <thead>
                            <tr>
                                <th class="col-pin">
                                    <span class="opcua-unpin-all" id="opcua-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="col-add-buttons"></th>
                                ${this.renderSortableHeader('id', 'ID', true, 'col-id')}
                                ${this.renderSortableHeader('name', 'Name', true, 'col-name')}
                                ${this.renderSortableHeader('type', 'Type', true, 'col-type')}
                                ${this.renderSortableHeader('value', 'Value', true, 'col-value')}
                                ${this.renderSortableHeader('tick', 'Tick', true, 'col-tick')}
                                ${this.renderSortableHeader('vtype', 'VType', true, 'col-vtype')}
                                ${this.renderSortableHeader('precision', 'Precision', true, 'col-precision')}
                                ${this.renderSortableHeader('status', 'Status', true, 'col-status')}
                            </tr>
                        </thead>
                        <tbody id="opcua-sensors-${this.objectName}"></tbody>
                    </table>
                    <div class="opcua-loading-more" id="opcua-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                </div>
                <div class="opcua-sensor-details" id="opcua-sensor-details-${this.objectName}"></div>
            </div>
            <div class="resize-handle" id="opcua-sensors-resize-${this.objectName}"></div>
        `, { sectionId: `opcua-sensors-section-${this.objectName}` });
    }

    createOPCUADiagnosticsSection() {
        return this.createCollapsibleSection('opcua-diagnostics', 'Diagnostics', `
            <div class="opcua-actions">
                <span class="opcua-note" id="opcua-diagnostics-note-${this.objectName}"></span>
            </div>
            <div class="opcua-diagnostics-container" id="opcua-diagnostics-container-${this.objectName}" style="height: ${this.diagnosticsHeight}px">
                <div class="opcua-diagnostics-scroll" id="opcua-diagnostics-${this.objectName}"></div>
            </div>
            <div class="opcua-diagnostics-resize-handle" id="opcua-diagnostics-resize-${this.objectName}"></div>
        `, { sectionId: `opcua-diagnostics-section-${this.objectName}` });
    }

    async loadStatus() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/opcua/status`);
            this.status = data.status || null;
            this.renderStatus();
            this.renderControl();
            this.updateParamsAccessibility('opcua');
            this.updateStatusTimestamp();
            this.setNote(`opcua-status-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`opcua-status-note-${this.objectName}`, err.message, true);
        }
    }

    renderStatus() {
        const statsContainer = this.getEl(`opcua-stats-${this.objectName}`);
        const monitorContainer = this.getEl(`opcua-monitor-${this.objectName}`);
        const headerChannels = this.getEl(`opcua-header-channels-${this.objectName}`);

        if (!statsContainer || !monitorContainer) return;

        statsContainer.innerHTML = '';
        monitorContainer.innerHTML = '';
        if (headerChannels) headerChannels.innerHTML = '';

        if (!this.status) {
            statsContainer.innerHTML = '<span class="text-muted">No data</span>';
            return;
        }

        const status = this.status;

        // Компактная строка статистики
        const ioSize = status.iolist_size ?? status.iolistSize ?? '—';
        const errCount = status.errorHistorySize ?? 0;
        const errMax = status.errorHistoryMax ?? 100;
        const errClass = errCount >= errMax ? 'error' : (errCount > 0 ? 'warn' : '');

        // Определяем класс индикатора ошибок
        const errDotClass = errCount >= errMax ? 'fail' : (errCount > 0 ? 'warn' : 'ok');

        statsContainer.innerHTML = `
            <div class="opcua-stat-item">
                <span class="opcua-stat-label">Subscription:</span>
                <span class="opcua-stat-value">${this.formatSubscription(status)}</span>
            </div>
            <div class="opcua-stat-item">
                <span class="opcua-stat-label">I/O list:</span>
                <span class="opcua-stat-value">${ioSize}</span>
            </div>
            <div class="opcua-stat-item">
                <span class="opcua-stat-label">Errors:</span>
                <span class="opcua-stat-indicator ${errDotClass}"></span>
                <span class="opcua-stat-value">${errCount}/${errMax}</span>
            </div>
        `;

        // Парсим и отображаем Monitor как сетку параметров
        if (status.monitor) {
            const params = this.parseMonitorString(status.monitor);
            if (params.length > 0) {
                const gridHtml = params.map(p => `
                    <div class="opcua-monitor-item">
                        <span class="opcua-monitor-name">${escapeHtml(p.name)}</span>
                        <span class="opcua-monitor-value">${escapeHtml(p.value)}</span>
                    </div>
                `).join('');
                monitorContainer.innerHTML = `
                    <div class="opcua-monitor-title">Parameters</div>
                    <div class="opcua-monitor-items">${gridHtml}</div>
                `;
            }
        }

        // Каналы в шапке
        if (headerChannels && Array.isArray(status.channels) && status.channels.length > 0) {
            const channelsHtml = status.channels.map(ch => {
                const ok = ch.ok || ch.status === 'OK';
                const addr = ch.addr || ch.address || '';
                const disabled = ch.disabled ? ' (disabled)' : '';
                const channelNum = (ch.index ?? 0) + 1;
                return `
                    <div class="header-channel ${ok ? 'ok' : 'fail'}" title="${addr}${disabled}">
                        <span class="header-channel-name">Channel ${channelNum}</span>
                        <span class="header-channel-dot"></span>
                    </div>
                `;
            }).join('');
            headerChannels.innerHTML = channelsHtml;
        }
    }

    parseMonitorString(monitorStr) {
        // Парсим строку формата "name = value name2 = value2 ..."
        const params = [];
        if (!monitorStr) return params;

        // Разбиваем по пробелам, но учитываем что значения могут быть пустыми
        const regex = /(\w+)\s*=\s*(\S*)/g;
        let match;
        while ((match = regex.exec(monitorStr)) !== null) {
            params.push({ name: match[1], value: match[2] || '—' });
        }
        return params;
    }

    renderControl() {
        const allow = this.status?.httpControlAllow && canControl();
        const active = this.status?.httpControlActive;
        const enabledParams = this.status?.httpEnabledSetParams;
        const allowText = allow ? 'Take control' : (!canControl() ? 'Read-only mode' : 'Control not allowed');

        // Обновляем индикаторы в шапке
        const indAllow = this.getEl(`opcua-ind-allow-${this.objectName}`);
        const indActive = this.getEl(`opcua-ind-active-${this.objectName}`);
        const indParams = this.getEl(`opcua-ind-params-${this.objectName}`);

        if (indAllow) {
            indAllow.className = `header-indicator-dot ${allow ? 'ok' : 'fail'}`;
            indAllow.title = allow ? 'Allowed: Yes' : 'Allowed: No';
        }
        if (indActive) {
            indActive.className = `header-indicator-dot ${active ? 'ok' : 'fail'}`;
            indActive.title = active ? 'Active: Yes' : 'Active: No';
        }
        if (indParams) {
            indParams.className = `header-indicator-dot ${enabledParams ? 'ok' : 'fail'}`;
            indParams.title = enabledParams ? 'Parameters: Yes' : 'Parameters: No';
        }

        // Обновляем кнопки
        const takeBtn = this.getEl(`opcua-control-take-${this.objectName}`);
        const releaseBtn = this.getEl(`opcua-control-release-${this.objectName}`);
        const noteEl = this.getEl(`opcua-control-note-${this.objectName}`);

        if (takeBtn) {
            takeBtn.disabled = !allow;
            takeBtn.title = allowText;
            // Подсветка кнопки когда контроль активен
            if (active) {
                takeBtn.classList.add('control-active');
            } else {
                takeBtn.classList.remove('control-active');
            }
        }
        if (releaseBtn) {
            releaseBtn.disabled = !allow;
            releaseBtn.title = allowText;
        }

        // Обновляем стиль сообщения
        if (noteEl) {
            if (active) {
                noteEl.classList.add('control-note-success');
            } else {
                noteEl.classList.remove('control-note-success');
            }
        }
    }

    formatSubscription(status) {
        if (status.subscription) {
            const sub = status.subscription;
            const enabled = sub.enabled ? 'On' : 'Off';
            const items = sub.items !== undefined ? ` · items: ${sub.items}` : '';
            return `${enabled}${items}`;
        }
        if (Array.isArray(status.read_attributes) || Array.isArray(status.write_attributes)) {
            const read = (status.read_attributes || []).map(r => r.total).reduce((a, b) => a + (b || 0), 0);
            const write = (status.write_attributes || []).map(r => r.total).reduce((a, b) => a + (b || 0), 0);
            return `Read: ${read || 0}, Write: ${write || 0}`;
        }
        return '—';
    }

    renderParams() {
        const readonlyTbody = this.getEl(`opcua-params-readonly-${this.objectName}`);
        const writableTbody = this.getEl(`opcua-params-writable-${this.objectName}`);
        if (!readonlyTbody || !writableTbody) return;

        readonlyTbody.innerHTML = '';
        writableTbody.innerHTML = '';

        if (!this.params || Object.keys(this.params).length === 0) {
            readonlyTbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            writableTbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            return;
        }

        // Человекочитаемые названия параметров
        const paramLabels = {
            currentChannel: 'Active channel',
            connectCount: 'Connections',
            activated: 'Activated',
            iolistSize: 'I/O size',
            errorHistoryMax: 'Max errors',
            polltime: 'Poll interval (ms)',
            updatetime: 'Update interval (ms)',
            reconnectPause: 'Reconnect pause (ms)',
            timeoutIterate: 'Iteration timeout (ms)',
            writeToAllChannels: 'Write to all channels',
            exchangeMode: 'Exchange mode'
        };

        // Readonly параметры (только отображение)
        this.readonlyParams.forEach(name => {
            const current = this.params[name];
            const tr = document.createElement('tr');
            let displayValue = current !== undefined ? formatValue(current) : '—';
            // Форматируем activated как Да/Нет
            if (name === 'activated') {
                displayValue = current ? 'Yes' : 'No';
            }
            tr.innerHTML = `
                <td class="variable-name">${paramLabels[name] || name}</td>
                <td class="variable-value">${displayValue}</td>
            `;
            readonlyTbody.appendChild(tr);
        });

        // Writable параметры (с полями ввода)
        const httpControlActive = this.status?.httpControlActive === 1 || this.status?.httpControlActive === true;

        this.writableParams.forEach((name, index) => {
            const current = this.params[name];
            const tr = document.createElement('tr');
            let inputHtml;

            if (name === 'exchangeMode') {
                // Выпадающий список для режима обмена
                const options = this.exchangeModes.map(m => {
                    const selected = current === m.value ? 'selected' : '';
                    return `<option value="${m.value}" ${selected}>${m.label}</option>`;
                }).join('');
                const disabled = httpControlActive ? '' : 'disabled title="HTTP control required"';
                inputHtml = `<select class="opcua-param-input param-field" data-name="${name}" ${disabled}>${options}</select>`;
                tr.className = 'param-row-primary';
            } else if (name === 'writeToAllChannels') {
                // Чекбокс для булевого параметра
                const checked = current ? 'checked' : '';
                inputHtml = `<input type="checkbox" class="opcua-param-checkbox" data-name="${name}" ${checked}>`;
            } else {
                // Обычное поле ввода
                inputHtml = `<input class="opcua-param-input param-field" data-name="${name}" value="${current !== undefined ? current : ''}">`;
            }

            tr.innerHTML = `
                <td class="variable-name">${paramLabels[name] || name}</td>
                <td>${inputHtml}</td>
            `;
            writableTbody.appendChild(tr);

            // Разделитель после exchangeMode
            if (name === 'exchangeMode') {
                const separator = document.createElement('tr');
                separator.className = 'param-separator';
                separator.innerHTML = '<td colspan="2"></td>';
                writableTbody.appendChild(separator);
            }
        });
    }

    async loadSensors() {
        // Reset state for fresh load
        this.allSensors = [];
        this.hasMore = true;
        this.startIndex = 0;
        this.endIndex = 0;

        // Reset viewport scroll position
        const viewport = this.getEl(`opcua-sensors-viewport-${this.objectName}`);
        if (viewport) viewport.scrollTop = 0;

        // Проверяем режим фильтрации: false = серверная (default), true = UI
        const useUIFilter = state.config.opcuaUISensorsFilter;

        try {
            let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=0`;

            // Серверная фильтрация (если не включена UI фильтрация)
            if (!useUIFilter) {
                if (this.filter) {
                    url += `&search=${encodeURIComponent(this.filter)}`;
                }
                if (this.typeFilter && this.typeFilter !== 'all') {
                    url += `&iotype=${this.typeFilter}`;
                }
            }

            const data = await this.fetchJSON(url);
            let sensors = data.sensors || [];
            this.sensorsTotal = typeof data.total === 'number' ? data.total : sensors.length;

            // UI фильтрация (если включена)
            if (useUIFilter) {
                sensors = this.applyLocalFilters(sensors);
            } else if (this.statusFilter && this.statusFilter !== 'all') {
                // Status filter применяем локально (сервер не поддерживает)
                sensors = sensors.filter(s =>
                    (s.status || '').toLowerCase() === this.statusFilter.toLowerCase()
                );
            }

            this.allSensors = sensors;
            this.sensorMap.clear();
            sensors.forEach(s => this.sensorMap.set(s.id, s));

            // Если нет фильтра и есть закреплённые датчики - загрузить их отдельно
            if (!this.filter) {
                await this.loadPinnedSensors();
            }

            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();
            this.setNote(`opcua-sensors-note-${this.objectName}`, '');

            // Подписываемся на SSE обновления после загрузки
            this.subscribeToSSE();

            // Обработчики сортировки
            const table = this.getEl(`opcua-sensors-table-${this.objectName}`);
            if (table) {
                this.attachSortHandlers(table);
                this.updateSortHeaders();
            }
        } catch (err) {
            this.setNote(`opcua-sensors-note-${this.objectName}`, err.message, true);
        }
    }

    // Загружает закреплённые датчики, если они не в текущем списке
    async loadPinnedSensors() {
        const pinnedIds = this.getPinned();
        if (pinnedIds.size === 0) return;

        // Найти ID, которых нет в загруженных датчиках
        const missingIds = [];
        for (const idStr of pinnedIds) {
            const id = parseInt(idStr);
            if (!this.sensorMap.has(id)) {
                missingIds.push(id);
            }
        }

        if (missingIds.length === 0) return;

        // Загрузить отсутствующие датчики по ID
        try {
            const idsParam = missingIds.join(',');
            const url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/get?filter=${idsParam}`;
            const response = await this.fetchJSON(url);
            const pinnedSensors = response.sensors || [];

            // Добавить закреплённые датчики в начало списка
            for (const sensor of pinnedSensors) {
                if (!this.sensorMap.has(sensor.id)) {
                    this.allSensors.unshift(sensor);
                    this.sensorMap.set(sensor.id, sensor);
                }
            }
        } catch (err) {
            console.warn('Failed to load pinned sensors:', err);
        }
    }

    applyLocalFilters(sensors) {
        let result = sensors;
        if (this.filter) {
            const filterLower = this.filter.toLowerCase();
            result = result.filter(s =>
                s.name?.toLowerCase().includes(filterLower) ||
                String(s.id).includes(filterLower)
            );
        }
        if (this.typeFilter && this.typeFilter !== 'all') {
            result = result.filter(s => s.iotype === this.typeFilter);
        }
        if (this.statusFilter && this.statusFilter !== 'all') {
            result = result.filter(s =>
                (s.status || '').toLowerCase() === this.statusFilter.toLowerCase()
            );
        }
        return result;
    }

    async loadMoreSensors() {
        if (this.isLoadingChunk || !this.hasMore) return;

        this.isLoadingChunk = true;
        this.showLoadingIndicator(true);

        // Проверяем режим фильтрации: false = серверная (default), true = UI
        const useUIFilter = state.config.opcuaUISensorsFilter;

        try {
            const nextOffset = this.allSensors.length;
            let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=${nextOffset}`;

            // Серверная фильтрация (если не включена UI фильтрация)
            if (!useUIFilter) {
                if (this.filter) {
                    url += `&search=${encodeURIComponent(this.filter)}`;
                }
                if (this.typeFilter && this.typeFilter !== 'all') {
                    url += `&iotype=${this.typeFilter}`;
                }
            }

            const data = await this.fetchJSON(url);
            let newSensors = data.sensors || [];

            // UI фильтрация (если включена)
            if (useUIFilter) {
                newSensors = this.applyLocalFilters(newSensors);
            } else if (this.statusFilter && this.statusFilter !== 'all') {
                // Status filter применяем локально (сервер не поддерживает)
                newSensors = newSensors.filter(s =>
                    (s.status || '').toLowerCase() === this.statusFilter.toLowerCase()
                );
            }

            // Дедупликация: добавляем только датчики которых еще нет
            const existingIds = new Set(this.allSensors.map(s => s.id));
            const uniqueNewSensors = newSensors.filter(s => !existingIds.has(s.id));

            this.allSensors = [...this.allSensors, ...uniqueNewSensors];
            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();
        } catch (err) {
            console.error('Failed to load more sensors:', err);
        } finally {
            this.isLoadingChunk = false;
            this.showLoadingIndicator(false);
        }
    }

    renderVisibleSensors() {
        const tbody = this.getEl(`opcua-sensors-${this.objectName}`);
        const spacer = this.getEl(`opcua-sensors-spacer-${this.objectName}`);
        if (!tbody || !spacer) return;

        // Получаем закрепленные датчики
        const pinnedSensors = this.getPinned();
        const hasPinned = pinnedSensors.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`opcua-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Фильтруем датчики: если есть закрепленные — показываем только их (если нет фильтра)
        let sensorsToShow = this.allSensors;
        if (hasPinned && !this.filter) {
            sensorsToShow = this.allSensors.filter(s => pinnedSensors.has(String(s.id)));
        }

        // Set spacer height to position visible rows correctly
        const spacerHeight = this.startIndex * this.rowHeight;
        spacer.style.height = `${spacerHeight}px`;

        // Show empty state if no sensors
        if (sensorsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="opcua-no-sensors">No sensors</td></tr>';
            return;
        }

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        sensorsToShow = this.sortItems(sensorsToShow, pinnedSensors, this.sortColumnDefs);

        // Get visible slice
        const visibleSensors = sensorsToShow.slice(this.startIndex, this.endIndex);

        // Update sensorMap for chart support
        visibleSensors.forEach(sensor => {
            if (sensor.id) {
                this.sensorMap.set(sensor.id, sensor);
            }
        });

        // Render visible rows with type badges and chart toggle
        tbody.innerHTML = visibleSensors.map(sensor => {
            const isPinned = pinnedSensors.has(String(sensor.id));
            const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
            const pinIcon = isPinned ? '📌' : '○';
            const pinTitle = isPinned ? 'Unpin' : 'Pin';

            const iotype = sensor.iotype || sensor.type || '';
            const typeBadgeClass = iotype ? `type-badge type-${iotype}` : '';
            return `
            <tr data-sensor-id="${sensor.id || ''}">
                <td class="col-pin">
                    <span class="${pinToggleClass}" data-id="${sensor.id}" title="${pinTitle}">
                        ${pinIcon}
                    </span>
                </td>
                ${this.renderAddButtonsCell(sensor.id, sensor.name, 'opcua', sensor.textname || sensor.name)}
                <td class="col-id">${sensor.id ?? '—'}</td>
                <td class="col-name" title="${escapeAttr(sensor.textname || sensor.comment || '')}">${escapeHtml(sensor.name || '')}</td>
                <td class="col-type"><span class="${typeBadgeClass}">${iotype || '—'}</span></td>
                <td class="col-value">${sensor.value ?? '—'}</td>
                <td class="col-tick">${sensor.tick ?? '—'}</td>
                <td class="col-vtype">${sensor.vtype || '—'}</td>
                <td class="col-precision">${sensor.precision ?? '—'}</td>
                <td class="col-status ${sensor.status && sensor.status.toLowerCase() !== 'ok' ? 'status-bad' : ''}" title="${escapeAttr(sensor.status || '')}">${escapeHtml(sensor.status || '—')}</td>
            </tr>
        `}).join('');

        // Bind chart toggle events
        this.attachChartToggleListeners(tbody, this.sensorMap);

        // Bind dashboard toggle events
        this.attachDashboardToggleListeners(tbody);

        // Bind pin toggle events
        tbody.querySelectorAll('.pin-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => this.togglePin(parseInt(toggle.dataset.id)));
        });

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAll();
        }

        // Bind row click events (prevent on chart checkbox)
        tbody.querySelectorAll('tr[data-sensor-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't trigger row click when clicking on chart checkbox
                if (e.target.closest('.chart-toggle')) return;
                const id = row.dataset.sensorId;
                if (id) this.loadSensorDetails(parseInt(id, 10));
            });
        });
    }

    // Override to use OPC UA SSE subscription
    subscribeToChartSensor(sensorId) {
        // OPCUAExchange sensors are already subscribed through main SSE
        // Just ensure the sensor is in our subscription list
        if (!this.subscribedSensorIds.has(sensorId)) {
            this.subscribedSensorIds.add(sensorId);
        }
    }

    updateSensorCount() {
        this.updateItemCount(`opcua-sensor-count-${this.objectName}`, this.allSensors.length, this.sensorsTotal);
    }

    showLoadingIndicator(show) {
        const el = this.getEl(`opcua-loading-more-${this.objectName}`);
        if (el) {
            el.style.display = show ? 'block' : 'none';
        }
    }

    async loadSensorDetails(id) {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors/${id}`);
            this.renderSensorDetails(data.sensor);
        } catch (err) {
            this.setNote(`opcua-sensors-note-${this.objectName}`, err.message, true);
        }
    }

    renderSensorDetails(sensor) {
        const container = this.getEl(`opcua-sensor-details-${this.objectName}`);
        if (!container) return;

        if (!sensor) {
            container.innerHTML = '<div class="text-muted">Sensor not found</div>';
            return;
        }

        const channels = Array.isArray(sensor.channels) ? sensor.channels.map(ch => {
            const disabled = ch.disabled ? 'disabled' : '';
            const status = ch.status || ch.statusCode || '';
            return `<div class="opcua-sensor-channel">${ch.index !== undefined ? `#${ch.index}` : ''} ${status} ${disabled ? '(disabled)' : ''}</div>`;
        }).join('') : '';

        container.innerHTML = `
            <div class="opcua-sensor-card">
                <div class="opcua-sensor-title">${escapeHtml(sensor.name || '')} (${sensor.id})</div>
                <div class="opcua-sensor-grid">
                    <div><span class="opcua-sensor-label">NodeId:</span> ${escapeHtml(sensor.nodeid || '—')}</div>
                    <div><span class="opcua-sensor-label">Type:</span> ${sensor.iotype || sensor.type || '—'}</div>
                    <div><span class="opcua-sensor-label">Value:</span> ${sensor.value ?? '—'}</div>
                    <div><span class="opcua-sensor-label">Tick:</span> ${sensor.tick ?? '—'}</div>
                    <div><span class="opcua-sensor-label">VType:</span> ${sensor.vtype || '—'}</div>
                    <div><span class="opcua-sensor-label">Precision:</span> ${sensor.precision ?? '—'}</div>
                    <div><span class="opcua-sensor-label">Status:</span> ${sensor.status || '—'}</div>
                </div>
                ${channels ? `<div class="opcua-sensor-channels">${channels}</div>` : ''}
            </div>
        `;
    }

    async loadDiagnostics() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/opcua/diagnostics`);
            this.diagnostics = data;
            this.renderDiagnostics();
            this.setNote(`opcua-diagnostics-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`opcua-diagnostics-note-${this.objectName}`, err.message, true);
        }
    }

    renderDiagnostics() {
        const container = this.getEl(`opcua-diagnostics-${this.objectName}`);
        if (!container) return;

        if (!this.diagnostics) {
            container.innerHTML = '<div class="text-muted">No data</div>';
            return;
        }

        const summary = this.diagnostics.summary || {};
        const errors = this.diagnostics.lastErrors || [];

        let html = '<div class="opcua-diagnostics-summary">';
        Object.entries(summary).forEach(([key, value]) => {
            html += `<div class="opcua-diagnostics-item"><span>${key}</span><strong>${value}</strong></div>`;
        });
        html += '</div>';

        if (errors.length > 0) {
            html += '<table class="variables-table opcua-errors-table"><thead><tr><th>Time</th><th>Last</th><th>Count</th><th>Channel</th><th>Operation</th><th>StatusCode</th><th>NodeId</th></tr></thead><tbody>';
            errors.forEach(err => {
                html += `<tr>
                    <td>${err.time || ''}</td>
                    <td>${err.lastSeen || ''}</td>
                    <td>${err.count ?? ''}</td>
                    <td>${err.channel ?? ''}</td>
                    <td>${err.operation || ''}</td>
                    <td>${err.statusCode || ''}</td>
                    <td>${escapeHtml(err.nodeid || '')}</td>
                </tr>`;
            });
            html += '</tbody></table>';
        } else {
            html += '<div class="text-muted">No errors</div>';
        }

        container.innerHTML = html;
    }

    loadDiagnosticsHeight() {
        return this.loadSectionHeight('uniset-panel-opcua-diagnostics', 260);
    }

    saveDiagnosticsHeight(value) {
        this.diagnosticsHeight = value;
        this.saveSectionHeight('uniset-panel-opcua-diagnostics', value);
    }

    setupDiagnosticsResize() {
        this.setupSectionResize(
            `opcua-diagnostics-resize-${this.objectName}`,
            `opcua-diagnostics-container-${this.objectName}`,
            'uniset-panel-opcua-diagnostics',
            'diagnosticsHeight',
            { minHeight: 160, maxHeight: 600 }
        );
    }

    loadSensorsHeight() {
        return this.loadSectionHeight('uniset-panel-opcua-sensors', 320);
    }

    saveSensorsHeight(value) {
        this.sensorsHeight = value;
        this.saveSectionHeight('uniset-panel-opcua-sensors', value);
    }

    setupSensorsResize() {
        this.setupSectionResize(
            `opcua-sensors-resize-${this.objectName}`,
            `opcua-sensors-container-${this.objectName}`,
            'uniset-panel-opcua-sensors',
            'sensorsHeight',
            { minHeight: 200, maxHeight: 700 }
        );
    }

    async takeControl() {
        if (this.status && this.status.httpControlAllow === false) {
            this.setNote(`opcua-control-note-${this.objectName}`, 'Control not allowed', true);
            return;
        }

        try {
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/opcua/control/take`, { method: 'POST' });
            this.setNote(`opcua-control-note-${this.objectName}`, 'HTTP control activated');
            this.loadStatus();
        } catch (err) {
            this.setNote(`opcua-control-note-${this.objectName}`, err.message, true);
        }
    }

    async releaseControl() {
        if (this.status && this.status.httpControlAllow === false) {
            this.setNote(`opcua-control-note-${this.objectName}`, 'Control not allowed', true);
            return;
        }

        try {
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/opcua/control/release`, { method: 'POST' });
            this.setNote(`opcua-control-note-${this.objectName}`, 'Control returned to sensor');
            this.loadStatus();
        } catch (err) {
            this.setNote(`opcua-control-note-${this.objectName}`, err.message, true);
        }
    }

    // === SSE подписка на обновления датчиков (использует SSESubscriptionMixin) ===

    async subscribeToSSE() {
        const sensorIds = this.allSensors.map(s => s.id);
        await this.subscribeToSSEFor('/opcua', sensorIds, 'sensor_ids', 'OPCUA SSE');
    }

    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/opcua', 'sensor_ids', 'OPCUA SSE');
    }

    handleOPCUASensorUpdates(sensors) {
        this.handleBatchUpdates(sensors);
    }

    // Bridge для BatchRenderMixin
    getBatchItems() { return this.allSensors; }

    updateRowCells(row, update) {
        // Value
        if (update.value !== undefined) {
            this._animateCellValue(row, '.col-value', String(update.value), 'value-changed');
        }
        // Tick
        const tickCell = row.querySelector('.col-tick');
        if (tickCell && update.tick !== undefined) {
            tickCell.textContent = String(update.tick);
        }
        // Status
        const statusCell = row.querySelector('.col-status');
        if (statusCell && update.status !== undefined) {
            statusCell.textContent = update.status || '—';
            statusCell.title = update.status || '';
            if (update.status && update.status.toLowerCase() !== 'ok') {
                statusCell.classList.add('status-bad');
            } else {
                statusCell.classList.remove('status-bad');
            }
        }
        // VType
        const vtypeCell = row.querySelector('.col-vtype');
        if (vtypeCell && update.vtype !== undefined) {
            vtypeCell.textContent = update.vtype || '—';
        }
        // Precision
        const precisionCell = row.querySelector('.col-precision');
        if (precisionCell && update.precision !== undefined) {
            precisionCell.textContent = update.precision ?? '—';
        }
    }

    // update(data) наследуется из BaseObjectRenderer

    // Pin management: pinStorageKey и renderAfterPinChange заданы в конструкторе

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderVisibleSensors(); }
}

// Apply mixins to OPCUAExchangeRenderer
applyMixin(OPCUAExchangeRenderer, VirtualScrollMixin);
applyMixin(OPCUAExchangeRenderer, SSESubscriptionMixin);
applyMixin(OPCUAExchangeRenderer, BatchRenderMixin);
applyMixin(OPCUAExchangeRenderer, ResizableSectionMixin);
applyMixin(OPCUAExchangeRenderer, FilterMixin);
applyMixin(OPCUAExchangeRenderer, ParamsAccessibilityMixin);
applyMixin(OPCUAExchangeRenderer, ParamsManagerMixin);
applyMixin(OPCUAExchangeRenderer, ItemCounterMixin);
applyMixin(OPCUAExchangeRenderer, PinManagementMixin);
applyMixin(OPCUAExchangeRenderer, TableSortMixin);



// === 22-modbus-master.js ===
// ============================================================================
// ModbusMasterRenderer - рендерер для ModbusMaster объектов
// ============================================================================

class ModbusMasterRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'ModbusMaster';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.status = null;
        this.params = {};
        this.paramsApiPath = 'modbus';
        this.paramsPrefix = 'mb';
        // Параметры только для чтения (статус)
        this.readonlyParams = [
            'force',
            'force_out',
            'maxHeartBeat'
        ];
        // Параметры для записи
        this.writableParams = [
            'exchangeMode',
            'recv_timeout',
            'sleepPause_msec',
            'polltime',
            'default_timeout'
        ];
        // Все параметры для загрузки
        this.paramNames = [...this.readonlyParams, ...this.writableParams];
        // Режимы обмена (как в OPCUA)
        this.exchangeModes = [
            { value: 0, name: 'none', label: 'Normal' },
            { value: 1, name: 'writeOnly', label: 'Write only' },
            { value: 2, name: 'readOnly', label: 'Read only' },
            { value: 3, name: 'skipSaveToSM', label: 'Skip save to SM' },
            { value: 4, name: 'skipExchange', label: 'Disable exchange' }
        ];
        this.devices = [];
        this.registersHeight = this.loadRegistersHeight();

        // SSE подписки (используется subscribedSensorIds из миксина)
        this.subscribedSensorIds = new Set();
        this.batchTbodyId = `mb-registers-tbody-${objectName}`;
        this.initBatchRenderProps();

        // Virtual scroll properties
        this.allRegisters = [];
        this.devicesDict = {};
        this.registersTotal = 0;
        this.initVirtualScrollProps();

        // Filter state
        this.filter = '';
        this.typeFilter = 'all';
        this.filterDebounce = null;

        // Pin management
        this.pinStorageKey = 'uniset-panel-mb-pinned';
        this.renderAfterPinChange = this.renderRegisters;

        // Register map for chart support
        this.registerMap = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `mb-registers-table-${objectName}`;
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'iotype', type: 'string' },
            value: { field: 'value', type: 'number' },
            device: { field: 'device', type: 'number' },
            register: { field: 'register', type: 'number', accessor: (item) => (item.register || {}).mbreg },
            func: { field: 'func', type: 'string', accessor: (item) => (item.register || {}).mbfunc }
        };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createMBControlSection()}
            ${this.createMBStatusSection()}
            ${this.createMBParamsSection()}
            ${this.createMBDevicesSection()}
            ${this.createMBRegistersSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-mbmaster-sort');
        this.bindEvents();
        this.reloadAll();
        setupChartsResize(this.tabKey);
        this.setupRegistersResize();
        this.setupSimpleInfiniteScroll({
            viewportId: `mb-registers-viewport-${this.objectName}`,
            threshold: 100,
        });
        this.initStatusAutoRefresh();
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allRegisters; }
    vscrollLoadMore() { this.loadRegisterChunk(this.allRegisters.length); }

    destroy() {
        this.stopStatusAutoRefresh();
        this.destroyLogViewer();
        this.unsubscribeFromSSE();
    }

    // ModbusMaster регистры - показываем badge "MB"
    getChartOptions() {
        return { badge: 'MB', prefix: 'mb' };
    }

    async reloadAll() {
        await Promise.allSettled([
            this.loadStatus(),
            this.loadParams(),
            this.loadDevices(),
            this.loadRegisters()
        ]);
    }

    bindEvents() {
        this.setupParamsListeners();

        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `mb-registers-filter-${this.objectName}`,
            `mb-type-filter-${this.objectName}`,
            () => this.loadRegisters(),       // type filter → серверная фильтрация
            FILTER_DEBOUNCE_DELAY, null,
            () => this.renderRegisters()      // text filter → локальная фильтрация
        );

        // HTTP Control buttons
        const takeControl = this.getEl(`mb-control-take-${this.objectName}`);
        if (takeControl) {
            takeControl.addEventListener('click', () => this.takeControl());
        }

        const releaseControl = this.getEl(`mb-control-release-${this.objectName}`);
        if (releaseControl) {
            releaseControl.addEventListener('click', () => this.releaseControl());
        }
    }


    createMBControlSection() {
        const headerIndicators = `
            <div class="header-indicators" id="mb-control-indicators-${this.objectName}" onclick="event.stopPropagation()">
                <div class="header-indicator">
                    <span class="header-indicator-label">Allowed</span>
                    <span class="header-indicator-dot" id="mb-ind-allow-${this.objectName}"></span>
                </div>
                <div class="header-indicator">
                    <span class="header-indicator-label">Active</span>
                    <span class="header-indicator-dot" id="mb-ind-active-${this.objectName}"></span>
                </div>
                <div class="header-indicator">
                    <span class="header-indicator-label">Parameters</span>
                    <span class="header-indicator-dot" id="mb-ind-params-${this.objectName}"></span>
                </div>
            </div>
        `;
        return this.createCollapsibleSection('mb-control', 'HTTP Control', `
            <div class="mb-actions">
                <button class="btn btn-take-control" id="mb-control-take-${this.objectName}">Take control</button>
                <button class="btn btn-release-control" id="mb-control-release-${this.objectName}">Release</button>
                <span class="mb-note" id="mb-control-note-${this.objectName}"></span>
            </div>
        `, { sectionId: `mb-control-section-${this.objectName}`, headerExtra: headerIndicators });
    }

    createMBStatusSection() {
        return this.createCollapsibleSection('mb-status', 'Modbus Status', `
            <div class="mb-actions">
                <span class="mb-note" id="mb-status-note-${this.objectName}"></span>
            </div>
            <table class="info-table">
                <tbody id="mb-status-${this.objectName}"></tbody>
            </table>
        `, { sectionId: `mb-status-section-${this.objectName}`, headerExtra: this.createStatusHeaderExtra() });
    }

    createMBParamsSection() {
        return this.createCollapsibleSection('mb-params', 'Exchange Parameters', `
            <div class="mb-actions">
                <button class="btn" id="mb-params-refresh-${this.objectName}">Перезагрузить</button>
                <button class="btn primary" id="mb-params-save-${this.objectName}">Apply</button>
                <span class="mb-note" id="mb-params-note-${this.objectName}"></span>
            </div>
            <div class="mb-params-table-wrapper">
                <table class="variables-table mb-params-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Current</th>
                            <th>New value</th>
                        </tr>
                    </thead>
                    <tbody id="mb-params-${this.objectName}"></tbody>
                </table>
            </div>
        `, { sectionId: `mb-params-section-${this.objectName}` });
    }

    createMBDevicesSection() {
        return this.createCollapsibleSection('mb-devices', 'Devices (Slaves)', `
            <div class="mb-actions">
                <span class="mb-device-count" id="mb-device-count-${this.objectName}">0</span>
                <span class="mb-note" id="mb-devices-note-${this.objectName}"></span>
            </div>
            <div class="mb-devices-container" id="mb-devices-${this.objectName}"></div>
        `, { sectionId: `mb-devices-section-${this.objectName}` });
    }

    createMBRegistersSection() {
        return this.createCollapsibleSection('mb-registers', 'Registers', `
            <div class="filter-bar mb-actions">
                <input type="text" class="filter-input" id="mb-registers-filter-${this.objectName}" placeholder="Filter...">
                <select class="type-filter" id="mb-type-filter-${this.objectName}">
                    <option value="all">All types</option>
                    <option value="AI">AI</option>
                    <option value="AO">AO</option>
                    <option value="DI">DI</option>
                    <option value="DO">DO</option>
                </select>
                <span class="sensor-count" id="mb-register-count-${this.objectName}">0</span>
                <span class="mb-note" id="mb-registers-note-${this.objectName}"></span>
            </div>
            <div class="mb-registers-container" id="mb-registers-container-${this.objectName}" style="height: ${this.registersHeight}px">
                <div class="mb-registers-viewport" id="mb-registers-viewport-${this.objectName}">
                    <div class="mb-registers-spacer" id="mb-registers-spacer-${this.objectName}"></div>
                    <table class="sensors-table variables-table mb-registers-table" id="mb-registers-table-${this.objectName}">
                        <thead>
                            <tr>
                                <th class="col-pin">
                                    <span class="mb-unpin-all" id="mb-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="col-add-buttons"></th>
                                ${this.renderSortableHeader('id', 'ID', true, 'col-id')}
                                ${this.renderSortableHeader('name', 'Name', true, 'col-name')}
                                ${this.renderSortableHeader('type', 'Type', true, 'col-type')}
                                ${this.renderSortableHeader('value', 'Value', true, 'col-value')}
                                ${this.renderSortableHeader('device', 'Устройство', true, 'col-device')}
                                ${this.renderSortableHeader('register', 'Регистр', true, 'col-register')}
                                ${this.renderSortableHeader('func', 'Функция', true, 'col-func')}
                                <th class="col-mbval">MB Val</th>
                            </tr>
                        </thead>
                        <tbody id="mb-registers-tbody-${this.objectName}"></tbody>
                    </table>
                    <div class="mb-loading-more" id="mb-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                </div>
            </div>
            <div class="resize-handle" id="mb-registers-resize-${this.objectName}"></div>
        `, { sectionId: `mb-registers-section-${this.objectName}` });
    }

    async loadStatus() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/status`);
            this.status = data.status || null;
            this.renderStatus();
            this.renderControl();
            this.updateParamsAccessibility('mb');
            this.updateStatusTimestamp();
            this.setNote(`mb-status-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`mb-status-note-${this.objectName}`, err.message, true);
        }
    }

    renderStatus() {
        const tbody = this.getEl(`mb-status-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!this.status) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            return;
        }

        const status = this.status;
        const rows = [
            { label: 'Name', value: status.name },
            { label: 'Monitor', value: status.monitor },
            { label: 'Activated', value: status.activated },
            { label: 'Mode', value: status.mode?.name || status.exchangeMode },
            { label: 'force', value: status.force },
            { label: 'force_out', value: status.force_out },
            { label: 'maxHeartBeat', value: status.maxHeartBeat },
            { label: 'activateTimeout', value: status.activateTimeout },
            { label: 'reopenTimeout', value: status.reopenTimeout }
        ];

        rows.forEach(row => {
            if (row.value === undefined || row.value === null) return;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="info-label">${row.label}</td>
                <td class="info-value">${formatValue(row.value)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderControl() {
        const allow = this.status?.httpControlAllow && canControl();
        const active = this.status?.httpControlActive;
        const enabledParams = this.status?.httpEnabledSetParams;
        const allowText = allow ? 'Take control' : (!canControl() ? 'Read-only mode' : 'Control not allowed');

        // Обновляем индикаторы в шапке
        const indAllow = this.getEl(`mb-ind-allow-${this.objectName}`);
        const indActive = this.getEl(`mb-ind-active-${this.objectName}`);
        const indParams = this.getEl(`mb-ind-params-${this.objectName}`);

        if (indAllow) {
            indAllow.className = `header-indicator-dot ${allow ? 'ok' : 'fail'}`;
            indAllow.title = allow ? 'Allowed: Yes' : 'Allowed: No';
        }
        if (indActive) {
            indActive.className = `header-indicator-dot ${active ? 'ok' : 'fail'}`;
            indActive.title = active ? 'Active: Yes' : 'Active: No';
        }
        if (indParams) {
            indParams.className = `header-indicator-dot ${enabledParams ? 'ok' : 'fail'}`;
            indParams.title = enabledParams ? 'Parameters: Yes' : 'Parameters: No';
        }

        // Обновляем кнопки
        const takeBtn = this.getEl(`mb-control-take-${this.objectName}`);
        const releaseBtn = this.getEl(`mb-control-release-${this.objectName}`);
        const noteEl = this.getEl(`mb-control-note-${this.objectName}`);

        if (takeBtn) {
            takeBtn.disabled = !allow;
            takeBtn.title = allowText;
            // Подсветка кнопки когда контроль активен
            if (active) {
                takeBtn.classList.add('control-active');
            } else {
                takeBtn.classList.remove('control-active');
            }
        }
        if (releaseBtn) {
            releaseBtn.disabled = !allow;
            releaseBtn.title = allowText;
        }

        // Обновляем стиль сообщения
        if (noteEl) {
            if (active) {
                noteEl.classList.add('control-note-success');
            } else {
                noteEl.classList.remove('control-note-success');
            }
        }
    }

    async takeControl() {
        if (this.status && this.status.httpControlAllow === false) {
            this.setNote(`mb-control-note-${this.objectName}`, 'Control not allowed', true);
            return;
        }

        try {
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/control/take`, { method: 'POST' });
            this.setNote(`mb-control-note-${this.objectName}`, 'HTTP control activated');
            this.loadStatus();
        } catch (err) {
            this.setNote(`mb-control-note-${this.objectName}`, err.message, true);
        }
    }

    async releaseControl() {
        if (this.status && this.status.httpControlAllow === false) {
            this.setNote(`mb-control-note-${this.objectName}`, 'Control not allowed', true);
            return;
        }

        try {
            await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/control/release`, { method: 'POST' });
            this.setNote(`mb-control-note-${this.objectName}`, 'Control returned to sensor');
            this.loadStatus();
        } catch (err) {
            this.setNote(`mb-control-note-${this.objectName}`, err.message, true);
        }
    }

    renderParams() {
        const tbody = this.getEl(`mb-params-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        const httpControlActive = this.status?.httpControlActive === 1 || this.status?.httpControlActive === true;

        // Человекочитаемые названия параметров
        const paramLabels = {
            force: 'Force read',
            force_out: 'Force write',
            maxHeartBeat: 'Max heartbeat (ms)',
            exchangeMode: 'Exchange mode',
            recv_timeout: 'Receive timeout (ms)',
            sleepPause_msec: 'Sleep pause (ms)',
            polltime: 'Poll interval (ms)',
            default_timeout: 'Default timeout (ms)'
        };

        // Readonly параметры
        this.readonlyParams.forEach(name => {
            const value = this.params[name];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="param-name">${paramLabels[name] || name}</td>
                <td class="param-value">${value !== undefined ? formatValue(value) : '—'}</td>
                <td class="param-input">—</td>
            `;
            tbody.appendChild(tr);
        });

        // Writable параметры
        this.writableParams.forEach(name => {
            const value = this.params[name];
            const tr = document.createElement('tr');
            let inputHtml;

            if (name === 'exchangeMode') {
                // Выпадающий список для режима обмена
                const options = this.exchangeModes.map(m => {
                    const selected = value === m.value ? 'selected' : '';
                    return `<option value="${m.value}" ${selected}>${m.label}</option>`;
                }).join('');
                const disabled = httpControlActive ? '' : 'disabled title="HTTP control required"';
                inputHtml = `<select class="param-field" data-param="${name}" ${disabled}>${options}</select>`;
                tr.className = 'param-row-primary';
            } else {
                inputHtml = `<input type="text" class="param-field" data-param="${name}" placeholder="${value !== undefined ? value : ''}" />`;
            }

            tr.innerHTML = `
                <td class="param-name">${paramLabels[name] || name}</td>
                <td class="param-value">${value !== undefined ? formatValue(value) : '—'}</td>
                <td class="param-input">${inputHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async loadDevices() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/devices`);
            this.devices = data.devices || [];
            this.renderDevices();
            this.setNote(`mb-devices-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`mb-devices-note-${this.objectName}`, err.message, true);
        }
    }

    renderDevices() {
        const container = this.getEl(`mb-devices-${this.objectName}`);
        const countEl = this.getEl(`mb-device-count-${this.objectName}`);
        if (!container) return;

        if (countEl) {
            countEl.textContent = `${this.devices.length} devices`;
        }

        if (this.devices.length === 0) {
            container.innerHTML = '<div class="text-muted">No devices</div>';
            return;
        }

        container.innerHTML = `
            <table class="variables-table mb-devices-table">
                <thead>
                    <tr>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Registers</th>
                        <th>Mode</th>
                        <th>SafeMode</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.devices.map(dev => {
                        const respondClass = dev.respond ? '' : 'status-bad';
                        const respondText = dev.respond ? 'Ok' : 'No response';
                        return `
                            <tr>
                                <td>${dev.addr}</td>
                                <td class="${respondClass}">${respondText}</td>
                                <td>${dev.dtype || '—'}</td>
                                <td>${dev.regCount ?? 0}</td>
                                <td>${dev.mode ?? 0}</td>
                                <td>${dev.safeMode ?? 0}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    async loadRegisters() {
        this.allRegisters = [];
        this.devicesDict = {};
        this.hasMore = true;
        this.isLoadingChunk = false;
        await this.loadRegisterChunk(0);
    }

    renderRegisters() {
        const tbody = this.getEl(`mb-registers-tbody-${this.objectName}`);
        if (!tbody) return;

        // Получаем закрепленные регистры
        const pinnedRegisters = this.getPinned();
        const hasPinned = pinnedRegisters.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`mb-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Фильтруем регистры используя общий метод (по name, id, mbreg)
        const mbregAccessor = (item, field) => (item.register || {})[field];
        let registersToShow = this.applyFilters(this.allRegisters, 'name', 'iotype', null, ['mbreg'], mbregAccessor);

        // Если есть закрепленные и нет фильтра — показываем только их
        if (hasPinned && !this.filter) {
            registersToShow = registersToShow.filter(r => pinnedRegisters.has(String(r.id)));
        }

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        registersToShow = this.sortItems(registersToShow, pinnedRegisters, this.sortColumnDefs);

        // Обновляем счётчик с учётом фильтрации
        this.updateItemCount(`mb-register-count-${this.objectName}`, registersToShow.length, this.registersTotal);

        // Update registerMap for chart support
        registersToShow.forEach(reg => {
            if (reg.id) {
                this.registerMap.set(reg.id, reg);
            }
        });

        const html = registersToShow.map(reg => {
            const isPinned = pinnedRegisters.has(String(reg.id));
            const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
            const pinIcon = isPinned ? '📌' : '○';
            const pinTitle = isPinned ? 'Unpin' : 'Pin';

            const deviceAddr = reg.device;
            const deviceInfo = this.devicesDict[deviceAddr] || {};
            const regInfo = reg.register || {};
            const respondClass = deviceInfo.respond ? 'ok' : 'fail';
            return `
                <tr data-sensor-id="${reg.id}">
                    <td class="col-pin">
                        <span class="${pinToggleClass}" data-id="${reg.id}" title="${pinTitle}">
                            ${pinIcon}
                        </span>
                    </td>
                    ${this.renderAddButtonsCell(reg.id, reg.name, 'mbreg', reg.textname || reg.name)}
                    <td class="col-id">${reg.id}</td>
                    <td class="col-name" title="${escapeAttr(reg.textname || reg.comment || '')}">${escapeHtml(reg.name || '')}</td>
                    <td class="col-type">${reg.iotype ? `<span class="type-badge type-${reg.iotype}">${reg.iotype}</span>` : ''}</td>
                    <td class="col-value">${reg.value !== undefined ? reg.value : ''}</td>
                    <td class="col-device"><span class="mb-respond ${respondClass}">${deviceAddr || ''}</span></td>
                    <td class="col-register">${regInfo.mbreg || ''}</td>
                    <td class="col-func">${regInfo.mbfunc || ''}</td>
                    <td class="col-mbval">${regInfo.mbval !== undefined ? regInfo.mbval : ''}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;

        // Bind chart toggle events
        this.attachChartToggleListeners(tbody, this.registerMap);

        // Bind dashboard button events
        this.attachDashboardToggleListeners(tbody);

        // Bind pin toggle events
        tbody.querySelectorAll('.pin-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => this.togglePin(parseInt(toggle.dataset.id)));
        });

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAll();
        }
    }

    // Override to use Modbus SSE subscription
    subscribeToChartSensor(sensorId) {
        // ModbusMaster registers are already subscribed through main SSE
        if (!this.subscribedSensorIds.has(sensorId)) {
            this.subscribedSensorIds.add(sensorId);
        }
    }

    loadRegistersHeight() {
        return this.loadSectionHeight('uniset-panel-mb-registers', 320);
    }

    saveRegistersHeight(value) {
        this.registersHeight = value;
        this.saveSectionHeight('uniset-panel-mb-registers', value);
    }

    setupRegistersResize() {
        this.setupSectionResize(
            `mb-registers-resize-${this.objectName}`,
            `mb-registers-container-${this.objectName}`,
            'uniset-panel-mb-registers',
            'registersHeight',
            { minHeight: 200, maxHeight: 700 }
        );
    }

    // === SSE подписка на обновления регистров (использует SSESubscriptionMixin) ===

    async subscribeToSSE() {
        const registerIds = this.allRegisters.map(r => r.id);
        await this.subscribeToSSEFor('/modbus', registerIds, 'register_ids', 'ModbusMaster SSE');
    }

    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/modbus', 'register_ids', 'ModbusMaster SSE');
    }

    handleModbusRegisterUpdates(registers) {
        this.handleBatchUpdates(registers);
    }

    // Bridge для BatchRenderMixin
    getBatchItems() { return this.allRegisters; }

    updateRowCells(row, update) {
        // Value
        if (update.value !== undefined) {
            this._animateCellValue(row, '.col-value', String(update.value), 'value-changed');
        }
        // Device respond status
        const deviceCell = row.querySelector('.col-device .mb-respond');
        if (deviceCell && update.device !== undefined) {
            const deviceAddr = update.device;
            const deviceInfo = this.devicesDict[deviceAddr] || {};
            deviceCell.className = `mb-respond ${deviceInfo.respond ? 'ok' : 'fail'}`;
        }
        // MB val (raw modbus value)
        const mbvalCell = row.querySelector('.col-mbval');
        if (mbvalCell && update.register) {
            const newMbval = update.register.mbval !== undefined ? String(update.register.mbval) : '';
            mbvalCell.textContent = newMbval;
        }
    }

    // update(data) наследуется из BaseObjectRenderer

    // Pin management: pinStorageKey и renderAfterPinChange заданы в конструкторе
    // Используются сокращённые методы из PinManagementMixin: getPinned(), togglePin(), unpinAll()

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderRegisters(); }
}

// Apply mixins to ModbusMasterRenderer
applyMixin(ModbusMasterRenderer, VirtualScrollMixin);
applyMixin(ModbusMasterRenderer, SSESubscriptionMixin);
applyMixin(ModbusMasterRenderer, BatchRenderMixin);
applyMixin(ModbusMasterRenderer, ResizableSectionMixin);
applyMixin(ModbusMasterRenderer, FilterMixin);
applyMixin(ModbusMasterRenderer, ParamsAccessibilityMixin);
applyMixin(ModbusMasterRenderer, ParamsManagerMixin);
applyMixin(ModbusMasterRenderer, ItemCounterMixin);
applyMixin(ModbusMasterRenderer, PinManagementMixin);
applyMixin(ModbusMasterRenderer, TableSortMixin);
applyMixin(ModbusMasterRenderer, ModbusRegistersMixin);

// Регистрируем стандартные рендереры
registerRenderer('UniSetManager', UniSetManagerRenderer);
registerRenderer('UniSetObject', UniSetObjectRenderer);
registerRenderer('IONotifyController', IONotifyControllerRenderer);
registerRenderer('OPCUAExchange', OPCUAExchangeRenderer);

// ModbusMaster рендерер (по extensionType)
registerRenderer('ModbusMaster', ModbusMasterRenderer);

// Fallback для старых версий (по objectType)
registerRenderer('MBTCPMaster', ModbusMasterRenderer);
registerRenderer('MBTCPMultiMaster', ModbusMasterRenderer);
registerRenderer('MBRTUMaster', ModbusMasterRenderer);
registerRenderer('ModbusTCPMaster', ModbusMasterRenderer);
registerRenderer('ModbusRTUMaster', ModbusMasterRenderer);



// === 23-modbus-slave.js ===
// ============================================================================
// ModbusSlaveRenderer - рендерер для ModbusSlave объектов
// ============================================================================

class ModbusSlaveRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'ModbusSlave';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.status = null;
        this.params = {};
        this.paramsApiPath = 'modbus';
        this.paramsPrefix = 'mbs';
        // Параметры ModbusSlave отличаются от ModbusMaster
        this.paramNames = [
            'force',
            'sockTimeout',
            'sessTimeout',
            'updateStatTime'
        ];
        this.registersHeight = this.loadRegistersHeight();

        // SSE подписки (используется subscribedSensorIds из миксина)
        this.subscribedSensorIds = new Set();
        this.batchTbodyId = `mbs-registers-tbody-${objectName}`;
        this.initBatchRenderProps();

        // Virtual scroll properties
        this.allRegisters = [];
        this.devicesDict = {};
        this.registersTotal = 0;
        this.initVirtualScrollProps();

        // Filter state
        this.filter = '';
        this.typeFilter = 'all';
        this.filterDebounce = null;

        // Pin management
        this.pinStorageKey = 'uniset-panel-mbs-pinned';
        this.renderAfterPinChange = this.renderRegisters;

        // Register map for chart support
        this.registerMap = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `mbs-registers-table-${objectName}`;
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'iotype', type: 'string' },
            value: { field: 'value', type: 'number' },
            mbaddr: { field: 'device', type: 'number' },
            register: { field: 'register', type: 'number', accessor: (item) => {
                const regInfo = item.register || {};
                return regInfo.mbreg !== undefined ? regInfo.mbreg : item.mbreg;
            }},
            func: { field: 'func', type: 'string', accessor: (item) => (item.register || {}).mbfunc },
            access: { field: 'amode', type: 'string' }
        };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createMBSStatusSection()}
            ${this.createMBSTcpSessionsSection()}
            ${this.createMBSParamsSection()}
            ${this.createMBSRegistersSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-mbslave-sort');
        this.bindEvents();
        this.reloadAll();
        setupChartsResize(this.tabKey);
        this.setupRegistersResize();
        this.setupSimpleInfiniteScroll({
            viewportId: `mbs-registers-viewport-${this.objectName}`,
            threshold: 100,
        });
        this.initStatusAutoRefresh();
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allRegisters; }
    vscrollLoadMore() { this.loadRegisterChunk(this.allRegisters.length); }

    destroy() {
        this.stopStatusAutoRefresh();
        this.destroyLogViewer();
        this.unsubscribeFromSSE();
    }

    // ModbusSlave регистры - показываем badge "MB"
    getChartOptions() {
        return { badge: 'MB', prefix: 'mb' };
    }

    async reloadAll() {
        await Promise.allSettled([
            this.loadStatus(),
            this.loadParams(),
            this.loadRegisters()
        ]);
    }

    bindEvents() {
        this.setupParamsListeners();

        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `mbs-registers-filter-${this.objectName}`,
            `mbs-type-filter-${this.objectName}`,
            () => this.loadRegisters(),       // type filter → серверная фильтрация
            FILTER_DEBOUNCE_DELAY, null,
            () => this.renderRegisters()      // text filter → локальная фильтрация
        );
    }


    createMBSStatusSection() {
        return this.createCollapsibleSection('mbs-status', 'ModbusSlave Status', `
            <div class="mb-actions">
                <span class="mb-note" id="mbs-status-note-${this.objectName}"></span>
            </div>
            <table class="info-table">
                <tbody id="mbs-status-${this.objectName}"></tbody>
            </table>
        `, { sectionId: `mbs-status-section-${this.objectName}`, headerExtra: this.createStatusHeaderExtra() });
    }

    createMBSTcpSessionsSection() {
        return this.createCollapsibleSection('mbs-tcp-sessions', 'TCP Sessions', `
            <table class="sensors-table">
                <thead>
                    <tr>
                        <th>IP</th>
                        <th>Ask Count</th>
                    </tr>
                </thead>
                <tbody id="mbs-tcp-sessions-${this.objectName}"></tbody>
            </table>
            <div class="tcp-sessions-info" id="mbs-tcp-sessions-info-${this.objectName}"></div>
        `, { sectionId: `mbs-tcp-sessions-section-${this.objectName}` });
    }

    createMBSParamsSection() {
        return this.createCollapsibleSection('mbs-params', 'Parameters', `
            <div class="mb-actions">
                <button class="btn" id="mbs-params-refresh-${this.objectName}">Refresh</button>
                <button class="btn primary" id="mbs-params-save-${this.objectName}">Apply</button>
                <span class="mb-note" id="mbs-params-note-${this.objectName}"></span>
            </div>
            <div class="mb-params-table-wrapper">
                <table class="variables-table mb-params-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Current</th>
                            <th>New value</th>
                        </tr>
                    </thead>
                    <tbody id="mbs-params-${this.objectName}"></tbody>
                </table>
            </div>
        `, { sectionId: `mbs-params-section-${this.objectName}` });
    }

    createMBSRegistersSection() {
        return this.createCollapsibleSection('mbs-registers', 'Registers', `
            <div class="filter-bar mb-actions">
                <input type="text" class="filter-input" id="mbs-registers-filter-${this.objectName}" placeholder="Filter...">
                <select class="type-filter" id="mbs-type-filter-${this.objectName}">
                    <option value="all">All types</option>
                    <option value="AI">AI</option>
                    <option value="AO">AO</option>
                    <option value="DI">DI</option>
                    <option value="DO">DO</option>
                </select>
                <span class="sensor-count" id="mbs-register-count-${this.objectName}">0</span>
                <span class="mb-note" id="mbs-registers-note-${this.objectName}"></span>
            </div>
            <div class="mb-registers-container" id="mbs-registers-container-${this.objectName}" style="height: ${this.registersHeight}px">
                <div class="mb-registers-viewport" id="mbs-registers-viewport-${this.objectName}">
                    <div class="mb-registers-spacer" id="mbs-registers-spacer-${this.objectName}"></div>
                    <table class="sensors-table variables-table mb-registers-table" id="mbs-registers-table-${this.objectName}">
                        <thead>
                            <tr>
                                <th class="col-pin">
                                    <span class="mbs-unpin-all" id="mbs-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="col-add-buttons"></th>
                                ${this.renderSortableHeader('id', 'ID', true, 'col-id')}
                                ${this.renderSortableHeader('name', 'Name', true, 'col-name')}
                                ${this.renderSortableHeader('type', 'Type', true, 'col-type')}
                                ${this.renderSortableHeader('value', 'Value', true, 'col-value')}
                                ${this.renderSortableHeader('mbaddr', 'MB Addr', true, 'col-mbaddr')}
                                ${this.renderSortableHeader('register', 'Register', true, 'col-register')}
                                ${this.renderSortableHeader('func', 'Function', true, 'col-func')}
                                ${this.renderSortableHeader('access', 'Access', true, 'col-access')}
                            </tr>
                        </thead>
                        <tbody id="mbs-registers-tbody-${this.objectName}"></tbody>
                    </table>
                    <div class="mb-loading-more" id="mbs-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                </div>
            </div>
            <div class="resize-handle" id="mbs-registers-resize-${this.objectName}"></div>
        `, { sectionId: `mbs-registers-section-${this.objectName}` });
    }

    async loadStatus() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/modbus/status`);
            this.status = data.status || null;
            this.renderStatus();
            this.updateParamsAccessibility('mbs');
            this.updateStatusTimestamp();
            this.setNote(`mbs-status-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`mbs-status-note-${this.objectName}`, err.message, true);
        }
    }

    renderStatus() {
        const tbody = this.getEl(`mbs-status-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!this.status) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            this.renderTcpSessions();
            return;
        }

        const status = this.status;
        const rows = [
            { label: 'Name', value: status.name },
            { label: 'TCP', value: status.tcp ? `${status.tcp.ip}:${status.tcp.port}` : null },
            { label: 'force', value: status.force },
            { label: 'sockTimeout', value: status.sockTimeout },
            { label: 'sessTimeout', value: status.sessTimeout },
            { label: 'updateStatTime', value: status.updateStatTime }
        ];

        // Статистика
        if (status.stat) {
            rows.push({ label: 'connectionCount', value: status.stat.connectionCount });
            rows.push({ label: 'smPingOK', value: status.stat.smPingOK });
            rows.push({ label: 'restartTCPServerCount', value: status.stat.restartTCPServerCount });
        }

        // Обслуживаемые адреса
        if (status.myaddr) {
            rows.push({ label: 'MB addresses', value: status.myaddr });
        }

        rows.forEach(row => {
            if (row.value === undefined || row.value === null) return;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="info-label">${row.label}</td>
                <td class="info-value">${formatValue(row.value)}</td>
            `;
            tbody.appendChild(tr);
        });

        this.renderTcpSessions();
    }

    renderTcpSessions() {
        const tbody = this.getEl(`mbs-tcp-sessions-${this.objectName}`);
        const info = this.getEl(`mbs-tcp-sessions-info-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        const sessions = this.status?.tcp_sessions;
        if (!sessions || !sessions.items || sessions.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No active sessions</td></tr>';
            if (info) info.innerHTML = '';
            return;
        }

        sessions.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.ip}</td>
                <td>${item.askCount}</td>
            `;
            tbody.appendChild(tr);
        });

        if (info) {
            info.innerHTML = `<span class="text-muted">Sessions: ${sessions.count} / ${sessions.max_sessions}</span>`;
        }
    }

    renderParams() {
        const tbody = this.getEl(`mbs-params-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';

        this.paramNames.forEach(name => {
            const value = this.params[name];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="param-name">${name}</td>
                <td class="param-value">${value !== undefined ? value : '—'}</td>
                <td class="param-input">
                    <input type="text" class="param-field" data-param="${name}" placeholder="${value !== undefined ? value : ''}" />
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    async loadRegisters() {
        this.allRegisters = [];
        this.devicesDict = {};
        this.hasMore = true;
        this.isLoadingChunk = false;
        await this.loadRegisterChunk(0);
    }

    renderRegisters() {
        const tbody = this.getEl(`mbs-registers-tbody-${this.objectName}`);
        if (!tbody) return;

        // Получаем закрепленные регистры
        const pinnedRegisters = this.getPinned();
        const hasPinned = pinnedRegisters.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`mbs-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Фильтруем регистры используя общий метод (по name, id, mbreg)
        // ModbusSlave: mbreg может быть в r.register.mbreg или r.mbreg
        const mbregAccessor = (item, field) => {
            const regInfo = item.register || {};
            return regInfo[field] !== undefined ? regInfo[field] : item[field];
        };
        let registersToShow = this.applyFilters(this.allRegisters, 'name', 'iotype', null, ['mbreg'], mbregAccessor);

        // Если есть закрепленные и нет фильтра — показываем только их
        if (hasPinned && !this.filter) {
            registersToShow = registersToShow.filter(r => pinnedRegisters.has(String(r.id)));
        }

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        registersToShow = this.sortItems(registersToShow, pinnedRegisters, this.sortColumnDefs);

        // Обновляем счётчик с учётом фильтрации
        this.updateItemCount(`mbs-register-count-${this.objectName}`, registersToShow.length, this.registersTotal);

        // Update registerMap for chart support
        registersToShow.forEach(reg => {
            if (reg.id) {
                this.registerMap.set(reg.id, reg);
            }
        });

        // ModbusSlave формат: device - это mbaddr, register содержит mbreg/mbfunc, есть amode
        const html = registersToShow.map(reg => {
            const isPinned = pinnedRegisters.has(String(reg.id));
            const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
            const pinIcon = isPinned ? '📌' : '○';
            const pinTitle = isPinned ? 'Unpin' : 'Pin';

            const mbAddr = reg.device;
            const regInfo = reg.register || {};
            const mbreg = regInfo.mbreg !== undefined ? regInfo.mbreg : reg.mbreg;
            const mbfunc = regInfo.mbfunc;
            return `
                <tr data-sensor-id="${reg.id}">
                    <td class="col-pin">
                        <span class="${pinToggleClass}" data-id="${reg.id}" title="${pinTitle}">
                            ${pinIcon}
                        </span>
                    </td>
                    ${this.renderAddButtonsCell(reg.id, reg.name, 'mbsreg', reg.textname || reg.name)}
                    <td class="col-id">${reg.id}</td>
                    <td class="col-name" title="${escapeAttr(reg.textname || reg.comment || '')}">${escapeHtml(reg.name || '')}</td>
                    <td class="col-type">${reg.iotype ? `<span class="type-badge type-${reg.iotype}">${reg.iotype}</span>` : ''}</td>
                    <td class="col-value">${reg.value !== undefined ? reg.value : ''}</td>
                    <td class="col-mbaddr">${mbAddr || ''}</td>
                    <td class="col-register">${mbreg !== undefined ? mbreg : ''}</td>
                    <td class="col-func">${mbfunc !== undefined ? mbfunc : ''}</td>
                    <td class="col-access">${reg.amode || ''}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;

        // Bind chart toggle events
        this.attachChartToggleListeners(tbody, this.registerMap);

        // Bind dashboard toggle events
        this.attachDashboardToggleListeners(tbody);

        // Bind pin toggle events
        tbody.querySelectorAll('.pin-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => this.togglePin(parseInt(toggle.dataset.id)));
        });

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAll();
        }
    }

    // Override to use ModbusSlave SSE subscription
    subscribeToChartSensor(sensorId) {
        // ModbusSlave registers are already subscribed through main SSE
        if (!this.subscribedSensorIds.has(sensorId)) {
            this.subscribedSensorIds.add(sensorId);
        }
    }

    loadRegistersHeight() {
        return this.loadSectionHeight('uniset-panel-mbs-registers', 320);
    }

    saveRegistersHeight(value) {
        this.registersHeight = value;
        this.saveSectionHeight('uniset-panel-mbs-registers', value);
    }

    setupRegistersResize() {
        this.setupSectionResize(
            `mbs-registers-resize-${this.objectName}`,
            `mbs-registers-container-${this.objectName}`,
            'uniset-panel-mbs-registers',
            'registersHeight',
            { minHeight: 200, maxHeight: 700 }
        );
    }

    // === SSE подписка на обновления регистров (использует SSESubscriptionMixin) ===

    async subscribeToSSE() {
        const registerIds = this.allRegisters.map(r => r.id);
        await this.subscribeToSSEFor('/modbus', registerIds, 'register_ids', 'ModbusSlave SSE');
    }

    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/modbus', 'register_ids', 'ModbusSlave SSE');
    }

    handleModbusRegisterUpdates(registers) {
        this.handleBatchUpdates(registers);
    }

    // Bridge для BatchRenderMixin
    getBatchItems() { return this.allRegisters; }

    updateRowCells(row, update) {
        // Value
        if (update.value !== undefined) {
            this._animateCellValue(row, '.col-value', String(update.value), 'value-changed');
        }
        // Device respond status
        const deviceCell = row.querySelector('.col-device .mb-respond');
        if (deviceCell && update.device !== undefined) {
            const deviceAddr = update.device;
            const deviceInfo = this.devicesDict ? (this.devicesDict[deviceAddr] || {}) : {};
            deviceCell.className = `mb-respond ${deviceInfo.respond ? 'ok' : 'fail'}`;
        }
    }

    // update(data) наследуется из BaseObjectRenderer

    // Pin management: pinStorageKey и renderAfterPinChange заданы в конструкторе

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderRegisters(); }
}

// Apply mixins to ModbusSlaveRenderer
applyMixin(ModbusSlaveRenderer, VirtualScrollMixin);
applyMixin(ModbusSlaveRenderer, SSESubscriptionMixin);
applyMixin(ModbusSlaveRenderer, BatchRenderMixin);
applyMixin(ModbusSlaveRenderer, ResizableSectionMixin);
applyMixin(ModbusSlaveRenderer, FilterMixin);
applyMixin(ModbusSlaveRenderer, ParamsAccessibilityMixin);
applyMixin(ModbusSlaveRenderer, ParamsManagerMixin);
applyMixin(ModbusSlaveRenderer, ItemCounterMixin);
applyMixin(ModbusSlaveRenderer, PinManagementMixin);
applyMixin(ModbusSlaveRenderer, TableSortMixin);
applyMixin(ModbusSlaveRenderer, ModbusRegistersMixin);

// ModbusSlave рендерер (по extensionType)
registerRenderer('ModbusSlave', ModbusSlaveRenderer);

// Fallback для старых версий (по objectType)
registerRenderer('MBSlave', ModbusSlaveRenderer);
registerRenderer('MBSlave1', ModbusSlaveRenderer);

// OPCUAServerRenderer - рендерер для OPCUAServer extensionType
// OPCUAServer - это OPC UA сервер, который предоставляет доступ к переменным через OPC UA протокол



// === 24-opcua-server.js ===
class OPCUAServerRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'OPCUAServer';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);
        this.status = null;
        this.params = {};
        this.paramsApiPath = 'opcua';
        this.paramsPrefix = 'opcuasrv';
        this.paramNames = [
            'updateTime_msec',
            'httpEnabledSetParams'
        ];
        this.loadingNote = '';
        this.sensorsHeight = this.loadSensorsHeight();

        // SSE подписки
        this.subscribedSensorIds = new Set();
        this.batchTbodyId = `opcuasrv-sensors-${objectName}`;
        this.initBatchRenderProps();

        // Virtual scroll properties
        this.allSensors = [];
        this.sensorsTotal = 0;
        this.initVirtualScrollProps();

        // Filter state
        this.filter = '';
        this.typeFilter = 'all';
        this.filterDebounce = null;

        // Pin management
        this.pinStorageKey = 'uniset-panel-opcuasrv-pinned';
        this.renderAfterPinChange = this.renderVisibleSensors;

        // Sensor map for chart support
        this.sensorMap = new Map();

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `opcuasrv-sensors-table-${objectName}`;
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'iotype', type: 'string' },
            value: { field: 'value', type: 'number' },
            vtype: { field: 'vtype', type: 'string' },
            precision: { field: 'precision', type: 'number' }
        };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createOPCUAServerStatusSection()}
            ${this.createOPCUAServerParamsSection()}
            ${this.createOPCUAServerSensorsSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    initialize() {
        this.loadSortState('uniset-panel-opcuasrv-sort');
        this.bindEvents();
        this.reloadAll();
        setupChartsResize(this.tabKey);
        this.setupSensorsResize();
        this.setupFullVirtualScroll({
            viewportId: `opcuasrv-sensors-viewport-${this.objectName}`,
            threshold: 80,
            thresholdType: 'percent',
        });
        this.initStatusAutoRefresh();
    }

    // Bridge methods for VirtualScrollMixin
    getVScrollItems() { return this.allSensors; }
    vscrollRenderVisible() { this.renderVisibleSensors(); }
    vscrollLoadMore() { this.loadMoreSensors(); }

    destroy() {
        this.stopStatusAutoRefresh();
        this.destroyLogViewer();
        this.unsubscribeFromSSE();
    }

    async reloadAll() {
        await Promise.allSettled([
            this.loadStatus(),
            this.loadParams(),
            this.loadSensors()
        ]);
    }

    bindEvents() {
        this.setupParamsListeners();

        // Используем методы из FilterMixin
        this.setupFilterListeners(
            `opcuasrv-sensors-filter-${this.objectName}`,
            `opcuasrv-type-filter-${this.objectName}`,
            () => this.loadSensors()
        );
    }

    createOPCUAServerStatusSection() {
        return this.createCollapsibleSection('opcuasrv-status', 'OPC UA Server Status', `
            <div class="opcua-actions">
                <span class="opcua-note" id="opcuasrv-status-note-${this.objectName}"></span>
            </div>
            <table class="info-table">
                <tbody id="opcuasrv-status-${this.objectName}"></tbody>
            </table>
            <div class="opcuasrv-endpoints" id="opcuasrv-endpoints-${this.objectName}"></div>
            <div class="opcuasrv-config" id="opcuasrv-config-${this.objectName}"></div>
        `, { sectionId: `opcuasrv-status-section-${this.objectName}`, headerExtra: this.createStatusHeaderExtra() });
    }

    createOPCUAServerParamsSection() {
        const headerIndicator = `
            <span class="header-indicator-dot fail" id="opcuasrv-ind-params-${this.objectName}" onclick="event.stopPropagation()" title="Parameters: loading..."></span>
        `;
        return this.createCollapsibleSection('opcuasrv-params', 'Server Parameters', `
            <div class="opcua-actions">
                <button class="btn" id="opcuasrv-params-refresh-${this.objectName}">Refresh</button>
                <button class="btn primary" id="opcuasrv-params-save-${this.objectName}">Apply</button>
                <span class="opcua-note" id="opcuasrv-params-note-${this.objectName}"></span>
            </div>
            <div class="opcua-params-table-wrapper">
                <table class="variables-table opcua-params-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Current</th>
                            <th>New value</th>
                        </tr>
                    </thead>
                    <tbody id="opcuasrv-params-${this.objectName}"></tbody>
                </table>
            </div>
        `, { sectionId: `opcuasrv-params-section-${this.objectName}`, headerExtra: headerIndicator });
    }

    createOPCUAServerSensorsSection() {
        return this.createCollapsibleSection('opcuasrv-sensors', 'OPC UA Variables', `
            <div class="filter-bar opcua-actions">
                <input type="text" class="filter-input" id="opcuasrv-sensors-filter-${this.objectName}" placeholder="Filter...">
                <select class="type-filter" id="opcuasrv-type-filter-${this.objectName}">
                    <option value="all">All types</option>
                    <option value="AI">AI</option>
                    <option value="AO">AO</option>
                    <option value="DI">DI</option>
                    <option value="DO">DO</option>
                </select>
                <span class="sensor-count" id="opcuasrv-sensor-count-${this.objectName}">0</span>
                <span class="opcua-note" id="opcuasrv-sensors-note-${this.objectName}"></span>
            </div>
            <div class="opcua-sensors-container" id="opcuasrv-sensors-container-${this.objectName}" style="height: ${this.sensorsHeight}px">
                <div class="opcua-sensors-viewport" id="opcuasrv-sensors-viewport-${this.objectName}">
                    <div class="opcua-sensors-spacer" id="opcuasrv-sensors-spacer-${this.objectName}"></div>
                    <table class="sensors-table variables-table opcua-sensors-table" id="opcuasrv-sensors-table-${this.objectName}">
                        <thead>
                            <tr>
                                <th class="col-pin">
                                    <span class="opcuasrv-unpin-all" id="opcuasrv-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                                </th>
                                <th class="col-add-buttons"></th>
                                ${this.renderSortableHeader('id', 'ID', true, 'col-id')}
                                ${this.renderSortableHeader('name', 'Name', true, 'col-name')}
                                ${this.renderSortableHeader('type', 'Type', true, 'col-type')}
                                ${this.renderSortableHeader('value', 'Value', true, 'col-value')}
                                ${this.renderSortableHeader('vtype', 'VType', true, 'col-vtype')}
                                ${this.renderSortableHeader('precision', 'Precision', true, 'col-precision')}
                            </tr>
                        </thead>
                        <tbody id="opcuasrv-sensors-${this.objectName}"></tbody>
                    </table>
                    <div class="opcua-loading-more" id="opcuasrv-loading-more-${this.objectName}" style="display: none;">Loading...</div>
                </div>
            </div>
            <div class="resize-handle" id="opcuasrv-sensors-resize-${this.objectName}"></div>
        `, { sectionId: `opcuasrv-sensors-section-${this.objectName}` });
    }

    async loadStatus() {
        try {
            const data = await this.fetchJSON(`/api/objects/${encodeURIComponent(this.objectName)}/opcua/status`);
            this.status = data.status || null;
            this.renderStatus();
            this.updateParamsAccessibility('opcuasrv');
            this.updateStatusTimestamp();
            this.setNote(`opcuasrv-status-note-${this.objectName}`, '');
        } catch (err) {
            this.setNote(`opcuasrv-status-note-${this.objectName}`, err.message, true);
        }
    }

    renderStatus() {
        const tbody = this.getEl(`opcuasrv-status-${this.objectName}`);
        const endpointsContainer = this.getEl(`opcuasrv-endpoints-${this.objectName}`);
        const configContainer = this.getEl(`opcuasrv-config-${this.objectName}`);
        if (!tbody || !endpointsContainer || !configContainer) return;

        tbody.innerHTML = '';
        endpointsContainer.innerHTML = '';
        configContainer.innerHTML = '';

        if (!this.status) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            return;
        }

        const status = this.status;

        // Main status rows
        const rows = [
            { label: 'Name', value: status.name },
            { label: 'httpEnabledSetParams', value: status.httpEnabledSetParams }
        ];

        // Variables info
        if (status.variables) {
            rows.push({ label: 'Total variables', value: status.variables.total });
            rows.push({ label: 'Read', value: status.variables.read });
            rows.push({ label: 'Write', value: status.variables.write });
            rows.push({ label: 'Methods', value: status.variables.methods });
        }

        // Params
        if (status.params) {
            rows.push({ label: 'updateTime_msec', value: status.params.updateTime_msec });
        }

        rows.forEach(row => {
            if (row.value === undefined || row.value === null) return;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="info-label">${row.label}</td>
                <td class="info-value">${formatValue(row.value)}</td>
            `;
            tbody.appendChild(tr);
        });

        // Endpoints
        if (Array.isArray(status.endpoints) && status.endpoints.length > 0) {
            endpointsContainer.innerHTML = '<h4 class="opcuasrv-section-title">Endpoints</h4>';
            status.endpoints.forEach(ep => {
                const div = document.createElement('div');
                div.className = 'opcuasrv-endpoint-card';
                div.innerHTML = `
                    <div class="opcuasrv-endpoint-name">${ep.name || 'Endpoint'}</div>
                    <div class="opcuasrv-endpoint-url">${ep.url || '—'}</div>
                `;
                endpointsContainer.appendChild(div);
            });
        }

        // Config
        if (status.config) {
            configContainer.innerHTML = '<h4 class="opcuasrv-section-title">Configuration</h4>';
            const configTable = document.createElement('table');
            configTable.className = 'info-table';
            const configTbody = document.createElement('tbody');

            const configRows = [
                { label: 'maxSubscriptions', value: status.config.maxSubscriptions },
                { label: 'maxSessions', value: status.config.maxSessions },
                { label: 'maxSecureChannels', value: status.config.maxSecureChannels },
                { label: 'maxSessionTimeout', value: status.config.maxSessionTimeout }
            ];

            configRows.forEach(row => {
                if (row.value === undefined || row.value === null) return;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="info-label">${row.label}</td>
                    <td class="info-value">${formatValue(row.value)}</td>
                `;
                configTbody.appendChild(tr);
            });

            configTable.appendChild(configTbody);
            configContainer.appendChild(configTable);
        }

        // Render LogServer section
        this.handleLogServer(status.LogServer);
    }

    renderParams() {
        const tbody = this.getEl(`opcuasrv-params-${this.objectName}`);
        if (!tbody) return;

        tbody.innerHTML = '';
        if (!this.params || Object.keys(this.params).length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No data</td></tr>';
            return;
        }

        this.paramNames.forEach(name => {
            const current = this.params[name];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="variable-name">${name}</td>
                <td class="variable-value">${current !== undefined ? formatValue(current) : '—'}</td>
                <td><input class="opcua-param-input" data-name="${escapeAttr(name)}" value="${escapeAttr(current !== undefined ? current : '')}"></td>
            `;
            tbody.appendChild(tr);
        });
    }

    async loadSensors() {
        // Reset state for fresh load
        this.allSensors = [];
        this.hasMore = true;
        this.startIndex = 0;
        this.endIndex = 0;

        // Reset viewport scroll position
        const viewport = this.getEl(`opcuasrv-sensors-viewport-${this.objectName}`);
        if (viewport) viewport.scrollTop = 0;

        try {
            let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=0`;

            if (this.filter) {
                url += `&search=${encodeURIComponent(this.filter)}`;
            }
            if (this.typeFilter && this.typeFilter !== 'all') {
                url += `&iotype=${this.typeFilter}`;
            }

            const data = await this.fetchJSON(url);
            let sensors = data.sensors || [];
            this.sensorsTotal = typeof data.total === 'number' ? data.total : sensors.length;

            this.allSensors = sensors;
            this.sensorMap.clear();
            sensors.forEach(s => this.sensorMap.set(s.id, s));

            // Если нет фильтра и есть закреплённые датчики - загрузить их отдельно
            if (!this.filter) {
                await this.loadPinnedSensors();
            }

            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();
            this.setNote(`opcuasrv-sensors-note-${this.objectName}`, '');

            // Подписываемся на SSE обновления после загрузки
            this.subscribeToSSE();

            // Обработчики сортировки
            const table = this.getEl(`opcuasrv-sensors-table-${this.objectName}`);
            if (table) {
                this.attachSortHandlers(table);
                this.updateSortHeaders();
            }
        } catch (err) {
            this.setNote(`opcuasrv-sensors-note-${this.objectName}`, err.message, true);
        }
    }

    // Загружает закреплённые датчики, если они не в текущем списке
    async loadPinnedSensors() {
        const pinnedIds = this.getPinned();
        if (pinnedIds.size === 0) return;

        // Найти ID, которых нет в загруженных датчиках
        const missingIds = [];
        for (const idStr of pinnedIds) {
            const id = parseInt(idStr);
            if (!this.sensorMap.has(id)) {
                missingIds.push(id);
            }
        }

        if (missingIds.length === 0) return;

        // Загрузить отсутствующие датчики по ID
        try {
            const idsParam = missingIds.join(',');
            const url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/get?filter=${idsParam}`;
            const response = await this.fetchJSON(url);
            const pinnedSensors = response.sensors || [];

            // Добавить закреплённые датчики в начало списка
            for (const sensor of pinnedSensors) {
                if (!this.sensorMap.has(sensor.id)) {
                    this.allSensors.unshift(sensor);
                    this.sensorMap.set(sensor.id, sensor);
                }
            }
        } catch (err) {
            console.warn('Failed to load pinned sensors:', err);
        }
    }

    async loadMoreSensors() {
        if (this.isLoadingChunk || !this.hasMore) return;

        this.isLoadingChunk = true;
        this.showLoadingIndicator(true);

        try {
            const nextOffset = this.allSensors.length;
            let url = `/api/objects/${encodeURIComponent(this.objectName)}/opcua/sensors?limit=${this.chunkSize}&offset=${nextOffset}`;

            if (this.filter) {
                url += `&search=${encodeURIComponent(this.filter)}`;
            }
            if (this.typeFilter && this.typeFilter !== 'all') {
                url += `&iotype=${this.typeFilter}`;
            }

            const data = await this.fetchJSON(url);
            let newSensors = data.sensors || [];

            // Дедупликация: добавляем только датчики которых еще нет
            const existingIds = new Set(this.allSensors.map(s => s.id));
            const uniqueNewSensors = newSensors.filter(s => !existingIds.has(s.id));

            this.allSensors = [...this.allSensors, ...uniqueNewSensors];
            this.hasMore = (data.sensors?.length || 0) === this.chunkSize;
            this.updateVisibleRows();
            this.updateSensorCount();
        } catch (err) {
            console.error('Failed to load more sensors:', err);
        } finally {
            this.isLoadingChunk = false;
            this.showLoadingIndicator(false);
        }
    }

    renderVisibleSensors() {
        const tbody = this.getEl(`opcuasrv-sensors-${this.objectName}`);
        const spacer = this.getEl(`opcuasrv-sensors-spacer-${this.objectName}`);
        if (!tbody || !spacer) return;

        // Получаем закрепленные датчики
        const pinnedSensors = this.getPinned();
        const hasPinned = pinnedSensors.size > 0;

        // Показываем/скрываем кнопку "снять все"
        const unpinBtn = this.getEl(`opcuasrv-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = hasPinned ? 'inline' : 'none';
        }

        // Локальная фильтрация по name и id (серверный search ищет только по name)
        let sensorsToShow = this.applyFilters(this.allSensors, 'name', 'iotype');

        // Если есть закрепленные и нет фильтра — показываем только их
        if (hasPinned && !this.filter) {
            sensorsToShow = this.allSensors.filter(s => pinnedSensors.has(String(s.id)));
        }

        // Set spacer height to position visible rows correctly
        const spacerHeight = this.startIndex * this.rowHeight;
        spacer.style.height = `${spacerHeight}px`;

        // Show empty state if no sensors
        if (sensorsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="opcua-no-sensors">No variables</td></tr>';
            return;
        }

        // Сортировка: pinned всегда вверху, остальные по выбранной колонке
        sensorsToShow = this.sortItems(sensorsToShow, pinnedSensors, this.sortColumnDefs);

        // Get visible slice
        const visibleSensors = sensorsToShow.slice(this.startIndex, this.endIndex);

        // Update sensorMap for chart support
        visibleSensors.forEach(sensor => {
            if (sensor.id) {
                this.sensorMap.set(sensor.id, sensor);
            }
        });

        // Render visible rows with type badges and chart toggle
        tbody.innerHTML = visibleSensors.map(sensor => {
            const isPinned = pinnedSensors.has(String(sensor.id));
            const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
            const pinIcon = isPinned ? '📌' : '○';
            const pinTitle = isPinned ? 'Unpin' : 'Pin';

            const iotype = sensor.iotype || sensor.type || '';
            const typeBadgeClass = iotype ? `type-badge type-${iotype}` : '';
            return `
            <tr data-sensor-id="${sensor.id || ''}">
                <td class="col-pin">
                    <span class="${pinToggleClass}" data-id="${sensor.id}" title="${pinTitle}">
                        ${pinIcon}
                    </span>
                </td>
                ${this.renderAddButtonsCell(sensor.id, sensor.name, 'opcuasrv', sensor.textname || sensor.name)}
                <td>${sensor.id || ''}</td>
                <td class="sensor-name" title="${escapeAttr(sensor.textname || sensor.comment || '')}">${escapeHtml(sensor.name || '')}</td>
                <td><span class="${typeBadgeClass}">${iotype}</span></td>
                <td class="sensor-value">${sensor.value !== undefined ? formatValue(sensor.value) : '—'}</td>
                <td>${sensor.vtype || ''}</td>
                <td>${sensor.precision !== undefined ? sensor.precision : ''}</td>
            </tr>
            `;
        }).join('');

        // Bind chart toggle events
        this.attachChartToggleListeners(tbody, this.sensorMap);

        // Bind dashboard toggle events
        this.attachDashboardToggleListeners(tbody);

        // Bind pin toggle events
        tbody.querySelectorAll('.pin-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => this.togglePin(parseInt(toggle.dataset.id)));
        });

        // Обработчик кнопки "снять все"
        if (unpinBtn) {
            unpinBtn.onclick = () => this.unpinAll();
        }
    }

    // Override to use OPCUAServer SSE subscription
    subscribeToChartSensor(sensorId) {
        // OPCUAServer sensors are already subscribed through main SSE
        if (!this.subscribedSensorIds.has(sensorId)) {
            this.subscribedSensorIds.add(sensorId);
        }
    }

    showLoadingIndicator(show) {
        const indicator = this.getEl(`opcuasrv-loading-more-${this.objectName}`);
        if (indicator) {
            indicator.style.display = show ? 'block' : 'none';
        }
    }

    updateSensorCount() {
        this.updateItemCount(`opcuasrv-sensor-count-${this.objectName}`, this.allSensors.length, this.sensorsTotal);
    }

    loadSensorsHeight() {
        // Используем формат JSON как другие рендереры
        return this.loadSectionHeight('uniset-panel-opcuasrv-sensors', 300);
    }

    saveSensorsHeight(height) {
        this.saveSectionHeight('uniset-panel-opcuasrv-sensors', height);
    }

    setupSensorsResize() {
        this.setupSectionResize(
            `opcuasrv-sensors-resize-${this.objectName}`,
            `opcuasrv-sensors-container-${this.objectName}`,
            'uniset-panel-opcuasrv-sensors',
            'sensorsHeight',
            { minHeight: 200, maxHeight: 700 }
        );
    }

    // SSE subscription methods (использует SSESubscriptionMixin)
    async subscribeToSSE() {
        const sensorIds = this.allSensors.map(s => s.id).filter(id => id != null);
        // OPCUAServer использует другой API параметр (id= вместо filter=), указываем extension_type
        await this.subscribeToSSEFor('/opcua', sensorIds, 'sensor_ids', 'OPCUAServer SSE', { extension_type: 'OPCUAServer' });
    }

    async unsubscribeFromSSE() {
        await this.unsubscribeFromSSEFor('/opcua', 'sensor_ids', 'OPCUAServer SSE');
    }

    handleOPCUASensorUpdates(sensors) {
        this.handleBatchUpdates(sensors);
    }

    // Bridge для BatchRenderMixin
    getBatchItems() { return this.allSensors; }

    updateRowCells(row, update) {
        if (update.value !== undefined) {
            this._animateCellValue(row, '.sensor-value', formatValue(update.value), 'value-updated');
        }
    }

    // Pin management: pinStorageKey и renderAfterPinChange заданы в конструкторе

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderVisibleSensors(); }
}

// Apply mixins to OPCUAServerRenderer
applyMixin(OPCUAServerRenderer, VirtualScrollMixin);
applyMixin(OPCUAServerRenderer, SSESubscriptionMixin);
applyMixin(OPCUAServerRenderer, BatchRenderMixin);
applyMixin(OPCUAServerRenderer, ResizableSectionMixin);
applyMixin(OPCUAServerRenderer, FilterMixin);
applyMixin(OPCUAServerRenderer, ParamsAccessibilityMixin);
applyMixin(OPCUAServerRenderer, ParamsManagerMixin);
applyMixin(OPCUAServerRenderer, ItemCounterMixin);
applyMixin(OPCUAServerRenderer, PinManagementMixin);
applyMixin(OPCUAServerRenderer, TableSortMixin);

// OPCUAServer рендерер (по extensionType)
registerRenderer('OPCUAServer', OPCUAServerRenderer);



// === 25-uwsgate.js ===
// ============================================================================
// UWebSocketGateRenderer - рендерер для объектов UWebSocketGate
// Работает через WebSocket для получения real-time обновлений датчиков
// ============================================================================

class UWebSocketGateRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'UWebSocketGate';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);

        // Подписанные датчики: name -> sensor data
        this.sensors = new Map();

        // Закреплённые датчики
        this.pinnedSensors = new Set();

        // Кэш всех датчиков из sensorconfig для autocomplete
        this.allSensorsCache = null;

        // Autocomplete состояние
        this.autocompleteResults = [];
        this.selectedAutocompleteIndex = 0;

        // Высота секции датчиков
        this.sensorsHeight = this.loadSectionHeight('uwsgate-sensors-height', 400);

        // Инициализация сортировки
        this.initSortProps();
        this.sortTableId = `uwsgate-sensors-table-${objectName}`;
        this.sortColumnDefs = {
            id: { field: 'id', type: 'number' },
            name: { field: 'name', type: 'string' },
            type: { field: 'iotype', type: 'string' },
            value: { field: 'value', type: 'number' },
            supplier: { field: 'supplier', type: 'string' },
            status: { field: 'status', type: 'string', accessor: (item) => item.error || '' }
        };

        // localStorage ключи
        this.subscriptionsKey = `uwsgate-subscriptions-${this.tabKey}`;
        this.pinnedKey = `uwsgate-pinned-${this.tabKey}`;
        this.highlightKey = `uwsgate-highlight-${this.tabKey}`;

        // Мигание при изменении значений (по умолчанию выключено)
        this.highlightEnabled = this.loadHighlightSetting();
        this.loadPinnedSensors();
    }

    loadHighlightSetting() {
        try {
            return localStorage.getItem(this.highlightKey) === 'true';
        } catch (e) {
            return false;
        }
    }

    saveHighlightSetting() {
        try {
            localStorage.setItem(this.highlightKey, this.highlightEnabled.toString());
        } catch (e) {}
    }

    loadPinnedSensors() {
        try {
            const saved = localStorage.getItem(this.pinnedKey);
            if (saved) {
                this.pinnedSensors = new Set(JSON.parse(saved));
            }
        } catch (e) {}
    }

    savePinnedSensors() {
        try {
            localStorage.setItem(this.pinnedKey, JSON.stringify(Array.from(this.pinnedSensors)));
        } catch (e) {}
    }

    togglePin(sensorName) {
        if (this.pinnedSensors.has(sensorName)) {
            this.pinnedSensors.delete(sensorName);
        } else {
            this.pinnedSensors.add(sensorName);
        }
        this.savePinnedSensors();
        this.renderSensorsTable();
    }

    unpinAll() {
        this.pinnedSensors.clear();
        this.savePinnedSensors();
        this.renderSensorsTable();
    }

    getChartOptions() {
        return { badge: 'WS', prefix: 'ws' };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createSensorsSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    createSensorsSection() {
        return this.createCollapsibleSection('uwsgate-sensors', 'Realtime Sensors', `
            <div class="uwsgate-add-sensor">
                <input type="text"
                       class="uwsgate-sensor-input"
                       id="uwsgate-input-${this.objectName}"
                       placeholder="Type sensor name to add..."
                       autocomplete="off">
                <div class="uwsgate-autocomplete" id="uwsgate-autocomplete-${this.objectName}"></div>
                <label class="uwsgate-highlight-toggle" title="Enable value change highlighting">
                    <input type="checkbox"
                           id="uwsgate-highlight-${this.objectName}"
                           ${this.highlightEnabled ? 'checked' : ''}>
                    <span>Highlight</span>
                </label>
            </div>
            <div class="uwsgate-sensors-container" id="uwsgate-sensors-container-${this.objectName}" style="height: ${this.sensorsHeight}px; overflow-y: auto;">
                <table class="sensors-table uwsgate-sensors-table" id="uwsgate-sensors-table-${this.objectName}">
                    <thead>
                        <tr>
                            <th class="col-pin">
                                <span class="uwsgate-unpin-all" id="uwsgate-unpin-${this.objectName}" title="Unpin all" style="display:none">✕</span>
                            </th>
                            <th class="col-add-buttons"></th>
                            ${this.renderSortableHeader('id', 'ID', true, 'col-id')}
                            ${this.renderSortableHeader('name', 'Name', true, 'col-name')}
                            ${this.renderSortableHeader('type', 'Type', true, 'col-type')}
                            ${this.renderSortableHeader('value', 'Value', true, 'col-value')}
                            ${this.renderSortableHeader('supplier', 'Supplier', true, 'col-supplier')}
                            <th class="col-status">Status</th>
                            <th class="col-actions"></th>
                        </tr>
                    </thead>
                    <tbody id="uwsgate-sensors-tbody-${this.objectName}">
                        <tr><td colspan="9" class="uwsgate-empty">No sensors subscribed. Type sensor name above to add.</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="section-counter">
                <span id="uwsgate-sensor-count-${this.objectName}">0</span> sensors
            </div>
            <div class="resize-handle" id="uwsgate-sensors-resize-${this.objectName}"></div>
        `, { sectionId: `uwsgate-sensors-section-${this.objectName}` });
    }

    initialize() {
        this.loadSortState('uniset-panel-uwsgate-sort');
        this.setupEventListeners();
        this.setupSensorsResize();
        this.loadSavedSubscriptions();
        setupChartsResize(this.tabKey);

        // Обработчики сортировки
        const table = getElementInTab(this.tabKey, `uwsgate-sensors-table-${this.objectName}`);
        if (table) {
            this.attachSortHandlers(table);
        }
    }

    setupEventListeners() {
        const input = getElementInTab(this.tabKey, `uwsgate-input-${this.objectName}`);
        if (!input) return;

        // Debounced autocomplete
        let debounceTimer;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this.updateAutocomplete(input.value), AUTOCOMPLETE_DEBOUNCE_DELAY);
        });

        // Keyboard navigation
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addSensorFromInput(input.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.value = '';
                input.blur();
                this.hideAutocomplete();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateAutocomplete(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateAutocomplete(-1);
            }
        });

        // Click outside to hide autocomplete.
        // Сохраняем reference, чтобы destroy() мог снять — без этого после
        // пересоздания renderer'а оставались висячие listeners, которые держали
        // ссылку на старый instance и срабатывали на чужих экранах.
        this._docClickHandler = (e) => {
            if (!e.target.closest('.uwsgate-add-sensor')) {
                this.hideAutocomplete();
            }
        };
        document.addEventListener('click', this._docClickHandler);

        // Highlight toggle
        const highlightCheckbox = getElementInTab(this.tabKey, `uwsgate-highlight-${this.objectName}`);
        if (highlightCheckbox) {
            highlightCheckbox.addEventListener('change', () => {
                this.highlightEnabled = highlightCheckbox.checked;
                this.saveHighlightSetting();
            });
        }

        // Unpin all button
        const unpinBtn = getElementInTab(this.tabKey, `uwsgate-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.addEventListener('click', () => this.unpinAll());
        }
    }

    setupSensorsResize() {
        const handle = getElementInTab(this.tabKey, `uwsgate-sensors-resize-${this.objectName}`);
        const container = getElementInTab(this.tabKey, `uwsgate-sensors-container-${this.objectName}`);
        if (!handle || !container) return;

        let startY, startHeight;
        const onMouseMove = (e) => {
            const newHeight = startHeight + (e.clientY - startY);
            if (newHeight >= 100 && newHeight <= 800) {
                container.style.height = `${newHeight}px`;
                this.sensorsHeight = newHeight;
            }
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            this.saveSectionHeight('uwsgate-sensors-height', this.sensorsHeight);
        };
        handle.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startHeight = container.offsetHeight;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    async loadAllSensors() {
        if (this.allSensorsCache) return this.allSensorsCache;

        try {
            const tabState = state.tabs.get(this.tabKey);
            const serverId = tabState?.serverId || '';
            const param = serverId ? `?server=${encodeURIComponent(serverId)}` : '';
            const response = await fetch(`/api/sensors${param}`);
            if (!response.ok) return [];
            const data = await response.json();
            this.allSensorsCache = data.sensors || [];
            return this.allSensorsCache;
        } catch (err) {
            console.error('Failed to load sensors for autocomplete:', err);
            return [];
        }
    }

    async updateAutocomplete(query) {
        if (!query || query.length < 2) {
            this.hideAutocomplete();
            return;
        }

        const allSensors = await this.loadAllSensors();
        const queryLower = query.toLowerCase();

        // Filter: name or id contains query, not already subscribed
        const matches = allSensors
            .filter(s =>
                (s.name.toLowerCase().includes(queryLower) ||
                 String(s.id || '').includes(queryLower)) &&
                !this.sensors.has(s.name)
            )
            .slice(0, 10);

        this.showAutocomplete(matches);
    }

    showAutocomplete(matches) {
        const container = getElementInTab(this.tabKey, `uwsgate-autocomplete-${this.objectName}`);
        if (!container) return;

        if (matches.length === 0) {
            this.hideAutocomplete();
            return;
        }

        this.autocompleteResults = matches;
        this.selectedAutocompleteIndex = 0;

        container.innerHTML = matches.map((s, i) => `
            <div class="uwsgate-autocomplete-item${i === 0 ? ' selected' : ''}" data-name="${escapeAttr(s.name)}">
                <span class="sensor-name">${escapeHtml(s.name)}</span>
                <span class="type-badge type-${s.iotype}">${s.iotype || '?'}</span>
                ${s.textname ? `<span class="sensor-textname">${escapeHtml(s.textname)}</span>` : ''}
            </div>
        `).join('');

        // Click handlers
        container.querySelectorAll('.uwsgate-autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                this.addSensorByName(item.dataset.name);
            });
        });

        container.style.display = 'block';
    }

    hideAutocomplete() {
        const container = getElementInTab(this.tabKey, `uwsgate-autocomplete-${this.objectName}`);
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        this.autocompleteResults = [];
        this.selectedAutocompleteIndex = 0;
    }

    navigateAutocomplete(direction) {
        const container = getElementInTab(this.tabKey, `uwsgate-autocomplete-${this.objectName}`);
        if (!container || this.autocompleteResults.length === 0) return;

        const items = container.querySelectorAll('.uwsgate-autocomplete-item');
        if (items.length === 0) return;

        // Update selection
        items[this.selectedAutocompleteIndex]?.classList.remove('selected');
        this.selectedAutocompleteIndex += direction;
        if (this.selectedAutocompleteIndex < 0) this.selectedAutocompleteIndex = items.length - 1;
        if (this.selectedAutocompleteIndex >= items.length) this.selectedAutocompleteIndex = 0;
        items[this.selectedAutocompleteIndex]?.classList.add('selected');

        // Update input value
        const input = getElementInTab(this.tabKey, `uwsgate-input-${this.objectName}`);
        if (input && this.autocompleteResults[this.selectedAutocompleteIndex]) {
            input.value = this.autocompleteResults[this.selectedAutocompleteIndex].name;
        }
    }

    async addSensorFromInput(name) {
        name = name.trim();
        if (!name) return;

        // Check if it's in autocomplete results
        const match = this.autocompleteResults.find(s =>
            s.name.toLowerCase() === name.toLowerCase()
        );

        if (match) {
            await this.addSensorByName(match.name);
        } else {
            // Try to add as-is
            await this.addSensorByName(name);
        }

        // Clear input
        const input = getElementInTab(this.tabKey, `uwsgate-input-${this.objectName}`);
        if (input) input.value = '';
        this.hideAutocomplete();
    }

    async addSensorByName(name, subscribeToServer = true) {
        if (this.sensors.has(name)) return;

        try {
            // Validate sensor exists in config before adding
            const allSensors = await this.loadAllSensors();
            const sensorInfo = allSensors.find(s => s.name === name);

            if (!sensorInfo) {
                console.warn(`UWebSocketGate: Sensor "${name}" not found in config, skipping`);
                return;
            }

            // Only subscribe if needed (not when loading from server's existing subscriptions)
            if (subscribeToServer) {
                const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/uwsgate/subscribe`);
                const response = await controlledFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensors: [name] })
                });

                if (!response.ok) {
                    const error = await response.text();
                    console.error('Failed to subscribe:', error);
                    return;
                }
            }

            this.sensors.set(name, {
                id: sensorInfo.id,
                name: name,
                iotype: sensorInfo.iotype || 'AI',
                textname: sensorInfo.textname || '',
                value: 0,
                error: 0,
                timestamp: 0,
                supplier: '',
                supplier_id: 0
            });

            this.renderSensorsTable();
            if (subscribeToServer) {
                this.saveSubscriptions();
            }
        } catch (err) {
            console.error('Failed to add sensor:', err);
        }
    }

    async removeSensor(name) {
        if (!this.sensors.has(name)) return;

        try {
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/uwsgate/unsubscribe`);
            await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensors: [name] })
            });

            this.sensors.delete(name);

            // Remove from chart if present
            const chartOptions = this.getChartOptions();
            const varName = `${chartOptions.prefix}:${name}`;
            removeChart(this.tabKey, varName);

            this.renderSensorsTable();
            this.saveSubscriptions();
        } catch (err) {
            console.error('Failed to remove sensor:', err);
        }
    }

    renderSensorsTable() {
        const tbody = getElementInTab(this.tabKey, `uwsgate-sensors-tbody-${this.objectName}`);
        if (!tbody) return;

        // Show/hide unpin button
        const unpinBtn = getElementInTab(this.tabKey, `uwsgate-unpin-${this.objectName}`);
        if (unpinBtn) {
            unpinBtn.style.display = this.pinnedSensors.size > 0 ? 'inline' : 'none';
        }

        if (this.sensors.size === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="uwsgate-empty">No sensors subscribed. Type sensor name above to add.</td></tr>';
            this.updateSensorCount();
            return;
        }

        // Используем sortItems из TableSortMixin для единообразной сортировки
        // pinnedSensors использует name вместо id
        const pinnedByName = new Set(this.pinnedSensors);
        let sensorsArray = Array.from(this.sensors.values());
        sensorsArray = this.sortItems(sensorsArray, pinnedByName, this.sortColumnDefs, 'name');

        const rows = sensorsArray.map(sensor => this.renderSensorRow(sensor));
        tbody.innerHTML = rows.join('');
        this.bindRowEvents(tbody);
        this.updateSensorCount();
    }

    renderSensorRow(sensor) {
        const chartOptions = this.getChartOptions();
        const varName = `${chartOptions.prefix}:${sensor.name}`;
        const isOnChart = this.isSensorOnChart(varName);
        const isPinned = this.pinnedSensors.has(sensor.name);
        const errorClass = sensor.error ? 'uwsgate-sensor-error' : '';
        const pinnedClass = isPinned ? 'uwsgate-sensor-pinned' : '';

        const checkboxId = `uwsgate-chart-${this.objectName}-${sensor.name}`;
        const pinToggleClass = isPinned ? 'pin-toggle pinned' : 'pin-toggle';
        const pinIcon = isPinned ? '📌' : '○';
        const pinTitle = isPinned ? 'Unpin' : 'Pin';
        return `
            <tr class="uwsgate-sensor-row ${errorClass} ${pinnedClass}" data-sensor-name="${escapeAttr(sensor.name)}">
                <td class="col-pin">
                    <span class="${pinToggleClass}" data-name="${escapeAttr(sensor.name)}" title="${pinTitle}">
                        ${pinIcon}
                    </span>
                </td>
                <td class="col-add-buttons add-buttons-col">
                    <span class="chart-toggle">
                        <input type="checkbox"
                               id="${escapeAttr(checkboxId)}"
                               class="uwsgate-chart-checkbox chart-toggle-input"
                               data-name="${escapeAttr(sensor.name)}"
                               ${isOnChart ? 'checked' : ''}>
                        <label class="chart-toggle-label" for="${escapeAttr(checkboxId)}" title="Add to Chart">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/>
                            </svg>
                        </label>
                    </span>
                    <button class="dashboard-add-btn"
                            data-sensor-name="${escapeAttr(sensor.name)}"
                            data-sensor-label="${escapeAttr(sensor.textname || sensor.name)}"
                            title="Add to Dashboard">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/>
                        </svg>
                    </button>
                </td>
                <td class="col-id">${sensor.id}</td>
                <td class="col-name" title="${escapeAttr(sensor.textname || sensor.name)}">${escapeHtml(sensor.name)}</td>
                <td class="col-type"><span class="type-badge type-${sensor.iotype}">${sensor.iotype || '?'}</span></td>
                <td class="col-value" id="uwsgate-value-${this.objectName}-${escapeAttr(sensor.name)}">${sensor.value}</td>
                <td class="col-supplier" id="uwsgate-supplier-${this.objectName}-${escapeAttr(sensor.name)}" title="${escapeAttr(sensor.supplier || '')}">${escapeHtml(sensor.supplier || '-')}</td>
                <td class="col-status">${sensor.error ? `<span class="error-flag">Error: ${sensor.error}</span>` : '-'}</td>
                <td class="col-actions">
                    <button class="uwsgate-btn-remove" data-name="${escapeAttr(sensor.name)}" title="Remove sensor">✕</button>
                </td>
            </tr>
        `;
    }

    bindRowEvents(tbody) {
        // Remove buttons
        tbody.querySelectorAll('.uwsgate-btn-remove').forEach(btn => {
            btn.addEventListener('click', () => this.removeSensor(btn.dataset.name));
        });

        // Pin toggles
        tbody.querySelectorAll('.pin-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => this.togglePin(toggle.dataset.name));
        });

        // Chart checkboxes
        tbody.querySelectorAll('.uwsgate-chart-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const sensor = this.sensors.get(cb.dataset.name);
                if (sensor) {
                    this.toggleSensorChart(sensor);
                }
            });
        });

        // Dashboard buttons
        tbody.querySelectorAll('.dashboard-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sensorName = btn.dataset.sensorName;
                const sensorLabel = btn.dataset.sensorLabel;
                showAddToDashboardDialog(sensorName, sensorLabel);
            });
        });
    }

    isSensorOnChart(varName) {
        const tabState = state.tabs.get(this.tabKey);
        return tabState?.charts?.has(varName) || false;
    }

    toggleSensorChart(sensor) {
        const chartOptions = this.getChartOptions();
        const varName = `${chartOptions.prefix}:${sensor.name}`;
        const tabState = state.tabs.get(this.tabKey);
        console.log('UWebSocketGate: toggleSensorChart', { varName, tabKey: this.tabKey, hasChart: tabState?.charts?.has(varName) });

        if (tabState?.charts?.has(varName)) {
            console.log('UWebSocketGate: Removing chart', varName);
            removeChart(this.tabKey, varName);
        } else {
            console.log('UWebSocketGate: Adding chart', varName, 'sensorId:', sensor.id);
            addExternalSensorChart(this.tabKey, varName, sensor.id, sensor.textname || sensor.name, chartOptions);
        }
    }

    updateSensorCount() {
        const el = getElementInTab(this.tabKey, `uwsgate-sensor-count-${this.objectName}`);
        if (el) {
            el.textContent = this.sensors.size;
        }
    }

    // SSE event handler
    handleSSEUpdate(sensorsData) {
        for (const sensor of sensorsData) {
            if (this.sensors.has(sensor.name)) {
                const existing = this.sensors.get(sensor.name);
                existing.value = sensor.value;
                existing.error = sensor.error;
                existing.timestamp = sensor.tv_sec;
                existing.supplier = sensor.supplier || '';
                existing.supplier_id = sensor.supplier_id || 0;

                // Update value cell
                const valueCell = getElementInTab(this.tabKey, `uwsgate-value-${this.objectName}-${sensor.name}`);
                if (valueCell) {
                    valueCell.textContent = sensor.value;
                    // Only highlight if enabled
                    if (this.highlightEnabled) {
                        // CSS animation trigger via reflow
                        valueCell.classList.remove('value-updated');
                        void valueCell.offsetWidth;
                        valueCell.classList.add('value-updated');
                    }
                }

                // Update supplier cell
                const supplierCell = getElementInTab(this.tabKey, `uwsgate-supplier-${this.objectName}-${sensor.name}`);
                if (supplierCell) {
                    const supplierValue = sensor.supplier || '-';
                    supplierCell.textContent = supplierValue;
                    supplierCell.title = supplierValue;
                }

                // Update chart
                this.updateChartData(sensor);
            }
        }
    }

    updateChartData(sensor) {
        const tabState = state.tabs.get(this.tabKey);
        if (!tabState?.charts) return;

        const chartOptions = this.getChartOptions();
        const varName = `${chartOptions.prefix}:${sensor.name}`;
        const chartData = tabState.charts.get(varName);

        if (chartData && chartData.chart) {
            const timestamp = Date.now();
            chartData.chart.data.datasets[0].data.push({
                x: timestamp,
                y: sensor.value
            });

            // Trim old data
            const maxPoints = 1000;
            if (chartData.chart.data.datasets[0].data.length > maxPoints) {
                chartData.chart.data.datasets[0].data.shift();
            }

            chartData.chart.update('none');
        }
    }

    // Update from API response
    update(data) {
        super.update(data);
        // Render websockets info if present
        if (data.object?.websockets) {
            this.renderWebsocketsInfo(data.object.websockets);
        }
    }

    renderWebsocketsInfo(websockets) {
        const tabState = state.tabs.get(this.tabKey);
        if (!tabState) return;

        const displayName = tabState.displayName || this.objectName;
        const tbody = getElementInTab(this.tabKey, `object-info-${displayName}`);
        if (!tbody) return;

        // Add websockets row after existing info
        const existingRow = tbody.querySelector('.websockets-info-row');
        if (existingRow) existingRow.remove();

        const tr = document.createElement('tr');
        tr.className = 'websockets-info-row';

        const count = websockets.count ?? 0;
        const items = websockets.items || [];

        let itemsHtml = '';
        if (items.length > 0) {
            itemsHtml = `<div class="ws-items">${items.map(item =>
                `<span class="ws-item">${escapeHtml(item.addr || item)}</span>`
            ).join('')}</div>`;
        }

        tr.innerHTML = `
            <td class="info-label">WebSocket Clients</td>
            <td class="info-value">
                <span class="ws-count ${count > 0 ? 'ws-active' : ''}">${count}</span>
                ${itemsHtml}
            </td>
        `;
        tbody.appendChild(tr);
    }

    // localStorage persistence
    saveSubscriptions() {
        const names = Array.from(this.sensors.keys());
        localStorage.setItem(this.subscriptionsKey, JSON.stringify(names));
    }

    async loadSavedSubscriptions() {
        try {
            // First, fetch current sensors with values from server
            const sensorsUrl = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/uwsgate/sensors`);
            const sensorsResponse = await fetch(sensorsUrl);
            if (sensorsResponse.ok) {
                const data = await sensorsResponse.json();
                if (data.sensors && data.sensors.length > 0) {
                    console.log(`UWebSocketGate: Loading ${data.sensors.length} sensors from server`);
                    // Add sensors with their current values
                    for (const sensor of data.sensors) {
                        if (!this.sensors.has(sensor.name)) {
                            this.sensors.set(sensor.name, {
                                id: sensor.id,
                                name: sensor.name,
                                iotype: sensor.iotype || 'AI',
                                textname: sensor.textname || '',
                                value: sensor.value || 0,
                                error: sensor.error || 0,
                                timestamp: sensor.timestamp || 0,
                                supplier: sensor.supplier || '',
                                supplier_id: sensor.supplier_id || 0
                            });
                        }
                    }
                    this.renderSensorsTable();
                    this.saveSubscriptions();
                    return;
                }
            }

            // Fallback to localStorage if server has no subscriptions
            const saved = localStorage.getItem(this.subscriptionsKey);
            if (!saved) return;

            const names = JSON.parse(saved);
            if (!Array.isArray(names) || names.length === 0) return;

            console.log(`UWebSocketGate: Loading ${names.length} subscriptions from localStorage`);
            // Restore subscriptions (will re-subscribe to server)
            for (const name of names) {
                await this.addSensorByName(name);
            }
        } catch (err) {
            console.error('Failed to load saved subscriptions:', err);
        }
    }

    destroy() {
        super.destroy();
        this.destroyLogViewer();

        // Снимаем document click listener, навешенный в setupEventListeners.
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
            this._docClickHandler = null;
        }

        // Unsubscribe from all sensors when tab closes
        if (this.sensors.size > 0) {
            const names = Array.from(this.sensors.keys());
            const url = this.buildUrl(`/api/objects/${encodeURIComponent(this.objectName)}/uwsgate/unsubscribe`);
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensors: names })
            }).catch(err => console.warn('Failed to unsubscribe on destroy:', err));
        }
    }

    // Bridge для TableSortMixin.renderAfterSort()
    sortRenderVisible() { this.renderSensorsTable(); }
}

// Apply mixins
applyMixin(UWebSocketGateRenderer, ResizableSectionMixin);
applyMixin(UWebSocketGateRenderer, TableSortMixin);

// UWebSocketGate рендерер (по extensionType)
registerRenderer('UWebSocketGate', UWebSocketGateRenderer);



// === 26-unet-exchange.js ===
// ============================================================================
// UNetExchangeRenderer - рендерер для объектов UNetExchange (UNet UDP)
// ============================================================================

// Метрики для receivers
const UNET_RECV_METRICS = [
    { id: 'recvPerSec', label: 'Recv/s', getter: (chan) => chan.stats?.recvPerSec || 0 },
    { id: 'lostPackets', label: 'Lost Packets', getter: (chan) => chan.lostPackets || 0 },
    { id: 'upPerSec', label: 'Updates/s', getter: (chan) => chan.stats?.upPerSec || 0 },
    { id: 'qsize', label: 'Queue Size', getter: (chan) => chan.stats?.qsize || 0 },
    { id: 'cacheMissed', label: 'Cache Missed', getter: (chan) => chan.cacheMissed || 0 }
];

// Метрики для senders
const UNET_SEND_METRICS = [
    { id: 'lastpacknum', label: 'Pack#', getter: (chan) => chan.lastpacknum || 0 }
];

class UNetExchangeRenderer extends BaseObjectRenderer {
    static getTypeName() {
        return 'UNetExchange';
    }

    constructor(objectName, tabKey = null) {
        super(objectName, tabKey);

        // Данные статуса
        this.status = null;
        this.receivers = [];
        this.senders = {};

        // Включенные каналы (для отслеживания какие каналы добавлены на графики)
        this.enabledRecvChannels = new Set(); // "node0:chan1", "node0:chan2", ...
        this.enabledSendChannels = new Set(); // "chan1", "chan2", ...

        // Скрываем кнопку "+ Sensor" - у UNet нет отдельных датчиков
        this.showAddSensorButton = false;
    }

    getChartOptions() {
        return { badge: 'UNET', prefix: 'unet' };
    }

    createPanelHTML() {
        return `
            ${this.createChartsSection()}
            ${this.createUNetStatusSection()}
            ${this.createUNetReceiversSection()}
            ${this.createUNetSendersSection()}
            ${this.createLogViewerSection()}
            ${this.createLogServerSection()}
            ${this.createObjectInfoSection()}
        `;
    }

    createUNetStatusSection() {
        return this.createCollapsibleSection('unet-status', 'Status', `
            <div class="unet-status-grid" id="unet-status-${this.objectName}">
                <div class="status-loading">Loading...</div>
            </div>
        `, { sectionId: `unet-status-section-${this.objectName}` });
    }

    createUNetReceiversSection() {
        return this.createCollapsibleSection('unet-receivers', 'Receivers', `
            <div class="unet-receivers-container" id="unet-receivers-container-${this.objectName}">
                <table class="sensors-table unet-table">
                    <thead>
                        <tr>
                            <th class="col-add-buttons"></th>
                            <th class="col-node">Node</th>
                            <th class="col-channel">Channel</th>
                            <th class="col-transport">Transport</th>
                            <th class="col-mode">Mode</th>
                            <th class="col-status">Status</th>
                            <th class="col-recv">Recv/s</th>
                            <th class="col-lost">Lost</th>
                            <th class="col-queue">Queue</th>
                        </tr>
                    </thead>
                    <tbody id="unet-receivers-tbody-${this.objectName}">
                        <tr><td colspan="9" class="loading-cell">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="section-counter">
                <span id="unet-receivers-count-${this.objectName}">0</span> receivers
            </div>
        `, { sectionId: `unet-receivers-section-${this.objectName}` });
    }

    createUNetSendersSection() {
        return this.createCollapsibleSection('unet-senders', 'Senders', `
            <div class="unet-senders-container" id="unet-senders-container-${this.objectName}">
                <table class="sensors-table unet-table">
                    <thead>
                        <tr>
                            <th class="col-add-buttons"></th>
                            <th class="col-channel">Channel</th>
                            <th class="col-transport">Transport</th>
                            <th class="col-mode">Mode</th>
                            <th class="col-items">Items</th>
                            <th class="col-packnum">Pack#</th>
                            <th class="col-sendpause">Send Pause</th>
                        </tr>
                    </thead>
                    <tbody id="unet-senders-tbody-${this.objectName}">
                        <tr><td colspan="7" class="loading-cell">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="section-counter">
                <span id="unet-senders-count-${this.objectName}">0</span> senders
            </div>
        `, { sectionId: `unet-senders-section-${this.objectName}` });
    }

    initialize() {
        this.loadStatus();
        this.initStatusAutoRefresh();
        setupChartsResize(this.tabKey);
    }

    destroy() {
        this.stopStatusAutoRefresh();
        this.destroyLogViewer();
        // Очищаем графики
        const tabState = state.tabs.get(this.tabKey);
        if (tabState && tabState.charts) {
            for (const [varName, chartData] of tabState.charts) {
                if (varName.startsWith('unet:')) {
                    if (chartData.chart) {
                        chartData.chart.destroy();
                    }
                    tabState.charts.delete(varName);
                }
            }
        }
        this.enabledRecvChannels.clear();
        this.enabledSendChannels.clear();
    }

    // Обновление данных объекта (вызывается из tabs.js и SSE)
    update(data) {
        renderObjectInfo(this.tabKey, data.object);
        this.handleLogServer(data.LogServer);
    }

    async loadStatus() {
        const serverParam = this.getServerParam();

        try {
            const response = await fetch(`/api/objects/${this.objectName}/unet/status?${serverParam}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            this.status = await response.json();
            this.updateStatusTimestamp();

            // Распаковываем receivers и senders из status
            if (this.status.receivers) {
                this.receivers = this.status.receivers;
            }
            if (this.status.senders) {
                this.senders = this.status.senders;
            }

            this.renderStatus();
            this.renderReceivers();
            this.renderSenders();
            this.updateCharts();

            // Handle LogServer section
            if (this.status.LogServer) {
                this.handleLogServer(this.status.LogServer);
            }

        } catch (err) {
            console.error('Failed to load UNet status:', err);
            this.renderStatusError(err.message);
        }
    }

    getServerParam() {
        const tabState = state.tabs.get(this.tabKey);
        const serverId = tabState?.serverId || '';
        return serverId ? `server=${encodeURIComponent(serverId)}` : '';
    }

    renderStatus() {
        const container = this.getEl(`unet-status-${this.objectName}`);
        if (!container || !this.status) return;

        const activated = this.status.activated;
        const activatedClass = activated ? 'status-ok' : 'status-error';
        const activatedText = activated ? 'Active' : 'Inactive';

        container.innerHTML = `
            <div class="status-grid">
                <div class="status-item">
                    <span class="status-label">Status</span>
                    <span class="status-value ${activatedClass}">${activatedText}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Max HeartBeat</span>
                    <span class="status-value">${this.status.maxHeartBeat || 0}</span>
                </div>
                <div class="status-item">
                    <span class="status-label">Step Time</span>
                    <span class="status-value">${this.status.steptime || 0} ms</span>
                </div>
                <div class="status-item">
                    <span class="status-label">No Sender</span>
                    <span class="status-value">${this.status.no_sender ? 'Yes' : 'No'}</span>
                </div>
            </div>
        `;
    }

    renderStatusError(message) {
        const container = this.getEl(`unet-status-${this.objectName}`);
        if (container) {
            container.innerHTML = `<div class="status-error">Error: ${escapeHtml(message)}</div>`;
        }
    }

    renderReceivers() {
        const tbody = this.getEl(`unet-receivers-tbody-${this.objectName}`);
        const countEl = this.getEl(`unet-receivers-count-${this.objectName}`);
        if (!tbody) return;

        if (!this.receivers || this.receivers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No receivers</td></tr>';
            if (countEl) countEl.textContent = '0';
            return;
        }

        let totalChannels = 0;
        const rows = [];

        this.receivers.forEach((node, nodeIndex) => {
            const channels = Object.keys(node).filter(k => k.startsWith('chan'));

            channels.forEach(chanKey => {
                const chan = node[chanKey];
                totalChannels++;

                const channelId = `node${nodeIndex}:${chanKey}`;
                const recvOK = chan.recvOK;
                const statusClass = recvOK ? 'status-ok' : 'status-error';
                const statusText = recvOK ? 'OK' : 'ERR';

                const modeClass = chan.mode === 'ACTIVE' ? 'mode-active' : 'mode-passive';

                // Метрики
                const recvPerSec = chan.stats?.recvPerSec || 0;
                const lostPackets = chan.lostPackets || 0;
                const qsize = chan.stats?.qsize || 0;

                const isEnabled = this.enabledRecvChannels.has(channelId);

                rows.push(`
                    <tr>
                        <td class="col-add-buttons add-buttons-col">
                            <span class="chart-toggle">
                                <input type="checkbox"
                                       class="chart-checkbox chart-toggle-input"
                                       id="chart-${this.objectName}-recv-${nodeIndex}-${chanKey}"
                                       ${isEnabled ? 'checked' : ''}
                                       onchange="toggleUNetChannel('${this.tabKey}', 'recv', '${channelId}', this.checked)">
                                <label class="chart-toggle-label" for="chart-${this.objectName}-recv-${nodeIndex}-${chanKey}" title="Add to Charts">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 3v18h18"/>
                                        <path d="M18 9l-5 5-4-4-3 3"/>
                                    </svg>
                                </label>
                            </span>
                        </td>
                        <td class="col-node">node${nodeIndex}</td>
                        <td class="col-channel">${chanKey}</td>
                        <td class="col-transport">${chan.transport || '-'}</td>
                        <td class="col-mode"><span class="${modeClass}">${chan.mode || '-'}</span></td>
                        <td class="col-status"><span class="${statusClass}">${statusText}</span></td>
                        <td class="col-recv">${recvPerSec}</td>
                        <td class="col-lost">${lostPackets}</td>
                        <td class="col-queue">${qsize}</td>
                    </tr>
                `);
            });
        });

        tbody.innerHTML = rows.join('');
        if (countEl) countEl.textContent = totalChannels.toString();
    }

    renderSenders() {
        const tbody = this.getEl(`unet-senders-tbody-${this.objectName}`);
        const countEl = this.getEl(`unet-senders-count-${this.objectName}`);
        if (!tbody) return;

        const channels = Object.keys(this.senders).filter(k => k.startsWith('chan'));

        if (channels.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No senders</td></tr>';
            if (countEl) countEl.textContent = '0';
            return;
        }

        const rows = channels.map(chanKey => {
            const chan = this.senders[chanKey];
            const channelId = chanKey;

            const modeEnabled = chan.mode === 'Enabled';
            const modeClass = modeEnabled ? 'mode-enabled' : 'mode-disabled';

            const isEnabled = this.enabledSendChannels.has(channelId);

            return `
                <tr>
                    <td class="col-add-buttons add-buttons-col">
                        <span class="chart-toggle">
                            <input type="checkbox"
                                   class="chart-checkbox chart-toggle-input"
                                   id="chart-${this.objectName}-send-${chanKey}"
                                   ${isEnabled ? 'checked' : ''}
                                   onchange="toggleUNetChannel('${this.tabKey}', 'send', '${channelId}', this.checked)">
                            <label class="chart-toggle-label" for="chart-${this.objectName}-send-${chanKey}" title="Add to Charts">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 3v18h18"/>
                                    <path d="M18 9l-5 5-4-4-3 3"/>
                                </svg>
                            </label>
                        </span>
                    </td>
                    <td class="col-channel">${chanKey}</td>
                    <td class="col-transport">${chan.transport || '-'}</td>
                    <td class="col-mode"><span class="${modeClass}">${chan.mode || '-'}</span></td>
                    <td class="col-items">${chan.items || 0}</td>
                    <td class="col-packnum">${chan.lastpacknum || 0}</td>
                    <td class="col-sendpause">${chan.params?.sendpause || 0} ms</td>
                </tr>
            `;
        });

        tbody.innerHTML = rows.join('');
        if (countEl) countEl.textContent = channels.length.toString();
    }

    // Получить или создать график для метрики
    getOrCreateMetricChart(metricId, metricLabel, type) {
        const tabState = state.tabs.get(this.tabKey);
        if (!tabState) return null;

        if (!tabState.charts) {
            tabState.charts = new Map();
        }

        const chartKey = `unet:${type}:${metricId}`;

        if (!tabState.charts.has(chartKey)) {
            // Создаём новый график
            const chartsGrid = this.getEl(`charts-${this.objectName}`);
            if (!chartsGrid) return null;

            const safeChartKey = chartKey.replace(/:/g, '-');

            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-panel';
            chartContainer.id = `chart-panel-${this.objectName}-${safeChartKey}`;
            chartContainer.innerHTML = `
                <div class="chart-panel-header">
                    <div class="chart-panel-info">
                        <span class="chart-panel-badge">UNET</span>
                        <span class="chart-panel-title">${type === 'recv' ? 'Recv' : 'Send'}: ${metricLabel}</span>
                    </div>
                    <div class="chart-panel-right">
                        <button class="btn-icon" title="Close" onclick="removeUNetMetricChart('${this.tabKey}', '${chartKey}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="chart-wrapper">
                    <canvas id="chart-canvas-${this.objectName}-${safeChartKey}"></canvas>
                </div>
            `;
            chartsGrid.appendChild(chartContainer);

            const canvas = this.getEl(`chart-canvas-${this.objectName}-${safeChartKey}`);
            const chart = new Chart(canvas, {
                type: 'line',
                data: {
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                displayFormats: { second: 'HH:mm:ss' }
                            },
                            ticks: { maxTicksLimit: 6 }
                        },
                        y: {
                            beginAtZero: true
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: { boxWidth: 12, padding: 8 }
                        }
                    }
                }
            });

            tabState.charts.set(chartKey, {
                chart: chart,
                metricId: metricId,
                type: type,
                channels: new Map() // channelId -> datasetIndex
            });
        }

        return tabState.charts.get(chartKey);
    }

    // Добавить канал на график метрики
    addChannelToChart(chartData, channelId, channelLabel) {
        if (!chartData || chartData.channels.has(channelId)) return;

        const color = getNextColor();
        const datasetIndex = chartData.chart.data.datasets.length;

        chartData.chart.data.datasets.push({
            label: channelLabel,
            data: [],
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.1
        });

        chartData.channels.set(channelId, datasetIndex);
        chartData.chart.update('none');
    }

    // Удалить канал с графика метрики
    removeChannelFromChart(chartData, channelId) {
        if (!chartData || !chartData.channels.has(channelId)) return;

        const datasetIndex = chartData.channels.get(channelId);

        // Удаляем dataset
        chartData.chart.data.datasets.splice(datasetIndex, 1);
        chartData.channels.delete(channelId);

        // Пересчитываем индексы оставшихся каналов
        const newChannels = new Map();
        let newIndex = 0;
        for (const [chId, _] of chartData.channels) {
            newChannels.set(chId, newIndex++);
        }
        chartData.channels = newChannels;

        chartData.chart.update('none');
    }

    // Удалить график метрики полностью
    removeMetricChart(chartKey) {
        const tabState = state.tabs.get(this.tabKey);
        if (!tabState || !tabState.charts) return;

        const chartData = tabState.charts.get(chartKey);
        if (chartData) {
            if (chartData.chart) {
                chartData.chart.destroy();
            }
            tabState.charts.delete(chartKey);

            // Удаляем контейнер
            const safeChartKey = chartKey.replace(/:/g, '-');
            const container = this.getEl(`chart-panel-${this.objectName}-${safeChartKey}`);
            if (container) {
                container.remove();
            }

            // Удаляем канал из enabled sets если на этом графике
            // (пользователь закрыл график - не снимаем checkboxes, чтобы другие графики остались)
        }
    }

    // Включить/выключить канал на всех графиках
    toggleChannel(type, channelId, enabled) {
        const metrics = type === 'recv' ? UNET_RECV_METRICS : UNET_SEND_METRICS;
        const enabledSet = type === 'recv' ? this.enabledRecvChannels : this.enabledSendChannels;

        if (enabled) {
            enabledSet.add(channelId);

            // Добавляем канал на все графики метрик
            metrics.forEach(metric => {
                const chartData = this.getOrCreateMetricChart(metric.id, metric.label, type);
                if (chartData) {
                    this.addChannelToChart(chartData, channelId, channelId);
                }
            });
        } else {
            enabledSet.delete(channelId);

            // Удаляем канал со всех графиков метрик
            const tabState = state.tabs.get(this.tabKey);
            if (tabState && tabState.charts) {
                metrics.forEach(metric => {
                    const chartKey = `unet:${type}:${metric.id}`;
                    const chartData = tabState.charts.get(chartKey);
                    if (chartData) {
                        this.removeChannelFromChart(chartData, channelId);

                        // Если на графике не осталось каналов - удаляем график
                        if (chartData.channels.size === 0) {
                            this.removeMetricChart(chartKey);
                        }
                    }
                });
            }
        }
    }

    updateCharts() {
        const tabState = state.tabs.get(this.tabKey);
        if (!tabState || !tabState.charts) return;

        const now = Date.now();
        const maxPoints = 300;

        // Обновляем графики receivers
        UNET_RECV_METRICS.forEach(metric => {
            const chartKey = `unet:recv:${metric.id}`;
            const chartData = tabState.charts.get(chartKey);
            if (!chartData) return;

            this.receivers.forEach((node, nodeIndex) => {
                const channels = Object.keys(node).filter(k => k.startsWith('chan'));
                channels.forEach(chanKey => {
                    const channelId = `node${nodeIndex}:${chanKey}`;
                    if (!chartData.channels.has(channelId)) return;

                    const chan = node[chanKey];
                    const value = metric.getter(chan);
                    const datasetIndex = chartData.channels.get(channelId);
                    const dataset = chartData.chart.data.datasets[datasetIndex];

                    if (dataset) {
                        dataset.data.push({ x: now, y: value });
                        if (dataset.data.length > maxPoints) {
                            dataset.data.shift();
                        }
                    }
                });
            });

            chartData.chart.update('none');
        });

        // Обновляем графики senders
        UNET_SEND_METRICS.forEach(metric => {
            const chartKey = `unet:send:${metric.id}`;
            const chartData = tabState.charts.get(chartKey);
            if (!chartData) return;

            const senderChannels = Object.keys(this.senders).filter(k => k.startsWith('chan'));
            senderChannels.forEach(chanKey => {
                const channelId = chanKey;
                if (!chartData.channels.has(channelId)) return;

                const chan = this.senders[chanKey];
                const value = metric.getter(chan);
                const datasetIndex = chartData.channels.get(channelId);
                const dataset = chartData.chart.data.datasets[datasetIndex];

                if (dataset) {
                    dataset.data.push({ x: now, y: value });
                    if (dataset.data.length > maxPoints) {
                        dataset.data.shift();
                    }
                }
            });

            chartData.chart.update('none');
        });
    }
}

// Глобальная функция для toggle канала (добавляет/удаляет на все графики метрик)
function toggleUNetChannel(tabKey, type, channelId, enabled) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState || !tabState.renderer) return;

    const renderer = tabState.renderer;
    if (renderer.toggleChannel) {
        renderer.toggleChannel(type, channelId, enabled);
    }
}

// Глобальная функция для удаления графика метрики
function removeUNetMetricChart(tabKey, chartKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState || !tabState.renderer) return;

    const renderer = tabState.renderer;
    if (renderer.removeMetricChart) {
        renderer.removeMetricChart(chartKey);
    }
}

// Регистрация рендерера
registerRenderer('UNetExchange', UNetExchangeRenderer);


// === 27-launcher-renderer.js ===
// LauncherRenderer — рендерер для вкладки Launcher
// Не наследует BaseObjectRenderer (Launcher не является UniSet2-объектом)
class LauncherRenderer {
    constructor(nodeName, tabKey, nodeId, launcherUrl, hasControl) {
        this.nodeName = nodeName;
        this.tabKey = tabKey;
        this.nodeId = nodeId;
        this.launcherUrl = launcherUrl;
        this.hasControlToken = hasControl || false; // есть ли controlToken на бэкенде
        this.controlActive = false; // пользователь взял управление
        this.processes = [];
        this.groups = [];
        this.filterText = '';
        this.autoRefreshInterval = null;
    }

    createPanelHTML() {
        const takeBtn = this.hasControlToken
            ? `<span class="launcher-control-badge readonly">
                   <span class="launcher-control-icon">&#128274;</span>
                   <button class="launcher-control-btn" id="launcher-take-${this.nodeId}">Take</button>
               </span>`
            : '';

        return `
            <div class="launcher-panel">
                <div class="launcher-header">
                    <div class="launcher-header-left">
                        <h2 class="launcher-title">${escapeHtml(this.nodeName)}</h2>
                        <span class="launcher-status-indicator" id="launcher-status-${this.nodeId}">
                            <span class="launcher-status-dot"></span>
                            <span class="launcher-status-text">Connecting...</span>
                        </span>
                    </div>
                    <div class="launcher-header-right">
                        <span class="launcher-control-info" id="launcher-control-${this.nodeId}">${takeBtn}</span>
                        ${this.launcherUrl ? `<a class="launcher-link" href="${escapeAttr(this.launcherUrl)}" target="_blank" rel="noopener noreferrer">Open Launcher UI</a>` : ''}
                    </div>
                </div>
                <div class="launcher-filter">
                    <input type="text" class="launcher-filter-input" id="launcher-filter-${this.nodeId}"
                           placeholder="Filter processes..." autocomplete="off">
                </div>
                <div class="launcher-content" id="launcher-content-${this.nodeId}">
                    <div class="launcher-loading">Loading processes...</div>
                </div>
            </div>
        `;
    }

    initialize() {
        // Обработчик фильтра
        const filterInput = document.getElementById(`launcher-filter-${this.nodeId}`);
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                this.filterText = e.target.value.toLowerCase();
                this.renderProcessTable();
            });
        }

        // Обработчик Take Control
        this.attachTakeHandler();

        // Загружаем начальные данные
        this.loadStatus();

        // Авто-обновление каждые 5 секунд
        this.autoRefreshInterval = setInterval(() => this.loadStatus(), LAUNCHER_AUTO_REFRESH_INTERVAL);
    }

    attachTakeHandler() {
        const takeBtn = document.getElementById(`launcher-take-${this.nodeId}`);
        if (!takeBtn) return;

        takeBtn.addEventListener('click', () => {
            this.controlActive = !this.controlActive;
            this.updateControlUI();
            this.renderProcessTable();
        });
    }

    updateControlUI() {
        const container = document.getElementById(`launcher-control-${this.nodeId}`);
        if (!container) return;

        if (!this.hasControlToken) {
            container.innerHTML = '';
            return;
        }

        if (this.controlActive) {
            container.innerHTML = `
                <span class="launcher-control-badge active">
                    <span class="launcher-control-icon">&#10003;</span>
                    <span class="launcher-control-text">Control</span>
                    <button class="launcher-control-btn" id="launcher-release-${this.nodeId}">Release</button>
                </span>
            `;
            const releaseBtn = document.getElementById(`launcher-release-${this.nodeId}`);
            if (releaseBtn) {
                releaseBtn.addEventListener('click', () => {
                    this.controlActive = false;
                    this.updateControlUI();
                    this.renderProcessTable();
                });
            }
        } else {
            container.innerHTML = `
                <span class="launcher-control-badge readonly">
                    <span class="launcher-control-icon">&#128274;</span>
                    <button class="launcher-control-btn" id="launcher-take-${this.nodeId}">Take</button>
                </span>
            `;
            this.attachTakeHandler();
        }
    }

    async loadStatus() {
        try {
            const resp = await fetch(`/api/launchers/${encodeURIComponent(this.nodeId)}/status`);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            this.updateStatus(data);
        } catch (err) {
            console.warn(`Launcher ${this.nodeName}: failed to load status:`, err);
            this.updateConnectionStatus(false);
        }
    }

    updateStatus(data) {
        if (!data) return;

        this.processes = data.processes || [];
        this.groups = data.groups || [];
        this.updateConnectionStatus(true);
        this.updateSummary(data);
        this.renderProcessTable();
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById(`launcher-status-${this.nodeId}`);
        if (!indicator) return;

        const dot = indicator.querySelector('.launcher-status-dot');
        const text = indicator.querySelector('.launcher-status-text');
        if (dot) {
            dot.className = `launcher-status-dot ${connected ? 'connected' : 'disconnected'}`;
        }
        if (text) {
            text.textContent = connected ? 'Connected' : 'Disconnected';
        }

        // Обновляем state.nodes и CSS-классы вкладки (sidebar dot, tab button, tab panel)
        updateLauncherNodeStatus(this.nodeId, connected);
    }

    updateSummary(data) {
        const indicator = document.getElementById(`launcher-status-${this.nodeId}`);
        if (!indicator) return;

        const text = indicator.querySelector('.launcher-status-text');
        if (!text) return;

        const total = this.processes.length;
        const running = this.processes.filter(p => p.state === 'running').length;

        if (data.allRunning) {
            text.textContent = `All running (${total})`;
        } else if (data.anyCriticalFailed) {
            text.textContent = `Critical failed! ${running}/${total} running`;
        } else {
            text.textContent = `${running}/${total} running`;
        }
    }

    renderProcessTable() {
        const content = document.getElementById(`launcher-content-${this.nodeId}`);
        if (!content) return;

        if (this.processes.length === 0) {
            content.innerHTML = '<div class="launcher-empty">No processes</div>';
            return;
        }

        const showActions = this.controlActive;

        // Группируем процессы
        const grouped = this.groupProcesses();
        let html = '';

        for (const group of grouped) {
            const filteredProcesses = group.processes.filter(p => {
                if (!this.filterText) return true;
                const searchText = `${p.name} ${p.state} ${p.group || ''} ${p.lastError || ''}`.toLowerCase();
                return searchText.includes(this.filterText);
            });

            if (filteredProcesses.length === 0) continue;

            if (group.name) {
                html += `<div class="launcher-group">
                    <div class="launcher-group-header">${escapeHtml(group.name)}</div>`;
            }

            html += `<table class="variables-table launcher-table">
                <thead>
                    <tr>
                        <th>Process</th>
                        <th>State</th>
                        <th>PID</th>
                        <th>Uptime</th>
                        <th>Group</th>
                        <th>Restarts</th>`;

            if (showActions) {
                html += `<th class="launcher-actions-header">Actions
                    <button class="launcher-bulk-btn launcher-bulk-stop" data-node="${this.nodeId}" data-bulk="stop-all" title="Stop all running processes">Stop</button>
                    <button class="launcher-bulk-btn launcher-bulk-start" data-node="${this.nodeId}" data-bulk="start-all" title="Start all stopped processes">Start</button>
                    <button class="launcher-bulk-btn launcher-bulk-restart" data-node="${this.nodeId}" data-bulk="restart-all" title="Restart all processes">Restart</button>
                    <button class="launcher-bulk-btn launcher-bulk-reload" data-node="${this.nodeId}" data-bulk="reload-all" title="Reload all processes">Reload</button>
                </th>`;
            }

            html += `</tr>
                </thead>
                <tbody>`;

            for (const proc of filteredProcesses) {
                const stateClass = this.getStateClass(proc.state);
                const uptime = proc.uptime ? this.formatUptime(proc.uptime) : '-';
                const actions = showActions ? this.getActionsHTML(proc) : '';
                const badges = [];
                if (proc.manual) badges.push('<span class="launcher-badge launcher-badge-manual">manual</span>');
                if (proc.oneshot) badges.push('<span class="launcher-badge launcher-badge-oneshot">oneshot</span>');

                html += `<tr>
                    <td class="variable-name">${escapeHtml(proc.name)} ${badges.join(' ')}</td>
                    <td><span class="launcher-state-badge ${stateClass}"><span class="launcher-state-dot"></span>${escapeHtml(proc.state).toUpperCase()}</span></td>
                    <td>${proc.pid || '-'}</td>
                    <td>${uptime}</td>
                    <td>${escapeHtml(proc.group || '')}</td>
                    <td>${proc.restartCount || 0}</td>`;

                if (showActions) {
                    html += `<td class="launcher-actions-cell">${actions}</td>`;
                }

                html += `</tr>`;
            }

            html += `</tbody></table>`;

            if (group.name) {
                html += `</div>`;
            }
        }

        content.innerHTML = html;

        if (showActions) {
            this.attachControlHandlers();
            this.attachBulkHandlers();
        }
    }

    groupProcesses() {
        if (this.groups.length === 0) {
            // Нет групп — показываем одним списком
            return [{ name: '', processes: this.processes }];
        }

        const result = [];
        const assigned = new Set();

        // Сортируем группы по order
        const sortedGroups = [...this.groups].sort((a, b) => (a.order || 0) - (b.order || 0));

        for (const group of sortedGroups) {
            const procs = this.processes.filter(p => {
                const inGroup = p.group === group.name ||
                    (group.processes && group.processes.includes(p.name));
                if (inGroup) assigned.add(p.name);
                return inGroup;
            });
            if (procs.length > 0) {
                result.push({ name: group.name, processes: procs });
            }
        }

        // Процессы без группы
        const ungrouped = this.processes.filter(p => !assigned.has(p.name));
        if (ungrouped.length > 0) {
            result.push({ name: '', processes: ungrouped });
        }

        return result;
    }

    getStateClass(state) {
        switch (state) {
            case 'running': return 'launcher-state-running';
            case 'failed': return 'launcher-state-failed';
            case 'stopped': return 'launcher-state-stopped';
            case 'starting':
            case 'restarting':
            case 'stopping': return 'launcher-state-transitioning';
            case 'completed': return 'launcher-state-completed';
            default: return 'launcher-state-unknown';
        }
    }

    getActionsHTML(proc) {
        const nodeId = this.nodeId;
        switch (proc.state) {
            case 'running':
                return `
                    <button class="launcher-ctrl-btn launcher-ctrl-restart" data-node="${nodeId}" data-process="${proc.name}" data-action="restart" title="Restart">&#8635;</button>
                    <button class="launcher-ctrl-btn launcher-ctrl-stop" data-node="${nodeId}" data-process="${proc.name}" data-action="stop" title="Stop">&#9632;</button>
                `;
            case 'stopped':
            case 'failed':
                return `
                    <button class="launcher-ctrl-btn launcher-ctrl-start" data-node="${nodeId}" data-process="${proc.name}" data-action="start" title="Start">&#9654;</button>
                `;
            case 'completed':
                return `
                    <button class="launcher-ctrl-btn launcher-ctrl-restart" data-node="${nodeId}" data-process="${proc.name}" data-action="restart" title="Re-run">&#8635;</button>
                `;
            case 'starting':
            case 'stopping':
            case 'restarting':
                return '<span class="launcher-ctrl-loading">...</span>';
            default:
                return '';
        }
    }

    attachControlHandlers() {
        const content = document.getElementById(`launcher-content-${this.nodeId}`);
        if (!content) return;

        content.querySelectorAll('.launcher-ctrl-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.currentTarget.dataset.action;
                const processName = e.currentTarget.dataset.process;
                const nodeId = e.currentTarget.dataset.node;

                const actionLabels = { restart: 'Restart', stop: 'Stop', start: 'Start' };
                const label = actionLabels[action] || action;

                // Подтверждение для restart и stop
                if (action === 'restart' || action === 'stop') {
                    const confirmed = await showConfirmDialog(
                        `${label} Process`,
                        `${label} process "${processName}"?`,
                        label
                    );
                    if (!confirmed) return;
                }

                btn.disabled = true;
                btn.textContent = '...';

                try {
                    const resp = await fetch(`/api/launchers/${encodeURIComponent(nodeId)}/process/${encodeURIComponent(processName)}/${action}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!resp.ok) {
                        const data = await resp.json().catch(() => ({}));
                        await showConfirmDialog('Error', data.error || resp.statusText, 'OK');
                    } else {
                        // Оптимистично обновляем статус процесса для мигающей анимации
                        const transitionStates = { stop: 'stopping', start: 'starting', restart: 'restarting' };
                        const proc = this.processes.find(p => p.name === processName);
                        if (proc && transitionStates[action]) {
                            proc.state = transitionStates[action];
                            this.renderProcessTable();
                        }
                    }

                    setTimeout(() => this.loadStatus(), LAUNCHER_ACTION_REFRESH_DELAY);
                } catch (err) {
                    console.error(`Launcher action ${action} failed:`, err);
                    await showConfirmDialog('Error', err.message, 'OK');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    attachBulkHandlers() {
        const content = document.getElementById(`launcher-content-${this.nodeId}`);
        if (!content) return;

        content.querySelectorAll('.launcher-bulk-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const bulkAction = e.currentTarget.dataset.bulk;
                const nodeId = e.currentTarget.dataset.node;
                const labels = { 'stop-all': 'Stop', 'start-all': 'Start', 'restart-all': 'Restart', 'reload-all': 'Reload' };
                const label = labels[bulkAction] || bulkAction;

                const confirmed = await showConfirmDialog(
                    `${label} All`,
                    `${label} ALL processes on this launcher?`,
                    label
                );
                if (!confirmed) return;

                btn.disabled = true;
                const origText = btn.textContent;
                btn.textContent = '...';

                try {
                    const resp = await fetch(`/api/launchers/${encodeURIComponent(nodeId)}/${bulkAction}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!resp.ok) {
                        const data = await resp.json().catch(() => ({}));
                        await showConfirmDialog('Error', `${label} failed: ${data.error || resp.statusText}`, 'OK');
                    } else {
                        // Оптимистично обновляем статусы для мигающей анимации
                        const bulkTransitions = {
                            'stop-all': { from: 'running', to: 'stopping', skipFlags: true },
                            'start-all': { from: null, to: 'starting', skipFlags: true },
                            'restart-all': { from: null, to: 'restarting', skipFlags: false },
                            'reload-all': { from: null, to: 'stopping', skipFlags: false },
                        };
                        const transition = bulkTransitions[bulkAction];
                        if (transition) {
                            for (const proc of this.processes) {
                                if (transition.skipFlags && (proc.manual || proc.oneshot || proc.skip)) continue;
                                if (transition.from && proc.state !== transition.from) continue;
                                if (!transition.from && bulkAction === 'start-all' && proc.state === 'running') continue;
                                proc.state = transition.to;
                            }
                            this.renderProcessTable();
                        }
                    }

                    setTimeout(() => this.loadStatus(), LAUNCHER_BULK_ACTION_REFRESH_DELAY);
                } catch (err) {
                    console.error(`Launcher bulk ${bulkAction} failed:`, err);
                    await showConfirmDialog('Error', `${label} failed: ${err.message}`, 'OK');
                } finally {
                    btn.disabled = false;
                    btn.textContent = origText;
                }
            });
        });
    }

    formatUptime(seconds) {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours < 24) return `${hours}h ${minutes}m`;
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }

    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
}


// === 30-log-viewer.js ===
// ============================================================================
// Конец системы рендереров
// ============================================================================

// ============================================================================
// LogViewer - компонент для просмотра логов в реальном времени
// ============================================================================

// Уровни логов UniSet2
const LOG_LEVELS = {
    NONE: 0,
    CRIT: 1,
    WARN: 2,
    INFO: 4,
    DEBUG: 8,
    LEVEL1: 16,
    LEVEL2: 32,
    LEVEL3: 64,
    LEVEL4: 128,
    LEVEL5: 256,
    LEVEL6: 512,
    LEVEL7: 1024,
    LEVEL8: 2048,
    LEVEL9: 4096,
    ANY: 0xFFFFFFFF
};

// Класс для управления просмотром логов объекта
class LogViewer {
    constructor(objectName, container, serverId = null, tabKey = null) {
        this.objectName = objectName;
        this.container = container;
        this.serverId = serverId;
        this.tabKey = tabKey;
        this.eventSource = null;
        this.connected = false;
        this.isActive = false; // true если идёт попытка подключения или переподключения
        this.lines = [];
        this.maxLines = MAX_LOG_LINES;
        this.autoScroll = true;
        this.currentLevel = 0; // 0 = по умолчанию (не отправлять setLevel)
        this.selectedLevels = new Set(); // выбранные уровни логов
        this.levelDropdownOpen = false;
        this.filter = '';
        this.filterRegex = true; // использовать regexp
        this.filterCase = false; // учитывать регистр
        this.filterOnlyMatches = false; // показывать только совпадения
        this.height = LOGVIEWER_DEFAULT_HEIGHT;
        this.hasReceivedLogs = false; // Получали ли логи
        this.matchCount = 0; // количество совпадений
        this.paused = false; // пауза автопрокрутки
        this.pausedBuffer = []; // буфер логов во время паузы

        // Reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.baseReconnectDelay = 1000; // 1 second
        this.maxReconnectDelay = 30000; // 30 seconds
        this.reconnectTimer = null;

        this.init();
    }

    // Найти элемент по ID внутри панели своей вкладки
    getEl(id) {
        return getElementInTab(this.tabKey, id);
    }

    init() {
        this.render();
        this.setupEventHandlers();
        this.loadSavedHeight();
    }

    render() {
        const html = `
            <div class="logviewer-section" data-object="${this.objectName}" id="logviewer-section-${this.objectName}">
                <div class="logviewer-header" data-toggle="logviewer">
                    <svg class="collapsible-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                    <span class="logviewer-title">Logs</span>
                    <div class="logviewer-controls" onclick="event.stopPropagation()">
                        <div class="log-level-wrapper" id="log-level-wrapper-${this.objectName}">
                            <button class="log-level-btn" id="log-level-btn-${this.objectName}" title="Select log levels">
                                Levels ▼
                            </button>
                            <div class="log-level-dropdown" id="log-level-dropdown-${this.objectName}">
                                <div class="log-level-pills">
                                    <button class="log-level-pill" data-level="CRIT">CRIT</button>
                                    <button class="log-level-pill" data-level="WARN">WARN</button>
                                    <button class="log-level-pill" data-level="INFO">INFO</button>
                                    <button class="log-level-pill" data-level="DEBUG">DEBUG</button>
                                </div>
                                <div class="log-level-pills">
                                    <button class="log-level-pill" data-level="LEVEL1">LVL1</button>
                                    <button class="log-level-pill" data-level="LEVEL2">LVL2</button>
                                    <button class="log-level-pill" data-level="LEVEL3">LVL3</button>
                                    <button class="log-level-pill" data-level="LEVEL4">LVL4</button>
                                    <button class="log-level-pill" data-level="LEVEL5">LVL5</button>
                                </div>
                                <div class="log-level-pills">
                                    <button class="log-level-pill" data-level="LEVEL6">LVL6</button>
                                    <button class="log-level-pill" data-level="LEVEL7">LVL7</button>
                                    <button class="log-level-pill" data-level="LEVEL8">LVL8</button>
                                    <button class="log-level-pill" data-level="LEVEL9">LVL9</button>
                                    <button class="log-level-pill" data-level="ANY">ALL</button>
                                </div>
                                <div class="log-level-presets">
                                    <button class="log-preset-btn" data-preset="errors">Errors</button>
                                    <button class="log-preset-btn" data-preset="info">Info+</button>
                                    <button class="log-preset-btn" data-preset="all">All</button>
                                    <button class="log-preset-btn" data-preset="reset">Reset</button>
                                </div>
                                <button class="log-level-apply log-command-btn" id="log-level-apply-${this.objectName}">Apply</button>
                            </div>
                        </div>
                        <div class="log-filter-wrapper">
                            <input type="text" class="log-filter-input" id="log-filter-${this.objectName}"
                                   placeholder="Filter (/ to focus)..." title="Filter (/ to focus, Esc to clear)">
                            <div class="log-filter-options">
                                <label class="log-filter-option" title="Regular expressions">
                                    <input type="checkbox" id="log-filter-regex-${this.objectName}" checked> Regex
                                </label>
                                <label class="log-filter-option" title="Case sensitive">
                                    <input type="checkbox" id="log-filter-case-${this.objectName}"> Case
                                </label>
                                <label class="log-filter-option" title="Show matches only">
                                    <input type="checkbox" id="log-filter-only-${this.objectName}"> Only
                                </label>
                            </div>
                            <span class="log-match-count" id="log-match-count-${this.objectName}"></span>
                        </div>
                        <div class="log-controls-spacer"></div>
                        <span class="log-stats" id="log-stats-${this.objectName}"></span>
                        <div class="logviewer-status">
                            <span class="logviewer-status-dot" id="log-status-dot-${this.objectName}"></span>
                            <span id="log-status-text-${this.objectName}">Disconnected</span>
                        </div>
                        <button class="log-pause-btn" id="log-pause-${this.objectName}" title="Pause/Resume (Esc)">
                            <span class="pause-icon">⏸</span>
                            <span class="pause-count" id="log-pause-count-${this.objectName}"></span>
                        </button>
                        <button class="log-connect-btn" id="log-connect-${this.objectName}">Connect</button>
                        <select class="log-buffer-select" id="log-buffer-${this.objectName}" title="Buffer size">
                            <option value="500">500</option>
                            <option value="1000">1000</option>
                            <option value="2000">2000</option>
                            <option value="5000">5000</option>
                            <option value="10000" selected>10000</option>
                            <option value="20000">20000</option>
                            <option value="50000">50000</option>
                        </select>
                        <button class="log-download-btn" id="log-download-${this.objectName}" title="Download logs">💾</button>
                        <button class="log-clear-btn" id="log-clear-${this.objectName}" title="Clear">Clear</button>
                    </div>
                    <div class="section-reorder-buttons" onclick="event.stopPropagation()">
                        <button class="section-move-btn section-move-up" onclick="moveSectionUp('${this.tabKey}', 'logviewer')" title="Move up">↑</button>
                        <button class="section-move-btn section-move-down" onclick="moveSectionDown('${this.tabKey}', 'logviewer')" title="Move down">↓</button>
                    </div>
                </div>
                <div class="logviewer-content">
                    <div class="log-container" id="log-container-${this.objectName}" style="height: ${this.height}px">
                        <div class="log-placeholder" id="log-placeholder-${this.objectName}">
                            <span class="log-placeholder-icon">📋</span>
                            <span>Click "Connect" to view logs</span>
                        </div>
                        <div class="log-waiting" id="log-waiting-${this.objectName}" style="display: none">
                            <span class="log-waiting-text">Waiting for messages...</span>
                            <span class="log-waiting-hint">Select log level or wait for messages from the process</span>
                        </div>
                        <div class="log-lines" id="log-lines-${this.objectName}" style="display: none"></div>
                    </div>
                    <div class="logviewer-resize-handle" id="log-resize-${this.objectName}"></div>
                </div>
            </div>
        `;
        this.container.innerHTML = html;
    }

    setupEventHandlers() {
        // Toggle collapse
        const header = this.container.querySelector('.logviewer-header');
        header.addEventListener('click', (e) => {
            if (e.target.closest('.logviewer-controls')) return;
            this.toggleCollapse();
        });

        // Connect button
        const connectBtn = this.getEl(`log-connect-${this.objectName}`);
        connectBtn.addEventListener('click', () => {
            if (this.isActive) {
                this.disconnect();
            } else {
                this.connect();
            }
        });

        // Clear button
        const clearBtn = this.getEl(`log-clear-${this.objectName}`);
        clearBtn.addEventListener('click', () => this.clear());

        // Download button
        const downloadBtn = this.getEl(`log-download-${this.objectName}`);
        downloadBtn.addEventListener('click', () => this.downloadLogs());

        // Pause button
        const pauseBtn = this.getEl(`log-pause-${this.objectName}`);
        pauseBtn.addEventListener('click', () => this.togglePause());

        // Level dropdown
        this.setupLevelDropdown();

        // Filter input with local filtering
        const filterInput = this.getEl(`log-filter-${this.objectName}`);
        let filterTimeout = null;
        filterInput.addEventListener('input', (e) => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                this.filter = e.target.value;
                this.applyFilter();
            }, 300);
        });

        // Filter options
        const regexCheckbox = this.getEl(`log-filter-regex-${this.objectName}`);
        regexCheckbox.addEventListener('change', (e) => {
            this.filterRegex = e.target.checked;
            this.saveFilterOptions();
            this.applyFilter();
        });

        const caseCheckbox = this.getEl(`log-filter-case-${this.objectName}`);
        caseCheckbox.addEventListener('change', (e) => {
            this.filterCase = e.target.checked;
            this.saveFilterOptions();
            this.applyFilter();
        });

        const onlyCheckbox = this.getEl(`log-filter-only-${this.objectName}`);
        onlyCheckbox.addEventListener('change', (e) => {
            this.filterOnlyMatches = e.target.checked;
            this.saveFilterOptions();
            this.applyFilter();
        });

        // Hotkey "/" for filter focus, Esc for pause toggle
        document.addEventListener('keydown', (e) => {
            // Check if LogViewer section is visible
            const section = this.getEl(`logviewer-section-${this.objectName}`);
            if (!section || section.classList.contains('collapsed')) return;

            if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                filterInput.focus();
            }
            if (e.key === 'Escape') {
                if (document.activeElement === filterInput) {
                    // Clear filter and blur
                    filterInput.value = '';
                    this.filter = '';
                    this.applyFilter();
                    filterInput.blur();
                } else if (document.activeElement.tagName !== 'INPUT') {
                    // Toggle pause when not in input
                    this.togglePause();
                }
            }
        });

        // Buffer size select
        const bufferSelect = this.getEl(`log-buffer-${this.objectName}`);
        bufferSelect.addEventListener('change', (e) => {
            this.maxLines = parseInt(e.target.value);
            this.saveBufferSize();
            this.updateStats();
        });

        // Resize handle
        this.setupResize();

        // Auto-scroll on container scroll
        const logContainer = this.getEl(`log-container-${this.objectName}`);
        logContainer.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = logContainer;
            this.autoScroll = scrollHeight - scrollTop - clientHeight < 50;
        });

        // Load saved settings
        this.loadSavedLevels();
        this.loadSavedBufferSize();
        this.loadFilterOptions();
    }

    saveFilterOptions() {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-filter-options') || '{}');
            saved[this.tabKey] = {
                regex: this.filterRegex,
                case: this.filterCase,
                only: this.filterOnlyMatches
            };
            localStorage.setItem('uniset-panel-filter-options', JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save filter options:', err);
        }
    }

    loadFilterOptions() {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-filter-options') || '{}');
            const opts = saved[this.tabKey] || saved[this.objectName];
            if (opts) {
                this.filterRegex = opts.regex !== undefined ? opts.regex : true;
                this.filterCase = opts.case !== undefined ? opts.case : false;
                this.filterOnlyMatches = opts.only !== undefined ? opts.only : false;

                // Update checkboxes
                const regexCheckbox = this.getEl(`log-filter-regex-${this.objectName}`);
                const caseCheckbox = this.getEl(`log-filter-case-${this.objectName}`);
                const onlyCheckbox = this.getEl(`log-filter-only-${this.objectName}`);

                if (regexCheckbox) regexCheckbox.checked = this.filterRegex;
                if (caseCheckbox) caseCheckbox.checked = this.filterCase;
                if (onlyCheckbox) onlyCheckbox.checked = this.filterOnlyMatches;
            }
        } catch (err) {
            console.warn('Failed to load filter options:', err);
        }
    }

    saveBufferSize() {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-buffersize') || '{}');
            saved[this.tabKey] = this.maxLines;
            localStorage.setItem('uniset-panel-buffersize', JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save buffer size:', err);
        }
    }

    loadSavedBufferSize() {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-buffersize') || '{}');
            const bufSize = saved[this.tabKey] ?? saved[this.objectName];
            if (bufSize) {
                this.maxLines = bufSize;
                const bufferSelect = this.getEl(`log-buffer-${this.objectName}`);
                if (bufferSelect) {
                    bufferSelect.value = this.maxLines;
                }
            }
        } catch (err) {
            console.warn('Failed to load buffer size:', err);
        }
    }

    setupLevelDropdown() {
        const btn = this.getEl(`log-level-btn-${this.objectName}`);
        const dropdown = this.getEl(`log-level-dropdown-${this.objectName}`);
        const wrapper = this.getEl(`log-level-wrapper-${this.objectName}`);

        // Toggle dropdown
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.levelDropdownOpen = !this.levelDropdownOpen;
            dropdown.classList.toggle('open', this.levelDropdownOpen);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target) && this.levelDropdownOpen) {
                this.levelDropdownOpen = false;
                dropdown.classList.remove('open');
            }
        });

        // Level pills
        const pills = dropdown.querySelectorAll('.log-level-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                const level = pill.dataset.level;
                if (level === 'ANY') {
                    // ANY toggles all levels
                    if (this.selectedLevels.has('ANY')) {
                        this.selectedLevels.clear();
                    } else {
                        this.selectedLevels.clear();
                        this.selectedLevels.add('ANY');
                    }
                } else {
                    // Remove ANY if specific level selected
                    this.selectedLevels.delete('ANY');
                    if (this.selectedLevels.has(level)) {
                        this.selectedLevels.delete(level);
                    } else {
                        this.selectedLevels.add(level);
                    }
                }
                this.updatePillsUI();
            });
        });

        // Presets
        const presets = dropdown.querySelectorAll('.log-preset-btn');
        presets.forEach(preset => {
            preset.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = preset.dataset.preset;
                this.selectedLevels.clear();
                switch (type) {
                    case 'errors':
                        this.selectedLevels.add('CRIT');
                        this.selectedLevels.add('WARN');
                        break;
                    case 'info':
                        this.selectedLevels.add('CRIT');
                        this.selectedLevels.add('WARN');
                        this.selectedLevels.add('INFO');
                        break;
                    case 'all':
                        this.selectedLevels.add('ANY');
                        break;
                    case 'reset':
                        // Already cleared
                        break;
                }
                this.updatePillsUI();
            });
        });

        // Apply button
        const applyBtn = this.getEl(`log-level-apply-${this.objectName}`);
        applyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.applyLevelSelection();
            this.levelDropdownOpen = false;
            dropdown.classList.remove('open');
        });
    }

    updatePillsUI() {
        const dropdown = this.getEl(`log-level-dropdown-${this.objectName}`);
        const pills = dropdown.querySelectorAll('.log-level-pill');
        pills.forEach(pill => {
            const level = pill.dataset.level;
            pill.classList.toggle('active', this.selectedLevels.has(level));
        });

        // Update button text to show selected count
        const btn = this.getEl(`log-level-btn-${this.objectName}`);
        if (this.selectedLevels.size === 0) {
            btn.textContent = 'Levels ▼';
        } else if (this.selectedLevels.has('ANY')) {
            btn.textContent = 'All ▼';
        } else {
            btn.textContent = `Levels (${this.selectedLevels.size}) ▼`;
        }
    }

    applyLevelSelection() {
        // Calculate combined mask
        let mask = 0;
        if (this.selectedLevels.has('ANY')) {
            mask = LOG_LEVELS.ANY;
        } else {
            this.selectedLevels.forEach(level => {
                if (LOG_LEVELS[level]) {
                    mask |= LOG_LEVELS[level];
                }
            });
        }

        this.currentLevel = mask;
        this.saveLevels();

        // Send to server if connected
        if (this.connected && mask > 0) {
            this.sendCommand('setLevel', mask);
        }
    }

    saveLevels() {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-loglevels') || '{}');
            saved[this.tabKey] = Array.from(this.selectedLevels);
            localStorage.setItem('uniset-panel-loglevels', JSON.stringify(saved));
        } catch (err) {
            console.warn('Failed to save log levels:', err);
        }
    }

    loadSavedLevels() {
        try {
            const saved = JSON.parse(localStorage.getItem('uniset-panel-loglevels') || '{}');
            const levels = saved[this.tabKey] || saved[this.objectName];
            if (levels) {
                this.selectedLevels = new Set(levels);
                this.updatePillsUI();
                // Calculate mask for currentLevel
                let mask = 0;
                if (this.selectedLevels.has('ANY')) {
                    mask = LOG_LEVELS.ANY;
                } else {
                    this.selectedLevels.forEach(level => {
                        if (LOG_LEVELS[level]) {
                            mask |= LOG_LEVELS[level];
                        }
                    });
                }
                this.currentLevel = mask;
            }
        } catch (err) {
            console.warn('Failed to load log levels:', err);
        }
    }

    setupResize() {
        const resizeHandle = this.getEl(`log-resize-${this.objectName}`);
        const logContainer = this.getEl(`log-container-${this.objectName}`);

        let startY = 0;
        let startHeight = 0;
        let isResizing = false;

        const onMouseMove = (e) => {
            if (!isResizing) return;
            const delta = e.clientY - startY;
            const newHeight = Math.max(LOGVIEWER_MIN_HEIGHT, Math.min(LOGVIEWER_MAX_HEIGHT, startHeight + delta));
            logContainer.style.height = `${newHeight}px`;
            this.height = newHeight;
        };

        const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            this.saveHeight();
        };

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            startY = e.clientY;
            startHeight = logContainer.offsetHeight;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        });
    }

    toggleCollapse() {
        const section = this.getEl(`logviewer-section-${this.objectName}`);
        section.classList.toggle('collapsed');
        this.saveCollapsedState();
    }

    connect() {
        // Clear any pending reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.isActive = true;
        this.updateStatus('connecting');

        // Собираем query параметры
        const params = new URLSearchParams();
        if (this.filter) {
            params.set('filter', this.filter);
        }
        if (this.serverId) {
            params.set('server', this.serverId);
        }
        const queryString = params.toString();
        const url = `/api/logs/${encodeURIComponent(this.objectName)}/stream${queryString ? '?' + queryString : ''}`;

        this.eventSource = new EventSource(url);

        this.eventSource.addEventListener('connected', (e) => {
            this.connected = true;
            this.hasReceivedLogs = false;
            this.reconnectAttempts = 0; // Reset on successful connection
            this.updateStatus('connected');
            this.showWaiting(); // Показываем "ожидание сообщений"

            // НЕ отправляем setLevel автоматически - пользователь сам выбирает
            // Если уровень уже был выбран до подключения, отправляем его
            if (this.currentLevel > 0) {
                this.sendCommand('setLevel', this.currentLevel);
            }

            try {
                const data = JSON.parse(e.data);
                console.log(`LogViewer: Connected to ${data.host}:${data.port}`);
            } catch (err) {
                console.log('LogViewer: Connected');
            }
        });

        this.eventSource.addEventListener('log', (e) => {
            this.addLine(e.data);
        });

        // Batch event handler (new format)
        this.eventSource.addEventListener('logs', (e) => {
            try {
                const lines = JSON.parse(e.data);
                this.addLines(lines);
            } catch (err) {
                console.error('LogViewer: Failed to parse logs batch:', err);
            }
        });

        this.eventSource.addEventListener('disconnected', () => {
            console.log('LogViewer: Disconnected from LogServer, will reconnect');
            this.handleConnectionError();
        });

        this.eventSource.addEventListener('error', (e) => {
            if (e.data) {
                this.addLine(`[ERROR] ${e.data}`, 'error');
            }
            this.handleConnectionError();
        });

        this.eventSource.onerror = () => {
            this.handleConnectionError();
        };
    }

    handleConnectionError() {
        if (!this.isActive) return; // Already disconnected by user

        this.connected = false;

        // Close current EventSource to prevent browser's automatic reconnection
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        this.reconnectAttempts++;

        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            // Exponential backoff with jitter
            const expDelay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            const cappedDelay = Math.min(expDelay, this.maxReconnectDelay);
            const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
            const delay = Math.round(cappedDelay + jitter);

            console.log(`LogViewer: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            this.updateStatus('reconnecting');

            // Clear any existing timer
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
            }

            this.reconnectTimer = setTimeout(() => {
                if (this.isActive) {
                    this.connect();
                }
            }, delay);
        } else {
            // Max attempts reached - disconnect
            console.warn('LogViewer: Max reconnection attempts reached, disconnecting');
            this.addLine('[WARN] Connection lost. Click Connect to retry.', 'error');
            this.isActive = false;
            this.updateStatus('disconnected');
        }
    }

    disconnect() {
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.connected = false;
        this.isActive = false;
        this.reconnectAttempts = 0;
        this.updateStatus('disconnected');
    }

    async sendCommand(command, level = 0, filter = '') {
        try {
            let url = `/api/logs/${encodeURIComponent(this.objectName)}/command`;
            if (this.serverId) {
                url += `?server=${encodeURIComponent(this.serverId)}`;
            }
            await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, level, filter })
            });
        } catch (err) {
            console.error('LogViewer: Failed to send command', err);
        }
    }

    addLine(text, type = '') {
        // При первом логе скрываем "ожидание" и показываем логи
        if (!this.hasReceivedLogs) {
            this.hasReceivedLogs = true;
            this.showLogLines();
        }

        const line = { text, type, timestamp: new Date() };

        // Если на паузе - накапливаем в буфер
        if (this.paused) {
            this.pausedBuffer.push(line);
            this.updatePauseCount();
            return;
        }

        this.lines.push(line);

        // Limit lines - also need to remove from DOM
        if (this.lines.length > this.maxLines) {
            this.lines = this.lines.slice(-this.maxLines);
            // Remove old lines from DOM
            const linesContainer = this.getEl(`log-lines-${this.objectName}`);
            if (linesContainer && linesContainer.children.length > this.maxLines) {
                const toRemove = linesContainer.children.length - this.maxLines;
                for (let i = 0; i < toRemove; i++) {
                    linesContainer.removeChild(linesContainer.firstChild);
                }
            }
        }

        const matches = this.renderLine(line, this.lines.length - 1);
        if (matches) {
            this.matchCount++;
            this.updateMatchCount();
        }
        this.updateStats();
        this.scrollToBottom();
    }

    // Batch add lines (for batched SSE events)
    addLines(texts) {
        if (!texts || texts.length === 0) return;

        // При первом логе скрываем "ожидание" и показываем логи
        if (!this.hasReceivedLogs) {
            this.hasReceivedLogs = true;
            this.showLogLines();
        }

        const timestamp = new Date();
        const newLines = texts.map(text => ({ text, type: '', timestamp }));

        // Если на паузе - накапливаем в буфер
        if (this.paused) {
            this.pausedBuffer.push(...newLines);
            this.updatePauseCount();
            return;
        }

        this.lines.push(...newLines);

        // Limit lines - also need to remove from DOM
        if (this.lines.length > this.maxLines) {
            const excess = this.lines.length - this.maxLines;
            this.lines = this.lines.slice(-this.maxLines);
            // Remove old lines from DOM
            const linesContainer = this.getEl(`log-lines-${this.objectName}`);
            if (linesContainer) {
                const toRemove = Math.min(excess, linesContainer.children.length);
                for (let i = 0; i < toRemove; i++) {
                    linesContainer.removeChild(linesContainer.firstChild);
                }
            }
        }

        // Render all new lines using DocumentFragment for better performance
        const linesContainer = this.getEl(`log-lines-${this.objectName}`);
        if (!linesContainer) return;

        const fragment = document.createDocumentFragment();
        let matchCount = 0;

        newLines.forEach((line, i) => {
            const index = this.lines.length - newLines.length + i;
            const div = document.createElement('div');
            div.className = 'log-line';
            div.dataset.index = index;

            // Detect log level from text
            const levelClass = this.detectLogLevel(line.text);
            if (levelClass) {
                div.classList.add(levelClass);
            }

            // Apply filter highlighting
            const { html, matches } = this.highlightText(line.text);
            if (matches) {
                div.innerHTML = html;
                div.classList.add('has-match');
                matchCount++;
            } else {
                div.textContent = line.text;
                if (this.filterOnlyMatches && this.filter) {
                    div.classList.add('hidden');
                }
            }

            fragment.appendChild(div);
        });

        linesContainer.appendChild(fragment);
        this.matchCount += matchCount;
        this.updateMatchCount();
        this.updateStats();
        this.scrollToBottom();
    }

    renderLine(line, index = -1) {
        const linesContainer = this.getEl(`log-lines-${this.objectName}`);
        if (!linesContainer) return;

        const div = document.createElement('div');
        div.className = 'log-line';
        if (index >= 0) {
            div.dataset.index = index;
        }

        // Detect log level from text
        const levelClass = this.detectLogLevel(line.text);
        if (levelClass) {
            div.classList.add(levelClass);
        }
        if (line.type === 'error') {
            div.classList.add('log-level-crit');
        }

        // Apply filter highlighting
        const { html, matches } = this.highlightText(line.text);
        if (matches) {
            div.innerHTML = html;
            div.classList.add('has-match');
        } else {
            div.textContent = line.text;
            if (this.filterOnlyMatches && this.filter) {
                div.classList.add('hidden');
            }
        }

        linesContainer.appendChild(div);
        return matches;
    }

    highlightText(text) {
        if (!this.filter) {
            return { html: text, matches: false };
        }

        try {
            let regex;
            if (this.filterRegex) {
                const flags = this.filterCase ? 'g' : 'gi';
                regex = new RegExp(`(${this.filter})`, flags);
            } else {
                const escaped = this.filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flags = this.filterCase ? 'g' : 'gi';
                regex = new RegExp(`(${escaped})`, flags);
            }

            if (regex.test(text)) {
                // Reset lastIndex after test
                regex.lastIndex = 0;
                const html = text.replace(regex, '<mark class="log-highlight">$1</mark>');
                return { html, matches: true };
            }
        } catch (e) {
            // Invalid regex - just return text
        }

        return { html: text, matches: false };
    }

    applyFilter() {
        const linesContainer = this.getEl(`log-lines-${this.objectName}`);
        if (!linesContainer) return;

        // Re-render all lines with filter
        linesContainer.innerHTML = '';
        this.matchCount = 0;

        this.lines.forEach((line, index) => {
            const matches = this.renderLine(line, index);
            if (matches) {
                this.matchCount++;
            }
        });

        // Update match count display
        this.updateMatchCount();
        this.updateStats();
        this.scrollToBottom();
    }

    updateMatchCount() {
        const countEl = this.getEl(`log-match-count-${this.objectName}`);
        if (countEl) {
            if (this.filter && this.matchCount > 0) {
                countEl.textContent = `${this.matchCount} matches`;
                countEl.classList.add('has-matches');
            } else if (this.filter) {
                countEl.textContent = '0 matches';
                countEl.classList.remove('has-matches');
            } else {
                countEl.textContent = '';
                countEl.classList.remove('has-matches');
            }
        }
    }

    updateStats() {
        const statsEl = this.getEl(`log-stats-${this.objectName}`);
        if (statsEl) {
            statsEl.textContent = `${this.lines.length} / ${this.maxLines}`;
        }
    }

    togglePause() {
        this.paused = !this.paused;
        this.updatePauseUI();

        if (!this.paused) {
            // При снятии паузы - выгружаем накопленный буфер
            this.flushPausedBuffer();
        }
    }

    updatePauseUI() {
        const pauseBtn = this.getEl(`log-pause-${this.objectName}`);
        const pauseIcon = pauseBtn?.querySelector('.pause-icon');

        if (pauseBtn) {
            pauseBtn.classList.toggle('paused', this.paused);
            if (pauseIcon) {
                pauseIcon.textContent = this.paused ? '▶' : '⏸';
            }
        }
        this.updatePauseCount();
    }

    updatePauseCount() {
        const countEl = this.getEl(`log-pause-count-${this.objectName}`);
        if (countEl) {
            if (this.paused && this.pausedBuffer.length > 0) {
                countEl.textContent = `+${this.pausedBuffer.length}`;
                countEl.style.display = 'inline';
            } else {
                countEl.textContent = '';
                countEl.style.display = 'none';
            }
        }
    }

    flushPausedBuffer() {
        if (this.pausedBuffer.length === 0) return;

        // Добавляем все накопленные строки
        this.pausedBuffer.forEach(line => {
            this.lines.push(line);
        });

        // Ограничиваем размер
        if (this.lines.length > this.maxLines) {
            this.lines = this.lines.slice(-this.maxLines);
        }

        // Очищаем буфер
        this.pausedBuffer = [];
        this.updatePauseCount();

        // Перерисовываем все строки с учётом фильтра
        this.applyFilter();
    }

    downloadLogs() {
        if (this.lines.length === 0) return;

        const content = this.lines.map(line => line.text).join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `logs-${this.objectName}-${timestamp}.txt`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    detectLogLevel(text) {
        const lower = text.toLowerCase();
        if (lower.includes('crit') || lower.includes('fatal') || lower.includes('error')) {
            return 'log-level-crit';
        }
        if (lower.includes('warn')) {
            return 'log-level-warn';
        }
        if (lower.includes('info')) {
            return 'log-level-info';
        }
        if (lower.includes('debug') || lower.includes('level')) {
            return 'log-level-debug';
        }
        return '';
    }

    scrollToBottom() {
        if (!this.autoScroll) return;
        const container = this.getEl(`log-container-${this.objectName}`);
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    showWaiting() {
        const placeholder = this.getEl(`log-placeholder-${this.objectName}`);
        const waiting = this.getEl(`log-waiting-${this.objectName}`);
        const lines = this.getEl(`log-lines-${this.objectName}`);
        if (placeholder) placeholder.style.display = 'none';
        if (waiting) waiting.style.display = 'flex';
        if (lines) lines.style.display = 'none';
    }

    showLogLines() {
        const placeholder = this.getEl(`log-placeholder-${this.objectName}`);
        const waiting = this.getEl(`log-waiting-${this.objectName}`);
        const lines = this.getEl(`log-lines-${this.objectName}`);
        if (placeholder) placeholder.style.display = 'none';
        if (waiting) waiting.style.display = 'none';
        if (lines) lines.style.display = 'block';
    }

    clear() {
        this.lines = [];
        const linesContainer = this.getEl(`log-lines-${this.objectName}`);
        if (linesContainer) {
            linesContainer.innerHTML = '';
        }
    }

    updateStatus(status) {
        const dot = this.getEl(`log-status-dot-${this.objectName}`);
        const text = this.getEl(`log-status-text-${this.objectName}`);
        const btn = this.getEl(`log-connect-${this.objectName}`);

        if (!dot || !text || !btn) return;

        dot.className = 'logviewer-status-dot';
        btn.classList.remove('connected', 'reconnecting');

        switch (status) {
            case 'connected':
                dot.classList.add('connected');
                text.textContent = 'Connected';
                btn.textContent = 'Disconnect';
                btn.classList.add('connected');
                break;
            case 'connecting':
                dot.classList.add('connecting');
                text.textContent = 'Connecting...';
                btn.textContent = 'Stop';
                break;
            case 'reconnecting':
                dot.classList.add('reconnecting');
                text.textContent = 'Reconnecting...';
                btn.textContent = 'Stop';
                btn.classList.add('reconnecting');
                break;
            default: // disconnected
                text.textContent = 'Disconnected';
                btn.textContent = 'Connect';
        }
    }

    saveHeight() {
        try {
            const heights = JSON.parse(localStorage.getItem('uniset-panel-logheights') || '{}');
            heights[this.tabKey] = this.height;
            localStorage.setItem('uniset-panel-logheights', JSON.stringify(heights));
        } catch (err) {
            console.warn('Failed to save log height:', err);
        }
    }

    loadSavedHeight() {
        try {
            const heights = JSON.parse(localStorage.getItem('uniset-panel-logheights') || '{}');
            const h = heights[this.tabKey] ?? heights[this.objectName];
            if (h) {
                this.height = h;
                const container = this.getEl(`log-container-${this.objectName}`);
                if (container) {
                    container.style.height = `${this.height}px`;
                }
            }
        } catch (err) {
            console.warn('Failed to load log height:', err);
        }
    }

    saveCollapsedState() {
        const section = this.getEl(`logviewer-section-${this.objectName}`);
        const collapsed = section.classList.contains('collapsed');
        state.collapsedSections[`logviewer-${this.objectName}`] = collapsed;
        saveCollapsedSections();
    }

    restoreCollapsedState() {
        if (state.collapsedSections[`logviewer-${this.objectName}`]) {
            const section = this.getEl(`logviewer-section-${this.objectName}`);
            section?.classList.add('collapsed');
        }
    }

    destroy() {
        this.disconnect();
    }
}



// === 35-journal.js ===
// Journal (Message Log) Component
// Displays messages from ClickHouse database with filtering and real-time updates

class JournalRenderer {
    constructor(journalId, journalName) {
        this.journalId = journalId;
        this.journalName = journalName;
        this.messages = [];
        this.isPaused = false;
        this.pendingMessages = [];
        this.filters = {
            mtype: 'all',
            mgroup: 'all',
            search: '',
            from: null,
            to: null
        };
        this.offset = 0;
        this.limit = JOURNAL_DEFAULT_LIMIT;
        this.total = 0;
        this.mtypes = [];
        this.mgroups = [];
        this.containerId = `journal-${journalId}`;
        this.isLoading = false;
        this.hasMore = true;
        this.searchDebounceTimer = null;
        this.activeTimeRange = '1h'; // Default time range
    }

    createPanelHTML() {
        return `
            <div class="journal-panel" id="${this.containerId}">
                <div class="journal-toolbar">
                    <div class="journal-filters">
                        <select id="journal-mtype-${this.journalId}" class="journal-select" title="Filter by type">
                            <option value="all">All types</option>
                        </select>
                        <select id="journal-mgroup-${this.journalId}" class="journal-select" title="Filter by group">
                            <option value="all">All groups</option>
                        </select>
                        <div class="journal-search-wrap">
                            <input type="text" id="journal-search-${this.journalId}" class="journal-search" placeholder="Search..." title="Search in messages (ESC to clear)">
                            <span class="journal-search-clear" id="journal-search-clear-${this.journalId}" title="Clear search">&times;</span>
                        </div>
                    </div>
                    <div class="journal-time-range">
                        <button class="journal-time-btn" data-range="15m">15m</button>
                        <button class="journal-time-btn active" data-range="1h">1h</button>
                        <button class="journal-time-btn" data-range="3h">3h</button>
                        <button class="journal-time-btn" data-range="10h">10h</button>
                        <button class="journal-time-btn" data-range="1d">1d</button>
                        <button class="journal-time-btn" data-range="3d">3d</button>
                        <button class="journal-time-btn" data-range="1w">1w</button>
                        <button class="journal-time-btn" data-range="1M">1M</button>
                        <button class="journal-time-btn" data-range="all">All</button>
                    </div>
                    <div class="journal-controls">
                        <button id="journal-pause-${this.journalId}" class="journal-btn journal-pause-btn" title="Pause updates">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="6" y="4" width="4" height="16"/>
                                <rect x="14" y="4" width="4" height="16"/>
                            </svg>
                            <span>Pause</span>
                        </button>
                        <span id="journal-pending-${this.journalId}" class="journal-pending hidden">0 pending</span>
                    </div>
                </div>
                <div class="journal-table-container" id="journal-container-${this.journalId}">
                    <div class="journal-table-wrapper" id="journal-wrapper-${this.journalId}">
                        <table class="journal-table">
                            <thead>
                                <tr>
                                    <th class="col-time">Time</th>
                                    <th class="col-type">Type</th>
                                    <th class="col-message">Message</th>
                                    <th class="col-code">Code</th>
                                    <th class="col-group">Group</th>
                                    <th class="col-name">Sensor</th>
                                    <th class="col-value">Value</th>
                                </tr>
                            </thead>
                            <tbody id="journal-tbody-${this.journalId}">
                                <tr class="journal-loading"><td colspan="7">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="journal-resize-handle" id="journal-resize-${this.journalId}" title="Drag to resize"></div>
                </div>
                <div class="journal-footer">
                    <span id="journal-info-${this.journalId}" class="journal-info">Loading...</span>
                </div>
            </div>
        `;
    }

    async initialize() {
        this.bindEvents();
        this.setupInfiniteScroll();
        this.setupResize();
        this.setTimeRange(this.activeTimeRange);
        await Promise.all([
            this.loadMTypes(),
            this.loadMGroups()
        ]);
        await this.loadMessages();
    }

    bindEvents() {
        const pauseBtn = document.getElementById(`journal-pause-${this.journalId}`);
        const searchInput = document.getElementById(`journal-search-${this.journalId}`);
        const searchClear = document.getElementById(`journal-search-clear-${this.journalId}`);
        const mtypeSelect = document.getElementById(`journal-mtype-${this.journalId}`);
        const mgroupSelect = document.getElementById(`journal-mgroup-${this.journalId}`);

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.togglePause());
        }

        // Live search with debounce
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = setTimeout(() => {
                    this.filters.search = searchInput.value;
                    this.offset = 0;
                    this.loadMessages();
                }, JOURNAL_SEARCH_DEBOUNCE_DELAY);
                // Show/hide clear button
                if (searchClear) {
                    searchClear.style.display = searchInput.value ? 'block' : 'none';
                }
            });

            // ESC to clear search
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.filters.search = '';
                    this.offset = 0;
                    this.loadMessages();
                    if (searchClear) searchClear.style.display = 'none';
                }
            });
        }

        // Clear search button
        if (searchClear) {
            searchClear.style.display = 'none';
            searchClear.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    this.filters.search = '';
                    this.offset = 0;
                    this.loadMessages();
                }
                searchClear.style.display = 'none';
            });
        }

        // Filter selects - apply on change
        if (mtypeSelect) {
            mtypeSelect.addEventListener('change', () => {
                this.filters.mtype = mtypeSelect.value;
                this.offset = 0;
                this.loadMessages();
            });
        }

        if (mgroupSelect) {
            mgroupSelect.addEventListener('change', () => {
                this.filters.mgroup = mgroupSelect.value;
                this.offset = 0;
                this.loadMessages();
            });
        }

        // Time range buttons
        const container = document.getElementById(this.containerId);
        if (container) {
            container.querySelectorAll('.journal-time-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const range = btn.dataset.range;
                    this.setTimeRange(range);
                    // Update active button
                    container.querySelectorAll('.journal-time-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.activeTimeRange = range;
                    this.offset = 0;
                    this.loadMessages();
                });
            });
        }
    }

    setTimeRange(range) {
        const now = new Date();
        let from = null;

        if (range === 'all') {
            this.filters.from = null;
            this.filters.to = null;
            return;
        }

        const multipliers = {
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '3h': 3 * 60 * 60 * 1000,
            '10h': 10 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '3d': 3 * 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1M': 30 * 24 * 60 * 60 * 1000
        };

        if (multipliers[range]) {
            from = new Date(now.getTime() - multipliers[range]);
        }

        this.filters.from = from ? from.toISOString() : null;
        this.filters.to = null; // Always to now for real-time
    }

    setupInfiniteScroll() {
        const wrapper = document.getElementById(`journal-wrapper-${this.journalId}`);
        if (!wrapper) return;

        wrapper.addEventListener('scroll', () => {
            if (this.isLoading || !this.hasMore) return;

            const { scrollTop, scrollHeight, clientHeight } = wrapper;
            // Load more when scrolled to 80% of the content
            if (scrollTop + clientHeight >= scrollHeight * 0.8) {
                this.loadMore();
            }
        });
    }

    setupResize() {
        const handle = document.getElementById(`journal-resize-${this.journalId}`);
        const container = document.getElementById(`journal-container-${this.journalId}`);
        if (!handle || !container) return;

        let startY, startHeight;

        const onMouseMove = (e) => {
            const delta = e.clientY - startY;
            const newHeight = Math.max(150, Math.min(800, startHeight + delta));
            container.style.height = `${newHeight}px`;
            container.style.flex = 'none'; // Override flex: 1 to allow fixed height
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        handle.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startHeight = container.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    async loadMTypes() {
        try {
            const response = await fetch(`/api/journals/${this.journalId}/mtypes`);
            if (response.ok) {
                this.mtypes = await response.json();
                this.updateMTypeSelect();
            }
        } catch (err) {
            console.error('Failed to load mtypes:', err);
        }
    }

    async loadMGroups() {
        try {
            const response = await fetch(`/api/journals/${this.journalId}/mgroups`);
            if (response.ok) {
                this.mgroups = await response.json();
                this.updateMGroupSelect();
            }
        } catch (err) {
            console.error('Failed to load mgroups:', err);
        }
    }

    updateMTypeSelect() {
        const select = document.getElementById(`journal-mtype-${this.journalId}`);
        if (!select) return;

        select.innerHTML = '<option value="all">All types</option>';
        for (const mtype of this.mtypes) {
            const option = document.createElement('option');
            option.value = mtype;
            option.textContent = mtype;
            select.appendChild(option);
        }
    }

    updateMGroupSelect() {
        const select = document.getElementById(`journal-mgroup-${this.journalId}`);
        if (!select) return;

        select.innerHTML = '<option value="all">All groups</option>';
        for (const mgroup of this.mgroups) {
            const option = document.createElement('option');
            option.value = mgroup;
            option.textContent = mgroup;
            select.appendChild(option);
        }
    }

    async loadMessages(append = false) {
        if (this.isLoading) return;
        this.isLoading = true;

        const params = new URLSearchParams();
        params.set('limit', this.limit);
        params.set('offset', append ? this.offset : 0);

        if (this.filters.mtype !== 'all') {
            params.set('mtype', this.filters.mtype);
        }
        if (this.filters.mgroup !== 'all') {
            params.set('mgroup', this.filters.mgroup);
        }
        if (this.filters.search) {
            params.set('search', this.filters.search);
        }
        if (this.filters.from) {
            params.set('from', this.filters.from);
        }
        if (this.filters.to) {
            params.set('to', this.filters.to);
        }

        try {
            const response = await fetch(`/api/journals/${this.journalId}/messages?${params}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (append) {
                this.messages = [...this.messages, ...(data.messages || [])];
            } else {
                this.messages = data.messages || [];
                this.offset = 0;
            }

            this.total = data.total || 0;
            this.hasMore = this.messages.length < this.total;

            this.renderMessages();
            this.updateInfo();
        } catch (err) {
            console.error('Failed to load messages:', err);
            this.showError('Failed to load messages');
        } finally {
            this.isLoading = false;
        }
    }

    renderMessages() {
        const tbody = document.getElementById(`journal-tbody-${this.journalId}`);
        if (!tbody) return;

        if (this.messages.length === 0) {
            tbody.innerHTML = '<tr class="journal-empty"><td colspan="7">No messages</td></tr>';
            return;
        }

        tbody.innerHTML = this.messages.map(msg => this.renderMessageRow(msg)).join('');
    }

    renderMessageRow(msg) {
        const time = new Date(msg.timestamp);
        const today = new Date();
        const isToday = time.toDateString() === today.toDateString();

        const timeStr = time.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const dateStr = time.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit'
        });

        // Show date if not today
        const displayTime = isToday ? timeStr : `${dateStr} ${timeStr}`;

        const mtypeClass = this.getMTypeClass(msg.mtype);
        const searchTerm = this.filters.search;

        // Highlight search matches
        const highlightText = (text) => {
            if (!searchTerm || !text) return this.escapeHtml(text || '');
            const escaped = this.escapeHtml(text);
            const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
            return escaped.replace(regex, '<mark class="journal-highlight">$1</mark>');
        };

        return `
            <tr class="journal-row ${mtypeClass}">
                <td class="col-time" title="${time.toLocaleString('ru-RU')}">${displayTime}</td>
                <td class="col-type"><span class="journal-badge ${mtypeClass}">${this.escapeHtml(msg.mtype || '')}</span></td>
                <td class="col-message" title="${this.escapeHtml(msg.message || '')}">${highlightText(msg.message)}</td>
                <td class="col-code">${highlightText(msg.mcode)}</td>
                <td class="col-group">${highlightText(msg.mgroup)}</td>
                <td class="col-name" title="${this.escapeHtml(msg.name || '')}">${highlightText(msg.name)}</td>
                <td class="col-value">${msg.value !== undefined ? msg.value : ''}</td>
            </tr>
        `;
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getMTypeClass(mtype) {
        const type = (mtype || '').toLowerCase();
        if (type === 'alarm' || type === 'emergancy') return 'journal-alarm';
        if (type === 'warning' || type === 'cauton') return 'journal-warning';
        if (type === 'normal') return 'journal-normal';
        if (type === 'blocking') return 'journal-blocking';
        return '';
    }

    updateInfo() {
        const info = document.getElementById(`journal-info-${this.journalId}`);
        if (info) {
            const showing = this.messages.length;
            if (this.total === 0) {
                info.textContent = 'No messages';
            } else {
                info.textContent = `Showing ${showing} of ${this.total}`;
            }
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const pauseBtn = document.getElementById(`journal-pause-${this.journalId}`);

        if (pauseBtn) {
            pauseBtn.classList.toggle('paused', this.isPaused);
            pauseBtn.querySelector('span').textContent = this.isPaused ? 'Resume' : 'Pause';
        }

        if (!this.isPaused && this.pendingMessages.length > 0) {
            this.addNewMessages(this.pendingMessages);
            this.pendingMessages = [];
            this.updatePendingCount();
        }
    }

    loadMore() {
        if (this.isLoading || !this.hasMore) return;
        this.offset = this.messages.length;
        this.loadMessages(true);
    }

    handleNewMessages(messages) {
        if (this.isPaused) {
            this.pendingMessages.push(...messages);
            this.updatePendingCount();
        } else {
            this.addNewMessages(messages);
        }
    }

    addNewMessages(messages) {
        const tbody = document.getElementById(`journal-tbody-${this.journalId}`);
        if (!tbody) return;

        const emptyRow = tbody.querySelector('.journal-empty');
        if (emptyRow) emptyRow.remove();

        for (const msg of messages) {
            // Check if message matches current filters
            if (!this.matchesFilters(msg)) continue;

            const row = document.createElement('tr');
            row.className = `journal-row ${this.getMTypeClass(msg.mtype)} journal-new`;
            row.innerHTML = this.renderMessageRowContent(msg);
            tbody.insertBefore(row, tbody.firstChild);

            setTimeout(() => row.classList.remove('journal-new'), JOURNAL_HIGHLIGHT_DURATION);
        }

        this.total += messages.length;
        this.updateInfo();
    }

    matchesFilters(msg) {
        if (this.filters.mtype !== 'all' && msg.mtype !== this.filters.mtype) return false;
        if (this.filters.mgroup !== 'all' && msg.mgroup !== this.filters.mgroup) return false;
        if (this.filters.search) {
            const search = this.filters.search.toLowerCase();
            const matchesName = (msg.name || '').toLowerCase().includes(search);
            const matchesMessage = (msg.message || '').toLowerCase().includes(search);
            const matchesCode = (msg.mcode || '').toLowerCase().includes(search);
            const matchesGroup = (msg.mgroup || '').toLowerCase().includes(search);
            if (!matchesName && !matchesMessage && !matchesCode && !matchesGroup) return false;
        }
        return true;
    }

    renderMessageRowContent(msg) {
        const time = new Date(msg.timestamp);
        const today = new Date();
        const isToday = time.toDateString() === today.toDateString();

        const timeStr = time.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const dateStr = time.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit'
        });

        const displayTime = isToday ? timeStr : `${dateStr} ${timeStr}`;
        const mtypeClass = this.getMTypeClass(msg.mtype);
        const searchTerm = this.filters.search;

        const highlightText = (text) => {
            if (!searchTerm || !text) return this.escapeHtml(text || '');
            const escaped = this.escapeHtml(text);
            const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
            return escaped.replace(regex, '<mark class="journal-highlight">$1</mark>');
        };

        return `
            <td class="col-time" title="${time.toLocaleString('ru-RU')}">${displayTime}</td>
            <td class="col-type"><span class="journal-badge ${mtypeClass}">${this.escapeHtml(msg.mtype || '')}</span></td>
            <td class="col-message" title="${this.escapeHtml(msg.message || '')}">${highlightText(msg.message)}</td>
            <td class="col-code">${highlightText(msg.mcode)}</td>
            <td class="col-group">${highlightText(msg.mgroup)}</td>
            <td class="col-name" title="${this.escapeHtml(msg.name || '')}">${highlightText(msg.name)}</td>
            <td class="col-value">${msg.value !== undefined ? msg.value : ''}</td>
        `;
    }

    updatePendingCount() {
        const pendingEl = document.getElementById(`journal-pending-${this.journalId}`);
        if (pendingEl) {
            const count = this.pendingMessages.length;
            pendingEl.textContent = `${count} pending`;
            pendingEl.classList.toggle('hidden', count === 0);
        }
    }

    showError(message) {
        const tbody = document.getElementById(`journal-tbody-${this.journalId}`);
        if (tbody) {
            tbody.innerHTML = `<tr class="journal-error"><td colspan="7">${this.escapeHtml(message)}</td></tr>`;
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    destroy() {
        clearTimeout(this.searchDebounceTimer);
    }
}

// Journal Manager
class JournalManager {
    constructor() {
        this.journals = new Map();
        this.renderers = new Map();
        this.activeJournalId = null;
    }

    async loadJournals() {
        try {
            const response = await fetch('/api/journals');
            if (!response.ok) return [];

            const journals = await response.json();
            this.journals.clear();
            for (const j of journals) {
                this.journals.set(j.id, j);
            }
            return journals;
        } catch (err) {
            console.error('Failed to load journals:', err);
            return [];
        }
    }

    renderJournalsList(journals) {
        const list = document.getElementById('journals-list');
        const countEl = document.getElementById('journals-count');

        if (!list) return;

        if (journals.length === 0) {
            list.innerHTML = '<li class="journal-item-empty">No journals configured</li>';
            if (countEl) countEl.textContent = '0';
            return;
        }

        list.innerHTML = journals.map(j => `
            <li class="journal-item" data-id="${j.id}">
                <span class="journal-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                </span>
                <span class="journal-item-name">${this.escapeHtml(j.name)}</span>
                <span class="journal-item-status ${j.status}">${j.status}</span>
            </li>
        `).join('');

        if (countEl) countEl.textContent = journals.length;

        // Add click handlers
        list.querySelectorAll('.journal-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                this.openJournal(id);
            });
        });
    }

    openJournal(journalId) {
        const journal = this.journals.get(journalId);
        if (!journal) return;

        // Switch to journals view if not active
        switchView('journals');

        // Activate journal in sidebar
        document.querySelectorAll('.journal-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === journalId);
        });

        this.activeJournalId = journalId;

        // Get or create renderer
        let renderer = this.renderers.get(journalId);
        if (!renderer) {
            renderer = new JournalRenderer(journalId, journal.name);
            this.renderers.set(journalId, renderer);
        }

        // Render journal panel
        const content = document.getElementById('journals-content');
        if (content) {
            content.innerHTML = renderer.createPanelHTML();
            renderer.initialize();
        }
    }

    handleSSEMessage(data) {
        const { journalId, messages } = data;
        const renderer = this.renderers.get(journalId);
        if (renderer) {
            renderer.handleNewMessages(messages);
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Global journal manager instance
let journalManager = null;

// Обновление статуса подключения журнала (sidebar, panel, groups)
function updateJournalConnectionStatus(journalId, connected) {
    // 1. Обновляем данные в journalManager
    if (journalManager) {
        const journal = journalManager.journals.get(journalId);
        if (journal) {
            journal.connected = connected;
            journal.status = connected ? 'connected' : 'error';
        }
    }

    // 2. Sidebar: обновляем .journal-item-status
    const item = document.querySelector(`.journal-item[data-id="${journalId}"]`);
    if (item) {
        const statusEl = item.querySelector('.journal-item-status');
        if (statusEl) {
            statusEl.className = `journal-item-status ${connected ? 'connected' : 'error'}`;
            statusEl.textContent = connected ? 'connected' : 'error';
        }
    }

    // 3. Panel: toggle .server-disconnected на .journal-panel
    const panel = document.getElementById(`journal-${journalId}`);
    if (panel) {
        panel.classList.toggle('server-disconnected', !connected);
    }

    // 4. Sidebar groups: обновляем статус точки
    if (typeof updateGroupEntityStatus === 'function' && journalManager) {
        const journal = journalManager.journals.get(journalId);
        if (journal) {
            updateGroupEntityStatus('journal', journal.name, connected);
        }
    }
}

// Global View Switcher
// All sidebar sections (Objects, Dashboards, Journals) are always visible
// Only the main content view changes
function switchView(viewName) {
    const objectsBtn = document.getElementById('view-objects-btn');
    const dashboardBtn = document.getElementById('view-dashboard-btn');
    const journalsBtn = document.getElementById('view-journals-btn');
    const objectsView = document.getElementById('objects-view');
    const dashboardView = document.getElementById('dashboard-view');
    const journalsView = document.getElementById('journals-view');
    const sidebar = document.getElementById('sidebar');
    const sidebarTitle = document.querySelector('.sidebar-title');

    // Reset all buttons
    objectsBtn?.classList.remove('active');
    dashboardBtn?.classList.remove('active');
    journalsBtn?.classList.remove('active');

    // Reset all views
    objectsView?.classList.remove('active');
    dashboardView?.classList.remove('active');
    journalsView?.classList.remove('active');

    // Activate selected view
    if (viewName === 'objects') {
        objectsBtn?.classList.add('active');
        objectsView?.classList.add('active');
        if (sidebarTitle) sidebarTitle.textContent = 'Navigation';
    } else if (viewName === 'dashboard') {
        dashboardBtn?.classList.add('active');
        dashboardView?.classList.add('active');
        if (sidebarTitle) sidebarTitle.textContent = 'Navigation';
        // Refresh dashboard widgets
        if (window.dashboardManager) {
            window.dashboardManager.refreshAllWidgets();
        }
    } else if (viewName === 'journals') {
        journalsBtn?.classList.add('active');
        journalsView?.classList.add('active');
        if (sidebarTitle) sidebarTitle.textContent = 'Navigation';
    }

    sidebar?.classList.remove('hidden');

    // Save current view to state
    if (typeof dashboardState !== 'undefined') {
        dashboardState.currentView = viewName;
    }
}

// Toggle journals section collapse
function toggleJournalsSection() {
    const section = document.getElementById('journals-section');
    if (!section) return;

    state.journalsSectionCollapsed = !state.journalsSectionCollapsed;
    section.classList.toggle('collapsed', state.journalsSectionCollapsed);
    saveSettings();
}

// Initialize journals on page load
async function initJournals() {
    journalManager = new JournalManager();
    const journals = await journalManager.loadJournals();

    const journalsSection = document.getElementById('journals-section');
    const journalsSectionHeader = document.getElementById('journals-section-header');
    const journalsBtn = document.getElementById('view-journals-btn');

    if (journals.length === 0) {
        // Hide journals section and button if no journals configured
        if (journalsSection) journalsSection.style.display = 'none';
        if (journalsBtn) journalsBtn.style.display = 'none';
    } else {
        // Show journals button and section, render the list
        if (journalsBtn) journalsBtn.style.display = '';
        // В group mode секция скрыта — не показываем
        if (journalsSection && (!state.sidebarGroups || state.sidebarGroups.length === 0)) {
            journalsSection.style.display = '';
            // Apply saved collapse state
            if (state.journalsSectionCollapsed) {
                journalsSection.classList.add('collapsed');
            }
        }
        journalManager.renderJournalsList(journals);
    }

    // Add click handler for journals section header collapse
    if (journalsSectionHeader && !journalsSectionHeader.dataset.listenerAdded) {
        journalsSectionHeader.addEventListener('click', toggleJournalsSection);
        journalsSectionHeader.dataset.listenerAdded = 'true';
    }

    // Add view switcher handler for journals
    if (journalsBtn) {
        journalsBtn.addEventListener('click', () => {
            switchView('journals');
        });
    }
}


// === 40-charts.js ===
// ============================================================================
// Конец LogViewer
// ============================================================================

// Цвета для графиков
const CHART_COLORS = [
    '#3274d9', '#73bf69', '#ff9830', '#f2495c',
    '#b877d9', '#5794f2', '#fade2a', '#ff6eb4'
];
let colorIndex = 0;

function getNextColor() {
    const color = CHART_COLORS[colorIndex % CHART_COLORS.length];
    colorIndex++;
    return color;
}

// API вызовы
async function fetchServers() {
    const response = await fetch('/api/servers');
    if (!response.ok) return null;
    return response.json();
}

async function fetchObjects() {
    // Загружаем список серверов
    const serversData = await fetchServers();
    if (!serversData || !serversData.servers) {
        throw new Error('Failed to load server list');
    }

    // Сохраняем кешированные объекты перед очисткой
    const cachedObjectsMap = new Map();
    state.servers.forEach((server, serverId) => {
        if (server.cachedObjects && server.cachedObjects.length > 0) {
            cachedObjectsMap.set(serverId, server.cachedObjects);
        }
    });

    state.servers.clear();
    // Сортируем серверы по полю order (backend задаёт порядок)
    const sortedServers = [...serversData.servers].sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedServers.forEach(server => {
        state.servers.set(server.id, {
            id: server.id,
            url: server.url,
            name: server.name || server.url,
            connected: server.connected,
            order: server.order || 0,
            cachedObjects: cachedObjectsMap.get(server.id) || [] // восстанавливаем кеш
        });
    });

    // Отображаем секцию серверов в sidebar
    renderServersSection();

    // Загружаем объекты со всех серверов
    const response = await fetch('/api/all-objects');
    if (!response.ok) throw new Error('Failed to load objects list');
    return response.json();
}

// Обновить список объектов (вызывается при восстановлении связи с сервером)
// Защита от конкурентных вызовов: повторный вызов во время выполнения запланирует ещё одно обновление
let _refreshObjectsInProgress = false;
let _refreshObjectsPending = false;

async function refreshObjectsList() {
    if (_refreshObjectsInProgress) {
        _refreshObjectsPending = true;
        return;
    }
    _refreshObjectsInProgress = true;
    try {
        const data = await fetchObjects();
        renderObjectsList(data);
        console.log('Список объектов обновлён');
    } catch (err) {
        console.error('Error обновления списка объектов:', err);
    } finally {
        _refreshObjectsInProgress = false;
        if (_refreshObjectsPending) {
            _refreshObjectsPending = false;
            refreshObjectsList();
        }
    }
}

async function fetchObjectData(name, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(name)}`;
    if (serverId) {
        url += `?server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load object data');
    return response.json();
}

async function watchObject(name, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(name)}/watch`;
    if (serverId) {
        url += `?server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to start watching');
    return response.json();
}

async function unwatchObject(name, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(name)}/watch`;
    if (serverId) {
        url += `?server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to stop watching');
    return response.json();
}

async function fetchVariableHistory(objectName, variableName, count = 100, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(objectName)}/variables/${encodeURIComponent(variableName)}/history?count=${count}`;
    if (serverId) {
        url += `&server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load history');
    return response.json();
}

async function fetchSensors(serverId) {
    const param = serverId ? `?server=${encodeURIComponent(serverId)}` : '';
    const response = await fetch(`/api/sensors${param}`);
    if (!response.ok) return { sensors: [], count: 0 };
    return response.json();
}

async function fetchSMSensors() {
    const response = await fetch('/api/sm/sensors');
    if (!response.ok) return { sensors: [], count: 0 };
    return response.json();
}

// Loading конфигурации сенсоров (per-server, вызывается после заполнения state.servers)
async function loadSensorsConfig() {
    try {
        let totalLoaded = 0;

        // Загружаем сенсоры для каждого известного сервера
        for (const [serverId] of state.servers) {
            const data = await fetchSensors(serverId);
            if (data.sensors && data.sensors.length > 0) {
                data.sensors.forEach(sensor => {
                    // sensor.supplier — owning object (типично "SharedMemory");
                    // если backend не вернул — fallback. Это не идеально для
                    // cross-object одинаковых имён, но лучшее, что есть из
                    // /api/sensors response сейчас.
                    const objectName = sensor.supplier || 'SharedMemory';
                    const key = makeSensorKey(serverId, objectName, sensor.name);
                    state.sensorsByKey.set(key, sensor);
                    if (!state.sensorsByName.has(sensor.name)) {
                        state.sensors.set(sensor.id, sensor);
                        state.sensorsByName.set(sensor.name, sensor);
                        totalLoaded++;
                    }
                });
            }
        }

        // Если ничего не загрузилось, пробуем SharedMemory как fallback
        if (totalLoaded === 0) {
            console.log('Конфиг датчиков пуст, загружаю из SharedMemory...');
            const data = await fetchSMSensors();
            if (data.sensors) {
                data.sensors.forEach(sensor => {
                    state.sensors.set(sensor.id, sensor);
                    state.sensorsByName.set(sensor.name, sensor);
                    // SM events идут с serverId='sm' (см. SM_SERVER_ID).
                    const key = makeSensorKey(SM_SERVER_ID, 'SharedMemory', sensor.name);
                    state.sensorsByKey.set(key, sensor);
                });
            }
        }

        console.log(`Загружено ${state.sensors.size} сенсоров`);
    } catch (err) {
        console.error('Error загрузки конфигурации сенсоров:', err);
    }
}

// Получить информацию о сенсоре по ID или имени.
// На multi-server панели возвращает первый встретившийся sensor с этим именем
// (см. комментарий к state.sensorsByName). Для multi-server-точного lookup
// используй getSensorInfoByKey(serverId, objectName, sensorName).
function getSensorInfo(idOrName) {
    if (typeof idOrName === 'number') {
        return state.sensors.get(idOrName);
    }
    return state.sensorsByName.get(idOrName);
}

// Multi-server-aware lookup. Принимает либо готовый sensorKey, либо
// (serverId, objectName, sensorName). Если такого ключа нет — fallback на
// short-name lookup, чтобы данные старых одно-серверных setup'ов не
// «терялись» (не критично, потому что там single-server и конфликта нет).
function getSensorInfoByKey(serverIdOrKey, objectName, sensorName) {
    const key = sensorName === undefined
        ? serverIdOrKey
        : makeSensorKey(serverIdOrKey, objectName, sensorName);
    const found = state.sensorsByKey.get(key);
    if (found) return found;
    // Fallback by short name. parseSensorKey работает только если key — наш
    // строковый формат; если caller передал что-то другое, просто skip.
    const parsed = typeof key === 'string' ? parseSensorKey(key) : null;
    return parsed ? state.sensorsByName.get(parsed.sensorName) : undefined;
}

if (typeof globalThis !== 'undefined') {
    globalThis.getSensorInfoByKey = getSensorInfoByKey;
}

// Проверить, является ли сигнал дискретным
function isDiscreteSignal(sensor) {
    if (!sensor) return false;
    return sensor.isDiscrete === true || sensor.iotype === 'DI' || sensor.iotype === 'DO';
}



// === 41-dialogs.js ===
// === IONC Action Dialog ===

const ioncDialogState = {
    isOpen: false,
    onConfirm: null,
    onCancel: null
};

function openIoncDialog(options) {
    const { title, body, footer, onConfirm, onCancel, focusInput } = options;

    const overlay = document.getElementById('ionc-dialog-overlay');
    const titleEl = document.getElementById('ionc-dialog-title');
    const bodyEl = document.getElementById('ionc-dialog-body');
    const footerEl = document.getElementById('ionc-dialog-footer');
    const errorEl = document.getElementById('ionc-dialog-error');

    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    footerEl.innerHTML = footer;
    errorEl.textContent = '';

    ioncDialogState.isOpen = true;
    ioncDialogState.onConfirm = onConfirm;
    ioncDialogState.onCancel = onCancel;

    overlay.classList.add('visible');

    // Focus input if specified (use setTimeout to ensure element is visible)
    if (focusInput) {
        setTimeout(() => {
            const input = bodyEl.querySelector('input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 50);
    }

    // Add ESC handler (remove old one first to prevent duplicates)
    document.removeEventListener('keydown', handleIoncDialogKeydown);
    document.addEventListener('keydown', handleIoncDialogKeydown);
}

function closeIoncDialog() {
    const overlay = document.getElementById('ionc-dialog-overlay');
    overlay.classList.remove('visible');
    ioncDialogState.isOpen = false;
    ioncDialogState.onConfirm = null;
    ioncDialogState.onCancel = null;
    document.removeEventListener('keydown', handleIoncDialogKeydown);
}

function handleIoncDialogKeydown(e) {
    if (!ioncDialogState.isOpen) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        if (ioncDialogState.onCancel) {
            ioncDialogState.onCancel();
        }
        closeIoncDialog();
    } else if (e.key === 'Enter') {
        const input = document.querySelector('#ionc-dialog-body input');
        if (input && document.activeElement === input) {
            e.preventDefault();
            if (ioncDialogState.onConfirm) {
                ioncDialogState.onConfirm();
            }
        }
    }
}

function showIoncDialogError(message) {
    const errorEl = document.getElementById('ionc-dialog-error');
    errorEl.textContent = message;
}

// === Sensor Dialog ===

// Status диалога датчиков
const sensorDialogState = {
    objectName: null,
    allSensors: [],
    filteredSensors: [],
    addedSensors: new Set() // датчики уже добавленные на график для текущего объекта
};

// Открыть диалог выбора датчика
// tabKey - ключ вкладки (serverId:objectName)
function openSensorDialog(tabKey) {
    sensorDialogState.objectName = tabKey;

    // Получаем displayName для localStorage (без serverId)
    const tabState = state.tabs.get(tabKey);
    const displayName = tabState?.displayName || tabKey;

    // Загрузить список уже добавленных внешних датчиков (по tabKey, fallback на displayName)
    sensorDialogState.addedSensors = getExternalSensorsFromStorage(tabKey, displayName);

    const overlay = document.getElementById('sensor-dialog-overlay');
    const filterInput = document.getElementById('sensor-filter-input');

    overlay.classList.add('visible');
    filterInput.value = '';
    filterInput.focus();

    // Определяем serverId текущей вкладки для per-server загрузки
    const serverId = tabState?.serverId || '';

    // Определяем источник датчиков в зависимости от smEnabled
    if (state.capabilities.smEnabled) {
        // SM включен - загружаем датчики из XML конфига (per-server)
        renderSensorDialogContent('<div class="sensor-dialog-loading">Loading sensor list...</div>');
        fetchSensorsForServer(serverId).then(sensors => {
            sensorDialogState.allSensors = sensors;
            sensorDialogState.filteredSensors = [...sensors];
            renderSensorTable();
        }).catch(err => {
            renderSensorDialogContent('<div class="sensor-dialog-empty">Error loading sensors</div>');
        });
    } else {
        // SM не настроен - показываем датчики из IONC таблицы
        const ioncTabState = state.tabs.get(tabKey);
        if (ioncTabState && ioncTabState.renderer && ioncTabState.renderer.sensors) {
            prepareSensorListFromIONC(ioncTabState.renderer.sensors);
            renderSensorTable();
        } else {
            renderSensorDialogContent('<div class="sensor-dialog-empty">No sensors in IONC table</div>');
        }
    }

    // Обработчик фильтра
    filterInput.oninput = () => {
        filterSensors(filterInput.value);
        renderSensorTable();
    };

    // Обработчик ESC
    document.addEventListener('keydown', handleSensorDialogKeydown);
}

// Close диалог
function closeSensorDialog() {
    const overlay = document.getElementById('sensor-dialog-overlay');
    overlay.classList.remove('visible');
    sensorDialogState.objectName = null;
    document.removeEventListener('keydown', handleSensorDialogKeydown);
}

// Обработка ESC
function handleSensorDialogKeydown(e) {
    if (e.key === 'Escape') {
        const filterInput = document.getElementById('sensor-filter-input');

        // Если есть фильтр — сбросить его и убрать фокус
        if (filterInput.value) {
            filterInput.value = '';
            filterInput.blur();
            filterSensors('');
            renderSensorTable();
        } else {
            // Иначе закрыть диалог
            closeSensorDialog();
        }
        e.preventDefault();
    }
}

// Подготовить список датчиков из IONC таблицы
function prepareSensorListFromIONC(ioncSensors) {
    // Преобразуем формат IONC датчиков в формат диалога
    sensorDialogState.allSensors = ioncSensors.map(sensor => ({
        id: sensor.id,
        name: sensor.name,
        textname: '', // IONC датчики не имеют текстового описания
        iotype: sensor.type // 'type' в IONC -> 'iotype' в диалоге
    }));
    sensorDialogState.filteredSensors = [...sensorDialogState.allSensors];
}

// Filterация датчиков
function filterSensors(query) {
    if (!query) {
        sensorDialogState.filteredSensors = [...sensorDialogState.allSensors];
        return;
    }

    const lowerQuery = query.toLowerCase();
    sensorDialogState.filteredSensors = sensorDialogState.allSensors.filter(sensor => {
        return (sensor.name && sensor.name.toLowerCase().includes(lowerQuery)) ||
               (sensor.textname && sensor.textname.toLowerCase().includes(lowerQuery)) ||
               (sensor.iotype && sensor.iotype.toLowerCase().includes(lowerQuery));
    });
}

// Рендер содержимого диалога
function renderSensorDialogContent(html) {
    document.getElementById('sensor-dialog-content').innerHTML = html;
}

// Рендер таблицы датчиков
function renderSensorTable() {
    const sensors = sensorDialogState.filteredSensors;
    const countEl = document.getElementById('sensor-dialog-count');

    countEl.textContent = `${sensors.length} датчиков`;

    if (sensors.length === 0) {
        renderSensorDialogContent('<div class="sensor-dialog-empty">Sensors not found</div>');
        return;
    }

    const rows = sensors.map(sensor => {
        const isAdded = sensorDialogState.addedSensors.has(sensor.name);
        const btnText = isAdded ? '✓' : '+';
        const btnDisabled = isAdded ? 'disabled' : '';
        const btnTitle = isAdded ? 'Already added' : 'Add to chart';

        return `
            <tr>
                <td>
                    <button class="sensor-add-btn" ${btnDisabled} title="${btnTitle}"
                            data-object="${escapeAttr(sensorDialogState.objectName)}"
                            data-sensor="${escapeAttr(sensor.name)}">${btnText}</button>
                </td>
                <td>${sensor.id}</td>
                <td class="sensor-name">${escapeHtml(sensor.name)}</td>
                <td>${escapeHtml(sensor.textname || '')}</td>
                <td class="sensor-type">${escapeHtml(sensor.iotype || '')}</td>
            </tr>
        `;
    }).join('');

    renderSensorDialogContent(`
        <table class="sensor-table">
            <thead>
                <tr>
                    <th style="width: 40px"></th>
                    <th style="width: 60px">ID</th>
                    <th>Name</th>
                    <th>Описание</th>
                    <th style="width: 50px">Type</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `);

    // Навешиваем обработчики клика программно (вместо inline onclick)
    const container = document.getElementById('sensor-dialog-content');
    container.querySelectorAll('.sensor-add-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            addExternalSensor(btn.dataset.object, btn.dataset.sensor);
        });
    });
}

// Экранирование HTML
// escapeHtml() определена в 06-utils.js

// Подписаться на внешние датчики через API
// tabKey - ключ вкладки (serverId:objectName)
async function subscribeToExternalSensors(tabKey, sensorNames) {
    try {
        const tabState = state.tabs.get(tabKey);
        const serverId = tabState?.serverId;
        const objectName = tabState?.displayName || tabKey;

        let url = `/api/objects/${encodeURIComponent(objectName)}/external-sensors`;
        if (serverId) {
            url += `?server=${encodeURIComponent(serverId)}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensors: sensorNames })
        });
        if (!response.ok) {
            const err = await response.json();
            console.warn('Error подписки на датчики:', err.error || response.statusText);
        }
    } catch (err) {
        console.warn('Error подписки на датчики:', err);
    }
}

// Отписаться от внешнего датчика через API
// tabKey - ключ вкладки (serverId:objectName)
async function unsubscribeFromExternalSensor(tabKey, sensorName) {
    try {
        const tabState = state.tabs.get(tabKey);
        const serverId = tabState?.serverId;
        const objectName = tabState?.displayName || tabKey;

        let url = `/api/objects/${encodeURIComponent(objectName)}/external-sensors/${encodeURIComponent(sensorName)}`;
        if (serverId) {
            url += `?server=${encodeURIComponent(serverId)}`;
        }

        const response = await fetch(url, { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json();
            console.warn('Error отписки от датчика:', err.error || response.statusText);
        }
    } catch (err) {
        console.warn('Error отписки от датчика:', err);
    }
}

// Подписаться на IONC датчик через API
// tabKey - ключ вкладки (serverId:objectName)
async function subscribeToIONCSensor(tabKey, sensorId) {
    try {
        const tabState = state.tabs.get(tabKey);
        const serverId = tabState?.serverId;
        const objectName = tabState?.displayName || tabKey;

        let url = `/api/objects/${encodeURIComponent(objectName)}/ionc/subscribe`;
        if (serverId) {
            url += `?server=${encodeURIComponent(serverId)}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensor_ids: [sensorId] })
        });
        if (!response.ok) {
            const err = await response.json();
            console.warn('Error подписки на IONC датчик:', err.error || response.statusText);
        } else {
            // Добавляем в список подписок рендерера
            if (tabState && tabState.renderer && tabState.renderer.subscribedSensorIds) {
                tabState.renderer.subscribedSensorIds.add(sensorId);
            }
            console.log(`IONC: Подписка на датчик ${sensorId} для ${objectName} (server: ${serverId})`);
        }
    } catch (err) {
        console.warn('Error подписки на IONC датчик:', err);
    }
}

// Отписаться от IONC датчика через API
// tabKey - ключ вкладки (serverId:objectName)
async function unsubscribeFromIONCSensor(tabKey, sensorId) {
    try {
        const tabState = state.tabs.get(tabKey);
        const serverId = tabState?.serverId;
        const objectName = tabState?.displayName || tabKey;

        let url = `/api/objects/${encodeURIComponent(objectName)}/ionc/unsubscribe`;
        if (serverId) {
            url += `?server=${encodeURIComponent(serverId)}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensor_ids: [sensorId] })
        });
        if (!response.ok) {
            const err = await response.json();
            console.warn('Error отписки от IONC датчика:', err.error || response.statusText);
        } else {
            // Удаляем из списка подписок рендерера
            if (tabState && tabState.renderer && tabState.renderer.subscribedSensorIds) {
                tabState.renderer.subscribedSensorIds.delete(sensorId);
            }
            console.log(`IONC: Отписка от датчика ${sensorId} для ${objectName} (server: ${serverId})`);
        }
    } catch (err) {
        console.warn('Error отписки от IONC датчика:', err);
    }
}

// Add external sensor на график
// tabKey - ключ вкладки (serverId:objectName)
function addExternalSensor(tabKey, sensorName) {
    let sensor;

    // Получаем displayName для localStorage (без serverId)
    const tabState = state.tabs.get(tabKey);
    const displayName = tabState?.displayName || tabKey;

    if (state.capabilities.smEnabled) {
        // SM включен - ищем датчик в глобальном списке
        sensor = state.sensorsByName.get(sensorName);
    } else {
        // SM выключен - ищем датчик в списке диалога (из IONC)
        sensor = sensorDialogState.allSensors.find(s => s.name === sensorName);
    }

    if (!sensor) {
        console.error('Sensor not found:', sensorName);
        return;
    }

    // Добавляем в список добавленных (сохраняем полные данные)
    sensorDialogState.addedSensors.set(sensorName, {
        id: sensor.id,
        name: sensor.name,
        textname: sensor.textname || sensor.name,
        iotype: sensor.iotype || sensor.type,
        value: sensor.value
    });

    // Сохраняем в localStorage (используем tabKey)
    saveExternalSensorsToStorage(tabKey, sensorDialogState.addedSensors);

    // Создаём график для внешнего датчика (используем tabKey)
    createExternalSensorChart(tabKey, sensor);

    // Обновляем таблицу (чтобы кнопка стала disabled)
    renderSensorTable();

    console.log(`External sensor added ${sensorName} для ${displayName}`);

    if (state.capabilities.smEnabled) {
        // SM включен - подписываемся через SM API
        subscribeToExternalSensors(tabKey, [sensorName]);
    } else {
        // SM выключен - подписываемся через IONC API
        subscribeToIONCSensor(tabKey, sensor.id);
    }
}

// Создать график для внешнего датчика
// tabKey - ключ для state.tabs (serverId:objectName)
// options.badge - текст badge ('SM', 'MB', null для скрытия)
// options.prefix - префикс для varName (по умолчанию 'ext')
function createExternalSensorChart(tabKey, sensor, options = {}) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    // Используем displayName из tabState для ID элементов (без serverId)
    const objectName = tabState.displayName;
    const prefix = options.prefix || 'ext';
    const varName = `${prefix}:${sensor.name}`; // Префикс для идентификации источника

    // Проверяем, не создан ли уже график
    if (tabState.charts.has(varName)) {
        console.log(`График для ${varName} уже существует`);
        return;
    }

    const displayName = sensor.textname || sensor.name;
    const isDiscrete = isDiscreteSignal(sensor);
    const color = getNextColor();

    // Создаём панель графика
    const chartsContainer = getElementInTab(tabKey, `charts-${objectName}`);
    if (!chartsContainer) return;

    // Используем CSS-безопасный ID (заменяем : на -)
    const safeVarName = varName.replace(/:/g, '-');

    // Находим supplier из данных рендерера (если есть)
    let supplierText = '';
    if (tabState.renderer && tabState.renderer.allSensors) {
        const sData = tabState.renderer.allSensors.find(s => s.id === sensor.id);
        if (sData && sData.supplier) {
            supplierText = sData.supplier;
        }
    }

    // Badge: SM для SharedMemory, MB для Modbus, или скрыт
    const badge = options.badge !== undefined ? options.badge : 'SM';
    const badgeHtml = badge ? `<span class="chart-panel-badge ${badge === 'SM' ? 'external-badge' : 'modbus-badge'}">${badge}</span>` : '';

    const chartDiv = document.createElement('div');
    chartDiv.className = 'chart-panel external-sensor-chart';
    chartDiv.id = `chart-panel-${objectName}-${safeVarName}`;
    chartDiv.innerHTML = `
        <div class="chart-panel-header">
            <div class="chart-panel-info">
                <span class="legend-color-picker" data-object="${tabKey}" data-variable="${varName}" style="background:${color}" title="Click to choose color"></span>
                <span class="chart-panel-title">${escapeHtml(displayName)}</span>
                <span class="chart-panel-value" id="legend-value-${objectName}-${safeVarName}">--</span>
                <span class="chart-panel-supplier" id="legend-supplier-${objectName}-${safeVarName}">${escapeHtml(supplierText)}</span>
                <span class="chart-panel-textname">${escapeHtml(sensor.name)}</span>
                <span class="type-badge type-${sensor.iotype || 'unknown'}">${sensor.iotype || '?'}</span>
                ${badgeHtml}
            </div>
            <div class="chart-panel-right">
                ${!isDiscrete ? `
                <label class="fill-toggle" title="Smooth line (bezier curves)">
                    <input type="checkbox" id="smooth-${objectName}-${safeVarName}" checked>
                    <span class="fill-toggle-label">smooth</span>
                </label>
                ` : ''}
                <label class="fill-toggle" title="Fill background">
                    <input type="checkbox" id="fill-${objectName}-${safeVarName}" checked>
                    <span class="fill-toggle-label">fill</span>
                </label>
                <button class="chart-remove-btn" title="Remove from chart">✕</button>
            </div>
        </div>
        <div class="chart-wrapper">
            <canvas id="canvas-${objectName}-${safeVarName}"></canvas>
        </div>
    `;

    chartsContainer.appendChild(chartDiv);

    // Получаем диапазон времени
    const timeRange = getTimeRangeForObject(objectName);
    const fillEnabled = true;
    const steppedEnabled = isDiscrete;

    // Создаём Chart.js график
    const ctx = getElementInTab(tabKey, `canvas-${objectName}-${safeVarName}`).getContext('2d');
    const chartConfig = {
        type: 'line',
        data: {
            datasets: [{
                label: displayName,
                data: [],
                borderColor: color,
                backgroundColor: `${color}20`,
                fill: fillEnabled,
                tension: isDiscrete ? 0 : 0.3,
                stepped: isDiscrete ? 'before' : false,
                pointRadius: 0,
                borderWidth: isDiscrete ? 2 : 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: 'index'
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
                        maxTicksLimit: 10,
                        display: true
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
                    beginAtZero: isDiscrete,
                    suggestedMin: isDiscrete ? 0 : undefined,
                    suggestedMax: isDiscrete ? 1.1 : undefined,
                    grid: {
                        color: '#333840',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8a9099',
                        stepSize: isDiscrete ? 1 : undefined
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#22252a',
                    titleColor: '#d8dce2',
                    bodyColor: '#d8dce2',
                    borderColor: '#333840',
                    borderWidth: 1
                }
            }
        }
    };

    const chart = new Chart(ctx, chartConfig);

    // Синхронизируем все графики после добавления нового
    syncAllChartsTimeRange(tabKey);

    // Сохраняем в состояние (используем оригинальный varName для ключа)
    tabState.charts.set(varName, {
        chart,
        isDiscrete,
        displayName,
        color,
        safeVarName // сохраняем для обновления DOM элементов
    });

    // Устанавливаем начальное время если это первый график
    if (!tabState.chartStartTime) {
        tabState.chartStartTime = Date.now();
    }

    // Добавляем начальную точку с текущим значением
    if (sensor.value !== undefined) {
        const now = new Date();
        chart.data.datasets[0].data.push({ x: now, y: sensor.value });
        chart.update('none');

        // Обновляем легенду
        const legendEl = getElementInTab(tabKey, `legend-value-${objectName}-${safeVarName}`);
        if (legendEl) {
            legendEl.textContent = formatValue(sensor.value);
        }
    }

    // Обработчик удаления (передаём tabKey, а не objectName)
    chartDiv.querySelector('.chart-remove-btn').addEventListener('click', () => {
        removeExternalSensor(tabKey, sensor.name, { prefix });
    });

    // Обработчик чекбокса заливки
    const fillCheckbox = getElementInTab(tabKey, `fill-${objectName}-${safeVarName}`);
    if (fillCheckbox) {
        fillCheckbox.addEventListener('change', (e) => {
            chart.data.datasets[0].fill = e.target.checked;
            chart.update('none');
        });
    }

    // Обработчик чекбокса сглаживания (только для аналоговых)
    const smoothCheckbox = getElementInTab(tabKey, `smooth-${objectName}-${safeVarName}`);
    if (smoothCheckbox) {
        smoothCheckbox.addEventListener('change', (e) => {
            chart.data.datasets[0].tension = e.target.checked ? 0.3 : 0;
            chart.update('none');
        });
    }
}

// Добавить график для внешнего датчика (обёртка над createExternalSensorChart)
// tabKey - ключ для state.tabs (serverId:objectName)
// varName - имя переменной с префиксом (например ws:SensorName)
// sensorId - ID датчика
// textname - отображаемое имя датчика
// options.badge - текст badge ('WS', 'MB', 'SM')
// options.prefix - префикс для varName (например 'ws')
function addExternalSensorChart(tabKey, varName, sensorId, textname, options = {}) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    // Проверяем, не создан ли уже график
    if (tabState.charts.has(varName)) {
        console.log(`График для ${varName} уже существует`);
        return;
    }

    // Извлекаем имя датчика из varName (убираем prefix)
    const prefix = options.prefix || 'ext';
    const sensorName = varName.startsWith(prefix + ':') ? varName.substring(prefix.length + 1) : varName;

    // Получаем информацию о датчике из кэша
    const sensorInfo = getSensorInfo(sensorId) || getSensorInfo(sensorName);

    // Создаём объект sensor для createExternalSensorChart
    const sensor = {
        id: sensorId,
        name: sensorName,
        textname: textname || sensorInfo?.textname || sensorName,
        iotype: sensorInfo?.iotype || 'AI',
        value: sensorInfo?.value
    };

    // Вызываем createExternalSensorChart
    createExternalSensorChart(tabKey, sensor, options);
}

// Удалить внешний датчик с графика
// tabKey - ключ для state.tabs (serverId:objectName)
// options.prefix - префикс для varName (по умолчанию 'ext')
function removeExternalSensor(tabKey, sensorName, options = {}) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    // Используем displayName из tabState для ID элементов (без serverId)
    const objectName = tabState.displayName;
    const prefix = options.prefix || 'ext';
    const varName = `${prefix}:${sensorName}`;
    const safeVarName = varName.replace(/:/g, '-');

    // Удаляем график
    const chartData = tabState.charts.get(varName);
    if (chartData) {
        chartData.chart.destroy();
        tabState.charts.delete(varName);
    }

    // Удаляем DOM элемент (используем safeVarName)
    const chartPanel = getElementInTab(tabKey, `chart-panel-${objectName}-${safeVarName}`);
    if (chartPanel) {
        chartPanel.remove();
    }

    // Удаляем из localStorage (используем tabKey как ключ)
    const addedSensors = getExternalSensorsFromStorage(tabKey, objectName);
    addedSensors.delete(sensorName);
    saveExternalSensorsToStorage(tabKey, addedSensors);

    // Находим сенсор для получения ID
    let sensor;
    if (state.capabilities.smEnabled) {
        sensor = state.sensorsByName.get(sensorName);
    } else {
        // Когда SM выключен, ищем в рендерере
        if (tabState && tabState.renderer && tabState.renderer.sensors) {
            sensor = tabState.renderer.sensors.find(s => s.name === sensorName);
        }
    }

    // Снять галочку в таблице IONC (по sensor.id)
    if (sensor) {
        const ioncCheckbox = getElementInTab(tabKey, `ionc-chart-${objectName}-ionc-${sensor.id}`);
        if (ioncCheckbox) {
            ioncCheckbox.checked = false;
        }
    }

    // Снять галочку в любой таблице по data-sensor-name (Modbus, OPCUA и др.).
    // Scoped lookup: при дубликате sensorName на разных вкладках нельзя снимать
    // галочку в чужой вкладке (правило DOM lookup из CLAUDE.md).
    const chartCheckboxes = getElementsInTab(tabKey, `.chart-checkbox[data-sensor-name="${CSS.escape(sensorName)}"]`);
    if (chartCheckboxes && chartCheckboxes.length > 0) {
        chartCheckboxes[0].checked = false;
    }

    // Снять галочку в таблице UWebSocketGate (по data-name)
    const uwsgateCheckbox = getElementsInTab(tabKey, `.uwsgate-chart-checkbox[data-name="${CSS.escape(sensorName)}"]`);
    if (uwsgateCheckbox && uwsgateCheckbox.length > 0) {
        uwsgateCheckbox[0].checked = false;
    }

    // Обновляем состояние диалога если открыт
    if (sensorDialogState.objectName === objectName) {
        sensorDialogState.addedSensors.delete(sensorName);
        renderSensorTable();
    }

    console.log(`Удалён внешний датчик ${sensorName} для ${tabKey}`);

    // Отписываемся от датчика через API
    if (state.capabilities.smEnabled) {
        unsubscribeFromExternalSensor(tabKey, sensorName);
    } else if (sensor) {
        unsubscribeFromIONCSensor(tabKey, sensor.id);
    }
}

// Загрузить внешние датчики из localStorage
// Возвращает Map<sensorName, sensorData> для обратной совместимости с Set API (.has, .add, .delete)
function getExternalSensorsFromStorage(tabKey, objectName) {
    try {
        // Пробуем по tabKey, потом fallback на objectName (обратная совместимость)
        const keyByTab = `uniset-panel-external-sensors-${tabKey}`;
        const keyByObj = `uniset-panel-external-sensors-${objectName}`;
        const data = localStorage.getItem(keyByTab) || (objectName ? localStorage.getItem(keyByObj) : null);
        if (data) {
            const parsed = JSON.parse(data);
            // Обратная совместимость: если это массив строк (старый формат), конвертируем
            if (Array.isArray(parsed)) {
                const map = new Map();
                parsed.forEach(item => {
                    if (typeof item === 'string') {
                        // Старый формат: только имя
                        map.set(item, { name: item });
                    } else if (item && item.name) {
                        // Новый формат: объект с данными
                        map.set(item.name, item);
                    }
                });
                return map;
            }
        }
    } catch (err) {
        console.warn('Error загрузки внешних датчиков:', err);
    }
    return new Map();
}

// Save внешние датчики в localStorage
function saveExternalSensorsToStorage(tabKey, sensors) {
    try {
        const key = `uniset-panel-external-sensors-${tabKey}`;
        // sensors - это Map<name, sensorData>
        const arr = [...sensors.values()];
        localStorage.setItem(key, JSON.stringify(arr));
    } catch (err) {
        console.warn('Error сохранения внешних датчиков:', err);
    }
}

// Восстановить внешние датчики при открытии вкладки
// tabKey - ключ для state.tabs (формат: serverId:objectName)
// displayName - имя объекта для отображения и localStorage
function restoreExternalSensors(tabKey, displayName) {
    const sensors = getExternalSensorsFromStorage(tabKey, displayName);
    if (sensors.size === 0) return;

    // Теперь sensors - это Map<name, sensorData>
    // Используем сохранённые данные напрямую, без необходимости искать в state

    let attempts = 0;
    const restoreSensors = () => {
        const tabState = state.tabs.get(tabKey);
        if (!tabState) {
            if (++attempts > RESTORE_SENSORS_MAX_ATTEMPTS) return;
            setTimeout(restoreSensors, 100);
            return;
        }

        const restoredSensorIds = [];
        const restoredSensorNames = [];

        sensors.forEach((sensorData, sensorName) => {
            // Если у нас есть полные данные (новый формат), используем их напрямую
            if (sensorData.id) {
                const sensor = {
                    id: sensorData.id,
                    name: sensorData.name,
                    textname: sensorData.textname || sensorData.name,
                    iotype: sensorData.iotype || sensorData.type,
                    value: sensorData.value
                };
                // Используем сохранённые опции графика (badge, prefix) или дефолтные
                const chartOptions = sensorData.chartOptions || { badge: 'SM', prefix: 'ext' };
                createExternalSensorChart(tabKey, sensor, chartOptions);
                restoredSensorIds.push(sensorData.id);
                restoredSensorNames.push(sensorName);

                // Добавляем в state.sensorsByName если его там нет
                if (!state.sensorsByName.has(sensorName)) {
                    state.sensorsByName.set(sensorName, sensor);
                    state.sensors.set(sensor.id, sensor);
                }
                // Multi-server-aware: scoped запись по (tabKey serverId, objectName).
                // tabKey формата `${serverId}:${objectName}` — split по первому ':'.
                const _idx = tabKey.indexOf(':');
                const _serverId = _idx >= 0 ? tabKey.slice(0, _idx) : '';
                const _objectName = _idx >= 0 ? tabKey.slice(_idx + 1) : tabKey;
                state.sensorsByKey.set(
                    makeSensorKey(_serverId, _objectName, sensorName),
                    sensor
                );
            } else {
                // Старый формат: только имя - пробуем найти в state или renderer
                let sensor = state.sensorsByName.get(sensorName);
                if (!sensor && tabState.renderer && tabState.renderer.sensors) {
                    sensor = tabState.renderer.sensors.find(s => s.name === sensorName);
                    if (sensor) {
                        sensor = {
                            id: sensor.id,
                            name: sensor.name,
                            textname: '',
                            iotype: sensor.type || sensor.iotype,
                            value: sensor.value
                        };
                    }
                }
                if (sensor) {
                    createExternalSensorChart(tabKey, sensor);
                    restoredSensorIds.push(sensor.id);
                    restoredSensorNames.push(sensorName);
                } else {
                    console.warn(`Датчик ${sensorName} не найден (старый формат)`);
                }
            }
        });

        // Подписываемся на все восстановленные датчики
        if (restoredSensorIds.length > 0) {
            if (state.capabilities.smEnabled) {
                subscribeToExternalSensors(tabKey, restoredSensorNames);
            } else if (tabState.renderer && tabState.renderer.subscribedSensorIds) {
                // IONC подписка
                const serverId = tabState.serverId;
                let url = `/api/objects/${encodeURIComponent(displayName)}/ionc/subscribe`;
                if (serverId) {
                    url += `?server=${encodeURIComponent(serverId)}`;
                }
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensor_ids: restoredSensorIds })
                }).then(response => {
                    if (response.ok) {
                        restoredSensorIds.forEach(id => {
                            tabState.renderer.subscribedSensorIds.add(id);
                        });
                    }
                }).catch(err => {
                    console.warn('Error восстановления подписок:', err);
                });
            }
        }

        console.log(`Восстановлено ${restoredSensorIds.length} датчиков на графике для ${displayName}`);
    };

    // Даём время на инициализацию вкладки
    setTimeout(restoreSensors, 200);
}

// Загрузка сенсоров для конкретного сервера
async function fetchSensorsForServer(serverId) {
    const param = serverId ? `?server=${encodeURIComponent(serverId)}` : '';
    const response = await fetch(`/api/sensors${param}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.sensors || [];
}

// UI функции


// === 41-sensor-autocomplete.js ===
// ============================================================================
// setupSensorAutocomplete — переиспользуемый IONC sensor selector.
//
// Привязывается к input'у. По вводу — debounce, fetch к
// /api/objects/{objectName}/ionc/sensors?server=...&search=...&limit=20,
// показывает выпадающий suggest. Клик/Enter — подставляет name + сохраняет
// числовой id в hidden input. Стрелки ↑↓ — навигация. Esc — закрыть.
// При смене objectName (через resetOnObjectChange()) — очищает выбор.
// ============================================================================

const SENSOR_AUTOCOMPLETE_DEBOUNCE_MS = 150;
const SENSOR_AUTOCOMPLETE_LIMIT = 20;
// На focus показываем top-N из IONC объекта (без search фильтра), чтобы юзер
// сразу видел ассортимент, а не результат поиска по уже введённому тексту
// (typically — имя сохранённого sensor'а из existing config). Spec требует 10.
const SENSOR_AUTOCOMPLETE_FOCUS_LIMIT = 10;

function setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId) {
    if (!inputEl) return null;

    let dropdown = null;
    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];

    function destroyDropdown() {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        activeIndex = -1;
        currentItems = [];
    }

    function buildDropdown() {
        destroyDropdown();
        dropdown = document.createElement('div');
        dropdown.className = 'sensor-autocomplete-dropdown';
        // Положение — fixed с подсчётом координат относительно input'а.
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.bottom + 2}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.zIndex = '10000';
        document.body.appendChild(dropdown);
    }

    function renderItems(items) {
        if (!dropdown) return;
        currentItems = items;
        if (items.length === 0) {
            dropdown.innerHTML = '<div class="sensor-autocomplete-empty">Не найдено</div>';
            return;
        }
        dropdown.innerHTML = items.map((s, idx) => `
            <div class="sensor-autocomplete-item ${idx === activeIndex ? 'active' : ''}"
                 data-idx="${idx}"
                 data-id="${s.id}"
                 data-name="${escapeAttr(s.name)}">
                <div class="sensor-autocomplete-name">${escapeHtml(s.name)}</div>
                <div class="sensor-autocomplete-meta">id=${s.id} · type=${escapeHtml(s.type || '?')} · value=${s.value ?? '—'}</div>
            </div>
        `).join('');
        dropdown.querySelectorAll('.sensor-autocomplete-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent input blur before we read values
                pickItem(parseInt(el.dataset.idx, 10));
            });
        });
    }

    function pickItem(idx) {
        const item = currentItems[idx];
        if (!item) return;
        inputEl.value = item.name;
        if (hiddenIdEl) hiddenIdEl.value = String(item.id);
        destroyDropdown();
    }

    async function fetchAndShow(searchText, options = {}) {
        const limit = options.limit ?? SENSOR_AUTOCOMPLETE_LIMIT;
        const objectName = (getObjectName && getObjectName()) || 'SharedMemory';
        const serverId = (getServerId && getServerId()) || '';
        if (!serverId) {
            buildDropdown();
            renderItems([]);
            return;
        }
        try {
            const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors`
                + `?server=${encodeURIComponent(serverId)}`
                + (searchText ? `&search=${encodeURIComponent(searchText)}` : '')
                + `&limit=${limit}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                buildDropdown();
                renderItems([]);
                return;
            }
            const data = await resp.json();
            const items = data.sensors || [];
            buildDropdown();
            activeIndex = -1;
            renderItems(items);
        } catch (e) {
            console.warn('sensor autocomplete fetch failed:', e);
        }
    }

    inputEl.addEventListener('focus', () => {
        // Focus всегда показывает top-N (limit=10) без search-фильтра — иначе при
        // editing existing config dropdown забит результатами по уже выбранному
        // имени, что бесполезно для просмотра «что ещё есть на этом объекте».
        fetchAndShow('', { limit: SENSOR_AUTOCOMPLETE_FOCUS_LIMIT });
    });

    inputEl.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchAndShow(inputEl.value.trim()),
            SENSOR_AUTOCOMPLETE_DEBOUNCE_MS);
    });

    inputEl.addEventListener('keydown', (e) => {
        if (!dropdown || currentItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            renderItems(currentItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderItems(currentItems);
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
                e.preventDefault();
                pickItem(activeIndex);
            }
        } else if (e.key === 'Escape') {
            destroyDropdown();
        }
    });

    inputEl.addEventListener('blur', () => {
        // Delay so click on dropdown item fires first (mousedown handler runs).
        setTimeout(destroyDropdown, 150);
    });

    return {
        // Каллер вызывает при смене IONC объекта в форме конфига.
        resetOnObjectChange() {
            inputEl.value = '';
            if (hiddenIdEl) hiddenIdEl.value = '';
            destroyDropdown();
        },
        destroy() {
            destroyDropdown();
        }
    };
}

window.setupSensorAutocomplete = setupSensorAutocomplete;


// === 50-ui-tabs.js ===
function renderObjectsList(data) {
    const list = document.getElementById('objects-list');
    list.innerHTML = '';

    // Проверяем есть ли хоть что-то для отображения (данные или кеш)
    let hasAnyObjects = false;
    if (data && data.objects) {
        for (const serverData of data.objects) {
            const existingServer = state.servers.get(serverData.serverId);
            const apiObjects = serverData.objects || [];
            const cachedObjects = existingServer?.cachedObjects || [];
            if (apiObjects.length > 0 || cachedObjects.length > 0) {
                hasAnyObjects = true;
                break;
            }
        }
    }

    if (!hasAnyObjects) {
        list.innerHTML = '<li class="loading">No objects found</li>';
        renderServersSection();
        return;
    }

    // data.objects - массив { serverId, serverName, objects: [...] }
    data.objects.forEach(serverData => {
        const serverId = serverData.serverId;
        const serverName = serverData.serverName || serverId;
        const serverConnected = serverData.connected !== false;
        const apiObjects = serverData.objects || [];

        // Получаем существующий сервер из state
        const existingServer = state.servers.get(serverId);

        // Определяем какие объекты отображать
        let objectsToRender;
        if (serverConnected && apiObjects.length > 0) {
            // Сервер подключен и есть объекты - обновляем кеш и используем их
            objectsToRender = apiObjects;
            if (existingServer) {
                existingServer.cachedObjects = [...apiObjects];
            }
        } else if (!serverConnected && existingServer?.cachedObjects?.length > 0) {
            // Сервер отключен - используем кешированные объекты
            objectsToRender = existingServer.cachedObjects;
        } else {
            // Нет ни данных, ни кеша - пропускаем
            objectsToRender = apiObjects;
        }

        const objectCount = objectsToRender.length;

        // Обновляем информацию о сервере в state
        if (existingServer) {
            existingServer.objectCount = objectCount;
        }

        if (objectCount === 0) return;

        // Создаём группу для сервера
        const group = document.createElement('div');
        group.className = 'server-group';
        group.dataset.serverId = serverId;
        if (state.collapsedServerGroups.has(serverId)) {
            group.classList.add('collapsed');
        }

        // Заголовок группы
        const header = document.createElement('div');
        header.className = 'server-group-header';
        header.innerHTML = `
            <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="server-status-dot${serverConnected ? '' : ' disconnected'}"></span>
            <span class="server-name">${escapeHtml(serverName)}</span>
            <span class="server-objects-count">${objectCount}</span>
        `;
        header.addEventListener('click', () => toggleServerGroup(serverId));
        group.appendChild(header);

        // Список объектов группы
        const objectsList = document.createElement('ul');
        objectsList.className = 'server-group-objects';

        objectsToRender.forEach(name => {
            const li = document.createElement('li');
            li.dataset.name = name;
            li.dataset.serverId = serverId;
            li.dataset.serverName = serverName;

            // Если сервер отключен - добавляем класс disconnected к объектам
            if (!serverConnected) {
                li.classList.add('disconnected');
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'object-name';
            nameSpan.textContent = name;

            li.appendChild(nameSpan);
            li.addEventListener('click', () => openObjectTab(name, serverId, serverName));
            objectsList.appendChild(li);
        });

        group.appendChild(objectsList);
        list.appendChild(group);
    });

    // Рендерим секцию серверов, обновляем objects section
    renderServersSection();
    updateObjectsSectionHeader();
}

// Обновить заголовок секции Objects
function updateObjectsSectionHeader() {
    const section = document.getElementById('objects-section');
    const header = document.getElementById('objects-section-header');
    const countEl = document.getElementById('objects-count');

    if (!section || !header) return;

    // Подсчитываем общее количество объектов
    let totalObjects = 0;
    state.servers.forEach(server => {
        totalObjects += server.objectCount || 0;
    });

    // Обновляем счётчик
    if (countEl) {
        countEl.textContent = totalObjects;
    }

    // Применяем сохранённое состояние свёрнутости
    if (state.objectsSectionCollapsed) {
        section.classList.add('collapsed');
    } else {
        section.classList.remove('collapsed');
    }

    // Обработчик клика на заголовок секции
    if (!header.dataset.listenerAdded) {
        header.addEventListener('click', toggleObjectsSection);
        header.dataset.listenerAdded = 'true';
    }
}

// Переключить свёрнутость секции "Objects"
function toggleObjectsSection() {
    const section = document.getElementById('objects-section');
    if (!section) return;

    state.objectsSectionCollapsed = !state.objectsSectionCollapsed;
    section.classList.toggle('collapsed', state.objectsSectionCollapsed);
    saveSettings();
}

// Переключить свёрнутость группы сервера в списке объектов
function toggleServerGroup(serverId) {
    const group = document.querySelector(`.server-group[data-server-id="${serverId}"]`);
    if (!group) return;

    const collapsed = !state.collapsedServerGroups.has(serverId);
    if (collapsed) state.collapsedServerGroups.add(serverId);
    else state.collapsedServerGroups.delete(serverId);
    group.classList.toggle('collapsed', collapsed);
    saveSettings();
}

// Рендеринг секции "Servers" в sidebar
function renderServersSection() {
    const section = document.getElementById('servers-section');
    const list = document.getElementById('servers-list');
    const countEl = document.getElementById('servers-count');
    const header = document.getElementById('servers-section-header');

    if (!section || !list) return;

    // Применяем сохранённое состояние свёрнутости
    section.classList.toggle('collapsed', state.serversSectionCollapsed);

    // Обработчик клика на заголовок секции
    if (!header.dataset.listenerAdded) {
        header.addEventListener('click', toggleServersSection);
        header.dataset.listenerAdded = 'true';
    }

    list.innerHTML = '';

    let serverCount = 0;

    state.servers.forEach((server, serverId) => {
        serverCount++;
        const li = document.createElement('li');
        li.className = 'server-item' + (server.connected ? ' connected' : ' disconnected');
        li.dataset.serverId = serverId;

        const objectCount = server.objectCount || 0;
        const connectedCount = server.connected ? objectCount : 0;

        let statsClass = '';
        if (objectCount === 0) {
            statsClass = '';
        } else if (connectedCount === objectCount) {
            statsClass = 'all-connected';
        } else if (connectedCount === 0) {
            statsClass = 'all-disconnected';
        } else {
            statsClass = 'some-disconnected';
        }

        const statusClass = server.connected ? '' : ' disconnected';
        const displayName = server.name || `${server.url.replace(/^https?:\/\//, '')}`;
        const statsText = objectCount > 0 ? `${connectedCount}/${objectCount}` : '-/-';

        li.innerHTML = `
            <span class="server-status-dot${statusClass}"></span>
            <span class="server-name" title="${escapeAttr(server.url)}">${escapeHtml(displayName)}</span>
            <span class="server-stats ${statsClass}">${statsText}</span>
        `;

        // Клик на сервер — развернуть/свернуть его группу в списке объектов
        li.addEventListener('click', () => {
            // Находим группу сервера и прокручиваем к ней
            const group = document.querySelector(`.server-group[data-server-id="${serverId}"]`);
            if (group) {
                // Если группа свёрнута — разворачиваем
                if (state.collapsedServerGroups.has(serverId)) {
                    toggleServerGroup(serverId);
                }
                // Прокручиваем к группе
                group.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        list.appendChild(li);
    });

    // Обновляем счётчик (только standalone серверы)
    if (countEl) {
        countEl.textContent = serverCount;
    }
}

// Переключить свёрнутость секции "Servers"
function toggleServersSection() {
    const section = document.getElementById('servers-section');
    if (!section) return;

    state.serversSectionCollapsed = !state.serversSectionCollapsed;
    section.classList.toggle('collapsed', state.serversSectionCollapsed);
    saveSettings();
}

async function openObjectTab(name, serverId, serverName) {
    // Составной ключ для tabs: serverId:objectName
    const tabKey = `${serverId}:${name}`;

    // Переключаемся на Objects view если сейчас на Dashboard
    if (dashboardManager && dashboardState.currentView !== 'objects') {
        dashboardManager.switchView('objects');
    }

    if (state.tabs.has(tabKey)) {
        activateTab(tabKey);
        return;
    }

    // Сначала загружаем данные, чтобы узнать тип объекта
    try {
        const data = await fetchObjectData(name, serverId);
        const rendererInfo = resolveRenderer(data.object || {});

        createTab(tabKey, name, rendererInfo, data, serverId, serverName);
        activateTab(tabKey);

        watchObject(name, serverId).catch(console.error);
    } catch (err) {
        console.error(`Error открытия вкладки ${name}:`, err);
    }
}

function createTab(tabKey, displayName, rendererInfo, initialData, serverId, serverName) {
    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');

    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    // Получаем класс рендерера для данного типа объекта/расширения
    const RendererClass = rendererInfo.RendererClass || DefaultObjectRenderer;
    const renderer = new RendererClass(displayName, tabKey);
    renderer.extensionType = rendererInfo.extensionType;
    renderer.objectType = rendererInfo.objectType;

    // Кнопка вкладки с индикатором типа и сервера
    const serverData = state.servers.get(serverId);
    const serverConnected = serverData?.connected !== false;

    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn' + (serverConnected ? '' : ' server-disconnected');
    tabBtn.dataset.name = tabKey;
    tabBtn.dataset.objectType = rendererInfo.rendererType;
    tabBtn.dataset.serverId = serverId;

    const badgeType = rendererInfo.badgeType || rendererInfo.rendererType || 'Default';

    // Формируем HTML вкладки
    const tabHTML = `
        <span class="tab-type-badge">${badgeType}</span>
        <span class="tab-server-badge${serverConnected ? '' : ' disconnected'}" data-server-id="${serverId}">${serverName}</span>
        ${displayName}
        <span class="close">&times;</span>
    `;
    tabBtn.innerHTML = tabHTML;

    tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
            closeTab(tabKey);
        } else {
            activateTab(tabKey);
        }
    });
    tabsHeader.appendChild(tabBtn);

    // Панель содержимого - создаётся рендерером
    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (serverConnected ? '' : ' server-disconnected');
    panel.dataset.name = tabKey;
    panel.dataset.objectType = rendererInfo.rendererType;
    panel.dataset.serverId = serverId;
    panel.innerHTML = renderer.createPanelHTML();
    tabsContent.appendChild(panel);

    // Восстановить состояние спойлеров
    restoreCollapsedSections(displayName);

    // Восстановить порядок секций
    loadSectionOrder(tabKey);

    // Сохраняем состояние вкладки с рендерером
    // Если SSE подключен, не запускаем polling (данные будут приходить через SSE)
    const updateInterval = state.sse.connected
        ? null
        : setInterval(() => loadObjectData(tabKey), state.sse.pollInterval);

    state.tabs.set(tabKey, {
        charts: new Map(),
        variables: {},
        objectType: rendererInfo.rendererType,
        extensionType: rendererInfo.extensionType,
        renderer: renderer,
        updateInterval: updateInterval,
        displayName: displayName,
        serverId: serverId,
        serverName: serverName
    });

    // Инициализация рендерера (настройка обработчиков и т.д.)
    renderer.initialize();

    // Восстанавливаем внешние датчики из localStorage
    restoreExternalSensors(tabKey, displayName);

    // Обновляем состояние кнопок перемещения секций
    updateReorderButtons(tabKey);

    // Отрисовываем начальные данные
    if (initialData) {
        renderer.update(initialData);
    }

    // Обновляем состояние кнопок контроля (disabled/enabled)
    // для только что созданных элементов
    updateAllControlButtons();
}

function activateTab(name) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.objects-list li').forEach(li => li.classList.remove('active'));
    // Снимаем выделение с dashboard items в sidebar
    document.querySelectorAll('.dashboard-item').forEach(item => item.classList.remove('active'));

    document.querySelector(`.tab-btn[data-name="${name}"]`)?.classList.add('active');
    document.querySelector(`.tab-panel[data-name="${name}"]`)?.classList.add('active');
    document.querySelector(`.objects-list li[data-name="${name}"]`)?.classList.add('active');

    state.activeTab = name;
}

function closeTab(name) {
    const tabState = state.tabs.get(name);
    if (tabState) {
        clearInterval(tabState.updateInterval);
        tabState.charts.forEach(chartData => {
            clearInterval(chartData.updateInterval);
            chartData.chart.destroy();
        });
        // Вызываем destroy рендерера
        if (tabState.renderer) {
            tabState.renderer.destroy();
        }
    }

    const objectName = tabState?.displayName || name;
    const serverId = tabState?.serverId || null;
    unwatchObject(objectName, serverId).catch(console.error);

    state.tabs.delete(name);

    document.querySelector(`.tab-btn[data-name="${name}"]`)?.remove();
    document.querySelector(`.tab-panel[data-name="${name}"]`)?.remove();

    if (state.tabs.size === 0) {
        const tabsContent = document.getElementById('tabs-content');
        tabsContent.innerHTML = '<div class="placeholder">Select an object from the list on the left</div>';
        state.activeTab = null;
    } else if (state.activeTab === name) {
        const firstTab = state.tabs.keys().next().value;
        activateTab(firstTab);
    }
}

// ============================================================================
// Launcher вкладки
// ============================================================================

function openLauncherTab(nodeId, nodeName, launcherUrl, hasControl) {
    const tabKey = `launcher:${nodeId}`;

    // Переключаемся на Objects view если сейчас на Dashboard
    if (dashboardManager && dashboardState.currentView !== 'objects') {
        dashboardManager.switchView('objects');
    }

    if (state.tabs.has(tabKey)) {
        activateTab(tabKey);
        return;
    }

    createLauncherTab(tabKey, nodeId, nodeName, launcherUrl, hasControl);
    activateTab(tabKey);
}

function createLauncherTab(tabKey, nodeId, nodeName, launcherUrl, hasControl) {
    const tabsHeader = document.getElementById('tabs-header');
    const tabsContent = document.getElementById('tabs-content');

    const placeholder = tabsContent.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    const renderer = new LauncherRenderer(nodeName, tabKey, nodeId, launcherUrl, hasControl);

    // Проверяем начальный статус подключения
    const nodeState = state.nodes.get(nodeId);
    const nodeConnected = nodeState?.connected !== false;

    // Кнопка вкладки
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn' + (nodeConnected ? '' : ' server-disconnected');
    tabBtn.dataset.name = tabKey;
    tabBtn.dataset.objectType = 'Launcher';
    tabBtn.innerHTML = `
        <span class="tab-type-badge tab-badge-launcher">Launcher</span>
        ${escapeHtml(nodeName)}
        <span class="close">&times;</span>
    `;
    tabBtn.addEventListener('click', (e) => {
        if (e.target.classList.contains('close')) {
            closeTab(tabKey);
        } else {
            activateTab(tabKey);
        }
    });
    tabsHeader.appendChild(tabBtn);

    // Панель содержимого
    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (nodeConnected ? '' : ' server-disconnected');
    panel.dataset.name = tabKey;
    panel.dataset.objectType = 'Launcher';
    panel.innerHTML = renderer.createPanelHTML();
    tabsContent.appendChild(panel);

    // Сохраняем состояние
    state.tabs.set(tabKey, {
        charts: new Map(),
        variables: {},
        objectType: 'Launcher',
        renderer: renderer,
        updateInterval: null,
        displayName: nodeName,
        serverId: nodeId,
        serverName: nodeName
    });

    renderer.initialize();
}

// ============================================================================
// Секция Launchers (плоский список Launcher'ов)
// ============================================================================

// Рендеринг секции Launchers в sidebar
function renderLaunchersSection(launchers) {
    const section = document.getElementById('launchers-section');
    if (!section) return;

    if (!launchers || launchers.length === 0) {
        section.style.display = 'none';
        return;
    }
    // В group mode секция скрыта — не показываем
    if (!state.sidebarGroups || state.sidebarGroups.length === 0) {
        section.style.display = '';
    }

    const list = document.getElementById('launchers-list');
    const countEl = document.getElementById('launchers-count');
    const header = document.getElementById('launchers-section-header');

    if (countEl) {
        countEl.textContent = launchers.length;
    }

    // Применяем сохранённое состояние свёрнутости
    if (state.launchersSectionCollapsed) {
        section.classList.add('collapsed');
    } else {
        section.classList.remove('collapsed');
    }

    // Обработчик клика на заголовок
    if (header && !header.dataset.listenerAdded) {
        header.addEventListener('click', toggleLaunchersSection);
        header.dataset.listenerAdded = 'true';
    }

    if (!list) return;
    list.innerHTML = '';

    for (const launcher of launchers) {
        // Сохраняем в state
        state.nodes.set(launcher.id, {
            id: launcher.id,
            name: launcher.name,
            launcherUrl: launcher.launcherUrl,
            connected: launcher.connected ?? false,
            hasControl: launcher.hasControl ?? false
        });

        const displayName = launcher.name || launcher.id;
        const connected = launcher.connected ?? false;

        let statusText = '';
        if (launcher.status && launcher.status.processes) {
            const total = launcher.status.processes.length;
            const running = launcher.status.processes.filter(p => p.state === 'running').length;
            statusText = `${running}/${total}`;
        }

        const li = document.createElement('li');
        li.className = 'launcher-sidebar-item';
        li.dataset.nodeId = launcher.id;
        li.innerHTML = `
            <span class="server-status-dot${connected ? '' : ' disconnected'}"></span>
            <span class="launcher-sidebar-name">${escapeHtml(displayName)}</span>
            ${statusText ? `<span class="launcher-sidebar-stats">${statusText}</span>` : ''}
        `;
        li.addEventListener('click', () => {
            openLauncherTab(launcher.id, launcher.name, launcher.launcherUrl, launcher.hasControl);
        });
        list.appendChild(li);
    }
}

function toggleLaunchersSection() {
    const section = document.getElementById('launchers-section');
    if (!section) return;

    state.launchersSectionCollapsed = !state.launchersSectionCollapsed;
    section.classList.toggle('collapsed', state.launchersSectionCollapsed);
    saveSettings();
}

// Обновить статус Launcher'а в sidebar
function updateLauncherNodeStatus(nodeId, connected) {
    const nodeState = state.nodes.get(nodeId);
    if (nodeState) {
        nodeState.connected = connected;
    }

    const item = document.querySelector(`.launcher-sidebar-item[data-node-id="${nodeId}"]`);
    if (item) {
        const dot = item.querySelector('.server-status-dot');
        if (dot) {
            dot.className = `server-status-dot${connected ? '' : ' disconnected'}`;
        }
    }

    // Обновляем CSS-класс tab-кнопки и панели (аналогично updateServerStatus)
    const tabKey = `launcher:${nodeId}`;
    const tabBtn = document.querySelector(`.tab-btn[data-name="${CSS.escape(tabKey)}"]`);
    if (tabBtn) {
        tabBtn.classList.toggle('server-disconnected', !connected);
    }
    const tabPanel = document.querySelector(`.tab-panel[data-name="${CSS.escape(tabKey)}"]`);
    if (tabPanel) {
        tabPanel.classList.toggle('server-disconnected', !connected);
    }

    // Обновляем статус в sidebar группах (по имени ноды)
    if (typeof updateGroupEntityStatus === 'function' && nodeState) {
        updateGroupEntityStatus('launcher', nodeState.name, connected);
    }
}

// Загрузка списка Launcher'ов (вызывается при инициализации)
async function loadLauncherNodes() {
    try {
        const resp = await fetch('/api/launchers');
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.launchers && data.launchers.length > 0) {
            renderLaunchersSection(data.launchers);
        }
    } catch (err) {
        console.warn('Failed to load launchers:', err);
    }
}

async function loadObjectData(tabKey) {
    try {
        const tabState = state.tabs.get(tabKey);
        if (!tabState) return;

        const data = await fetchObjectData(tabState.displayName, tabState.serverId);

        // Используем рендерер для обновления данных
        if (tabState.renderer) {
            tabState.renderer.update(data);
        }

        // Если работаем в режиме polling - обновляем индикатор
        if (!state.sse.connected) {
            updateSSEStatus('polling', new Date());
        }
    } catch (err) {
        console.error(`Error загрузки ${tabKey}:`, err);
    }
}



// === 51-ui-render.js ===
// ============================================================================
// Helper для безопасного поиска элементов внутри панели вкладки
// Решает проблему конфликта ID при multi-server с одинаковыми displayName
// ============================================================================

/**
 * Находит элемент внутри панели конкретной вкладки
 * @param {string} tabKey - Ключ вкладки (serverId:objectName или objectName для single-server)
 * @param {string} elementId - ID элемента для поиска
 * @returns {HTMLElement|null} - Найденный элемент или null
 */
function getElementInTab(tabKey, elementId) {
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return null;
    // Escape special CSS characters in elementId (e.g., colon in "ws:SensorName")
    const escapedId = CSS.escape(elementId);
    return panel.querySelector(`#${escapedId}`);
}

/**
 * Находит все элементы внутри панели конкретной вкладки
 * @param {string} tabKey - Ключ вкладки
 * @param {string} selector - CSS селектор
 * @returns {NodeList} - Список найденных элементов
 */
function getElementsInTab(tabKey, selector) {
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return [];
    return panel.querySelectorAll(selector);
}

// ============================================================================
// Функции рендеринга (обновлены для работы с tabKey вместо displayName)
// ============================================================================

function renderVariables(tabKey, variables, filterText = '') {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;
    const tbody = getElementInTab(tabKey, `variables-${displayName}`);
    if (!tbody) return;

    // Сохраняем переменные в state для фильтрации
    tabState.variables = variables;

    tbody.innerHTML = '';
    const filterLower = filterText.toLowerCase();

    Object.entries(variables).forEach(([varName, value]) => {
        // Filterация по имени переменной
        if (filterText && !varName.toLowerCase().includes(filterLower)) {
            return;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="variable-name">${varName}</td>
            <td class="variable-value">${formatValue(value)}</td>
            <td></td>
        `;

        tbody.appendChild(tr);
    });
}

function renderIO(tabKey, type, ioData) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const tbody = getElementInTab(tabKey, `${type}-${displayName}`);
    const countBadge = getElementInTab(tabKey, `${type}-count-${displayName}`);
    if (!tbody) return;

    const entries = Object.entries(ioData);

    if (countBadge) {
        countBadge.textContent = entries.length;
    }

    // Получаем текущий фильтр (глобальный) и закреплённые строки
    const filterInput = getElementInTab(tabKey, `io-filter-global-${displayName}`);
    const filterText = filterInput ? filterInput.value.toLowerCase() : '';
    const pinnedRows = getIOPinnedRows(tabKey, type);
    const hasPinned = pinnedRows.size > 0;

    // Показываем/скрываем кнопку "снять все"
    const unpinBtn = getElementInTab(tabKey, `io-unpin-${type}-${displayName}`);
    if (unpinBtn) {
        unpinBtn.style.display = hasPinned ? 'inline' : 'none';
    }

    tbody.innerHTML = '';

    entries.forEach(([key, io]) => {
        const varName = `io.${type === 'inputs' ? 'in' : 'out'}.${key}`;
        const sensor = getSensorInfo(io.id) || getSensorInfo(io.name);
        const iotype = sensor?.iotype || (type === 'inputs' ? 'DI' : 'DO');
        const textname = sensor?.textname || io.textname || io.comment || '';
        const rowKey = io.id || key;
        const isPinned = pinnedRows.has(String(rowKey));

        // Filterация: если есть закреплённые - показываем только их, иначе фильтруем по тексту
        const searchText = `${io.name || key} ${io.id} ${iotype} ${textname}`.toLowerCase();
        const matchesFilter = !filterText || searchText.includes(filterText);
        const shouldShow = hasPinned ? isPinned : matchesFilter;

        if (!shouldShow) return;

        const tr = document.createElement('tr');
        tr.className = '';
        tr.dataset.rowKey = rowKey;

        tr.innerHTML = `
            <td class="io-pin-col">
                <span class="io-pin-toggle ${isPinned ? 'pinned' : ''}" data-row-key="${rowKey}" title="${isPinned ? 'Unpin' : 'Pin'}">
                    ${isPinned ? '📌' : '○'}
                </span>
            </td>
            <td class="io-chart-col">
                <span class="chart-toggle">
                    <input type="checkbox"
                           id="chart-${displayName}-${varName}"
                           data-object="${tabKey}"
                           data-variable="${varName}"
                           data-sensor-id="${io.id}"
                           ${hasChart(tabKey, varName) ? 'checked' : ''}>
                    <label class="chart-toggle-label" for="chart-${displayName}-${varName}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3v18h18"/>
                            <path d="M18 9l-5 5-4-4-3 3"/>
                        </svg>
                    </label>
                </span>
            </td>
            <td class="io-spacer-col"></td>
            <td><span class="variable-iotype iotype-${iotype.toLowerCase()}">${iotype}</span></td>
            <td>${io.id}</td>
            <td class="variable-name" title="${textname}">${io.name || key}</td>
            <td class="variable-value" data-var="${varName}">${formatValue(io.value)}</td>
        `;

        // Pin toggle handler
        const pinToggle = tr.querySelector('.io-pin-toggle');
        pinToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleIOPin(tabKey, type, rowKey);
        });

        // Chart toggle handler
        const checkbox = tr.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                addChart(tabKey, varName, io.id, textname);
            } else {
                removeChart(tabKey, varName);
            }
        });

        tbody.appendChild(tr);
    });
}

function formatValue(value) {
    if (typeof value === 'number') {
        return Number.isInteger(value) ? value : value.toFixed(2);
    }
    return String(value);
}

// Находит tabKey по displayName (для обратной совместимости с кодом использующим objectName)
function findTabKeyByDisplayName(displayName) {
    for (const [tabKey, tabState] of state.tabs) {
        if (tabState.displayName === displayName) {
            return tabKey;
        }
    }
    // Fallback: если не нашли, возможно это и есть tabKey
    if (state.tabs.has(displayName)) {
        return displayName;
    }
    return null;
}

function hasChart(objectName, varName) {
    const tabKey = findTabKeyByDisplayName(objectName);
    if (!tabKey) return false;
    const tabState = state.tabs.get(tabKey);
    return tabState && tabState.charts.has(varName);
}

async function addChart(tabKey, varName, sensorId, passedTextname) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState || tabState.charts.has(varName)) return;

    const displayName = tabState.displayName || tabKey;

    const chartsContainer = getElementInTab(tabKey, `charts-${displayName}`);
    // Ищем сенсор по ID или по имени переменной
    let sensor = sensorId ? getSensorInfo(sensorId) : null;
    if (!sensor) {
        // Пробуем найти по имени (последняя часть varName, например io.in.Input1_S -> Input1_S)
        const shortName = varName.split('.').pop();
        sensor = getSensorInfo(shortName);
    }
    const isDiscrete = isDiscreteSignal(sensor);
    const color = getNextColor();
    const sensorDisplayName = sensor?.name || varName.split('.').pop();
    // textname: приоритет - справочник сенсоров, потом переданный параметр (comment из API)
    const textName = sensor?.textname || passedTextname || '';

    // Находим supplier из данных рендерера (если есть)
    let supplierText = '';
    if (tabState.renderer && tabState.renderer.allSensors) {
        const sData = tabState.renderer.allSensors.find(s => s.id === sensorId);
        if (sData && sData.supplier) {
            supplierText = sData.supplier;
        }
    }

    // Создаём панель графика
    const chartDiv = document.createElement('div');
    chartDiv.className = 'chart-panel';
    chartDiv.id = `chart-panel-${displayName}-${varName}`;
    chartDiv.innerHTML = `
        <div class="chart-panel-header">
            <div class="chart-panel-info">
                <span class="legend-color-picker" data-object="${tabKey}" data-variable="${varName}" style="background:${color}" title="Click to choose color"></span>
                <span class="chart-panel-title">${sensorDisplayName}</span>
                <span class="chart-panel-value" id="legend-value-${displayName}-${varName}">--</span>
                <span class="chart-panel-supplier" id="legend-supplier-${displayName}-${varName}">${supplierText}</span>
                <span class="chart-panel-textname">${textName}</span>
                ${sensor?.iotype ? `<span class="type-badge type-${sensor.iotype}">${sensor.iotype}</span>` : ''}
            </div>
            <div class="chart-panel-right">
                ${!isDiscrete ? `
                <label class="fill-toggle" title="Smooth line (bezier curves)">
                    <input type="checkbox" id="smooth-${displayName}-${varName}" checked>
                    <span class="fill-toggle-label">smooth</span>
                </label>
                ` : ''}
                <label class="fill-toggle" title="Fill background">
                    <input type="checkbox" id="fill-${displayName}-${varName}" checked>
                    <span class="fill-toggle-label">fill</span>
                </label>
                <button class="btn-icon" title="Close" onclick="removeChartByButton('${tabKey}', '${varName}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="chart-wrapper">
            <canvas id="canvas-${displayName}-${varName}"></canvas>
        </div>
    `;
    chartsContainer.appendChild(chartDiv);

    // Обработчик для чекбокса заливки
    const fillCheckbox = getElementInTab(tabKey, `fill-${displayName}-${varName}`);
    if (fillCheckbox) {
        fillCheckbox.addEventListener('change', (e) => {
            toggleChartFill(tabKey, varName, e.target.checked);
        });
    }

    // Обработчик для чекбокса сглаживания (только для аналоговых)
    const smoothCheckbox = getElementInTab(tabKey, `smooth-${displayName}-${varName}`);
    if (smoothCheckbox) {
        smoothCheckbox.addEventListener('change', (e) => {
            toggleChartSmooth(tabKey, varName, e.target.checked);
        });
    }

    // Загружаем историю
    try {
        const serverId = tabState?.serverId;
        const history = await fetchVariableHistory(displayName, varName, 200, serverId);
        const ctx = getElementInTab(tabKey, `canvas-${displayName}-${varName}`).getContext('2d');

        // Преобразуем данные для временной шкалы
        const historyData = history.points?.map(p => ({
            x: new Date(p.timestamp),
            y: p.value
        })) || [];

        // Получаем диапазон времени (при первом графике устанавливается начало)
        const timeRange = getTimeRangeForObject(tabKey);

        // Заливка по умолчанию только для аналоговых
        const fillEnabled = true;

        // Конфигурация графика в зависимости от типа сигнала
        const chartConfig = {
            type: 'line',
            data: {
                datasets: [{
                    label: sensorDisplayName,
                    data: historyData,
                    borderColor: color,
                    backgroundColor: `${color}20`,
                    fill: fillEnabled,
                    tension: isDiscrete ? 0 : 0.3,
                    stepped: isDiscrete ? 'before' : false,
                    pointRadius: 0,
                    borderWidth: isDiscrete ? 2 : 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
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
                            maxTicksLimit: 10,
                            display: true
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
                        beginAtZero: isDiscrete,
                        suggestedMin: isDiscrete ? 0 : undefined,
                        suggestedMax: isDiscrete ? 1.1 : undefined,
                        grid: {
                            color: '#333840',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#8a9099',
                            stepSize: isDiscrete ? 1 : undefined
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#22252a',
                        titleColor: '#d8dce2',
                        bodyColor: '#d8dce2',
                        borderColor: '#333840',
                        borderWidth: 1
                    }
                }
            }
        };

        const chart = new Chart(ctx, chartConfig);

        // Синхронизируем все графики после добавления нового
        syncAllChartsTimeRange(tabKey);

        // Обновить начальное значение в легенде
        if (history.points && history.points.length > 0) {
            const lastValue = history.points[history.points.length - 1].value;
            const legendValueEl = getElementInTab(tabKey, `legend-value-${displayName}-${varName}`);
            if (legendValueEl) {
                legendValueEl.textContent = formatValue(lastValue);
            }
        }

        // Сохраняем данные графика
        const chartData = {
            chart,
            sensorId,
            isDiscrete,
            color,
            updateInterval: null
        };

        // Периодическое обновление только если SSE не подключен
        if (!state.sse.connected) {
            chartData.updateInterval = setInterval(async () => {
                await updateChart(tabKey, varName, chart);
            }, state.sse.pollInterval);
        }

        tabState.charts.set(varName, chartData);

    } catch (err) {
        console.error(`Error загрузки истории для ${varName}:`, err);
        chartDiv.innerHTML += `<div class="alert alert-error">Не удалось загрузить данные графика</div>`;
    }
}

async function updateChart(objectName, varName, chart) {
    // objectName может быть displayName или tabKey
    const tabKey = findTabKeyByDisplayName(objectName) || objectName;
    const tabState = state.tabs.get(tabKey);
    if (!tabState || !tabState.charts.has(varName)) return;

    try {
        const serverId = tabState?.serverId;
        const displayName = tabState?.displayName || objectName;
        const history = await fetchVariableHistory(displayName, varName, 200, serverId);

        // Преобразуем данные для временной шкалы
        const chartData = history.points?.map(p => ({
            x: new Date(p.timestamp),
            y: p.value
        })) || [];

        chart.data.datasets[0].data = chartData;

        // Применяем диапазон времени (со смещением если нужно)
        const timeRange = getTimeRangeForObject(objectName);
        chart.options.scales.x.min = timeRange.min;
        chart.options.scales.x.max = timeRange.max;

        chart.update('none');

        // Обновить значение в легенде
        if (history.points && history.points.length > 0) {
            const lastValue = history.points[history.points.length - 1].value;
            const legendEl = getElementInTab(tabKey, `legend-value-${objectName}-${varName}`);
            if (legendEl) {
                legendEl.textContent = formatValue(lastValue);
            }
        }
    } catch (err) {
        console.error(`Error обновления графика для ${varName}:`, err);
    }
}

// Получить диапазон времени для графиков объекта
// tabKey - ключ вкладки (serverId:objectName)
function getTimeRangeForObject(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) {
        const now = Date.now();
        return { min: now, max: now + state.timeRange * 1000 };
    }

    // Если нет начального времени - установить текущее
    if (!tabState.chartStartTime) {
        tabState.chartStartTime = Date.now();
    }

    const now = Date.now();
    const rangeMs = state.timeRange * 1000;
    let min = tabState.chartStartTime;
    let max = min + rangeMs;

    // Если текущее время достигло конца шкалы - сместить на 90%
    if (now >= max) {
        const shiftAmount = rangeMs * 0.9;
        tabState.chartStartTime = min + shiftAmount;
        min = tabState.chartStartTime;
        max = min + rangeMs;
    }

    return { min, max };
}

// Синхронизировать диапазон времени для всех графиков
// tabKey - ключ вкладки (serverId:objectName)
function syncAllChartsTimeRange(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const timeRange = getTimeRangeForObject(tabKey);

    tabState.charts.forEach((chartData, varName) => {
        const chart = chartData.chart;
        chart.options.scales.x.min = timeRange.min;
        chart.options.scales.x.max = timeRange.max;
        chart.update('none');
    });

    // Обновить отображение оси X (показывать только на последнем графике)
    updateXAxisVisibility(tabKey);
}

// Показывать ось X только на последнем графике
// tabKey - ключ вкладки (serverId:objectName)
function updateXAxisVisibility(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    // Используем displayName для DOM селекторов (без serverId)
    const displayName = tabState.displayName || tabKey;

    // ВАЖНО: Ограничиваем поиск панелью конкретной вкладки
    // для избежания конфликтов ID при multi-server (когда displayName одинаковый)
    const tabPanel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!tabPanel) return;

    const chartPanels = tabPanel.querySelectorAll(`#charts-${displayName} .chart-panel`);
    const chartCount = chartPanels.length;

    let index = 0;
    tabState.charts.forEach((chartData, varName) => {
        const isLast = index === chartCount - 1;
        chartData.chart.options.scales.x.ticks.display = isLast;
        chartData.chart.update('none');
        index++;
    });
}

function updateChartLegends(tabKey, data) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    // Обновляем значения и supplier в таблицах
    if (data.io?.in) {
        Object.entries(data.io.in).forEach(([key, io]) => {
            const varName = `io.in.${key}`;
            const legendEl = getElementInTab(tabKey, `legend-value-${displayName}-${varName}`);
            if (legendEl) {
                legendEl.textContent = formatValue(io.value);
            }
            if (io.supplier !== undefined) {
                const supplierEl = getElementInTab(tabKey, `legend-supplier-${displayName}-${varName}`);
                if (supplierEl) supplierEl.textContent = io.supplier || '';
            }
        });
    }

    if (data.io?.out) {
        Object.entries(data.io.out).forEach(([key, io]) => {
            const varName = `io.out.${key}`;
            const legendEl = getElementInTab(tabKey, `legend-value-${displayName}-${varName}`);
            if (legendEl) {
                legendEl.textContent = formatValue(io.value);
            }
            if (io.supplier !== undefined) {
                const supplierEl = getElementInTab(tabKey, `legend-supplier-${displayName}-${varName}`);
                if (supplierEl) supplierEl.textContent = io.supplier || '';
            }
        });
    }
}

function removeChart(tabKey, varName) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const chartData = tabState.charts.get(varName);
    if (chartData) {
        clearInterval(chartData.updateInterval);
        chartData.chart.destroy();
        tabState.charts.delete(varName);
    }

    getElementInTab(tabKey, `chart-panel-${displayName}-${varName}`)?.remove();

    // Снять галочку в таблице (обычная IO таблица)
    const checkbox = getElementInTab(tabKey, `chart-${displayName}-${varName}`);
    if (checkbox) {
        checkbox.checked = false;
    }

    // Снять галочку в таблице IONC (датчики SharedMemory)
    const ioncCheckbox = getElementInTab(tabKey, `ionc-chart-${displayName}-${varName}`);
    if (ioncCheckbox) {
        ioncCheckbox.checked = false;
    }

    // Снять галочку в таблице UWebSocketGate (varName = ws:SensorName)
    if (varName.startsWith('ws:')) {
        const sensorName = varName.substring(3);
        const uwsgateCheckboxes = getElementsInTab(tabKey, `.uwsgate-chart-checkbox[data-name="${sensorName}"]`);
        if (uwsgateCheckboxes && uwsgateCheckboxes.length > 0) {
            uwsgateCheckboxes[0].checked = false;
        }
    }

    // Обновить видимость оси X на оставшихся графиках
    updateXAxisVisibility(tabKey);
}

// Глобальная функция для кнопки закрытия графика
window.removeChartByButton = function(objectName, varName) {
    removeChart(objectName, varName);
};

// Глобальная функция для сворачивания/разворачивания секций
window.toggleSection = function(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (section) {
        section.classList.toggle('collapsed');
        saveCollapsedSections();
    }
};

// Глобальная функция для обновления статуса сервера (для тестов)
window.updateServerStatus = updateServerStatus;

// Хранилище данных таймеров для локального обновления timeleft
const timerDataCache = {};
let timerUpdateInterval = null;

// Рендеринг таймеров


// === 52-ui-sections.js ===
function renderTimers(tabKey, timersData) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const tbody = getElementInTab(tabKey, `timers-${displayName}`);
    const countBadge = getElementInTab(tabKey, `timers-count-${displayName}`);
    if (!tbody) return;

    // Извлечь таймеры из объекта (исключая count)
    const timers = [];
    Object.entries(timersData).forEach(([key, timer]) => {
        if (key !== 'count' && typeof timer === 'object') {
            timers.push({...timer, _key: key});
        }
    });

    // Сохраняем в кэш для локального обновления
    timerDataCache[tabKey] = {
        timers: timers,
        lastUpdate: Date.now()
    };

    if (countBadge) {
        countBadge.textContent = timers.length;
    }

    renderTimersTable(tabKey, timers);

    // Запускаем интервал локального обновления если ещё не запущен
    startTimerUpdateInterval();
}

// Отрисовка таблицы таймеров
function renderTimersTable(tabKey, timers) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const tbody = getElementInTab(tabKey, `timers-${displayName}`);
    if (!tbody) return;

    // Получаем текущий фильтр (глобальный) и закреплённые строки
    const filterInput = getElementInTab(tabKey, `io-filter-global-${displayName}`);
    const filterText = filterInput ? filterInput.value.toLowerCase() : '';
    const pinnedRows = getIOPinnedRows(tabKey, 'timers');
    const hasPinned = pinnedRows.size > 0;

    // Показываем/скрываем кнопку "снять все"
    const unpinBtn = getElementInTab(tabKey, `io-unpin-timers-${displayName}`);
    if (unpinBtn) {
        unpinBtn.style.display = hasPinned ? 'inline' : 'none';
    }

    tbody.innerHTML = '';

    if (timers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No timers</td></tr>';
        return;
    }

    timers.forEach(timer => {
        const rowKey = timer.id || timer._key;
        const isPinned = pinnedRows.has(String(rowKey));

        // Filterация
        const searchText = `${timer.id} ${timer.name || ''}`.toLowerCase();
        const matchesFilter = !filterText || searchText.includes(filterText);
        const shouldShow = hasPinned ? isPinned : matchesFilter;

        if (!shouldShow) return;

        const tr = document.createElement('tr');
        tr.dataset.timerId = timer.id;
        tr.className = '';

        // Форматирование tick: -1 означает бесконечный таймер
        const tickDisplay = timer.tick === -1 ? '∞' : timer.tick;
        const tickClass = timer.tick === -1 ? 'timer-infinite' : '';

        // Форматирование timeleft с прогресс-баром
        const timeleftPercent = timer.msec > 0 ? Math.max(0, (timer.timeleft / timer.msec) * 100) : 0;
        const timeleftClass = timer.timeleft <= 0 ? 'timer-expired' : '';

        tr.innerHTML = `
            <td class="io-pin-col">
                <span class="io-pin-toggle ${isPinned ? 'pinned' : ''}" data-row-key="${rowKey}" title="${isPinned ? 'Unpin' : 'Pin'}">
                    ${isPinned ? '📌' : '○'}
                </span>
            </td>
            <td>${timer.id}</td>
            <td class="variable-name">${timer.name || '-'}</td>
            <td class="variable-value">${timer.msec} мс</td>
            <td class="variable-value ${timeleftClass}">
                <div class="timeleft-cell">
                    <span class="timeleft-value">${Math.max(0, timer.timeleft)} мс</span>
                    <div class="timeleft-bar" style="width: ${timeleftPercent}%"></div>
                </div>
            </td>
            <td class="variable-value ${tickClass}">${tickDisplay}</td>
        `;

        // Pin toggle handler
        const pinToggle = tr.querySelector('.io-pin-toggle');
        pinToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleIOPin(tabKey, 'timers', rowKey);
        });

        tbody.appendChild(tr);
    });
}

// Запуск интервала для локального обновления timeleft
function startTimerUpdateInterval() {
    if (timerUpdateInterval) return;

    const UPDATE_INTERVAL = 100; // мс

    timerUpdateInterval = setInterval(() => {
        const now = Date.now();

        Object.entries(timerDataCache).forEach(([objectName, cache]) => {
            const elapsed = now - cache.lastUpdate;

            // Обновляем timeleft для каждого таймера
            cache.timers.forEach(timer => {
                if (timer.tick !== -1 && timer.timeleft > 0) {
                    timer.timeleft = Math.max(0, timer.timeleft - UPDATE_INTERVAL);
                }
            });

            cache.lastUpdate = now;

            // Перерисовываем таблицу
            renderTimersTable(objectName, cache.timers);
        });
    }, UPDATE_INTERVAL);
}

// Рендеринг информации об объекте
function renderObjectInfo(tabKey, objectData) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const tbody = getElementInTab(tabKey, `object-info-${displayName}`);
    if (!tbody || !objectData) return;

    tbody.innerHTML = '';

    // Первая строка - важные метрики сообщений (объединённая)
    const msgCount = objectData.msgCount ?? 0;
    const lostMessages = objectData.lostMessages ?? 0;
    const maxQueue = objectData.maxSizeOfMessageQueue ?? '-';
    const msgCountRow = document.createElement('tr');
    msgCountRow.className = 'message-metrics-row';
    const lostClass = lostMessages > 0 ? 'lost-messages-warning' : '';
    msgCountRow.innerHTML = `
        <td colspan="2" class="message-metrics">
            <span class="metric-item">В очереди: <strong>${msgCount}</strong></span>
            <span class="metric-separator">|</span>
            <span class="metric-item ${lostClass}">Потеряно: <strong>${lostMessages}</strong></span>
            <span class="metric-separator">|</span>
            <span class="metric-item">Макс. очередь: <strong>${maxQueue}</strong></span>
        </td>
    `;
    tbody.appendChild(msgCountRow);

    // Остальные поля
    const fields = [
        { key: 'name', label: 'Name' },
        { key: 'id', label: 'ID' },
        { key: 'objectType', label: 'Type' },
        { key: 'extensionType', label: 'Extension' },
        { key: 'isActive', label: 'Active', format: v => v ? 'Yes' : 'No' }
    ];

    fields.forEach(({ key, label, format }) => {
        if (objectData[key] !== undefined) {
            const tr = document.createElement('tr');
            const value = format ? format(objectData[key]) : escapeHtml(String(objectData[key]));
            tr.innerHTML = `
                <td class="info-label">${label}</td>
                <td class="info-value">${value}</td>
            `;
            tbody.appendChild(tr);
        }
    });
}

// Рендеринг LogServer
function renderLogServer(tabKey, logServerData) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const section = getElementInTab(tabKey, `logserver-section-${displayName}`);
    const tbody = getElementInTab(tabKey, `logserver-${displayName}`);
    if (!section || !tbody) return;

    if (!logServerData) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    tbody.innerHTML = '';

    const fields = [
        { key: 'host', label: 'Host' },
        { key: 'port', label: 'Port' },
        { key: 'state', label: 'Status', formatState: true }
    ];

    fields.forEach(({ key, label, formatState }) => {
        if (logServerData[key] !== undefined) {
            const tr = document.createElement('tr');
            let valueHtml;
            if (formatState) {
                const stateValue = String(logServerData[key]).toUpperCase();
                // Проверяем с учётом возможных опечаток (RUNNIG вместо RUNNING)
                const stateClass = stateValue.startsWith('RUNN') ? 'state-running' :
                                   stateValue === 'STOPPED' ? 'state-stopped' : '';
                valueHtml = `<span class="state-badge ${stateClass}">${escapeHtml(String(logServerData[key]))}</span>`;
            } else {
                valueHtml = escapeHtml(String(logServerData[key]));
            }
            tr.innerHTML = `
                <td class="info-label">${label}</td>
                <td class="info-value">${valueHtml}</td>
            `;
            tbody.appendChild(tr);
        }
    });

    // Если есть дополнительная информация в info
    if (logServerData.info && typeof logServerData.info === 'object') {
        const info = logServerData.info;

        // Показываем sessMaxCount
        if (info.sessMaxCount !== undefined) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="info-label">Макс. сессий</td>
                <td class="info-value">${escapeHtml(String(info.sessMaxCount))}</td>
            `;
            tbody.appendChild(tr);
        }

        // Показываем список сессий
        if (info.sessions && Array.isArray(info.sessions)) {
            const sessionsCount = info.sessions.length;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="info-label">Активных сессий</td>
                <td class="info-value">${sessionsCount}</td>
            `;
            tbody.appendChild(tr);

            // Если есть активные сессии - показываем их
            if (sessionsCount > 0) {
                info.sessions.forEach((session, idx) => {
                    const sessionTr = document.createElement('tr');
                    const sessionInfo = typeof session === 'object' ?
                        JSON.stringify(session) : String(session);
                    sessionTr.innerHTML = `
                        <td class="info-label" style="padding-left: 1.5rem">Сессия ${idx + 1}</td>
                        <td class="info-value">${escapeHtml(sessionInfo)}</td>
                    `;
                    tbody.appendChild(sessionTr);
                });
            }
        }
    }
}

// Рендеринг статистики
function renderStatistics(tabKey, statsData) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const section = getElementInTab(tabKey, `statistics-section-${displayName}`);
    const container = getElementInTab(tabKey, `statistics-${displayName}`);
    if (!section || !container) return;

    if (!statsData) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // Сохраняем данные статистики в state для фильтрации
    tabState.statisticsData = statsData;

    // Проверяем, был ли уже создан контейнер
    let generalTable = container.querySelector('.stats-general-table');
    let sensorsSection = container.querySelector('.stats-sensors-section');

    if (!generalTable) {
        // Первичный рендеринг - создаём структуру
        container.innerHTML = `
            <table class="info-table stats-general-table">
                <tbody></tbody>
            </table>
            <div class="stats-sensors-section" style="display:none">
                <div class="stats-subtitle">Sensors</div>
                <input type="text"
                       class="filter-input stats-filter"
                       id="filter-stats-${displayName}"
                       placeholder="Filter by sensor name..."
                       data-object="${tabKey}">
                <table class="variables-table stats-sensors-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Срабатываний</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;

        // Настроить обработчик фильтра
        const filterInput = container.querySelector(`#filter-stats-${displayName}`);
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                renderStatisticsSensors(tabKey, e.target.value);
            });
            filterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    filterInput.value = '';
                    filterInput.blur();
                    renderStatisticsSensors(tabKey, '');
                }
            });
        }

        generalTable = container.querySelector('.stats-general-table');
        sensorsSection = container.querySelector('.stats-sensors-section');
    }

    // Обновляем общую статистику
    const generalTbody = generalTable.querySelector('tbody');
    generalTbody.innerHTML = '';

    Object.entries(statsData).forEach(([key, value]) => {
        if (key === 'sensors' && typeof value === 'object') {
            return;
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="info-label">${escapeHtml(key)}</td>
            <td class="info-value">${escapeHtml(String(formatValue(value)))}</td>
        `;
        generalTbody.appendChild(tr);
    });

    // Обновляем секцию сенсоров
    if (statsData.sensors && typeof statsData.sensors === 'object' && Object.keys(statsData.sensors).length > 0) {
        sensorsSection.style.display = 'block';
        const currentFilter = container.querySelector(`#filter-stats-${displayName}`)?.value || '';
        renderStatisticsSensors(tabKey, currentFilter);
    } else {
        sensorsSection.style.display = 'none';
    }
}

// Рендеринг таблицы сенсоров в статистике с фильтрацией
function renderStatisticsSensors(tabKey, filterText = '') {
    const tabState = state.tabs.get(tabKey);
    if (!tabState || !tabState.statisticsData?.sensors) return;

    const displayName = tabState.displayName || tabKey;

    const container = getElementInTab(tabKey, `statistics-${displayName}`);
    if (!container) return;

    const tbody = container.querySelector('.stats-sensors-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const filterLower = filterText.toLowerCase();
    const sensors = tabState.statisticsData.sensors;

    Object.entries(sensors).forEach(([sensorKey, sensorData]) => {
        // sensorData может быть объектом {id, name, count} или просто числом
        let sensorId, sensorName, sensorCount;

        if (typeof sensorData === 'object' && sensorData !== null) {
            // Формат: {id: 1, name: "Input1_S", count: 5}
            sensorId = sensorData.id ?? '-';
            sensorName = sensorData.name || sensorKey;
            sensorCount = sensorData.count ?? 0;
        } else {
            // Формат: "SensorName": 5 (просто число срабатываний)
            const sensorInfo = getSensorInfo(sensorKey);
            sensorId = sensorInfo?.id || '-';
            sensorName = sensorKey;
            sensorCount = sensorData;
        }

        if (filterText && !sensorName.toLowerCase().includes(filterLower)) {
            return;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(String(sensorId))}</td>
            <td class="variable-name">${escapeHtml(String(sensorName))}</td>
            <td class="variable-value">${escapeHtml(String(formatValue(sensorCount)))}</td>
        `;
        tbody.appendChild(tr);
    });

    if (tbody.children.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No data</td></tr>';
    }
}

// Восстановление состояния спойлеров из localStorage
function restoreCollapsedSections(objectName) {
    try {
        const saved = localStorage.getItem('uniset-panel-collapsed');
        if (saved) {
            state.collapsedSections = JSON.parse(saved);
        }
    } catch (err) {
        console.warn('Error загрузки состояния спойлеров:', err);
    }

    // Apply сохранённые состояния к секциям этого объекта
    Object.entries(state.collapsedSections).forEach(([sectionId, collapsed]) => {
        if (sectionId.endsWith(`-${objectName}`)) {
            const section = document.querySelector(`[data-section="${sectionId}"]`);
            if (section && collapsed) {
                section.classList.add('collapsed');
            }
        }
    });
}

// Сохранение состояния спойлеров в localStorage
function saveCollapsedSections() {
    const sections = document.querySelectorAll('.collapsible-section[data-section]');
    const collapsed = {};

    sections.forEach(section => {
        const sectionId = section.dataset.section;
        collapsed[sectionId] = section.classList.contains('collapsed');
    });

    state.collapsedSections = collapsed;

    try {
        localStorage.setItem('uniset-panel-collapsed', JSON.stringify(collapsed));
    } catch (err) {
        console.warn('Error сохранения состояния спойлеров:', err);
    }
}

// Color picker для изменения цвета графика
let activeColorPicker = null;

function showColorPicker(element, tabKey, varName) {
    // Close предыдущий picker если открыт
    hideColorPicker();

    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const chartData = tabState.charts.get(varName);
    if (!chartData) return;

    const currentColor = chartData.color;
    const rect = element.getBoundingClientRect();

    const popup = document.createElement('div');
    popup.className = 'color-picker-popup';
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;

    CHART_COLORS.forEach(color => {
        const option = document.createElement('div');
        option.className = 'color-picker-option';
        if (color === currentColor) option.classList.add('selected');
        option.style.background = color;
        option.addEventListener('click', () => {
            changeChartColor(tabKey, varName, color);
            hideColorPicker();
        });
        popup.appendChild(option);
    });

    document.body.appendChild(popup);
    activeColorPicker = popup;

    // Close по клику вне popup
    setTimeout(() => {
        document.addEventListener('click', handleColorPickerOutsideClick);
    }, 0);
}

function hideColorPicker() {
    if (activeColorPicker) {
        activeColorPicker.remove();
        activeColorPicker = null;
        document.removeEventListener('click', handleColorPickerOutsideClick);
    }
}

function handleColorPickerOutsideClick(e) {
    if (activeColorPicker && !activeColorPicker.contains(e.target) && !e.target.classList.contains('legend-color-picker')) {
        hideColorPicker();
    }
}

function changeChartColor(tabKey, varName, newColor) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const chartData = tabState.charts.get(varName);
    if (!chartData) return;

    // Обновить цвет в данных
    chartData.color = newColor;

    // Обновить цвет графика
    const chart = chartData.chart;
    chart.data.datasets[0].borderColor = newColor;
    chart.data.datasets[0].backgroundColor = `${newColor}20`;
    chart.update('none');

    // Обновить цвет квадратика в шапке
    // Используем displayName для ID элемента (objectName)
    const displayName = tabState.displayName || tabKey;
    const safeVarName = varName.replace(/:/g, '-');
    const colorPicker = document.querySelector(`#chart-panel-${displayName}-${safeVarName} .legend-color-picker`);
    if (colorPicker) {
        colorPicker.style.background = newColor;
    }
}

// Переключение заливки графика
// tabKey - ключ вкладки (serverId:objectName)
function toggleChartFill(tabKey, varName, fillEnabled) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const chartData = tabState.charts.get(varName);
    if (!chartData) return;

    chartData.chart.data.datasets[0].fill = fillEnabled;
    chartData.chart.update('none');
}

// Переключение сглаживания линии графика
// tabKey - ключ вкладки (serverId:objectName)
function toggleChartSmooth(tabKey, varName, smoothEnabled) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const chartData = tabState.charts.get(varName);
    if (!chartData) return;

    chartData.chart.data.datasets[0].tension = smoothEnabled ? 0.3 : 0;
    chartData.chart.update('none');
}

// Делегирование события для color picker
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('legend-color-picker')) {
        const tabKey = e.target.dataset.object; // data-object содержит tabKey
        const varName = e.target.dataset.variable;
        showColorPicker(e.target, tabKey, varName);
    }
});

// Настройка обработчиков фильтра для вкладки
function setupFilterHandlers(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    const filterInput = getElementInTab(tabKey, `filter-variables-${displayName}`);
    if (!filterInput) return;

    // Обработка ввода
    filterInput.addEventListener('input', (e) => {
        const tabState = state.tabs.get(tabKey);
        if (tabState && tabState.variables) {
            renderVariables(tabKey, tabState.variables, e.target.value);
        }
    });

    // Обработка ESC
    filterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            filterInput.value = '';
            filterInput.blur();
            const tabState = state.tabs.get(tabKey);
            if (tabState && tabState.variables) {
                renderVariables(tabKey, tabState.variables, '');
            }
        }
    });
}

// Пауза/возобновление обновления графиков
function toggleChartsPause(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;
    tabState.chartsPaused = !tabState.chartsPaused;
    const displayName = tabState.displayName || tabKey;
    const btn = getElementInTab(tabKey, `charts-pause-${displayName}`);
    if (btn) {
        btn.textContent = tabState.chartsPaused ? '▶' : '||';
        btn.title = tabState.chartsPaused ? 'Resume chart updates' : 'Pause chart updates';
        btn.classList.toggle('paused', tabState.chartsPaused);
    }
    // При снятии паузы — отрисовать накопленные данные
    if (!tabState.chartsPaused) {
        syncAllChartsTimeRange(tabKey);
    }
}

// Настройка resize для графиков
function setupChartsResize(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    setupResizeHandle(
        getElementInTab(tabKey, `charts-resize-${displayName}`),
        getElementInTab(tabKey, `charts-container-${displayName}`),
        CHARTS_CONTAINER_MIN_HEIGHT,
        (height) => saveChartsHeight(tabKey, height)
    );

    loadChartsHeight(tabKey);
}

function saveChartsHeight(tabKey, height) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-charts-height') || '{}');
        saved[tabKey] = height;
        localStorage.setItem('uniset-panel-charts-height', JSON.stringify(saved));
    } catch (err) {
        console.warn('Failed to save charts height:', err);
    }
}

function loadChartsHeight(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;

    const displayName = tabState.displayName || tabKey;

    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-charts-height') || '{}');
        if (saved[tabKey]) {
            const chartsContainer = getElementInTab(tabKey, `charts-container-${displayName}`);
            if (chartsContainer) {
                chartsContainer.style.height = `${saved[tabKey]}px`;
                chartsContainer.style.maxHeight = `${saved[tabKey]}px`;
            }
        }
    } catch (err) {
        console.warn('Failed to load charts height:', err);
    }
}

// Настройка resize для IONC секции датчиков
function setupIONCSensorsResize(tabKey, objectName) {
    setupResizeHandle(
        getElementInTab(tabKey, `ionc-resize-${objectName}`),
        getElementInTab(tabKey, `ionc-sensors-container-${objectName}`),
        SENSORS_CONTAINER_MIN_HEIGHT,
        (height) => saveIONCSensorsHeight(tabKey, height)
    );

    loadIONCSensorsHeight(tabKey, objectName);
}

function saveIONCSensorsHeight(tabKey, height) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-ionc-height') || '{}');
        saved[tabKey] = height;
        localStorage.setItem('uniset-panel-ionc-height', JSON.stringify(saved));
    } catch (err) {
        console.warn('Failed to save IONC sensors height:', err);
    }
}

function loadIONCSensorsHeight(tabKey, objectName) {


// === 53-ui-settings.js ===
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-ionc-height') || '{}');
        const height = saved[tabKey] ?? saved[objectName];
        if (height) {
            const sensorsContainer = getElementInTab(tabKey, `ionc-sensors-container-${objectName}`);
            if (sensorsContainer) {
                sensorsContainer.style.height = `${height}px`;
                sensorsContainer.style.maxHeight = `${height}px`;
            }
        }
    } catch (err) {
        console.warn('Failed to load IONC sensors height:', err);
    }
}

// Переключение режима отображения IO (горизонтально/вертикально)
function toggleIOLayout(tabKey, objectName) {
    const checkbox = getElementInTab(tabKey, `io-sequential-${objectName}`);
    const ioGrid = getElementInTab(tabKey, `io-grid-${objectName}`);

    if (!checkbox || !ioGrid) return;

    if (checkbox.checked) {
        ioGrid.classList.add('io-sequential');
    } else {
        ioGrid.classList.remove('io-sequential');
    }

    // Сохраняем состояние
    saveIOLayoutState(tabKey, checkbox.checked);
}

function saveIOLayoutState(tabKey, isSequential) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-layout') || '{}');
        saved[tabKey] = isSequential;
        localStorage.setItem('uniset-panel-io-layout', JSON.stringify(saved));
    } catch (err) {
        console.warn('Failed to save IO layout state:', err);
    }
}

function loadIOLayoutState(tabKey, objectName) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-layout') || '{}');
        if (saved[tabKey] ?? saved[objectName]) {
            const checkbox = getElementInTab(tabKey, `io-sequential-${objectName}`);
            const ioGrid = getElementInTab(tabKey, `io-grid-${objectName}`);
            if (checkbox && ioGrid) {
                checkbox.checked = true;
                ioGrid.classList.add('io-sequential');
            }
        }
    } catch (err) {
        console.warn('Failed to load IO layout state:', err);
    }
}

// === Section Reordering ===

// tabKey - ключ вкладки (serverId:objectName)
function moveSectionUp(tabKey, sectionId) {
    const section = getSectionElement(tabKey, sectionId);
    if (!section) return;

    const prev = getPreviousReorderableSection(section);
    if (prev) {
        section.parentNode.insertBefore(section, prev);
        saveSectionOrder(tabKey);
        updateReorderButtons(tabKey);
    }
}

// tabKey - ключ вкладки (serverId:objectName)
function moveSectionDown(tabKey, sectionId) {
    const section = getSectionElement(tabKey, sectionId);
    if (!section) return;

    const next = getNextReorderableSection(section);
    if (next) {
        section.parentNode.insertBefore(next, section);
        saveSectionOrder(tabKey);
        updateReorderButtons(tabKey);
    }
}

function getSectionElement(tabKey, sectionId) {
    // Ищем секцию по data-section-id внутри панели вкладки
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return null;
    return panel.querySelector(`.reorderable-section[data-section-id="${sectionId}"]`);
}

function getPreviousReorderableSection(element) {
    let prev = element.previousElementSibling;
    while (prev) {
        if (prev.classList.contains('reorderable-section') && prev.style.display !== 'none') {
            return prev;
        }
        prev = prev.previousElementSibling;
    }
    return null;
}

function getNextReorderableSection(element) {
    let next = element.nextElementSibling;
    while (next) {
        if (next.classList.contains('reorderable-section') && next.style.display !== 'none') {
            return next;
        }
        next = next.nextElementSibling;
    }
    return null;
}

// tabKey - ключ вкладки (serverId:objectName)
function saveSectionOrder(tabKey) {
    try {
        const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
        if (!panel) return;

        const sections = panel.querySelectorAll('.reorderable-section[data-section-id]');
        const order = Array.from(sections).map(s => s.dataset.sectionId);

        const saved = JSON.parse(localStorage.getItem('uniset-panel-section-order') || '{}');
        saved[tabKey] = order;
        localStorage.setItem('uniset-panel-section-order', JSON.stringify(saved));
    } catch (err) {
        console.warn('Failed to save section order:', err);
    }
}

// tabKey - ключ вкладки (serverId:objectName)
function loadSectionOrder(tabKey) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-section-order') || '{}');
        const order = saved[tabKey];
        if (!order || !Array.isArray(order)) return;

        const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
        if (!panel) return;

        // Собираем все reorderable секции в Map
        const sections = new Map();
        panel.querySelectorAll('.reorderable-section[data-section-id]').forEach(s => {
            sections.set(s.dataset.sectionId, s);
        });

        if (sections.size === 0) return;

        // Собираем секции в нужном порядке
        const orderedSections = order
            .map(id => sections.get(id))
            .filter(s => s != null);

        if (orderedSections.length < 2) return;

        // Находим первую секцию в DOM (точка привязки)
        const allSections = [...sections.values()];
        allSections.sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        );
        let anchor = allSections[0];

        // Вставляем в обратном порядке перед anchor
        // После каждой вставки новый элемент становится anchor
        for (let i = orderedSections.length - 1; i >= 0; i--) {
            panel.insertBefore(orderedSections[i], anchor);
            anchor = orderedSections[i];
        }

        updateReorderButtons(tabKey);
    } catch (err) {
        console.warn('Failed to load section order:', err);
    }
}

// tabKey - ключ вкладки (serverId:objectName)
function updateReorderButtons(tabKey) {
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return;

    const sections = Array.from(panel.querySelectorAll('.reorderable-section[data-section-id]'))
        .filter(s => s.style.display !== 'none');

    sections.forEach((section, index) => {
        const upBtn = section.querySelector('.section-move-up');
        const downBtn = section.querySelector('.section-move-down');

        if (upBtn) {
            upBtn.disabled = index === 0;
        }
        if (downBtn) {
            downBtn.disabled = index === sections.length - 1;
        }
    });
}

// IO Section resize, filter, and pin functionality
// tabKey - ключ вкладки (serverId:objectName)
function setupIOSections(tabKey) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;
    const objectName = tabState.displayName || tabKey;

    // Setup global filter for all IO sections
    setupIOGlobalFilter(tabKey, objectName);

    ['inputs', 'outputs', 'timers'].forEach(type => {
        setupIOResize(tabKey, objectName, type);
        setupIOUnpinAll(tabKey, objectName, type);
        setupIOCollapse(tabKey, objectName, type);
    });
}

function setupIOCollapse(tabKey, objectName, type) {
    const panel = document.querySelector(`.tab-panel[data-name="${tabKey}"]`);
    if (!panel) return;

    const toggleEl = panel.querySelector(`.io-section-toggle[data-section="${type}-${objectName}"]`);
    const section = getElementInTab(tabKey, `${type}-section-${objectName}`);

    if (!toggleEl || !section) return;

    // Load saved state
    const savedState = loadIOCollapseState(tabKey, type);
    if (savedState === 'collapsed') {
        section.classList.add('collapsed');
    }

    toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        section.classList.toggle('collapsed');
        saveIOCollapseState(tabKey, type, section.classList.contains('collapsed'));
    });
}

function saveIOCollapseState(tabKey, type, collapsed) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-collapse') || '{}');
        const key = `${tabKey}-${type}`;
        saved[key] = collapsed ? 'collapsed' : 'expanded';
        localStorage.setItem('uniset-panel-io-collapse', JSON.stringify(saved));
    } catch (err) {
        console.warn('Failed to save IO collapse state:', err);
    }
}

function loadIOCollapseState(tabKey, type) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-collapse') || '{}');
        const key = `${tabKey}-${type}`;
        return saved[key] || 'expanded';
    } catch (err) {
        console.warn('Failed to load IO collapse state:', err);
        return 'expanded';
    }
}

function setupIOResize(tabKey, objectName, type) {
    setupResizeHandle(
        getElementInTab(tabKey, `io-resize-${type}-${objectName}`),
        getElementInTab(tabKey, `io-container-${type}-${objectName}`),
        MIN_SECTION_HEIGHT,
        (height) => saveIOHeight(tabKey, type, height)
    );

    loadIOHeight(tabKey, objectName, type);
}

function saveIOHeight(tabKey, type, height) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-heights') || '{}');
        const key = `${tabKey}-${type}`;
        saved[key] = height;
        localStorage.setItem('uniset-panel-io-heights', JSON.stringify(saved));
    } catch (err) {
        console.warn('Failed to save IO height:', err);
    }
}

function loadIOHeight(tabKey, objectName, type) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-heights') || '{}');
        const key = `${tabKey}-${type}`;
        if (saved[key]) {
            const container = getElementInTab(tabKey, `io-container-${type}-${objectName}`);
            if (container) {
                container.style.height = `${saved[key]}px`;
                container.style.maxHeight = `${saved[key]}px`;
            }
        }
    } catch (err) {
        console.warn('Failed to load IO height:', err);
    }
}

// tabKey - ключ вкладки, objectName - displayName для DOM селекторов
function setupIOGlobalFilter(tabKey, objectName) {
    const filterInput = getElementInTab(tabKey, `io-filter-global-${objectName}`);
    if (!filterInput) return;

    let filterTimeout = null;

    const refilterAll = () => {
        const tabState = state.tabs.get(tabKey);
        if (tabState) {
            if (tabState.ioData?.in) {
                renderIO(tabKey, 'inputs', tabState.ioData.in);
            }
            if (tabState.ioData?.out) {
                renderIO(tabKey, 'outputs', tabState.ioData.out);
            }
            if (tabState.timersData) {
                renderTimers(tabKey, tabState.timersData);
            }
        }
    };

    filterInput.addEventListener('input', (e) => {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(refilterAll, SETTINGS_FILTER_DEBOUNCE_DELAY);
    });

    // ESC to clear and blur
    filterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            filterInput.value = '';
            filterInput.blur();
            refilterAll();
        }
    });
}

// Перерисовка IO секции по типу (inputs/outputs/timers)
function reRenderIOType(tabKey, type) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;
    if (type === 'inputs' && tabState.ioData?.in) renderIO(tabKey, 'inputs', tabState.ioData.in);
    else if (type === 'outputs' && tabState.ioData?.out) renderIO(tabKey, 'outputs', tabState.ioData.out);
    else if (type === 'timers' && tabState.timersData) renderTimers(tabKey, tabState.timersData);
}

// tabKey - ключ вкладки, objectName - displayName для DOM селекторов
function setupIOUnpinAll(tabKey, objectName, type) {
    const unpinBtn = getElementInTab(tabKey, `io-unpin-${type}-${objectName}`);
    if (!unpinBtn) return;

    unpinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearIOPinnedRows(tabKey, type);
        reRenderIOType(tabKey, type);
    });
}

// Pinned rows management
function getIOPinnedRows(tabKey, type) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-pinned') || '{}');
        const key = `${tabKey}-${type}`;
        return new Set(saved[key] || []);
    } catch (err) {
        return new Set();
    }
}

function saveIOPinnedRows(tabKey, type, pinnedSet) {
    try {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-io-pinned') || '{}');
        const key = `${tabKey}-${type}`;
        saved[key] = Array.from(pinnedSet);
        localStorage.setItem('uniset-panel-io-pinned', JSON.stringify(saved));
    } catch (err) {
        console.warn('Failed to save pinned rows:', err);
    }
}

function toggleIOPin(tabKey, type, rowKey) {
    const pinned = getIOPinnedRows(tabKey, type);
    const keyStr = String(rowKey);

    if (pinned.has(keyStr)) {
        pinned.delete(keyStr);
    } else {
        pinned.add(keyStr);
    }

    saveIOPinnedRows(tabKey, type, pinned);
    reRenderIOType(tabKey, type);
}

function clearIOPinnedRows(tabKey, type) {
    saveIOPinnedRows(tabKey, type, new Set());
}

// Установка временного диапазона
function setTimeRange(range) {
    // Обновляем active класс на всех кнопках
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        const btnRange = parseInt(btn.getAttribute('onclick')?.match(/setTimeRange\((\d+)\)/)?.[1], 10);
        btn.classList.toggle('active', btnRange === range);
    });

    state.timeRange = range;
    saveSettings();

    // Сбросить начальное время для всех вкладок при изменении интервала
    state.tabs.forEach((tabState, objectName) => {
        if (tabState.charts.size > 0) {
            tabState.chartStartTime = Date.now();
        }
        tabState.charts.forEach((chartData, varName) => {
            updateChart(objectName, varName, chartData.chart);
        });
    });
}


// Сохранение настроек в localStorage
function saveSettings() {
    const settings = {
        timeRange: state.timeRange,
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedServerGroups: Array.from(state.collapsedServerGroups),
        serversSectionCollapsed: state.serversSectionCollapsed,
        launchersSectionCollapsed: state.launchersSectionCollapsed
    };
    localStorage.setItem('uniset-panel-settings', JSON.stringify(settings));
}

// Loading настроек из localStorage
function loadSettings() {
    try {
        const saved = localStorage.getItem('uniset-panel-settings');
        if (saved) {
            const settings = JSON.parse(saved);

            // Восстановить timeRange
            if (settings.timeRange) {
                state.timeRange = settings.timeRange;
                document.querySelectorAll('.time-range-btn').forEach(btn => {
                    btn.classList.toggle('active', parseInt(btn.dataset.range, 10) === state.timeRange);
                });
            }

            // Восстановить состояние sidebar
            if (settings.sidebarCollapsed) {
                state.sidebarCollapsed = settings.sidebarCollapsed;
                document.getElementById('sidebar').classList.add('collapsed');
            }

            // Восстановить свёрнутые группы серверов
            if (settings.collapsedServerGroups && Array.isArray(settings.collapsedServerGroups)) {
                state.collapsedServerGroups = new Set(settings.collapsedServerGroups);
            }

            // Восстановить состояние секции "Servers"
            if (settings.serversSectionCollapsed !== undefined) {
                state.serversSectionCollapsed = settings.serversSectionCollapsed;
            }

            // Восстановить состояние секции "Launchers"
            if (settings.launchersSectionCollapsed !== undefined) {
                state.launchersSectionCollapsed = settings.launchersSectionCollapsed;
            }
        }
    } catch (err) {
        console.warn('Error загрузки настроек:', err);
    }
}

// Loading конфигурации приложения
async function loadAppConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            state.config = { ...state.config, ...config };
            console.log('App config loaded:', state.config);
        }
    } catch (err) {
        console.warn('Failed to load app config:', err);
    }
}



// === 55-sidebar-groups.js ===
// Sidebar Groups — рендеринг сгруппированного sidebar
// Загружается между UI-функциями (50-59 диапазон)

const ENTITY_TYPE_BADGE = {
    object: 'Obj',
    launcher: 'Lnc',
    journal: 'Jrn',
    dashboard: 'Dsh',
    server: 'Srv'
};

// Загрузка sidebar конфигурации с сервера
async function loadSidebar() {
    try {
        const response = await fetch('/api/sidebar');
        if (!response.ok) {
            console.warn('Sidebar API error:', response.status);
            state.sidebarGroups = [];
            return;
        }
        const data = await response.json();
        state.sidebarGroups = Array.isArray(data.groups) ? data.groups : [];
        console.log(`Sidebar: ${state.sidebarGroups.length} groups loaded`);
    } catch (err) {
        console.warn('Failed to load sidebar config:', err);
        state.sidebarGroups = [];
    }
}

// Загрузка collapse состояния групп из localStorage
function loadGroupCollapseState() {
    try {
        const saved = localStorage.getItem('uniset-panel-group-collapse');
        if (saved) {
            state.groupCollapseState = JSON.parse(saved);
        }
    } catch (err) {
        state.groupCollapseState = {};
    }
}

// Сохранение collapse состояния групп в localStorage
function saveGroupCollapseState() {
    try {
        localStorage.setItem('uniset-panel-group-collapse', JSON.stringify(state.groupCollapseState));
    } catch (err) {
        // ignore
    }
}

// Основная функция рендеринга всех групп
function renderSidebarGroups() {
    const container = document.getElementById('sidebar-groups');
    if (!container || !state.sidebarGroups) return;

    container.innerHTML = '';
    loadGroupCollapseState();

    for (const group of state.sidebarGroups) {
        renderSidebarGroup(group, container);
    }

    // Пользовательские dashboard'ы из localStorage
    renderUserDashboardsGroup(container);
}

// Рендеринг одной группы
function renderSidebarGroup(group, container) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'sidebar-group';
    const collapseKey = group.name || `_group_${container.children.length}`;
    groupDiv.dataset.groupName = collapseKey;

    const isCollapsed = state.groupCollapseState[collapseKey] === true;
    if (isCollapsed) {
        groupDiv.classList.add('collapsed');
    }

    const header = document.createElement('div');
    header.className = 'sidebar-group-header';
    const iconHtml = group.icon ? `<span class="sidebar-group-icon">${escapeHtml(group.icon)}</span>` : '';
    const titleHtml = group.name ? `<span class="sidebar-group-title">${escapeHtml(group.name)}</span>` : '';
    header.innerHTML = `
        <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
        </svg>
        ${iconHtml}
        ${titleHtml}
        <span class="sidebar-group-count">${group.items ? group.items.length : 0}</span>
    `;
    header.addEventListener('click', () => {
        groupDiv.classList.toggle('collapsed');
        state.groupCollapseState[collapseKey] = groupDiv.classList.contains('collapsed');
        saveGroupCollapseState();
    });
    groupDiv.appendChild(header);

    // Items — всегда плоский список с бейджами
    const ul = document.createElement('ul');
    ul.className = 'sidebar-group-items';

    if (group.items) {
        for (const item of group.items) {
            ul.appendChild(createSidebarGroupItem(item));
        }
    }

    groupDiv.appendChild(ul);
    container.appendChild(groupDiv);
}

// Создание одного элемента sidebar
function createSidebarGroupItem(item) {
    const li = document.createElement('li');
    li.className = 'sidebar-group-item';
    li.dataset.type = item.type;
    li.dataset.name = item.name;
    if (item.serverId) {
        li.dataset.serverId = item.serverId;
    }

    // Status dot для объектов и серверов
    if (item.type === 'object' || item.type === 'server') {
        const dot = document.createElement('span');
        dot.className = 'sidebar-group-status';
        li.appendChild(dot);
    }

    // Type badge
    const badge = document.createElement('span');
    badge.className = `entity-type-badge entity-type-${item.type}`;
    badge.textContent = ENTITY_TYPE_BADGE[item.type] || item.type;
    li.appendChild(badge);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'sidebar-group-item-name';
    nameSpan.textContent = item.displayName || item.name;
    li.appendChild(nameSpan);

    li.addEventListener('click', () => {
        activateSidebarGroupItem(item.type, item.name, item.serverId);
        // Подсветка активного элемента
        document.querySelectorAll('.sidebar-group-item.active').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
    });

    return li;
}

// Активация элемента sidebar — открытие соответствующего таба
function activateSidebarGroupItem(type, name, serverId) {
    switch (type) {
        case 'object': {
            const serverInfo = state.servers.get(serverId);
            const serverName = serverInfo ? serverInfo.name : (serverId || '');
            openObjectTab(name, serverId, serverName);
            break;
        }
        case 'launcher': {
            for (const [nodeId, node] of state.nodes) {
                if (node.name === name) {
                    openLauncherTab(nodeId, node.name, node.launcherUrl, node.hasControl);
                    return;
                }
            }
            break;
        }
        case 'dashboard': {
            if (dashboardManager) {
                dashboardManager.switchView('dashboard');
                dashboardManager.loadDashboard(name);
            }
            break;
        }
        case 'journal': {
            if (typeof journalManager !== 'undefined' && journalManager) {
                for (const [id, journal] of journalManager.journals) {
                    if (journal.name === name) {
                        journalManager.openJournal(id);
                        return;
                    }
                }
            }
            break;
        }
        case 'server': {
            for (const [serverId, server] of state.servers) {
                if (server.id === name || server.name === name) {
                    const group = document.querySelector(`.server-group[data-server-id="${serverId}"]`);
                    if (group) {
                        group.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    return;
                }
            }
            break;
        }
    }
}

// Обновление статуса сущности в sidebar группах (вызывается из SSE хуков)
function updateGroupEntityStatus(type, name, connected) {
    const container = document.getElementById('sidebar-groups');
    if (!container) return;

    const selector = `.sidebar-group-item[data-type="${type}"][data-name="${CSS.escape(name)}"]`;
    const items = container.querySelectorAll(selector);
    items.forEach(item => {
        const dot = item.querySelector('.sidebar-group-status');
        if (dot) {
            dot.classList.toggle('connected', connected);
            dot.classList.toggle('disconnected', !connected);
        }
    });

    // Объекты наследуют статус от своего сервера
    if (type === 'server') {
        const objSelector = `.sidebar-group-item[data-type="object"][data-server-id="${CSS.escape(name)}"]`;
        container.querySelectorAll(objSelector).forEach(item => {
            const dot = item.querySelector('.sidebar-group-status');
            if (dot) {
                dot.classList.toggle('connected', connected);
                dot.classList.toggle('disconnected', !connected);
            }
        });
    }
}

// Обновление sidebar при изменении списка объектов
async function refreshSidebarGroups() {
    await loadSidebar();
    renderSidebarGroups();
    applySidebarStatuses();
}

// Применяет текущие статусы из state к точкам в sidebar
function applySidebarStatuses() {
    for (const [serverId, server] of state.servers) {
        if (server.connected !== undefined) {
            updateGroupEntityStatus('server', serverId, server.connected);
        }
    }
    for (const [nodeId, node] of state.nodes) {
        if (node.connected !== undefined) {
            updateGroupEntityStatus('launcher', node.name, node.connected);
        }
    }
    if (typeof journalManager !== 'undefined' && journalManager?.journals) {
        for (const [journalId, journal] of journalManager.journals) {
            updateGroupEntityStatus('journal', journal.name, journal.connected !== false);
        }
    }
}

// Рендеринг пользовательских dashboard'ов в отдельную группу
function renderUserDashboardsGroup(container) {
    try {
        const saved = localStorage.getItem('user-dashboards');
        if (!saved) return;

        const userDashboards = JSON.parse(saved);
        if (!Array.isArray(userDashboards) || userDashboards.length === 0) return;

        const items = userDashboards.map(name => ({
            type: 'dashboard',
            name: name
        }));

        renderSidebarGroup({
            name: 'Custom',
            items: items
        }, container);
    } catch (err) {
        // ignore
    }
}


// === 60-dashboard-base.js ===
// ============================================================================
// Dashboard System
// ============================================================================

const DASHBOARD_VERSION = 1;

// Dashboard state
const dashboardState = window.dashboardState = {
    currentView: 'objects', // 'objects' or 'dashboard'
    currentDashboard: null, // current dashboard name
    dashboards: new Map(),  // name -> dashboard config
    serverDashboards: [],   // list of server-side dashboards
    editMode: false,
    selectedWidgetId: null, // selected widget for keyboard movement
    widgets: new Map(),     // widgetId -> widget instance
    sensorSubscriptions: new Map(), // sensorKey -> Set of widgetIds (sensorKey = ${serverId}|${objectName}|${sensorName})
    setpointSubscriptions: new Map(), // sensorKey -> Set of widgetIds (для setpoint sensor2)
    chartSubscriptions: new Map(), // sensorKey -> Set of widgetIds
    pendingImport: null     // pending import data
};

// ============================================================================
// Base Widget Class
// ============================================================================

class DashboardWidget {
    static type = 'base';
    static displayName = 'Base Widget';
    static description = 'Base widget class';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
    static defaultSize = { width: 2, height: 1 };
    static minSize = { width: 1, height: 1 };
    static maxSize = { width: 6, height: 2 };

    constructor(id, config, container) {
        this.id = id;
        this.config = config;
        this.container = container;
        this.value = null;
        this.error = null;
        this.element = null;
    }

    // Override in subclasses
    render() {
        this.element = document.createElement('div');
        this.element.className = 'widget-content';
        this.element.innerHTML = '<span class="widget-value">--</span>';
        this.container.appendChild(this.element);
    }

    // Override in subclasses
    update(value, error = null) {
        this.value = value;
        this.error = error;
    }

    // Override in subclasses to return config form HTML
    static getConfigForm(config = {}) {
        return `
            <div class="widget-config-field">
                <label>Sensor</label>
                <input type="text" class="widget-input" name="sensor"
                       value="${escapeAttr(config.sensor || '')}" placeholder="Type to search..." autocomplete="off">
            </div>
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
        `;
    }

    // Override in subclasses to parse form data
    static parseConfigForm(form) {
        return {
            sensor: form.querySelector('[name="sensor"]')?.value || '',
            label: form.querySelector('[name="label"]')?.value || ''
        };
    }

    destroy() {
        if (this.element) {
            this.element.remove();
        }
    }

    getConfig() {
        return { ...this.config };
    }
}

// ============================================================================
// Gauge Widget (SVG)
// ============================================================================



// === 61-dashboard-active-base.js ===
// ============================================================================
// ActiveDashboardWidget — базовый класс для активных (write-capable) виджетов.
//
// Базовый класс предоставляет:
//   - writeValue(value): запись через controlledFetch на /api/objects/.../ionc/set
//   - writeState: 'idle' | 'pending' | 'success' | 'error' (с auto-revert/timeout)
//   - commandValue / feedbackValue: раздельные «команда vs обратная связь» (SCADA)
//   - isInteractive(): false в edit mode и без controlToken
//   - _updateInteractivityClass(): реактивный active-disabled
//   - _recomputeTitle(): единое управление tooltip'ом (приоритет: error > blocked > пусто)
//   - needsConfirmation(): читает config.requireConfirmation
//   - static getConfigForm: рендерит objectName select + sensor input + hidden sensorId +
//     style select (если styles.length > 1) + label + requireConfirmation
//   - static parseConfigForm: парсит base поля + spread parseActiveConfigFields()
//   - static initConfigHandlers: загружает IONC dropdown + setupSensorAutocomplete
//
// Subclass contract (минимальный active widget):
//   - render() — построить DOM, навесить interaction handlers
//   - renderCommand() — отразить commandValue + writeState в DOM
//   - renderFeedback() — отразить feedbackValue + error в DOM
//
// Опциональные override:
//   - static getActiveConfigFields(config) — дополнительные поля формы
//   - static parseActiveConfigFields(form) — парсинг этих полей (return {} merge'ится)
//   - static styles + static defaultStyle — несколько визуальных стилей; base.getConfigForm
//     автоматически рендерит style select когда styles.length > 1
//   - _confirm(value) — заменить window.confirm на красивый dialog
//
// НЕ переопределять (наследуется и достаточно):
//   - getConfigForm, parseConfigForm, initConfigHandlers, writeValue, _doWrite,
//     usesNewSensorAutocomplete, _setWriteState, _recomputeTitle, _updateInteractivityClass.
//
// Persisted base config поля: serverId, sensor, sensorId, objectName, label,
// requireConfirmation, style. Subclass добавляет свои через
// parseActiveConfigFields/getActiveConfigFields — НЕ перекрывай serverId
// и не возвращай его из parseActiveConfigFields.
//
// Конкретные виджеты реализуются в файлах 61-dashboard-active-*.js и регистрируются
// в WIDGET_TYPES (62-dashboard-manager.js).
// ============================================================================

class ActiveDashboardWidget extends DashboardWidget {
    static type = 'active-base';
    static displayName = 'Active Widget (base)';
    static description = 'Base class for write-capable widgets';
    // Active widgets всегда используют setupSensorAutocomplete (41-sensor-autocomplete.js).
    // dashboard-manager skip'ает legacy in-memory sensor autocomplete для widget'ов
    // c этим флагом. См. 62-dashboard-manager.js setupConfigDialog.
    static usesNewSensorAutocomplete = true;
    // Subclasses с несколькими стилями (toggle: ['slider','checkbox']) задают список;
    // base getConfigForm рендерит style select когда length > 1.
    static styles = [];
    static defaultStyle = '';

    constructor(id, config, container) {
        super(id, config, container);
        this.commandValue = null;
        this.feedbackValue = null;
        this.writeState = 'idle';
        this._writeStateTimer = null;
        this._pendingTimeoutTimer = null;

        // Reactive interactivity: refresh active-disabled класс when edit mode
        // or controlToken state changes.
        this._interactivityListener = () => this._updateInteractivityClass();
        document.addEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.addEventListener('controlStatusChanged', this._interactivityListener);
    }

    // ===== SSE feedback =====
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        this.renderFeedback();
    }

    // ===== Write =====
    // Orchestrator: проверяет UI guards (interactive + confirmation), затем
    // делегирует actual fetch в _doWrite().
    async writeValue(value) {
        if (!this.isInteractive()) return;
        if (this.needsConfirmation() && !await this._confirm(value)) return;
        await this._doWrite(value);
    }

    // Actual fetch + writeState handling. БЕЗ interactive/confirm guards.
    // Используется напрямую активными widget'ами для release/OFF path,
    // где critical чтобы second POST дошёл даже если controlToken был
    // отозван между ON и OFF (push-button release, pulse trailing edge).
    // Валидирует только sensorId/serverId/objectName.
    async _doWrite(value) {
        this.commandValue = value;
        this._setWriteState('pending');

        // sensorId — числовой ID, должен быть резолвлен заранее (autocomplete сохраняет
        // его в config). config.sensor (имя) — fallback для smoke TestActiveWidget'а.
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        if (sensorId === undefined || sensorId === null || sensorId === '') {
            this._setWriteState('error', 'Sensor not configured');
            return;
        }

        const serverId = this.config?.serverId ?? this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No server configured');
            return;
        }
        // Warn один раз на widget lifetime — legacy widget'ы могут писать N раз/сек
        // (generator) или сериями (push-button pulse), spam в console не нужен.
        if (!this.config?.serverId && !this._serverIdFallbackWarned) {
            this._serverIdFallbackWarned = true;
            console.warn(`Active widget ${this.id || '<unknown>'}: serverId missing in config, using fallback ${serverId} — config will be migrated on next dashboard load`);
        }

        const objectName = this.config?.objectName || 'SharedMemory';
        const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/set?server=${encodeURIComponent(serverId)}`;
        try {
            const resp = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, value })
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                this._setWriteState('error', data.error || `HTTP ${resp.status}`);
                return;
            }
            this._setWriteState('success');
        } catch (e) {
            this._setWriteState('error', e.message);
        }
    }

    // ===== State helpers =====
    _setWriteState(state, message = '') {
        this.writeState = state;
        this._lastWriteMessage = message;

        // Обновить CSS-классы контейнера виджета
        const root = this.container;
        if (root) {
            root.classList.remove('active-pending', 'active-success', 'active-error');
            if (state !== 'idle') {
                root.classList.add(`active-${state}`);
            }
            this._recomputeTitle();
        }

        // Очистить предыдущие таймеры
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        this._writeStateTimer = null;
        this._pendingTimeoutTimer = null;

        if (state === 'pending') {
            // Защитный таймаут — если сервер молчит, переводим в error.
            this._pendingTimeoutTimer = setTimeout(() => {
                if (this.writeState === 'pending') {
                    this._setWriteState('error', 'Write timed out');
                }
            }, WRITE_PENDING_TIMEOUT_MS);
        } else if (state === 'success') {
            // Через WRITE_SUCCESS_DISPLAY_MS возвращаемся в idle.
            this._writeStateTimer = setTimeout(() => {
                if (this.writeState === 'success') {
                    this._setWriteState('idle');
                }
            }, WRITE_SUCCESS_DISPLAY_MS);
        }

        // command может зависеть от state (например opacity).
        // Guard: _setWriteState может вызываться до render() (writeValue может фейлиться синхронно).
        if (this.element) this.renderCommand();
    }

    // ===== Edit-mode / control gating =====
    isInteractive() {
        if (typeof dashboardState !== 'undefined' && dashboardState.editMode) return false;
        if (typeof canControl === 'function' && !canControl()) return false;
        return true;
    }

    // Единая точка владения title. Приоритет:
    //   1. write error message (пока активен writeState='error')
    //   2. control-blocked / edit-mode → 'Take control to interact'
    //   3. пусто
    // Вызывается из _setWriteState и _updateInteractivityClass — так оба источника
    // не затирают друг друга и пользователь видит самую релевантную информацию.
    _recomputeTitle() {
        const root = this.container;
        if (!root) return;
        if (this.writeState === 'error' && this._lastWriteMessage) {
            root.title = this._lastWriteMessage;
            return;
        }
        if (!this.isInteractive()) {
            root.title = 'Take control to interact';
            return;
        }
        root.removeAttribute('title');
    }

    // Toggles 'active-disabled' class and 'data-control-blocked' attr on the
    // widget container so CSS can show "click does nothing right now" state.
    // Also sets `disabled` attribute on all form controls within this.element —
    // native <input type=range> и <input type=text> игнорировали pointer-events:none
    // (можно было drag'ать slider клавиатурой/keyboard). disabled — гарантия.
    _updateInteractivityClass() {
        const root = this.container;
        if (!root) return;
        const interactive = this.isInteractive();
        root.classList.toggle('active-disabled', !interactive);
        if (!interactive) {
            root.dataset.controlBlocked = 'true';
        } else {
            delete root.dataset.controlBlocked;
        }
        if (this.element) {
            const formEls = this.element.querySelectorAll('input, select, button, textarea');
            for (const el of formEls) {
                el.disabled = !interactive;
            }
        }
        this._recomputeTitle();
    }

    needsConfirmation() {
        return !!this.config?.requireConfirmation;
    }

    async _confirm(value) {
        // Простой confirm — конкретные виджеты могут override на красивый dialog.
        return window.confirm(`Set ${this.config?.sensor || 'sensor'} = ${value}?`);
    }

    _resolveServerId() {
        // Берём первый подключённый сервер (как делает dashboard для чтения).
        if (typeof state === 'undefined' || !state.servers) return null;
        for (const [id, server] of state.servers) {
            if (server.connected) return id;
        }
        return null;
    }

    // ===== Render hooks (override в наследниках) =====
    renderCommand() {
        // Override: показать commandValue в DOM.
    }

    renderFeedback() {
        // Override: показать feedbackValue в DOM.
    }

    // ===== Config form extension =====
    static getConfigForm(config = {}) {
        const styleSelect = (this.styles && this.styles.length > 1)
            ? `
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-input" name="style" data-test="cfg-style">
                    ${this.styles.map(s => `<option value="${escapeAttr(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            `
            : '';

        // Server dropdown — первое поле, определяет список IONC objects ниже.
        // Показываем connected серверы + текущий config.serverId (даже если disconnected),
        // чтобы юзер видел свой выбор.
        const currentServerId = config.serverId || '';
        let serverOptions = '';
        for (const [id, srv] of state.servers) {
            if (srv.connected || id === currentServerId) {
                const sel = id === currentServerId ? 'selected' : '';
                serverOptions += `<option value="${escapeAttr(id)}" ${sel}>${escapeHtml(srv.name || id)}</option>`;
            }
        }
        // Edge: state.servers пустой при cold load (SSE ещё не приехал) — показать
        // placeholder чтобы юзер не видел пустой select без объяснения.
        if (!serverOptions) {
            serverOptions = '<option value="" disabled selected>(нет доступных серверов)</option>';
        }

        const baseFields = `
            <div class="widget-config-field">
                <label>Server</label>
                <select class="widget-input" name="serverId" data-test="cfg-serverId">
                    ${serverOptions}
                </select>
            </div>
            <div class="widget-config-field">
                <label>IONC Object</label>
                <select class="widget-input" name="objectName" data-test="cfg-objectName">
                    <option value="${escapeAttr(config.objectName || 'SharedMemory')}" selected>${escapeHtml(config.objectName || 'SharedMemory')}</option>
                </select>
                <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
            </div>
            <div class="widget-config-field">
                <label>Sensor</label>
                <div class="sensor-select-wrap">
                    <input type="text" class="widget-input sensor-select-input" name="sensor" autocomplete="off"
                           placeholder="Click to select or type to search..."
                           value="${escapeAttr(config.sensor || '')}" data-test="cfg-sensor">
                    <input type="hidden" name="sensorId" value="${escapeAttr(config.sensorId ?? '')}" data-test="cfg-sensorId">
                </div>
            </div>
            ${styleSelect}
            <div class="widget-config-field">
                <label>Label (optional)</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Leave empty to hide header">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        `;
        return baseFields + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }

    static getActiveConfigFields(config = {}) {
        // Override: дополнительные поля специфичные для виджета.
        return '';
    }

    static parseConfigForm(form) {
        const base = {
            serverId:   form.querySelector('[name="serverId"]')?.value || null,
            sensor:     form.querySelector('[name="sensor"]')?.value || '',
            sensorId:   (() => {
                const raw = form.querySelector('[name="sensorId"]')?.value;
                if (raw === '' || raw === undefined || raw === null) return null;
                const n = parseInt(raw, 10);
                // sensorId=0 валиден (раньше `parseInt('0',10) || null === null` теряло его).
                return Number.isFinite(n) ? n : null;
            })(),
            objectName: form.querySelector('[name="objectName"]')?.value || 'SharedMemory',
            label:      form.querySelector('[name="label"]')?.value || '',
            requireConfirmation: form.querySelector('[name="requireConfirmation"]')?.checked || false,
        };
        const styleEl = form.querySelector('[name="style"]');
        if (styleEl) base.style = styleEl.value;
        const extra = this.parseActiveConfigFields ? this.parseActiveConfigFields(form) : {};
        return { ...base, ...extra };
    }

    // IMPORTANT для subclass'ов: если переопределяешь — ОБЯЗАТЕЛЬНО вызывай
    // super.initConfigHandlers(form, config) ровно ОДИН РАЗ. Двойной вызов
    // навесит дублирующие listeners на sensor input и change на objectSelect.
    // Idempotency guard ниже защищает от случайного повторного вызова.
    static initConfigHandlers(form, config = {}) {
        if (form.dataset.activeHandlersWired === 'true') return;
        form.dataset.activeHandlersWired = 'true';

        const serverSelect = form.querySelector('[name="serverId"]');
        const objectSelect = form.querySelector('[name="objectName"]');
        const sensorInput = form.querySelector('[name="sensor"]');
        const hiddenIdInput = form.querySelector('[name="sensorId"]');
        if (!serverSelect || !objectSelect || !sensorInput || !hiddenIdInput) return;

        // Helper: загрузить IONC objects для текущего serverId.
        // Token guard: при быстром переключении Server'а (A→B→A...) ответ A может
        // прийти ПОСЛЕ B и затереть UI. loadToken растёт на каждом вызове, в .then
        // сравнивается — устаревший response игнорируется.
        let loadToken = 0;
        const loadIONCObjects = (serverId) => {
            const myToken = ++loadToken;
            if (!serverId) {
                objectSelect.innerHTML = '<option value="" disabled selected>(выберите Server)</option>';
                return;
            }
            fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`)
                .then(r => r.ok ? r.json() : { objects: [] })
                .then(data => {
                    if (myToken !== loadToken) return; // stale response, skip
                    const objs = data.objects || [];
                    // При смене сервера preferred = config.objectName, иначе первый из списка.
                    const currentValue = objectSelect.value || config.objectName || 'SharedMemory';
                    objectSelect.innerHTML = objs.map(o => {
                        const name = typeof o === 'string' ? o : o.name;
                        return `<option value="${escapeAttr(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`;
                    }).join('');
                    if (!objs.some(o => (typeof o === 'string' ? o : o.name) === currentValue)) {
                        const opt = document.createElement('option');
                        opt.value = currentValue;
                        opt.textContent = `${currentValue} (текущий, не найден)`;
                        opt.selected = true;
                        objectSelect.prepend(opt);
                    }
                })
                .catch(e => console.warn('Failed to load IONC objects:', e));
        };

        // Initial load для текущего serverId.
        loadIONCObjects(serverSelect.value);

        // Setup sensor autocomplete (читает текущий serverId из form, не cached).
        const ac = setupSensorAutocomplete(
            sensorInput,
            hiddenIdInput,
            () => objectSelect.value,
            () => serverSelect.value
        );

        // Server change → reload objects + reset sensor.
        serverSelect.addEventListener('change', () => {
            loadIONCObjects(serverSelect.value);
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });

        // Object change → reset sensor.
        objectSelect.addEventListener('change', () => {
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });
    }

    static parseActiveConfigFields(form) {
        // Override: разобрать поля из getActiveConfigFields().
        return {};
    }

    destroy() {
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        document.removeEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.removeEventListener('controlStatusChanged', this._interactivityListener);
        super.destroy();
    }
}

window.ActiveDashboardWidget = ActiveDashboardWidget;


// === 61-dashboard-active-button.js ===
// ============================================================================
// PushButtonWidget — write-only momentary/pulse кнопка для команд.
//
// Семантика отличается от toggle: нет двух-состоянного латча, нет feedback
// отображения (push-button — fire-and-forget команда). update() override
// в no-op (feedback игнорируется).
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — подпись на кнопке (default = sensor name)
//   valueOn     — числовое значение «нажато» (default 1)
//   valueOff    — числовое значение «отпущено» (default 0)
//   mode        — 'pulse' (default) | 'momentary'
//   pulseWidth  — ms, длительность импульса для pulse режима (default 500)
//   style       — 'flat' (default) | 'mushroom' | 'pill'
//   requireConfirmation — bool (от base; в momentary НЕ работает, warning в форме)
// ============================================================================

class PushButtonWidget extends ActiveDashboardWidget {
    static type = 'pushbutton';
    static displayName = 'Push Button';
    static description = 'Momentary/pulse command button (write-only)';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>';
    static styles = ['flat', 'mushroom', 'pill'];
    static defaultStyle = 'flat';
    static defaultSize = { width: 2, height: 1 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    // Helper: подсказка для выбора размера на стороне формы конфига
    // (dashboard-manager при первом создании использует static defaultSize;
    // юзер может ресайзить вручную drag handle'ом).
    static getDefaultSizeForStyle(style) {
        if (style === 'mushroom') return { width: 2, height: 2 };
        return { width: 2, height: 1 };
    }

    // === SSE feedback override — игнорируем (push-button fire-and-forget) ===
    update(value, error = null) {
        // Сохраняем поля для совместимости с base (writeState handlers могут читать),
        // но НЕ вызываем renderFeedback — push-button не визуализирует feedback своего
        // sensor'а (valueOn пролетает за миллисекунды и не несёт смысла оператору).
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
    }

    _currentStyle() {
        return this.config?.style || PushButtonWidget.defaultStyle;
    }

    _currentMode() {
        return this.config?.mode || 'pulse';
    }

    // === Render ===
    render() {
        const style = this._currentStyle();
        const label = this.config?.label || this.config?.sensor || 'BUTTON';

        this.element = document.createElement('div');
        this.element.className = `widget-content pushbutton-widget pushbutton-style-${style}`;
        this.element.innerHTML = `<button class="pb-btn" data-test="btn">${escapeHtml(label)}</button>`;
        this.container.appendChild(this.element);

        const btn = this.element.querySelector('[data-test="btn"]');
        if (this._currentMode() === 'momentary') {
            this._bindMomentary(btn);
        } else {
            btn.addEventListener('click', () => this._onPulseClick());
        }
    }

    // === Pulse mode handler ===
    _onPulseClick() {
        if (!this.isInteractive()) return;
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;
        const pulseWidth = this.config?.pulseWidth ?? 500;

        // Visual flash (300ms независимо от pulseWidth — это UI feedback).
        // Timer хранится на instance чтобы destroy() мог его отменить и не
        // снимать класс с уже удалённого DOM-узла.
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (btn) {
            btn.classList.add('pulsing');
            clearTimeout(this._pulseFlashTimer);
            this._pulseFlashTimer = setTimeout(() => {
                this._pulseFlashTimer = null;
                btn?.classList.remove('pulsing');
            }, 300);
        }

        // POST valueOn → wait pulseWidth → POST valueOff.
        // Второй POST через _writeValueRaw чтобы не дублировать confirm dialog.
        // Trailing timer тоже на instance — destroy() отменяет его, чтобы не
        // дёргать _writeValueRaw на удалённом widget'е (safety OFF при destroy
        // оставляем ответственностью владельца, не побочным эффектом).
        this.writeValue(valueOn);
        clearTimeout(this._pulseTrailTimer);
        this._pulseTrailTimer = setTimeout(() => {
            this._pulseTrailTimer = null;
            this._writeValueRaw(valueOff);
        }, pulseWidth);
    }

    destroy() {
        clearTimeout(this._pulseFlashTimer);
        clearTimeout(this._pulseTrailTimer);
        this._pulseFlashTimer = null;
        this._pulseTrailTimer = null;
        super.destroy();
    }

    // === Momentary mode handler ===
    _bindMomentary(btn) {
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;

        const onDown = (e) => {
            if (!this.isInteractive()) return;
            e.preventDefault();
            btn.classList.add('pressed');
            this.writeValue(valueOn);
            // Window-level listeners — гарантия release даже если мышь ушла за пределы кнопки.
            const onUp = () => {
                btn.classList.remove('pressed');
                this._writeValueRaw(valueOff);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('touchend', onUp);
            };
            window.addEventListener('mouseup', onUp);
            window.addEventListener('touchend', onUp);
        };
        btn.addEventListener('mousedown', onDown);
        btn.addEventListener('touchstart', onDown);
    }

    // Release/OFF path для pulse trailing edge и momentary mouseup.
    // Вызывает _doWrite напрямую — пропускает isInteractive() и confirm.
    // Это критично: между нажатием (ON отправлен) и release пользователь мог
    // отдать controlToken, выйти из edit-mode и т.п. Если бы мы прошли через
    // writeValue() с её guard'ами, OFF не отправился бы → actuator завис в ON.
    // Server validation (sensorId/serverId/objectName) сохраняется внутри _doWrite.
    async _writeValueRaw(value) {
        await this._doWrite(value);
    }

    // Push-button doesn't visualize commandValue or feedbackValue — overrides пустые.
    renderCommand() { /* no-op */ }
    renderFeedback() { /* no-op */ }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        const mode = config.mode || 'pulse';
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Mode</label>
                    <select class="widget-input" name="mode" data-test="cfg-mode">
                        <option value="pulse" ${mode === 'pulse' ? 'selected' : ''}>pulse</option>
                        <option value="momentary" ${mode === 'momentary' ? 'selected' : ''}>momentary</option>
                    </select>
                </div>
                <div class="widget-config-field" data-pulse-only style="display:${mode === 'pulse' ? '' : 'none'}">
                    <label>Pulse width (ms)</label>
                    <input type="number" class="widget-input" name="pulseWidth"
                           value="${config.pulseWidth ?? 500}" min="50" data-test="cfg-pulseWidth">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>valueOff</label>
                    <input type="number" class="widget-input" name="valueOff"
                           value="${config.valueOff ?? 0}" data-test="cfg-valueOff">
                </div>
                <div class="widget-config-field">
                    <label>valueOn</label>
                    <input type="number" class="widget-input" name="valueOn"
                           value="${config.valueOn ?? 1}" data-test="cfg-valueOn">
                </div>
            </div>
            <div class="widget-config-field" data-momentary-warning style="display:${mode === 'momentary' ? '' : 'none'}">
                <small style="color:#f59e0b">⚠ В momentary режиме requireConfirmation не работает (POST уйдёт без диалога).</small>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        super.initConfigHandlers(form, config);
        // Дополнительно: при смене mode показывать/скрывать pulseWidth field
        // (relevant только для pulse) + momentary warning.
        const modeSel = form.querySelector('[name="mode"]');
        const warning = form.querySelector('[data-momentary-warning]');
        const pulseField = form.querySelector('[data-pulse-only]');
        if (!modeSel) return;
        const update = () => {
            const isMomentary = modeSel.value === 'momentary';
            if (warning)    warning.style.display    = isMomentary ? '' : 'none';
            if (pulseField) pulseField.style.display = isMomentary ? 'none' : '';
        };
        modeSel.addEventListener('change', update);
        update();
    }

    static parseActiveConfigFields(form) {
        const pulseRaw = parseInt(form.querySelector('[name="pulseWidth"]')?.value, 10);
        // pulseWidth: clamp к [50, ∞) — html min=50 это hint, не enforcement.
        // Number.isFinite check вместо `|| 500` — иначе pulseWidth=0 неправильно
        // парсится как 500 (falsy-zero).
        const pulseWidth = Number.isFinite(pulseRaw) ? Math.max(50, pulseRaw) : 500;
        return {
            mode:       form.querySelector('[name="mode"]')?.value || 'pulse',
            pulseWidth,
            valueOff:   Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:    Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
        };
    }
}

window.PushButtonWidget = PushButtonWidget;


// === 61-dashboard-active-generator.js ===
// ============================================================================
// GeneratorWidget — обёртка вокруг SignalGenerator engine для dashboard.
//
// Запускает математический генератор (square/sin/cos/linear/random),
// каждый тик пишет в датчик через _writeRaw (fire-and-forget). Параметры
// настраиваются только через config dialog, на widget'е — Start/Stop toggle
// + текущее значение.
//
// Один стиль 'compact' (default 3×1). Сетpoint feedback игнорируется
// (update() no-op, как PushButton) — UI показывает что генератор послал.
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — подпись виджета (default = имя датчика)
//   requireConfirmation — bool, спрашивать ли confirm при Start (от base)
//   type        — 'square' (default) | 'sin' | 'cos' | 'linear' | 'random'
//   min, max    — диапазон значений
//   step        — для linear/sin/cos (число точек на полуцикл)
//   pause       — для linear/sin/cos/square (ms между шагами)
//   pulseWidth  — для square (ms ширина импульса)
//   period      — для random (ms между генерациями)
// ============================================================================

class GeneratorWidget extends ActiveDashboardWidget {
    static type = 'generator';
    static displayName = 'Signal Generator';
    static description = 'Writes generated signal (square/sin/cos/linear/random) to a sensor';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12 L6 12 L6 4 L10 4 L10 20 L14 20 L14 4 L18 4 L18 12 L22 12"/></svg>';
    static defaultSize = { width: 3, height: 1 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 2 };
    // Один стиль — base.getConfigForm НЕ рендерит style select когда styles.length <= 1.
    static styles = [];
    static defaultStyle = '';

    constructor(id, config, container) {
        super(id, config, container);
        this._signalGen = null;
        this._lastTickValue = null;
        this._writeUrl = null;
        this._writeSensorId = undefined;
    }

    // === Render ===
    render() {
        // Label опционален: пустой → header не рисуется. Fallback на sensor name
        // удалён намеренно (см. комментарий в ToggleWidget.renderSlider).
        const label = this.config?.label || '';
        const labelHtml = label
            ? `<div class="gen-label" data-test="label">${escapeHtml(label)}</div>`
            : '';
        this.element = document.createElement('div');
        this.element.className = 'widget-content generator-widget';
        this.element.innerHTML = `
            ${labelHtml}
            <div class="gen-value" data-test="value">--</div>
            <div class="gen-toggle" data-test="toggle" role="switch" aria-checked="false">
                <div class="gen-handle"></div>
            </div>
        `;
        this.container.appendChild(this.element);

        const toggle = this.element.querySelector('[data-test="toggle"]');
        toggle.addEventListener('click', (e) => { e.stopPropagation(); this._onToggle(); });
        // mousedown.preventDefault — toggle не должен забирать фокус на click
        toggle.addEventListener('mousedown', (e) => e.preventDefault());
    }

    // === SSE feedback override — игнорируем (как PushButton) ===
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        // НЕ вызываем renderFeedback — UI показывает _lastTickValue от генератора.
    }

    // === Toggle handler ===
    async _onToggle() {
        if (!this.isInteractive()) return;
        if (this._isRunning()) {
            this._stop();
        } else {
            if (this.needsConfirmation() && !await this._confirm(this.config?.sensor || 'sensor')) return;
            this._start();
        }
    }

    async _confirm(sensorName) {
        return window.confirm(`Start generator on "${sensorName}"? It will write each tick.`);
    }

    // === Start/Stop ===
    _start() {
        // Resolve all params and validate at start.
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        if (sensorId === undefined || sensorId === null || sensorId === '') {
            this._setWriteState('error', 'Sensor not configured');
            return;
        }
        const serverId = this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No connected server');
            return;
        }
        const objectName = this.config?.objectName || 'SharedMemory';
        // S-3: guard against double-start (rapid double-toggle leak).
        if (this._signalGen) return;
        // I-1: cache write target — avoid re-resolving every tick.
        this._writeUrl = `/api/objects/${encodeURIComponent(objectName)}/ionc/set?server=${encodeURIComponent(serverId)}`;
        this._writeSensorId = sensorId;
        this._signalGen = new SignalGenerator({
            type: this.config?.type || 'square',
            min: this.config?.min ?? 0,
            max: this.config?.max ?? 100,
            step: this.config?.step,
            pause: this.config?.pause,
            pulseWidth: this.config?.pulseWidth,
            period: this.config?.period,
            onTick: (value) => this._onTick(value),
        });
        this._signalGen.start();
        this._updateRunningUI(true);
    }

    _stop() {
        if (this._signalGen) {
            this._signalGen.stop();
            this._signalGen = null;
        }
        this._lastTickValue = null;
        this._writeUrl = null;
        this._writeSensorId = undefined;
        this._updateValueDisplay(null);
        this._updateRunningUI(false);
    }

    _isRunning() {
        return !!this._signalGen?.isRunning();
    }

    _onTick(value) {
        this._lastTickValue = value;
        this._updateValueDisplay(value);
        this._writeRaw(value);
    }

    // _writeRaw — fire-and-forget POST на ionc/set, без per-tick confirm/state.
    // Errors → _stop + setWriteState('error') → UI: purple border + tooltip.
    async _writeRaw(value) {
        if (!this._writeUrl || this._writeSensorId === undefined) {
            // Should not happen if _start succeeded, defensive
            this._stop();
            return;
        }
        try {
            const resp = await controlledFetch(this._writeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: this._writeSensorId, value }),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                console.warn('Generator write failed:', resp.status, data.error);
                this._stop();
                this._setWriteState('error', data.error || `HTTP ${resp.status}`);
            }
        } catch (e) {
            console.warn('Generator write exception:', e);
            this._stop();
            this._setWriteState('error', e.message);
        }
    }

    // === UI update helpers ===
    _updateValueDisplay(value) {
        if (!this.element) return;
        const valueEl = this.element.querySelector('[data-test="value"]');
        if (valueEl) {
            valueEl.textContent = (value !== null && value !== undefined) ? String(value) : '--';
            valueEl.classList.toggle('running', value !== null && value !== undefined);
        }
    }

    _updateRunningUI(isRunning) {
        if (!this.element) return;
        const toggle = this.element.querySelector('[data-test="toggle"]');
        if (toggle) {
            toggle.classList.toggle('running', isRunning);
            toggle.setAttribute('aria-checked', isRunning ? 'true' : 'false');
        }
    }

    // === ControlToken released во время работы → стоп ===
    _updateInteractivityClass() {
        super._updateInteractivityClass();
        if (this._isRunning() && !this.isInteractive()) {
            this._stop();
        }
    }

    // === Render hooks (не используются для Generator) ===
    renderFeedback() { /* no-op */ }
    renderCommand() { /* no-op */ }

    // === Cleanup ===
    destroy() {
        this._stop();
        super.destroy();
    }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        const type = config.type || 'square';
        const showLinSinCos = (type === 'linear' || type === 'sin' || type === 'cos');
        const showSquare = (type === 'square');
        const showRandom = (type === 'random');

        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Type</label>
                    <select class="widget-input" name="type" data-test="cfg-type">
                        <option value="square" ${type==='square'?'selected':''}>square</option>
                        <option value="sin"    ${type==='sin'?'selected':''}>sin</option>
                        <option value="cos"    ${type==='cos'?'selected':''}>cos</option>
                        <option value="linear" ${type==='linear'?'selected':''}>linear</option>
                        <option value="random" ${type==='random'?'selected':''}>random</option>
                    </select>
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>min</label>
                    <input type="number" class="widget-input" name="min" value="${config.min ?? 0}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max" value="${config.max ?? 100}" data-test="cfg-max">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-lin-sin-cos" data-test="cfg-row-step-pause" style="display:${showLinSinCos?'flex':'none'}">
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step" value="${config.step ?? 10}" data-test="cfg-step">
                </div>
                <div class="widget-config-field">
                    <label>pause (ms)</label>
                    <input type="number" class="widget-input" name="pause" value="${config.pause ?? 200}" min="1" data-test="cfg-pause">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-square" data-test="cfg-row-square" style="display:${showSquare?'flex':'none'}">
                <div class="widget-config-field">
                    <label>pulseWidth (ms)</label>
                    <input type="number" class="widget-input" name="pulseWidth" value="${config.pulseWidth ?? 500}" min="1" data-test="cfg-pulseWidth">
                </div>
                <div class="widget-config-field">
                    <label>pause (ms)</label>
                    <input type="number" class="widget-input" name="pause-square" value="${config.pause ?? 500}" min="1" data-test="cfg-pause-square">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-random" data-test="cfg-row-random" style="display:${showRandom?'flex':'none'}">
                <div class="widget-config-field">
                    <label>period (ms)</label>
                    <input type="number" class="widget-input" name="period" value="${config.period ?? 1000}" min="100" data-test="cfg-period">
                </div>
            </div>
        `;
    }

    // initConfigHandlers ОВЕРРАЙДИМ для conditional полей по type.
    // ОБЯЗАТЕЛЬНО зовём super.initConfigHandlers (для autocomplete + IONC dropdown).
    static initConfigHandlers(form, config = {}) {
        super.initConfigHandlers(form, config);
        // Idempotency для нашего type listener'а
        if (form.dataset.genHandlersWired === 'true') return;
        form.dataset.genHandlersWired = 'true';

        const typeSelect = form.querySelector('[name="type"]');
        const rowLinSinCos = form.querySelector('[data-test="cfg-row-step-pause"]');
        const rowSquare    = form.querySelector('[data-test="cfg-row-square"]');
        const rowRandom    = form.querySelector('[data-test="cfg-row-random"]');
        if (!typeSelect) return;

        const updateConditional = () => {
            const t = typeSelect.value;
            if (rowLinSinCos) rowLinSinCos.style.display = (t === 'linear' || t === 'sin' || t === 'cos') ? 'flex' : 'none';
            if (rowSquare)    rowSquare.style.display    = (t === 'square') ? 'flex' : 'none';
            if (rowRandom)    rowRandom.style.display    = (t === 'random') ? 'flex' : 'none';
        };
        typeSelect.addEventListener('change', updateConditional);
        // Не вызываем сразу — initial display уже установлен через template style attr.
    }

    static parseActiveConfigFields(form) {
        const type = form.querySelector('[name="type"]')?.value || 'square';
        const numOrDefault = (name, def) => {
            const v = Number(form.querySelector(`[name="${name}"]`)?.value);
            return Number.isFinite(v) ? v : def;
        };
        const minRaw = numOrDefault('min', 0);
        const maxRaw = numOrDefault('max', 100);
        // Validation: min<max swap; period>=100; pause>0; pulseWidth>0; step≠0
        const min = Math.min(minRaw, maxRaw);
        const max = Math.max(minRaw, maxRaw);

        const result = { type, min, max };
        if (type === 'linear' || type === 'sin' || type === 'cos') {
            const step = numOrDefault('step', 10);
            const pause = Math.max(1, numOrDefault('pause', 200));
            result.step = step !== 0 ? step : 10;
            result.pause = pause;
        } else if (type === 'square') {
            result.pulseWidth = Math.max(1, numOrDefault('pulseWidth', 500));
            // Note: square pause input has different name 'pause-square' для уникальности
            const pauseSq = Number(form.querySelector('[name="pause-square"]')?.value);
            result.pause = Math.max(1, Number.isFinite(pauseSq) ? pauseSq : 500);
        } else { // random
            result.period = Math.max(100, numOrDefault('period', 1000));
        }
        return result;
    }
}

window.GeneratorWidget = GeneratorWidget;


// === 61-dashboard-active-setpoint.js ===
// ============================================================================
// SetpointWidget — числовой задатчик для AI/AO датчиков.
//
// Семантика: пользователь вводит число в [min, max] с шагом step, посылается
// через POST .../ionc/set. Two-way: feedbackValue (от сервера) vs commandValue
// (что пользователь установил), расхождение → dirty state (жёлтая граница).
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — заголовок виджета (от base)
//   min         — нижняя граница диапазона (default 0)
//   max         — верхняя граница (default 100)
//   step        — шаг изменения (default 1; влияет на stepper buttons и slider step)
//   unit        — текстовая подпись после value ("°C", "%", "Pa"; default '')
//   applyMode   — 'manual' (default) | 'auto'
//   style       — 'input' (default) | 'slider' | 'stepper'
//   requireConfirmation — bool (от base)
//
// Стили:
//   - 'input': текстовый input + Apply button (visible только в dirty state)
//   - 'slider': horizontal slider + value-label (с inline-edit) + min/max подписи
//   - 'stepper': '−' [value] '+' (auto-apply on click; inline-edit на value)
// ============================================================================

const SETPOINT_AUTO_APPLY_DEBOUNCE_MS = 500;

class SetpointWidget extends ActiveDashboardWidget {
    static type = 'setpoint';
    static displayName = 'Setpoint';
    static description = 'Numeric setpoint (analog write) with input/slider/stepper styles';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v6M12 9v6M17 9v6"/></svg>';
    static styles = ['input', 'slider', 'stepper'];
    static defaultStyle = 'input';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    constructor(id, config, container) {
        super(id, config, container);
        this._autoApplyTimer = null;
        // True после первого ручного ввода/clicka на +/- — после этого
        // renderFeedback больше не перезаписывает input.value на feedbackValue
        // (иначе после blur значение возвращалось бы на старое feedback).
        // Сбрасывается в _cancel() (Esc) — для resync с актуальным feedback.
        this._userHasEdited = false;
    }

    _currentStyle() {
        return this.config?.style || SetpointWidget.defaultStyle;
    }

    _applyMode() {
        return this.config?.applyMode || 'manual';
    }

    _clamp(value) {
        const min = this.config?.min ?? -Infinity;
        const max = this.config?.max ?? Infinity;
        return Math.max(min, Math.min(max, value));
    }

    // ===== Render dispatch =====
    render() {
        const style = this._currentStyle();
        this.element = document.createElement('div');
        this.element.className = `widget-content setpoint-widget setpoint-style-${style}`;
        // Tabindex=-1 чтобы widget мог принимать keyboard events (Esc), но не
        // попадал в Tab navigation. Esc на любом элементе виджета bubble'ится
        // и вызывает _cancel — работает для всех стилей (input/slider/stepper).
        this.element.tabIndex = -1;
        this.element.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.commandValue !== null) {
                e.preventDefault();
                e.stopPropagation();
                this._cancel();
            }
        });

        if (style === 'slider') {
            this._renderSlider();
        } else if (style === 'stepper') {
            this._renderStepper();
        } else {
            this._renderInput();
        }

        this.container.appendChild(this.element);
        // Initial display sync
        this.renderFeedback();
    }

    // ===== Style: input =====
    _renderInput() {
        const unit = escapeHtml(this.config?.unit || '');
        const min = this.config?.min ?? '';
        const max = this.config?.max ?? '';
        const step = this.config?.step ?? 1;
        // type="text" + inputmode=decimal — нативно нет spin buttons, нет
        // password-popup, и selection API работает (для select-on-focus).
        // Валидация только цифр — через keydown filter ниже + _clamp в JS.
        // autocomplete=off + data-form-type + data-lpignore — отключают browser
        // autocomplete и password manager хинты.
        this.element.innerHTML = `
            ${this._labelHtml()}
            <div class="setpoint-feedback" data-test="feedback"><strong data-test="feedback-value">--</strong>${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}</div>
            <div class="setpoint-input-row">
                <input type="text" class="setpoint-input" data-test="value-input"
                       autocomplete="off" autocorrect="off" autocapitalize="off"
                       spellcheck="false" data-form-type="other" data-lpignore="true"
                       inputmode="decimal"
                       data-min="${escapeAttr(String(min))}" data-max="${escapeAttr(String(max))}" data-step="${escapeAttr(String(step))}">
                ${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}
                <button class="setpoint-apply-btn" data-test="apply-btn" tabindex="-1">Apply</button>
                <button class="setpoint-cancel-btn" data-test="cancel-btn" title="Cancel" tabindex="-1">×</button>
            </div>
        `;

        const input = this.element.querySelector('[data-test="value-input"]');
        const applyBtn = this.element.querySelector('[data-test="apply-btn"]');
        const cancelBtn = this.element.querySelector('[data-test="cancel-btn"]');

        // Commit gesture: применить + снять focus + оптимистично убрать dirty
        // (если write fails — _setWriteState('error') покажет purple border).
        const commit = () => {
            this._applyNow();
            this.commandValue = null;
            this._updateDirty(false);
            input.blur();
        };

        // При получении фокуса (клик/Tab/программно) — выделить текущее значение,
        // чтобы новый ввод сразу его заменял. setTimeout(0) — после нативного
        // позиционирования cursor'а от mousedown'а.
        input.addEventListener('focus', () => {
            setTimeout(() => { try { input.select(); } catch {} }, 0);
        });
        input.addEventListener('input', () => {
            this._userHasEdited = true;
            const num = Number(input.value);
            if (!Number.isFinite(num)) return;
            this._setCommand(num);
        });
        // Не пропускать буквы / 'e' (scientific) / '+' — оставлять только цифры,
        // знак минус, точку, запятую и навигационные клавиши.
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.blur(); this._cancel(); return; }
            if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+C/V/A и т.п.
            if (e.key.length === 1) {
                // Single-char key — фильтруем
                const allowed = /[0-9.,\-]/;
                if (!allowed.test(e.key)) { e.preventDefault(); }
            }
        });
        applyBtn.addEventListener('mousedown', (e) => e.preventDefault());
        cancelBtn.addEventListener('mousedown', (e) => e.preventDefault());
        applyBtn.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
        cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); input.blur(); this._cancel(); });
    }

    // ===== Style: slider =====
    _renderSlider() {
        const unit = escapeHtml(this.config?.unit || '');
        const min = this.config?.min ?? 0;
        const max = this.config?.max ?? 100;
        const step = this.config?.step ?? 1;
        this.element.innerHTML = `
            ${this._labelHtml()}
            <div class="setpoint-slider-wrap">
                <div class="setpoint-slider-value-row">
                    <span class="setpoint-slider-value" data-test="value" title="Двойной клик — точный ввод">--</span>
                    ${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}
                </div>
                <input type="range" class="setpoint-slider" data-test="slider"
                       min="${escapeHtml(String(min))}" max="${escapeHtml(String(max))}" step="${escapeHtml(String(step))}">
                <div class="setpoint-slider-labels">
                    <span>${escapeHtml(String(min))}</span>
                    <span>${escapeHtml(String(max))}</span>
                </div>
            </div>
        `;

        const slider = this.element.querySelector('[data-test="slider"]');
        const valueSpan = this.element.querySelector('[data-test="value"]');

        slider.addEventListener('input', () => {
            const num = Number(slider.value);
            this._setCommand(num);
            valueSpan.textContent = String(num);
        });
        // Manual mode: change (release) = trigger apply
        slider.addEventListener('change', () => {
            if (this._applyMode() === 'manual') {
                // В manual mode для slider apply при release (change event).
                // (Apply button + Cancel также видны для consistency с input style.)
                this._applyNow();
            }
        });
        this._makeInlineEditable(valueSpan);
    }

    // ===== Style: stepper =====
    _renderStepper() {
        const unit = escapeHtml(this.config?.unit || '');
        // Stepper не имеет Apply/Cancel кнопок — auto-apply on click +/- сразу
        // отправляет POST. × cancel был добавлен раньше но оказался лишним:
        // commandValue не «pending», команда уже ушла. Если оператор хочет
        // вернуться — кликает обратное направление +/-. Esc на widget element
        // всё ещё работает (через _cancel) — для случая когда юзер передумал
        // через keyboard.
        this.element.innerHTML = `
            ${this._labelHtml()}
            <div class="setpoint-feedback" data-test="feedback"><strong data-test="feedback-value">--</strong>${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}</div>
            <div class="setpoint-stepper-row">
                <button class="setpoint-step-btn" data-test="step-down" tabindex="-1">−</button>
                <span class="setpoint-stepper-value" data-test="value" title="Двойной клик — точный ввод">--</span>
                <button class="setpoint-step-btn" data-test="step-up" tabindex="-1">+</button>
            </div>
        `;

        const stepDown = this.element.querySelector('[data-test="step-down"]');
        const stepUp = this.element.querySelector('[data-test="step-up"]');
        const valueSpan = this.element.querySelector('[data-test="value"]');
        const step = this.config?.step ?? 1;

        const stepBy = (delta, ev) => {
            if (ev) { ev.stopPropagation(); ev.preventDefault(); }
            if (!this.isInteractive()) return;
            const current = this.commandValue ?? this.feedbackValue ?? this.config?.min ?? 0;
            const next = this._clamp(current + delta);
            this._setCommand(next);
            // Stepper всегда auto-apply (нет explicit Apply кнопки).
            this._applyNow();
        };
        // mousedown.preventDefault — не передавать фокус на button при клике
        // (focus border мерцал после каждого клика). Дополнительно blur() в click
        // — на Linux/Chrome preventDefault иногда пропускает фокус на 1 frame.
        stepDown.addEventListener('mousedown', (e) => e.preventDefault());
        stepUp.addEventListener('mousedown', (e) => e.preventDefault());
        stepDown.addEventListener('click', (e) => { stepBy(-step, e); stepDown.blur(); });
        stepUp.addEventListener('click', (e) => { stepBy(step, e); stepUp.blur(); });

        this._makeInlineEditable(valueSpan);
    }

    // Label header — рендерится сверху виджета, если config.label задан.
    _labelHtml() {
        const label = this.config?.label;
        if (!label) return '';
        return `<div class="setpoint-label" data-test="label">${escapeHtml(label)}</div>`;
    }

    // ===== Common: feedback rendering =====
    // Pure DOM update — НЕ делает auto-snap dirty (это в update() от SSE).
    // Иначе во время typing значение совпавшее с feedback автоматически
    // снимало dirty без Enter.
    renderFeedback() {
        if (!this.element) return;
        const fbValueEl = this.element.querySelector('[data-test="feedback-value"]');
        if (fbValueEl) {
            fbValueEl.textContent = (this.feedbackValue !== null && this.feedbackValue !== undefined)
                ? String(this.feedbackValue) : '--';
        }

        const style = this._currentStyle();
        if (style === 'input') {
            const input = this.element.querySelector('[data-test="value-input"]');
            // Initial sync: пока юзер ничего не вводил, input.value tracks feedback.
            // После первого ручного ввода — input.value под контролем юзера, feedback
            // отображается отдельно через [data-test="feedback-value"].
            if (input && !this._userHasEdited && document.activeElement !== input) {
                input.value = this.feedbackValue ?? '';
            }
        } else if (style === 'slider') {
            const slider = this.element.querySelector('[data-test="slider"]');
            const valueSpan = this.element.querySelector('[data-test="value"]');
            const display = this.commandValue ?? this.feedbackValue;
            if (slider && display !== null && display !== undefined && document.activeElement !== slider) {
                slider.value = display;
            }
            if (valueSpan) {
                valueSpan.textContent = (display !== null && display !== undefined) ? String(display) : '--';
            }
        } else { // stepper
            const valueSpan = this.element.querySelector('[data-test="value"]');
            const display = this.commandValue ?? this.feedbackValue;
            if (valueSpan) {
                valueSpan.textContent = (display !== null && display !== undefined) ? String(display) : '--';
            }
        }
    }

    // ===== SSE feedback override =====
    // Auto-snap dirty: если feedback догнал command (с tolerance step/2) → снять.
    // Делается ТОЛЬКО здесь (в update от SSE), не в renderFeedback — иначе во
    // время typing совпавшее с feedback значение автоматически апплаилось.
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        if (this.commandValue !== null && this.commandValue !== undefined &&
            value !== null && value !== undefined) {
            const tolerance = Math.abs(this.config?.step ?? 1) / 2;
            if (Math.abs(this.commandValue - value) <= tolerance) {
                this.commandValue = null;
                this._updateDirty(false);
            }
        }
        this.renderFeedback();
    }

    renderCommand() {
        // No-op для setpoint (commandValue отображается через renderFeedback).
    }

    // ===== Apply flow =====
    _setCommand(value) {
        const clamped = this._clamp(value);
        this.commandValue = clamped;
        this._updateDirty(true);
        // Сразу обновить отображение (особенно для stepper — иначе value-span ждёт SSE).
        this.renderFeedback();
        if (this._applyMode() === 'auto') {
            clearTimeout(this._autoApplyTimer);
            this._autoApplyTimer = setTimeout(() => this._applyNow(), SETPOINT_AUTO_APPLY_DEBOUNCE_MS);
        }
    }

    _applyNow() {
        clearTimeout(this._autoApplyTimer);
        if (this.commandValue === null || this.commandValue === undefined) return;
        this.writeValue(this.commandValue);
    }

    _cancel() {
        clearTimeout(this._autoApplyTimer);
        this.commandValue = null;
        this._userHasEdited = false;  // resync с feedback
        this._updateDirty(false);
        this.renderFeedback();
    }

    _updateDirty(isDirty) {
        const root = this.element;
        if (!root) return;
        root.classList.toggle('dirty', !!isDirty);
    }

    // ===== Inline-edit helper =====
    _makeInlineEditable(spanEl) {
        spanEl.addEventListener('dblclick', () => {
            const currentValue = spanEl.textContent.trim();
            const input = document.createElement('input');
            input.type = 'text';  // type=text + inputmode=decimal — см. _renderInput
            input.className = 'setpoint-inline-edit';
            input.dataset.test = 'inline-input';
            input.autocomplete = 'off';
            input.autocorrect = 'off';
            input.autocapitalize = 'off';
            input.spellcheck = false;
            input.setAttribute('data-form-type', 'other');
            input.setAttribute('data-lpignore', 'true');
            input.setAttribute('inputmode', 'decimal');
            input.value = currentValue === '--' ? '' : currentValue;
            spanEl.replaceWith(input);
            input.select();

            let finished = false;
            const finish = (apply) => {
                if (finished) return;
                finished = true;
                if (apply) {
                    const num = Number(input.value);
                    if (Number.isFinite(num)) {
                        this._setCommand(num);
                        // Inline-edit Enter/blur — explicit commit gesture; всегда apply
                        // независимо от applyMode (иначе slider+manual+inline → soft-lock).
                        this._applyNow();
                    }
                }
                input.replaceWith(spanEl);
                this.renderFeedback();  // обновить display
            };

            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); finish(true); return; }
                if (e.key === 'Escape') { e.preventDefault(); finish(false); return; }
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key.length === 1) {
                    const allowed = /[0-9.,\-]/;
                    if (!allowed.test(e.key)) { e.preventDefault(); }
                }
            });
            input.addEventListener('blur', () => finish(true));
            // Stop click propagation, чтобы не открыть widget config dialog
            // через bubble на родителя.
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('dblclick', (e) => e.stopPropagation());
        });
    }

    // ===== Config form =====
    static getActiveConfigFields(config = {}) {
        const applyMode = config.applyMode || 'manual';
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>min</label>
                    <input type="number" class="widget-input" name="min"
                           value="${config.min ?? 0}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max"
                           value="${config.max ?? 100}" data-test="cfg-max">
                </div>
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step"
                           value="${config.step ?? 1}" min="0" data-test="cfg-step">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="°C, %, Pa..." data-test="cfg-unit">
                </div>
                <div class="widget-config-field">
                    <label>Apply mode</label>
                    <select class="widget-input" name="applyMode" data-test="cfg-applyMode">
                        <option value="manual" ${applyMode === 'manual' ? 'selected' : ''}>manual (Apply button)</option>
                        <option value="auto" ${applyMode === 'auto' ? 'selected' : ''}>auto (debounce ${SETPOINT_AUTO_APPLY_DEBOUNCE_MS}ms)</option>
                    </select>
                </div>
            </div>
        `;
    }

    static parseActiveConfigFields(form) {
        const minRaw = (() => { const v = form.querySelector('[name="min"]')?.value; return (v === '' || v === undefined) ? 0 : Number(v); })();
        const maxRaw = (() => { const v = form.querySelector('[name="max"]')?.value; return (v === '' || v === undefined) ? 100 : Number(v); })();
        const min = Number.isFinite(minRaw) ? minRaw : 0;
        const max = Number.isFinite(maxRaw) ? maxRaw : 100;
        const step = (() => { const v = Number(form.querySelector('[name="step"]')?.value); return (Number.isFinite(v) && v > 0) ? v : 1; })();
        return {
            min: Math.min(min, max),
            max: Math.max(min, max),
            step,
            unit:      form.querySelector('[name="unit"]')?.value || '',
            applyMode: form.querySelector('[name="applyMode"]')?.value || 'manual',
        };
    }

    destroy() {
        clearTimeout(this._autoApplyTimer);
        super.destroy();
    }
}

window.SetpointWidget = SetpointWidget;


// === 61-dashboard-active-toggle.js ===
// ============================================================================
// ToggleWidget — переключатель между двумя числовыми значениями (DI/DO/AI/AO).
// Слитая композиция: цвет track = feedback, позиция handle = command.
// Жёлтая граница при расхождении command vs feedback.
//
// Config:
//   sensor      — имя датчика (для отображения, autocomplete сохраняет имя)
//   sensorId    — числовой ID датчика (используется в writeValue)
//   objectName  — имя IONC-объекта (default 'SharedMemory')
//   valueOff    — числовое значение OFF (default 0)
//   valueOn     — числовое значение ON (default 1)
//   labelOff    — текстовая подпись OFF (default 'OFF')
//   labelOn     — текстовая подпись ON (default 'ON')
//   label       — заголовок виджета (default = имя датчика)
//   requireConfirmation — bool, наследуется от base
// ============================================================================

class ToggleWidget extends ActiveDashboardWidget {
    static type = 'toggle';
    static displayName = 'Toggle';
    static description = 'Two-state switch (writes to digital or analog sensor)';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3" fill="currentColor"/></svg>';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 2 };
    static maxSize = { width: 6, height: 3 };

    // Доступные визуальные стили. base.getConfigForm рендерит style select
    // когда length > 1.
    static styles = ['slider', 'checkbox'];
    static defaultStyle = 'slider';

    // === Render ===
    render() {
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckbox();
        } else {
            this.renderSlider();
        }
    }

    _currentStyle() {
        return this.config?.style || ToggleWidget.defaultStyle;
    }

    renderSlider() {
        // Label опционален: если пустой — НЕ показываем header строку, экономим
        // вертикальный pixel'аж. Fallback на sensor name удалён намеренно
        // (старое поведение «не задал label → имя датчика» путало юзеров,
        // которые специально хотели чистый виджет).
        const label = this.config?.label || '';
        const labelHtml = label
            ? `<div class="toggle-name" data-test="name">${escapeHtml(label)}</div>`
            : '';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-slider';
        this.element.innerHTML = `
            ${labelHtml}
            <div class="toggle-track" data-test="track" data-handle-pos="left">
                <div class="toggle-handle"></div>
            </div>
            <div class="toggle-state-text" data-test="state-text">${escapeHtml(this._currentLabel())}</div>
        `;
        this.container.appendChild(this.element);
        this.element.querySelector('[data-test="track"]').addEventListener('click', () => this.onClick());

        // Initial state — отрисовать по текущим feedback/command.
        this.renderFeedback();
        this.renderCommand();
    }

    renderCheckbox() {
        // Label опционален. См. комментарий в renderSlider().
        const label = this.config?.label || '';
        const labelHtml = label
            ? `<div class="toggle-name" data-test="name">${escapeHtml(label)}</div>`
            : '';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-checkbox';
        this.element.innerHTML = `
            <div class="toggle-cb" data-test="cb"></div>
            ${labelHtml}
        `;
        this.container.appendChild(this.element);
        // Click anywhere on widget triggers writeValue (standard checkbox UX).
        this.element.addEventListener('click', () => this.onClick());

        this.renderFeedback();
        this.renderCommand();
    }

    // Возвращает labelOn если current value считается ON, иначе labelOff.
    _currentLabel() {
        const labelOff = this.config?.labelOff || 'OFF';
        const labelOn = this.config?.labelOn || 'ON';
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        return current === valueOn ? labelOn : labelOff;
    }

    onClick() {
        // Если widget не интерактивен — клик игнорируется (writeValue сам это знает,
        // но мы ещё не проходим path validation если просто вернём ничего).
        if (!this.isInteractive()) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        const next = current === valueOn ? valueOff : valueOn;
        this.writeValue(next);
    }

    renderCommand() {
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckboxCommand();
        } else {
            this.renderSliderCommand();
        }
    }

    renderSliderCommand() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOn = this.config?.valueOn ?? 1;
        const refValue = this.commandValue ?? this.feedbackValue;
        track.dataset.handlePos = refValue === valueOn ? 'right' : 'left';
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        track.classList.toggle('diverge', !!diverges);
        const stateText = this.element?.querySelector('[data-test="state-text"]');
        if (stateText) stateText.textContent = this._currentLabel();
    }

    renderCheckboxCommand() {
        // diverge применяется к корневому .toggle-widget (yellow box-shadow вокруг
        // всего widget'а лучше читается чем вокруг 24px чекбокса).
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);
    }

    renderFeedback() {
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckboxFeedback();
        } else {
            this.renderSliderFeedback();
        }
    }

    renderSliderFeedback() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        track.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            track.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            track.classList.add('fb-off');
        } else {
            track.classList.add('fb-unknown');
        }
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            track.title = `actual: ${this.feedbackValue}`;
        }
        this.renderCommand();
    }

    renderCheckboxFeedback() {
        const cb = this.element?.querySelector('[data-test="cb"]');
        if (!cb) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        cb.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            cb.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            cb.classList.add('fb-off');
        } else {
            cb.classList.add('fb-unknown');
        }
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            cb.title = `actual: ${this.feedbackValue}`;
        }
        this.renderCommand();
    }

    // === Config form ===

    static getActiveConfigFields(config = {}) {
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>valueOff</label>
                    <input type="number" class="widget-input" name="valueOff"
                           value="${config.valueOff ?? 0}" data-test="cfg-valueOff">
                </div>
                <div class="widget-config-field">
                    <label>valueOn</label>
                    <input type="number" class="widget-input" name="valueOn"
                           value="${config.valueOn ?? 1}" data-test="cfg-valueOn">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>labelOff</label>
                    <input type="text" class="widget-input" name="labelOff"
                           value="${escapeAttr(config.labelOff || '')}" placeholder="OFF" data-test="cfg-labelOff">
                </div>
                <div class="widget-config-field">
                    <label>labelOn</label>
                    <input type="text" class="widget-input" name="labelOn"
                           value="${escapeAttr(config.labelOn || '')}" placeholder="ON" data-test="cfg-labelOn">
                </div>
            </div>
        `;
    }

    static parseActiveConfigFields(form) {
        const valueOff = Number(form.querySelector('[name="valueOff"]')?.value ?? 0);
        let valueOn = Number(form.querySelector('[name="valueOn"]')?.value ?? 1);
        // Защита от degenerate config: valueOff === valueOn делает click no-op
        // (current===valueOn?valueOff:valueOn возвращает valueOn). Если совпали,
        // принудительно ставим valueOn = valueOff + 1, чтобы toggle хотя бы что-то делал.
        if (valueOn === valueOff) {
            valueOn = valueOff + 1;
        }
        return {
            valueOff,
            valueOn,
            labelOff: form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:  form.querySelector('[name="labelOn"]')?.value || '',
        };
    }
}

window.ToggleWidget = ToggleWidget;


// === 61-dashboard-widgets.js ===
class GaugeWidget extends DashboardWidget {
    static type = 'gauge';
    static displayName = 'Gauge';
    static description = 'Circular gauge with needle';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
    static defaultSize = { width: 8, height: 4 };

    render() {
        const { style = 'default' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content';

        switch (style) {
            case 'semicircle':
                this.renderClassic();
                break;
            case 'arc270':
                this.renderModern();
                break;
            case 'speedometer':
                this.renderSpeedometer();
                break;
            case 'dual':
                this.renderDualScale();
                break;
            default:
                this.renderDefault();
        }

        this.container.appendChild(this.element);
    }

    // === Default style (current design) ===
    renderDefault() {
        const { min = 0, max = 100, unit = '' } = this.config;

        this.element.innerHTML = `
            <svg class="gauge-svg" viewBox="0 0 100 60">
                <!-- Background arc -->
                <path class="gauge-background" d="M 10 50 A 40 40 0 0 1 90 50"/>
                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>
                <!-- Value arc -->
                <path class="gauge-value-arc" id="gauge-arc-${this.id}" d="M 10 50 A 40 40 0 0 1 90 50"/>
                <!-- Needle -->
                <g class="gauge-needle" id="gauge-needle-${this.id}" style="transform-origin: 50px 50px; transform: rotate(-90deg)">
                    <polygon points="50,15 48,50 52,50"/>
                </g>
                <!-- Center -->
                <circle class="gauge-center" cx="50" cy="50" r="6"/>
                <!-- Value text -->
                <text class="gauge-value-text" x="50" y="42" id="gauge-value-${this.id}">0</text>
                <text class="gauge-unit-text" x="50" y="52">${escapeHtml(unit)}</text>
                <!-- Min/Max labels -->
                <text class="gauge-min-text" x="12" y="58">${min}</text>
                <text class="gauge-max-text" x="88" y="58" text-anchor="end">${max}</text>
            </svg>
        `;

        this.arcEl = this.element.querySelector(`#gauge-arc-${this.id}`);
        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.valueEl = this.element.querySelector(`#gauge-value-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
        this.updateArcColor(0);
    }

    // === Classic style (chrome rim, trading style) ===
    renderClassic() {
        const { min = 0, max = 100, unit = '', zones = [] } = this.config;
        const ticks = this.generateTicks(min, max, 5);

        // Semicircular gauge with value below on dark background
        const cx = 50, cy = 46, r = 41;

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-semicircle" viewBox="0 0 100 72">
                <defs>
                    <!-- Chrome gradient for rim -->
                    <linearGradient id="chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#f5f5f5"/>
                        <stop offset="30%" style="stop-color:#e0e0e0"/>
                        <stop offset="50%" style="stop-color:#c8c8c8"/>
                        <stop offset="70%" style="stop-color:#d5d5d5"/>
                        <stop offset="100%" style="stop-color:#a0a0a0"/>
                    </linearGradient>
                    <!-- Face gradient -->
                    <radialGradient id="face-${this.id}" cx="50%" cy="0%" r="100%">
                        <stop offset="0%" style="stop-color:#fafafa"/>
                        <stop offset="100%" style="stop-color:#e8e8e8"/>
                    </radialGradient>
                </defs>

                <!-- Chrome rim (semicircle only) -->
                <path d="M ${cx - r - 5} ${cy} A ${r + 5} ${r + 5} 0 0 1 ${cx + r + 5} ${cy}"
                      fill="none" stroke="url(#chrome-${this.id})" stroke-width="5"/>
                <path d="M ${cx - r - 5} ${cy} A ${r + 5} ${r + 5} 0 0 1 ${cx + r + 5} ${cy}"
                      fill="none" stroke="#888" stroke-width="0.5"/>

                <!-- Inner face (semicircle) -->
                <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z"
                      fill="url(#face-${this.id})" stroke="#999" stroke-width="0.3"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Color zones arc -->
                ${this.renderClassicZones(zones, min, max)}

                <!-- Tick marks and labels -->
                ${ticks.map(t => this.renderClassicTick(t.angle, t.value, t.major)).join('')}

                <!-- Needle -->
                <g class="gauge-needle-semicircle" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(-90deg)">
                    <polygon points="${cx},${cy - r + 6} ${cx - 2},${cy - 3} ${cx + 2},${cy - 3}" fill="#222"/>
                    <polygon points="${cx},${cy - r + 8} ${cx - 1.5},${cy - 4} ${cx + 1.5},${cy - 4}" fill="#c00"/>
                </g>

                <!-- Center cap -->
                <circle cx="${cx}" cy="${cy}" r="5" fill="url(#chrome-${this.id})" stroke="#666" stroke-width="0.5"/>
                <circle cx="${cx}" cy="${cy}" r="3" fill="#333"/>

                <!-- Unit inside gauge (center, below cap) -->
                <text x="${cx}" y="${cy - 8}" fill="#555" text-anchor="middle" font-size="9">${escapeHtml(unit)}</text>

                <!-- Value below gauge (white text on dark widget background) -->
                <text class="gauge-semicircle-value" x="${cx}" y="${cy + 17}" id="gauge-value-${this.id}">0</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.valueEl = this.element.querySelector(`#gauge-value-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
    }

    renderClassicZones(zones, min, max) {
        if (!zones || zones.length === 0) return '';

        const cx = 50, cy = 46, r = 34;
        let html = '';

        for (const zone of zones) {
            const startPercent = (zone.from - min) / (max - min);
            const endPercent = (zone.to - min) / (max - min);
            // Position angles for cos/sin: LEFT (180°) to RIGHT (360°) via TOP (270°)
            const startAngle = 180 + (startPercent * 180);
            const endAngle = 180 + (endPercent * 180);

            const startRad = startAngle * Math.PI / 180;
            const endRad = endAngle * Math.PI / 180;

            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);

            // Arc spans from startAngle to endAngle (sweep=1 for upper arc in SVG Y-down)
            const arcSpan = Math.abs(endAngle - startAngle);
            const largeArc = arcSpan > 180 ? 1 : 0;

            html += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}"
                          fill="none" stroke="${zone.color}" stroke-width="4" opacity="0.8"/>`;
        }

        return html;
    }

    renderClassicTick(angle, value, major) {
        const cx = 50, cy = 46;
        const outerR = 36;
        const innerR = major ? 30 : 33;
        const textR = 23;

        // Convert from lower semicircle angles (180→0) to upper semicircle (180→360)
        const upperAngle = 360 - angle;
        const rad = upperAngle * Math.PI / 180;
        const x1 = cx + outerR * Math.cos(rad);
        const y1 = cy + outerR * Math.sin(rad);
        const x2 = cx + innerR * Math.cos(rad);
        const y2 = cy + innerR * Math.sin(rad);
        const tx = cx + textR * Math.cos(rad);
        let ty = cy + textR * Math.sin(rad);

        // Raise extreme labels (0 and max) by 3px so they don't extend beyond gauge background
        if (angle === 180 || angle === 0) {
            ty -= 3;
        }

        let html = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                         stroke="#444" stroke-width="${major ? 1 : 0.5}"/>`;

        if (major) {
            html += `<text x="${tx}" y="${ty}" class="gauge-semicircle-tick" text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    // === Modern style (Lada dashboard style) ===
    renderModern() {
        const { min = 0, max = 100, unit = '', zones = [] } = this.config;
        const ticks = this.generateTicks(min, max, 5);

        // Match speedometer outer diameter with thicker bezel
        const cx = 60, cy = 55, r = 51;

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-arc270" viewBox="0 0 120 115">
                <defs>
                    <!-- Chrome rim gradient (matching speedometer) -->
                    <linearGradient id="arc270-chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#505050"/>
                        <stop offset="15%" style="stop-color:#404040"/>
                        <stop offset="50%" style="stop-color:#303030"/>
                        <stop offset="85%" style="stop-color:#404040"/>
                        <stop offset="100%" style="stop-color:#353535"/>
                    </linearGradient>
                    <!-- Glow filter -->
                    <filter id="glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                    <!-- Needle gradient -->
                    <linearGradient id="needle-grad-${this.id}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#ff6b35"/>
                        <stop offset="100%" style="stop-color:#f7931e"/>
                    </linearGradient>
                </defs>

                <!-- Outer chrome bezel (thicker, matching speedometer) -->
                <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="url(#arc270-chrome-${this.id})" stroke="#555" stroke-width="0.5"/>

                <!-- Inner dark ring (matching speedometer) -->
                <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="#252525"/>

                <!-- Dark background -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1a1a1a"/>

                <!-- Outer glow ring -->
                <circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="none" stroke="#2a4a5a" stroke-width="2" filter="url(#glow-${this.id})"/>

                <!-- Inner ring -->
                <circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="#1e3a4a" stroke-width="1"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Red zone (if defined) -->
                ${this.renderModernRedZone(zones, min, max)}

                <!-- Tick marks and numbers -->
                ${ticks.map(t => this.renderModernTick(t.angle, t.value, t.major)).join('')}

                <!-- Needle -->
                <g class="gauge-needle-arc270" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(-135deg)">
                    <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 10}" stroke="#ff6b35" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="${cx}" cy="${cy}" r="4" fill="#333" stroke="#ff6b35" stroke-width="1"/>
                </g>

                <!-- Center cap -->
                <circle cx="${cx}" cy="${cy}" r="6" fill="#222" stroke="#444" stroke-width="1"/>
                <circle cx="${cx}" cy="${cy}" r="3" fill="#333"/>

                <!-- Unit label (centered) -->
                <text class="gauge-arc270-unit" x="${cx}" y="${cy + 22}">${escapeHtml(unit)}</text>

                <!-- Value display (lower position, inside gauge) -->
                <text class="gauge-arc270-value-small" x="${cx}" y="${cy + 35}" id="gauge-value-${this.id}">0</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.valueEl = this.element.querySelector(`#gauge-value-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
    }

    renderModernRedZone(zones, min, max) {
        if (!zones || zones.length === 0) return '';

        const cx = 60, cy = 55, r = 38;
        let html = '';

        // Find red/warning zones (typically high values)
        for (const zone of zones) {
            const startPercent = (zone.from - min) / (max - min);
            const endPercent = (zone.to - min) / (max - min);
            // Position angles for cos/sin: BOTTOM-LEFT (135°) to BOTTOM-RIGHT (45°) via TOP (270°)
            const startAngle = 135 + (startPercent * 270);
            const endAngle = 135 + (endPercent * 270);

            const startRad = startAngle * Math.PI / 180;
            const endRad = endAngle * Math.PI / 180;

            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);

            // Arc spans from startAngle to endAngle (increasing angles with sweep=1)
            const arcSpan = Math.abs(endAngle - startAngle);
            const largeArc = arcSpan > 180 ? 1 : 0;

            html += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}"
                          fill="none" stroke="${zone.color}" stroke-width="4" opacity="0.8"/>`;
        }

        return html;
    }

    renderModernTick(angle, value, major) {
        const cx = 60, cy = 55;
        const outerR = 42;
        const innerR = major ? 34 : 38;
        const textR = 26;

        // Convert from semicircle position angles (180° to 0°) to arc270 (135° to 405°)
        const adjustedAngle = 135 + (180 - angle) / 180 * 270;
        const rad = adjustedAngle * Math.PI / 180;

        const x1 = cx + outerR * Math.cos(rad);
        const y1 = cy + outerR * Math.sin(rad);
        const x2 = cx + innerR * Math.cos(rad);
        const y2 = cy + innerR * Math.sin(rad);
        const tx = cx + textR * Math.cos(rad);
        const ty = cy + textR * Math.sin(rad);

        let html = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                         stroke="${major ? '#888' : '#555'}" stroke-width="${major ? 1.5 : 0.5}"/>`;

        if (major) {
            html += `<text x="${tx}" y="${ty}" class="gauge-arc270-tick" text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    // === Speedometer style (realistic automotive gauge) ===
    renderSpeedometer() {
        const { min = 0, max = 4000, unit = 'RPM', zones = [] } = this.config;
        const majorStep = this.calculateMajorStep(min, max);
        const ticks = this.generateSpeedoTicks(min, max, majorStep);

        const cx = 60, cy = 55, r = 48;

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-speedometer" viewBox="0 0 120 115">
                <defs>
                    <!-- Chrome rim gradient -->
                    <linearGradient id="speedo-chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#ffffff"/>
                        <stop offset="15%" style="stop-color:#e8e8e8"/>
                        <stop offset="30%" style="stop-color:#c0c0c0"/>
                        <stop offset="50%" style="stop-color:#a8a8a8"/>
                        <stop offset="70%" style="stop-color:#c0c0c0"/>
                        <stop offset="85%" style="stop-color:#d8d8d8"/>
                        <stop offset="100%" style="stop-color:#909090"/>
                    </linearGradient>

                    <!-- Inner chrome ring -->
                    <linearGradient id="speedo-chrome-inner-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#606060"/>
                        <stop offset="50%" style="stop-color:#404040"/>
                        <stop offset="100%" style="stop-color:#606060"/>
                    </linearGradient>

                    <!-- Face gradient (off-white) -->
                    <radialGradient id="speedo-face-${this.id}" cx="50%" cy="30%" r="70%">
                        <stop offset="0%" style="stop-color:#f8f8f8"/>
                        <stop offset="100%" style="stop-color:#e0e0e0"/>
                    </radialGradient>

                    <!-- Shadow filter -->
                    <filter id="speedo-shadow-${this.id}" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3"/>
                    </filter>

                    <!-- Needle gradient -->
                    <linearGradient id="speedo-needle-${this.id}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#cc0000"/>
                        <stop offset="50%" style="stop-color:#ff0000"/>
                        <stop offset="100%" style="stop-color:#cc0000"/>
                    </linearGradient>
                </defs>

                <!-- Outer chrome bezel -->
                <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="url(#speedo-chrome-${this.id})"
                        stroke="#707070" stroke-width="0.5"/>

                <!-- Inner dark ring -->
                <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="url(#speedo-chrome-inner-${this.id})"/>

                <!-- Main face -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#speedo-face-${this.id})"
                        filter="url(#speedo-shadow-${this.id})"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Color zones (danger zone etc) -->
                ${this.renderSpeedoZones(zones, min, max, cx, cy, r - 6)}

                <!-- Tick marks and numbers -->
                ${ticks.map(t => this.renderSpeedoTick(t, cx, cy, r)).join('')}

                <!-- Needle assembly -->
                <g class="gauge-needle-tacho" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(-135deg)">
                    <!-- Needle shadow -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 3},${cy + 8} ${cx + 3},${cy + 8}"
                             fill="rgba(0,0,0,0.2)" transform="translate(1, 1)"/>
                    <!-- Needle body -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 2.5},${cy + 6} ${cx + 2.5},${cy + 6}"
                             fill="url(#speedo-needle-${this.id})" stroke="#800000" stroke-width="0.3"/>
                    <!-- Needle highlight -->
                    <line x1="${cx}" y1="${cy - r + 16}" x2="${cx}" y2="${cy - 4}"
                          stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
                </g>

                <!-- Center cap (layered for 3D effect) -->
                <circle cx="${cx}" cy="${cy}" r="10" fill="url(#speedo-chrome-${this.id})"
                        stroke="#505050" stroke-width="0.5"/>
                <circle cx="${cx}" cy="${cy}" r="7" fill="#2a2a2a"/>
                <circle cx="${cx}" cy="${cy}" r="5" fill="#1a1a1a" stroke="#333" stroke-width="0.5"/>
                <circle cx="${cx}" cy="${cy}" r="2" fill="#444"/>

                <!-- Unit label (above digital display) -->
                <text class="speedo-unit" x="${cx}" y="${cy + 21}">${escapeHtml(unit)}</text>

                <!-- Digital display -->
                <rect x="${cx - 21}" y="${cy + 27}" width="42" height="11" rx="2"
                      fill="#2a2a2a" stroke="#1a1a1a" stroke-width="0.5"/>
                <rect x="${cx - 20}" y="${cy + 28}" width="40" height="9" rx="1.5"
                      fill="#1e1e1e"/>
                <text class="speedo-digital" x="${cx}" y="${cy + 35}" id="gauge-digital-${this.id}">0</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.digitalEl = this.element.querySelector(`#gauge-digital-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
        // valueEl not used in speedometer - digital display shows the value
    }

    // === Dual Scale style (main value + target indicator) ===
    renderDualScale() {
        const { min = 0, max = 100, unit = '', zones = [], sensor2 = '' } = this.config;
        const hasSensor2 = sensor2 && sensor2.trim() !== '';

        const cx = 60, cy = 62, r = 55;
        const majorStep = this.calculateMajorStep(min, max);
        const ticks = this.generateSpeedoTicks(min, max, majorStep);

        this.element.innerHTML = `
            <svg class="gauge-svg gauge-dual" viewBox="0 0 120 125">
                <defs>
                    <!-- Dark background gradient -->
                    <radialGradient id="dual-bg-${this.id}" cx="50%" cy="30%" r="70%">
                        <stop offset="0%" style="stop-color:#3a3a3a"/>
                        <stop offset="100%" style="stop-color:#1a1a1a"/>
                    </radialGradient>

                    <!-- Chrome bezel gradient -->
                    <linearGradient id="dual-chrome-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:#606060"/>
                        <stop offset="15%" style="stop-color:#505050"/>
                        <stop offset="50%" style="stop-color:#404040"/>
                        <stop offset="85%" style="stop-color:#505050"/>
                        <stop offset="100%" style="stop-color:#454545"/>
                    </linearGradient>

                    <!-- Cyan glow filter -->
                    <filter id="dual-glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="1.5" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>

                    <!-- Orange glow filter for target -->
                    <filter id="dual-target-glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="1" result="blur"/>
                        <feMerge>
                            <feMergeNode in="blur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>

                    <!-- Needle gradient (cyan) -->
                    <linearGradient id="dual-needle-${this.id}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:#00a8cc"/>
                        <stop offset="50%" style="stop-color:#00d4ff"/>
                        <stop offset="100%" style="stop-color:#00a8cc"/>
                    </linearGradient>
                </defs>

                <!-- Outer chrome bezel -->
                <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="url(#dual-chrome-${this.id})"
                        stroke="#303030" stroke-width="0.5"/>

                <!-- Inner ring -->
                <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="#2a2a2a"/>

                <!-- Main face (dark) -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#dual-bg-${this.id})"/>

                <!-- Sector fill (0 to value) -->
                <path class="gauge-sector-fill" id="gauge-sector-${this.id}" style="display: none; opacity: 0.3;"/>

                <!-- Color zones -->
                ${this.renderSpeedoZones(zones, min, max, cx, cy, r - 6)}

                <!-- Scale: tick marks -->
                ${ticks.map(t => this.renderDualOuterTick(t, cx, cy, r)).join('')}

                <!-- Target arc (cyan, from 0 to target value) - updated via JS -->
                <path id="gauge-target-arc-${this.id}" class="dual-target-arc"
                      d="" fill="none" stroke="#00d4ff" stroke-width="2.5" opacity="0.6"
                      filter="url(#dual-target-glow-${this.id})" style="display: none;"/>

                <!-- Target indicator (invisible, used only for angle calculation) -->
                <g class="dual-target-marker" id="gauge-target-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(-135deg); display: none;"></g>

                <!-- Needle assembly (cyan) -->
                <g class="gauge-needle-dual" id="gauge-needle-${this.id}" style="transform-origin: ${cx}px ${cy}px; transform: rotate(-135deg)">
                    <!-- Needle glow -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 2.5},${cy + 6} ${cx + 2.5},${cy + 6}"
                             fill="#00d4ff" filter="url(#dual-glow-${this.id})" opacity="0.5"/>
                    <!-- Needle body -->
                    <polygon points="${cx},${cy - r + 14} ${cx - 2},${cy + 5} ${cx + 2},${cy + 5}"
                             fill="url(#dual-needle-${this.id})" stroke="#008899" stroke-width="0.3"/>
                    <!-- Needle highlight -->
                    <line x1="${cx}" y1="${cy - r + 16}" x2="${cx}" y2="${cy - 4}"
                          stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>
                </g>

                <!-- Center cap (cyan glow) -->
                <circle cx="${cx}" cy="${cy}" r="10" fill="#2a2a2a" stroke="#00d4ff" stroke-width="1"/>
                <circle cx="${cx}" cy="${cy}" r="7" fill="#00d4ff" filter="url(#dual-glow-${this.id})"/>
                <circle cx="${cx}" cy="${cy}" r="5" fill="#1a1a1a"/>
                <circle cx="${cx}" cy="${cy}" r="2" fill="#00d4ff"/>

                <!-- Unit label -->
                <text class="dual-unit" x="${cx}" y="${cy + 21}">${escapeHtml(unit)}</text>

                <!-- Digital display for main value (white digits) -->
                <rect x="${cx - 21}" y="${cy + 27}" width="42" height="11" rx="2"
                      fill="#1a1a1a" stroke="#333" stroke-width="0.5"/>
                <rect x="${cx - 20}" y="${cy + 28}" width="40" height="9" rx="1.5"
                      fill="#0a0a0a"/>
                <text class="dual-digital-white" x="${cx}" y="${cy + 35}" id="gauge-digital-${this.id}">--</text>

                <!-- Target value (small, below digital display) - hidden if no sensor2 -->
                <text class="dual-target-small" x="${cx}" y="${cy + 44}" id="gauge-target-digital-${this.id}"
                      style="${hasSensor2 ? '' : 'display: none;'}">${hasSensor2 ? '--' : ''}</text>
            </svg>
        `;

        this.needleEl = this.element.querySelector(`#gauge-needle-${this.id}`);
        this.digitalEl = this.element.querySelector(`#gauge-digital-${this.id}`);
        this.targetEl = this.element.querySelector(`#gauge-target-${this.id}`);
        this.targetArcEl = this.element.querySelector(`#gauge-target-arc-${this.id}`);
        this.targetDigitalEl = this.element.querySelector(`#gauge-target-digital-${this.id}`);
        this.sectorEl = this.element.querySelector(`#gauge-sector-${this.id}`);
        // Store dimensions for arc calculation
        this.dualParams = { cx, cy, r, arcR: r - 2 };
    }

    renderDualOuterTick(tick, cx, cy, r) {
        const { angle, value, major } = tick;
        const rad = angle * Math.PI / 180;

        // Outer scale: ticks at edge, numbers between ticks and inner dots
        const outerR = r - 4;      // tick outer edge
        const innerR = major ? r - 11 : r - 7;  // tick inner edge
        const textR = r - 19;      // numbers position (between ticks and dots)

        const x1 = cx + outerR * Math.cos(rad);
        const y1 = cy + outerR * Math.sin(rad);
        const x2 = cx + innerR * Math.cos(rad);
        const y2 = cy + innerR * Math.sin(rad);

        let html = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                         stroke="#ccc" stroke-width="${major ? 1.8 : 0.8}"/>`;

        if (major) {
            const tx = cx + textR * Math.cos(rad);
            const ty = cy + textR * Math.sin(rad);
            html += `<text x="${tx}" y="${ty}" class="dual-outer-label"
                          text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    calculateMajorStep(min, max) {
        const range = max - min;
        if (range <= 100) return 10;
        if (range <= 500) return 50;
        if (range <= 1000) return 100;
        if (range <= 5000) return 500;
        if (range <= 10000) return 1000;
        return 2000;
    }

    generateSpeedoTicks(min, max, majorStep) {
        const ticks = [];
        const minorStep = majorStep / 5;

        for (let v = min; v <= max; v += minorStep) {
            const isMajor = Math.abs(v % majorStep) < 0.001 || Math.abs(v % majorStep - majorStep) < 0.001;
            const percent = (v - min) / (max - min);
            // 270° arc for positioning with cos/sin (135° to 405°/45°)
            const angle = 135 + (percent * 270);
            ticks.push({ value: Math.round(v), angle, major: isMajor });
        }

        return ticks;
    }

    renderSpeedoTick(tick, cx, cy, r) {
        const { angle, value, major } = tick;
        const rad = angle * Math.PI / 180;

        const outerR = r - 4;
        const innerR = major ? r - 12 : r - 8;
        const textR = r - 24;

        const x1 = cx + outerR * Math.cos(rad);
        const y1 = cy + outerR * Math.sin(rad);
        const x2 = cx + innerR * Math.cos(rad);
        const y2 = cy + innerR * Math.sin(rad);

        let html = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                         stroke="#333" stroke-width="${major ? 1.5 : 0.7}"/>`;

        if (major) {
            const tx = cx + textR * Math.cos(rad);
            const ty = cy + textR * Math.sin(rad);
            html += `<text x="${tx}" y="${ty}" class="speedo-tick-label"
                          text-anchor="middle" dominant-baseline="middle">${value}</text>`;
        }

        return html;
    }

    renderSpeedoZones(zones, min, max, cx, cy, r) {
        if (!zones || zones.length === 0) return '';

        let html = '';
        for (const zone of zones) {
            const startPercent = (zone.from - min) / (max - min);
            const endPercent = (zone.to - min) / (max - min);
            // Position angles for cos/sin (135° to 405°/45°)
            const startAngle = 135 + (startPercent * 270);
            const endAngle = 135 + (endPercent * 270);

            const startRad = startAngle * Math.PI / 180;
            const endRad = endAngle * Math.PI / 180;

            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);

            // Arc spans from startAngle to endAngle (increasing angles with sweep=1)
            const arcSpan = Math.abs(endAngle - startAngle);
            const largeArc = arcSpan > 180 ? 1 : 0;

            html += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}"
                          fill="none" stroke="${zone.color}" stroke-width="6" opacity="0.7"/>`;
        }

        return html;
    }

    // === Shared helpers ===
    generateTicks(min, max, majorCount) {
        const ticks = [];
        const range = max - min;
        const majorStep = range / majorCount;
        const minorPerMajor = 4;

        for (let i = 0; i <= majorCount; i++) {
            const value = min + (i * majorStep);
            const percent = i / majorCount;
            // Position angle for cos/sin: 180° (left) to 0° (right) via 90° (bottom)
            const angle = 180 - (percent * 180);
            ticks.push({ angle, value: Math.round(value), major: true });

            // Minor ticks
            if (i < majorCount) {
                for (let j = 1; j <= minorPerMajor; j++) {
                    const minorPercent = (i + j / (minorPerMajor + 1)) / majorCount;
                    const minorAngle = 180 - (minorPercent * 180);
                    const minorValue = min + (minorPercent * range);
                    ticks.push({ angle: minorAngle, value: Math.round(minorValue), major: false });
                }
            }
        }

        return ticks;
    }

    getColorForValue(value) {
        const { zones = [] } = this.config;

        if (zones.length === 0) {
            return 'var(--accent-blue)';
        }

        for (const zone of zones) {
            if (value >= zone.from && value <= zone.to) {
                return zone.color;
            }
        }

        return 'var(--accent-blue)';
    }

    updateArcColor(value) {
        if (this.arcEl) {
            this.arcEl.style.stroke = this.getColorForValue(value);
        }
    }

    update(value, error = null) {
        super.update(value, error);

        const { min = 0, max = 100, decimals = 1, style = 'default' } = this.config;

        // For speedometer/dual, check digitalEl; for others, check valueEl
        const hasDisplay = (style === 'speedometer' || style === 'dual') ? this.digitalEl : this.valueEl;
        if (!hasDisplay && !this.needleEl) return;

        if (error) {
            if (this.valueEl) this.valueEl.textContent = 'ERR';
            if (this.digitalEl) this.digitalEl.textContent = 'ERR';
            if (this.needleEl) this.needleEl.classList.remove('overrange');
            return;
        }

        const numValue = parseFloat(value) || 0;
        const clampedValue = Math.max(min, Math.min(max, numValue));
        const percent = (clampedValue - min) / (max - min);

        // Detect overrange condition
        const isOverrange = numValue < min || numValue > max;

        // Update value text (always show actual value, not clamped)
        if (this.valueEl) this.valueEl.textContent = numValue.toFixed(decimals);

        // Update needle rotation based on style
        // CSS rotate: 0 = UP, positive = clockwise
        // Position angle (math): 0 = RIGHT, positive = counter-clockwise in SVG (Y down)
        // To point at position P: CSS angle = P - 270
        let angle;
        switch (style) {
            case 'semicircle':
                // 180° arc: LEFT (180°) to RIGHT (360°) via TOP (270°) - UPPER semicircle
                // Position = 180 + percent*180, so CSS = (180 + p*180) - 270 = -90 + p*180
                angle = -90 + (percent * 180);
                break;
            case 'arc270':
                // 270° arc: -135 to +135
                angle = -135 + (percent * 270);
                break;
            case 'speedometer':
                // 270° arc: -135 to +135 (same as arc270)
                angle = -135 + (percent * 270);
                // Update digital display (use decimals config)
                if (this.digitalEl) {
                    this.digitalEl.textContent = numValue.toFixed(decimals);
                }
                break;
            case 'dual':
                // 270° arc: -135 to +135 (same as speedometer)
                angle = -135 + (percent * 270);
                // Update digital display
                if (this.digitalEl) {
                    this.digitalEl.textContent = numValue.toFixed(decimals);
                }
                break;
            default:
                // 180° arc: LEFT (180°) to RIGHT (360°) via TOP (270°) - UPPER semicircle
                // Position = 180 + percent*180, so CSS = (180 + p*180) - 270 = -90 + p*180
                angle = -90 + (percent * 180);
        }

        // Apply needle rotation with CSS variable for animation
        this.needleEl.style.setProperty('--needle-angle', `${angle}deg`);
        this.needleEl.style.transform = `rotate(${angle}deg)`;

        // Toggle overrange shake animation
        if (isOverrange) {
            this.needleEl.classList.add('overrange');
        } else {
            this.needleEl.classList.remove('overrange');
        }

        // Update arc color for default style
        if (style === 'default') {
            this.updateArcColor(numValue);
            if (this.arcEl) {
                const arcLength = Math.PI * 40;
                const dashLength = percent * arcLength;
                this.arcEl.style.strokeDasharray = `${dashLength} ${arcLength}`;
            }
        }

        // Update sector fill
        this.lastValue = numValue;
        this.updateSectorFill(percent);
    }

    // Update target indicator for dual scale gauge (instant, no animation)
    updateSetpoint(value, error = null) {
        if (!this.targetEl) return;

        const { min = 0, max = 100, style = 'default', decimals = 1 } = this.config;

        // Only for dual style
        if (style !== 'dual') return;

        if (error) {
            this.targetEl.style.display = 'none';
            if (this.targetArcEl) this.targetArcEl.style.display = 'none';
            if (this.targetDigitalEl) this.targetDigitalEl.textContent = 'ERR';
            return;
        }

        const numValue = parseFloat(value) || 0;
        const clampedValue = Math.max(min, Math.min(max, numValue));
        const percent = (clampedValue - min) / (max - min);

        // Calculate rotation angle (270° arc: -135° to +135°)
        const angle = -135 + (percent * 270);

        // Set rotation directly without transition (instant move)
        this.targetEl.style.transform = `rotate(${angle}deg)`;
        this.targetEl.style.display = 'block';

        // Update target digital display
        if (this.targetDigitalEl) {
            this.targetDigitalEl.textContent = numValue.toFixed(decimals);
        }

        // Update target arc (from 0/min to target value)
        if (this.targetArcEl && this.dualParams) {
            const { cx, cy, arcR } = this.dualParams;
            const startAngle = -135; // Start at min (0)
            const endAngle = angle;  // End at target

            if (percent > 0.01) {
                const arcPath = this.describeArc(cx, cy, arcR, startAngle, endAngle);
                this.targetArcEl.setAttribute('d', arcPath);
                this.targetArcEl.style.display = 'block';
            } else {
                this.targetArcEl.style.display = 'none';
            }
        }
    }

    // Helper to create SVG arc path
    describeArc(cx, cy, r, startAngle, endAngle) {
        const start = this.polarToCartesian(cx, cy, r, endAngle);
        const end = this.polarToCartesian(cx, cy, r, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
    }

    polarToCartesian(cx, cy, r, angleDeg) {
        const angleRad = (angleDeg - 90) * Math.PI / 180;
        return {
            x: cx + r * Math.cos(angleRad),
            y: cy + r * Math.sin(angleRad)
        };
    }

    // Helper to create SVG sector (pie slice) path
    describeSector(cx, cy, r, startAngle, endAngle) {
        const start = this.polarToCartesian(cx, cy, r, startAngle);
        const end = this.polarToCartesian(cx, cy, r, endAngle);
        const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
        const sweepFlag = endAngle > startAngle ? 1 : 0;
        return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y} Z`;
    }

    // Animate sector fill by reading actual needle position from CSS computed style
    // This ensures perfect sync with CSS transition animation
    animateSectorTo(targetPercent) {
        const { fillSector = false, style = 'default' } = this.config;
        if (!fillSector || !this.sectorEl || !this.needleEl) return;

        // Cancel any running animation
        if (this.sectorAnimationId) {
            cancelAnimationFrame(this.sectorAnimationId);
        }

        // Store target for comparison
        this.targetPercent = targetPercent;
        const startTime = performance.now();
        const maxDuration = 1500; // Safety timeout slightly longer than CSS transition (1.2s)

        const animate = () => {
            // Read actual needle angle from computed transform
            const computedStyle = window.getComputedStyle(this.needleEl);
            const transform = computedStyle.transform;

            let currentPercent = targetPercent;

            if (transform && transform !== 'none') {
                // Parse matrix: matrix(a, b, c, d, e, f)
                const match = transform.match(/matrix\(([^)]+)\)/);
                if (match) {
                    const values = match[1].split(', ').map(parseFloat);
                    const a = values[0];
                    const b = values[1];
                    // Calculate rotation angle in radians, then convert to degrees
                    const angleRad = Math.atan2(b, a);
                    const angleDeg = angleRad * (180 / Math.PI);

                    // Convert angle to percent based on gauge style
                    switch (style) {
                        case 'semicircle':
                            // Range: -90° to +90°, so 180° total
                            currentPercent = (angleDeg + 90) / 180;
                            break;
                        case 'arc270':
                        case 'speedometer':
                        case 'dual':
                            // Range: -135° to +135°, so 270° total
                            currentPercent = (angleDeg + 135) / 270;
                            break;
                        default:
                            // Default: -90° to +90°, so 180° total
                            currentPercent = (angleDeg + 90) / 180;
                            break;
                    }
                }
            }

            currentPercent = Math.max(0, Math.min(1, currentPercent));
            this.updateSectorPath(currentPercent);
            this.displayedPercent = currentPercent;

            // Continue animating until needle stops (close to target or timeout)
            const elapsed = performance.now() - startTime;
            if (Math.abs(currentPercent - this.targetPercent) > 0.002 && elapsed < maxDuration) {
                this.sectorAnimationId = requestAnimationFrame(animate);
            }
        };

        this.sectorAnimationId = requestAnimationFrame(animate);
    }

    // Update sector path for given percent (called during animation)
    updateSectorPath(percent) {
        if (!this.sectorEl) return;

        if (percent <= 0.001) {
            this.sectorEl.style.display = 'none';
            return;
        }

        this.sectorEl.style.display = 'block';

        const { style = 'default' } = this.config;
        let path = '';

        switch (style) {
            case 'semicircle': {
                const cx = 50, cy = 46, r = 34;
                const startAngle = -90;
                const endAngle = -90 + (percent * 180);
                path = this.describeSector(cx, cy, r, startAngle, endAngle);
                break;
            }
            case 'arc270':
            case 'speedometer': {
                const cx = 60, cy = 55, r = 44;
                const startAngle = -135;
                const endAngle = -135 + (percent * 270);
                path = this.describeSector(cx, cy, r, startAngle, endAngle);
                break;
            }
            case 'dual': {
                const cx = 60, cy = 62, r = 44;
                const startAngle = -135;
                const endAngle = -135 + (percent * 270);
                path = this.describeSector(cx, cy, r, startAngle, endAngle);
                break;
            }
            default: {
                const cx = 50, cy = 50, r = 35;
                const startAngle = -90;
                const endAngle = -90 + (percent * 180);
                path = this.describeSector(cx, cy, r, startAngle, endAngle);
                break;
            }
        }

        this.sectorEl.setAttribute('d', path);
        this.sectorEl.style.fill = this.getColorForValue(this.lastValue || 0);
    }

    // Update sector fill (starts animation to target percent)
    updateSectorFill(percent) {
        const { fillSector = false } = this.config;
        if (!fillSector) {
            if (this.sectorEl) this.sectorEl.style.display = 'none';
            return;
        }

        // Start animated transition to new value
        this.animateSectorTo(percent);
    }

    static getConfigForm(config = {}) {
        const zones = config.zones || [];
        return `
            <div class="widget-config-field">
                <label>Sensor</label>
                <input type="text" class="widget-input" name="sensor"
                       value="${escapeAttr(config.sensor || '')}" placeholder="Type to search..." autocomplete="off">
            </div>
            <div class="dual-scale-fields" style="display: ${config.style === 'dual' ? 'block' : 'none'};">
                <div class="widget-config-field">
                    <label>Target Sensor</label>
                    <input type="text" class="widget-input" name="sensor2"
                           value="${escapeAttr(config.sensor2 || '')}" placeholder="Target/setpoint sensor..." autocomplete="off">
                </div>
            </div>
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-select" name="style" onchange="toggleDualScaleFields(this)">
                    <option value="default" ${!config.style || config.style === 'default' ? 'selected' : ''}>Default</option>
                    <option value="semicircle" ${config.style === 'semicircle' ? 'selected' : ''}>Semicircle White</option>
                    <option value="arc270" ${config.style === 'arc270' ? 'selected' : ''}>Arc 270° Black</option>
                    <option value="speedometer" ${config.style === 'speedometer' ? 'selected' : ''}>Speedometer White</option>
                    <option value="dual" ${config.style === 'dual' ? 'selected' : ''}>Dual Scale</option>
                </select>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Min</label>
                    <input type="number" class="widget-input" name="min"
                           value="${config.min ?? 0}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="max"
                           value="${config.max ?? 100}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="°C, %, etc.">
                </div>
                <div class="widget-config-field">
                    <label>Decimals</label>
                    <input type="number" class="widget-input" name="decimals"
                           value="${config.decimals ?? 1}" min="0" max="4">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label class="widget-toggle">
                        <input type="checkbox" name="fillSector" ${config.fillSector ? 'checked' : ''}>
                        <span class="widget-toggle-track"><span class="widget-toggle-thumb"></span></span>
                        <span class="widget-toggle-label">Fill sector (0 to value)</span>
                    </label>
                </div>
            </div>
            <div class="widget-config-field">
                <div class="zones-editor">
                    <div class="zones-header">
                        <label>Color Zones</label>
                        <button type="button" class="zones-add-btn" onclick="addZoneField(this)">+ Add Zone</button>
                    </div>
                    <div class="zones-list" id="zones-list">
                        ${zones.map((z, i) => `
                            <div class="zone-item">
                                <input type="color" class="zone-color" name="zone-color-${i}" value="${z.color || '#22c55e'}">
                                <div class="zone-inputs">
                                    <input type="number" class="zone-input" name="zone-from-${i}" value="${z.from ?? 0}" placeholder="From">
                                    <span class="zone-separator">→</span>
                                    <input type="number" class="zone-input" name="zone-to-${i}" value="${z.to ?? 100}" placeholder="To">
                                </div>
                                <button type="button" class="zone-remove-btn" onclick="removeZoneField(this)">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        const zones = [];
        const zoneItems = form.querySelectorAll('.zone-item');
        zoneItems.forEach((item) => {
            // Find elements by class/type inside item (index-independent)
            const color = item.querySelector('.zone-color')?.value;
            const inputs = item.querySelectorAll('.zone-input');
            const from = parseFloat(inputs[0]?.value);
            const to = parseFloat(inputs[1]?.value);
            if (color && !isNaN(from) && !isNaN(to)) {
                zones.push({ from, to, color });
            }
        });

        const style = form.querySelector('[name="style"]')?.value || 'default';
        const result = {
            sensor: form.querySelector('[name="sensor"]')?.value || '',
            label: form.querySelector('[name="label"]')?.value || '',
            style,
            min: parseFloat(form.querySelector('[name="min"]')?.value) || 0,
            max: parseFloat(form.querySelector('[name="max"]')?.value) || 100,
            unit: form.querySelector('[name="unit"]')?.value || '',
            decimals: parseInt(form.querySelector('[name="decimals"]')?.value) || 1,
            fillSector: form.querySelector('[name="fillSector"]')?.checked || false,
            zones
        };

        // Dual scale fields (target sensor uses same min/max as main)
        if (style === 'dual') {
            result.sensor2 = form.querySelector('[name="sensor2"]')?.value || '';
        }

        return result;
    }
}

// ============================================================================
// Level Widget (CSS + SVG)
// ============================================================================

class LevelWidget extends DashboardWidget {
    static type = 'level';
    static displayName = 'Level';
    static description = 'Tank level indicator';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><rect x="8" y="10" width="8" height="10" fill="currentColor" opacity="0.3"/></svg>';
    static defaultSize = { width: 8, height: 8 };

    render() {
        const { orientation = 'vertical', unit = '%' } = this.config;
        const isVertical = orientation === 'vertical';

        this.element = document.createElement('div');
        this.element.className = 'widget-content';
        this.element.innerHTML = `
            <div class="level-container">
                <div class="level-bar-${isVertical ? 'vertical' : 'horizontal'}">
                    <div class="level-fill-${isVertical ? 'vertical' : 'horizontal'}" id="level-fill-${this.id}"></div>
                    <span class="level-text" id="level-text-${this.id}">--%</span>
                </div>
            </div>
        `;
        this.container.appendChild(this.element);

        this.fillEl = this.element.querySelector(`#level-fill-${this.id}`);
        this.textEl = this.element.querySelector(`#level-text-${this.id}`);
    }

    getColorForValue(value) {
        const { zones = [] } = this.config;

        if (zones.length === 0) {
            return 'var(--accent-blue)';
        }

        for (const zone of zones) {
            if (value >= zone.from && value <= zone.to) {
                return zone.color;
            }
        }

        return 'var(--accent-blue)';
    }

    update(value, error = null) {
        super.update(value, error);

        if (!this.fillEl || !this.textEl) return;

        if (error) {
            this.textEl.textContent = 'ERR';
            return;
        }

        const { min = 0, max = 100, orientation = 'vertical', unit = '%', decimals = 0 } = this.config;
        const numValue = parseFloat(value) || 0;
        const percent = Math.max(0, Math.min(100, ((numValue - min) / (max - min)) * 100));

        const isVertical = orientation === 'vertical';
        if (isVertical) {
            this.fillEl.style.height = `${percent}%`;
        } else {
            this.fillEl.style.width = `${percent}%`;
        }

        this.fillEl.style.backgroundColor = this.getColorForValue(numValue);
        this.textEl.textContent = `${numValue.toFixed(decimals)}${unit}`;
    }

    static getConfigForm(config = {}) {
        const zones = config.zones || [];
        return `
            <div class="widget-config-field">
                <label>Sensor</label>
                <input type="text" class="widget-input" name="sensor"
                       value="${escapeAttr(config.sensor || '')}" placeholder="Type to search..." autocomplete="off">
            </div>
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Min</label>
                    <input type="number" class="widget-input" name="min"
                           value="${config.min ?? 0}">
                </div>
                <div class="widget-config-field">
                    <label>Max</label>
                    <input type="number" class="widget-input" name="max"
                           value="${config.max ?? 100}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Orientation</label>
                    <select class="widget-select" name="orientation">
                        <option value="vertical" ${config.orientation !== 'horizontal' ? 'selected' : ''}>Vertical</option>
                        <option value="horizontal" ${config.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '%')}" placeholder="%">
                </div>
            </div>
            <div class="widget-config-field">
                <div class="zones-editor">
                    <div class="zones-header">
                        <label>Color Zones</label>
                        <button type="button" class="zones-add-btn" onclick="addZoneField(this)">+ Add Zone</button>
                    </div>
                    <div class="zones-list" id="zones-list">
                        ${zones.map((z, i) => `
                            <div class="zone-item">
                                <input type="color" class="zone-color" name="zone-color-${i}" value="${z.color || '#3b82f6'}">
                                <div class="zone-inputs">
                                    <input type="number" class="zone-input" name="zone-from-${i}" value="${z.from ?? 0}" placeholder="From">
                                    <span class="zone-separator">→</span>
                                    <input type="number" class="zone-input" name="zone-to-${i}" value="${z.to ?? 100}" placeholder="To">
                                </div>
                                <button type="button" class="zone-remove-btn" onclick="removeZoneField(this)">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        const zones = [];
        const zoneItems = form.querySelectorAll('.zone-item');
        zoneItems.forEach((item) => {
            // Find elements by class/type inside item (index-independent)
            const color = item.querySelector('.zone-color')?.value;
            const inputs = item.querySelectorAll('.zone-input');
            const from = parseFloat(inputs[0]?.value);
            const to = parseFloat(inputs[1]?.value);
            if (color && !isNaN(from) && !isNaN(to)) {
                zones.push({ from, to, color });
            }
        });

        return {
            sensor: form.querySelector('[name="sensor"]')?.value || '',
            label: form.querySelector('[name="label"]')?.value || '',
            min: parseFloat(form.querySelector('[name="min"]')?.value) || 0,
            max: parseFloat(form.querySelector('[name="max"]')?.value) || 100,
            orientation: form.querySelector('[name="orientation"]')?.value || 'vertical',
            unit: form.querySelector('[name="unit"]')?.value || '%',
            zones
        };
    }
}

// ============================================================================
// LED Widget (CSS)
// ============================================================================

class LedWidget extends DashboardWidget {
    static type = 'led';
    static displayName = 'LED';
    static description = 'On/Off indicator';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
    static defaultSize = { width: 4, height: 4 };

    render() {
        this.element = document.createElement('div');
        this.element.className = 'widget-content';
        this.element.innerHTML = `
            <div class="led-indicator" id="led-${this.id}"></div>
        `;
        this.container.appendChild(this.element);

        this.ledEl = this.element.querySelector(`#led-${this.id}`);
        this.updateLed(false, false);
    }

    updateLed(isOn, isError) {
        if (!this.ledEl) return;

        const { onColor = '#22c55e', offColor = '#6b7280', errorColor = '#ef4444', blinkOnError = true } = this.config;

        this.ledEl.classList.remove('led-on', 'led-blink');

        if (isError) {
            this.ledEl.style.backgroundColor = errorColor;
            this.ledEl.classList.add('led-on');
            if (blinkOnError) {
                this.ledEl.classList.add('led-blink');
            }
        } else if (isOn) {
            this.ledEl.style.backgroundColor = onColor;
            this.ledEl.style.color = onColor;
            this.ledEl.classList.add('led-on');
        } else {
            this.ledEl.style.backgroundColor = offColor;
            this.ledEl.style.color = offColor;
        }
    }

    update(value, error = null) {
        super.update(value, error);

        const { threshold = 0 } = this.config;
        const numValue = parseFloat(value) || 0;
        const isOn = numValue > threshold;

        this.updateLed(isOn, !!error);
    }

    static getConfigForm(config = {}) {
        return `
            <div class="widget-config-field">
                <label>Sensor</label>
                <input type="text" class="widget-input" name="sensor"
                       value="${escapeAttr(config.sensor || '')}" placeholder="Type to search..." autocomplete="off">
            </div>
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label>Threshold (value > threshold = ON)</label>
                <input type="number" class="widget-input" name="threshold"
                       value="${config.threshold ?? 0}">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>ON Color</label>
                    <input type="color" class="widget-input" name="onColor"
                           value="${config.onColor || '#22c55e'}" style="height: 38px; padding: 4px;">
                </div>
                <div class="widget-config-field">
                    <label>OFF Color</label>
                    <input type="color" class="widget-input" name="offColor"
                           value="${config.offColor || '#6b7280'}" style="height: 38px; padding: 4px;">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Error Color</label>
                    <input type="color" class="widget-input" name="errorColor"
                           value="${config.errorColor || '#ef4444'}" style="height: 38px; padding: 4px;">
                </div>
                <div class="widget-config-field">
                    <label style="display: flex; align-items: center; gap: 8px; margin-top: 24px;">
                        <input type="checkbox" name="blinkOnError" ${config.blinkOnError !== false ? 'checked' : ''}>
                        Blink on error
                    </label>
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        return {
            sensor: form.querySelector('[name="sensor"]')?.value || '',
            label: form.querySelector('[name="label"]')?.value || '',
            threshold: parseFloat(form.querySelector('[name="threshold"]')?.value) || 0,
            onColor: form.querySelector('[name="onColor"]')?.value || '#22c55e',
            offColor: form.querySelector('[name="offColor"]')?.value || '#6b7280',
            errorColor: form.querySelector('[name="errorColor"]')?.value || '#ef4444',
            blinkOnError: form.querySelector('[name="blinkOnError"]')?.checked !== false
        };
    }
}

// ============================================================================
// Label Widget (static text)
// ============================================================================

class LabelWidget {
    static type = 'label';
    static displayName = 'Label';
    static description = 'Static text label or header';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><text x="12" y="16" text-anchor="middle" font-size="14" fill="currentColor">Aa</text></svg>';
    static defaultSize = { width: 8, height: 2 };

    constructor(id, config, container) {
        this.id = id;
        this.config = config || {};
        this.container = container;
    }

    render() {
        const {
            text = 'Label',
            fontSize = 'medium',
            color = '#d8dce2',
            align = 'center',
            border = false,
            borderColor = '#4b5563',
            borderWidth = 1,
            borderRadius = 4,
            backgroundColor = 'transparent'
        } = this.config;

        // Font size map
        const fontSizeMap = {
            'small': '14px',
            'medium': '18px',
            'large': '24px',
            'xlarge': '32px'
        };

        // Border styles
        const borderStyle = border
            ? `border: ${borderWidth}px solid ${borderColor}; border-radius: ${borderRadius}px; background: ${backgroundColor};`
            : '';

        this.element = document.createElement('div');
        this.element.className = 'widget-content label-widget';
        this.element.innerHTML = `
            <div class="label-text" id="label-${this.id}"
                 style="font-size: ${fontSizeMap[fontSize] || fontSize};
                        color: ${color};
                        text-align: ${align};
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        justify-content: ${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};
                        height: 100%;
                        padding: ${border ? '4px 12px' : '0 8px'};
                        ${borderStyle}">
                ${escapeHtml(text)}
            </div>
        `;
        this.container.appendChild(this.element);
        this.labelEl = this.element.querySelector(`#label-${this.id}`);
    }

    // Label doesn't need sensor updates, but we need the method for compatibility
    update(value, error = null) {
        // No-op - label is static
    }

    // Update text dynamically if needed
    setText(text) {
        if (this.labelEl) {
            this.labelEl.textContent = text;
        }
    }

    static getConfigForm(config = {}) {
        return `
            <div class="widget-config-field">
                <label>Text</label>
                <input type="text" class="widget-input" name="text"
                       value="${escapeAttr(config.text || '')}" placeholder="Label text">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Font Size</label>
                    <select class="widget-select" name="fontSize">
                        <option value="small" ${config.fontSize === 'small' ? 'selected' : ''}>Small (14px)</option>
                        <option value="medium" ${config.fontSize === 'medium' || !config.fontSize ? 'selected' : ''}>Medium (18px)</option>
                        <option value="large" ${config.fontSize === 'large' ? 'selected' : ''}>Large (24px)</option>
                        <option value="xlarge" ${config.fontSize === 'xlarge' ? 'selected' : ''}>X-Large (32px)</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Alignment</label>
                    <select class="widget-select" name="align">
                        <option value="left" ${config.align === 'left' ? 'selected' : ''}>Left</option>
                        <option value="center" ${config.align === 'center' || !config.align ? 'selected' : ''}>Center</option>
                        <option value="right" ${config.align === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Text Color</label>
                    <input type="color" class="widget-input" name="color"
                           value="${config.color || '#d8dce2'}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="border" ${config.border ? 'checked' : ''}>
                        <span>Show border (nameplate)</span>
                    </label>
                </div>
            </div>
            <div class="widget-config-row label-border-options" style="${config.border ? '' : 'display: none;'}">
                <div class="widget-config-field">
                    <label>Border Color</label>
                    <input type="color" class="widget-input" name="borderColor"
                           value="${config.borderColor || '#4b5563'}">
                </div>
                <div class="widget-config-field">
                    <label>Border Width</label>
                    <input type="number" class="widget-input" name="borderWidth"
                           value="${config.borderWidth || 1}" min="1" max="5">
                </div>
                <div class="widget-config-field">
                    <label>Border Radius</label>
                    <input type="number" class="widget-input" name="borderRadius"
                           value="${config.borderRadius || 4}" min="0" max="20">
                </div>
                <div class="widget-config-field">
                    <label>Background</label>
                    <input type="color" class="widget-input" name="backgroundColor"
                           value="${config.backgroundColor || '#1f2937'}">
                </div>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        const borderCheckbox = form.querySelector('[name="border"]');
        const borderOptions = form.querySelector('.label-border-options');

        borderCheckbox?.addEventListener('change', () => {
            if (borderOptions) {
                borderOptions.style.display = borderCheckbox.checked ? '' : 'none';
            }
        });
    }

    static parseConfigForm(form) {
        return {
            text: form.querySelector('[name="text"]')?.value || 'Label',
            fontSize: form.querySelector('[name="fontSize"]')?.value || 'medium',
            align: form.querySelector('[name="align"]')?.value || 'center',
            color: form.querySelector('[name="color"]')?.value || '#d8dce2',
            border: form.querySelector('[name="border"]')?.checked || false,
            borderColor: form.querySelector('[name="borderColor"]')?.value || '#4b5563',
            borderWidth: parseInt(form.querySelector('[name="borderWidth"]')?.value) || 1,
            borderRadius: parseInt(form.querySelector('[name="borderRadius"]')?.value) || 4,
            backgroundColor: form.querySelector('[name="backgroundColor"]')?.value || '#1f2937'
        };
    }
}

// ============================================================================
// Divider Widget (visual separator)
// ============================================================================

class DividerWidget {
    static type = 'divider';
    static displayName = 'Divider';
    static description = 'Horizontal or vertical separator line';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/></svg>';
    static defaultSize = { width: 12, height: 1 };

    constructor(id, config, container) {
        this.id = id;
        this.config = config || {};
        this.container = container;
    }

    render() {
        const {
            orientation = 'horizontal',
            color = '#4b5563',
            thickness = 1,
            style = 'solid',
            margin = 8
        } = this.config;

        const isHorizontal = orientation === 'horizontal';

        this.element = document.createElement('div');
        this.element.className = 'widget-content divider-widget';
        this.element.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: ${isHorizontal ? `${margin}px 0` : `0 ${margin}px`};
        `;

        const line = document.createElement('div');
        line.className = 'divider-line';
        line.style.cssText = isHorizontal
            ? `width: 100%; height: ${thickness}px; border-top: ${thickness}px ${style} ${color};`
            : `height: 100%; width: ${thickness}px; border-left: ${thickness}px ${style} ${color};`;

        this.element.appendChild(line);
        this.container.appendChild(this.element);
    }

    // Divider doesn't need updates
    update(value, error = null) {}

    static getConfigForm(config = {}) {
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Orientation</label>
                    <select class="widget-select" name="orientation">
                        <option value="horizontal" ${config.orientation !== 'vertical' ? 'selected' : ''}>Horizontal</option>
                        <option value="vertical" ${config.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Style</label>
                    <select class="widget-select" name="style">
                        <option value="solid" ${config.style !== 'dashed' && config.style !== 'dotted' ? 'selected' : ''}>Solid</option>
                        <option value="dashed" ${config.style === 'dashed' ? 'selected' : ''}>Dashed</option>
                        <option value="dotted" ${config.style === 'dotted' ? 'selected' : ''}>Dotted</option>
                    </select>
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Thickness (px)</label>
                    <input type="number" class="widget-input" name="thickness"
                           value="${config.thickness || 1}" min="1" max="10">
                </div>
                <div class="widget-config-field">
                    <label>Margin (px)</label>
                    <input type="number" class="widget-input" name="margin"
                           value="${config.margin || 8}" min="0" max="50">
                </div>
                <div class="widget-config-field">
                    <label>Color</label>
                    <input type="color" class="widget-input" name="color"
                           value="${config.color || '#4b5563'}">
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        return {
            orientation: form.querySelector('[name="orientation"]')?.value || 'horizontal',
            style: form.querySelector('[name="style"]')?.value || 'solid',
            thickness: parseInt(form.querySelector('[name="thickness"]')?.value) || 1,
            margin: parseInt(form.querySelector('[name="margin"]')?.value) || 8,
            color: form.querySelector('[name="color"]')?.value || '#4b5563'
        };
    }
}

// ============================================================================
// StatusBar Widget (multiple status indicators)
// ============================================================================

class StatusBarWidget {
    static type = 'statusbar';
    static displayName = 'Status Bar';
    static description = 'Multiple status indicators in a row';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="3" fill="#22c55e"/><circle cx="12" cy="12" r="3" fill="#ef4444"/><circle cx="19" cy="12" r="3" fill="#6b7280"/></svg>';
    static defaultSize = { width: 12, height: 3 };

    constructor(id, config, container) {
        this.id = id;
        this.config = config || {};
        this.container = container;
        this.indicators = new Map();
    }

    render() {
        const { items = [], layout = 'horizontal' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content statusbar-widget';
        this.element.style.cssText = `
            display: flex;
            flex-direction: ${layout === 'vertical' ? 'column' : 'row'};
            align-items: center;
            justify-content: space-around;
            gap: 12px;
            padding: 8px 16px;
            height: 100%;
        `;

        items.forEach((item, idx) => {
            const indicator = this.createIndicator(item, idx);
            this.element.appendChild(indicator);
        });

        this.container.appendChild(this.element);
    }

    createIndicator(item, idx) {
        const { label = `Status ${idx + 1}`, onColor = '#22c55e', offColor = '#6b7280' } = item;

        const el = document.createElement('div');
        el.className = 'statusbar-indicator';
        el.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        `;

        const led = document.createElement('div');
        led.className = 'statusbar-led';
        led.style.cssText = `
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: ${offColor};
            box-shadow: 0 0 4px ${offColor};
            transition: all 0.3s ease;
        `;

        const labelEl = document.createElement('div');
        labelEl.className = 'statusbar-label';
        labelEl.style.cssText = `
            font-size: 11px;
            color: #9ca3af;
            text-align: center;
            white-space: nowrap;
        `;
        labelEl.textContent = label;

        el.appendChild(led);
        el.appendChild(labelEl);

        this.indicators.set(idx, { element: el, led, item });

        return el;
    }

    // Update specific indicator by index
    updateIndicator(idx, value, error = null) {
        const indicator = this.indicators.get(idx);
        if (!indicator) return;

        const { item, led } = indicator;
        const { threshold = 0.5, onColor = '#22c55e', offColor = '#6b7280', errorColor = '#ef4444' } = item;

        if (error) {
            led.style.background = errorColor;
            led.style.boxShadow = `0 0 8px ${errorColor}`;
        } else {
            const isOn = value > threshold;
            const color = isOn ? onColor : offColor;
            led.style.background = color;
            led.style.boxShadow = isOn ? `0 0 8px ${color}` : `0 0 4px ${color}`;
        }
    }

    // Main update - expects object with sensor values by name
    update(values, error = null) {
        if (typeof values === 'object' && values !== null) {
            const { items = [] } = this.config;
            items.forEach((item, idx) => {
                if (item.sensor && values[item.sensor] !== undefined) {
                    this.updateIndicator(idx, values[item.sensor], error);
                }
            });
        }
    }

    // Update by sensor name (called from SSE handler)
    updateBySensor(sensorName, value, error = null) {
        const { items = [] } = this.config;
        items.forEach((item, idx) => {
            if (item.sensor === sensorName) {
                this.updateIndicator(idx, value, error);
            }
        });
    }

    static getConfigForm(config = {}) {
        const items = config.items || [{ label: 'Status 1', sensor: '', threshold: 0.5, onColor: '#22c55e', offColor: '#6b7280' }];

        const itemsHtml = items.map((item, idx) => `
            <div class="statusbar-item-config" data-idx="${idx}">
                <div class="widget-config-row">
                    <div class="widget-config-field" style="flex: 1;">
                        <label>Label</label>
                        <input type="text" class="widget-input" name="item-label-${idx}"
                               value="${escapeAttr(item.label || '')}" placeholder="Status name">
                    </div>
                    <div class="widget-config-field" style="flex: 2;">
                        <label>Sensor</label>
                        <input type="text" class="widget-input sensor-autocomplete" name="item-sensor-${idx}"
                               value="${escapeAttr(item.sensor || '')}" placeholder="Sensor name">
                    </div>
                </div>
                <div class="widget-config-row">
                    <div class="widget-config-field">
                        <label>Threshold</label>
                        <input type="number" class="widget-input" name="item-threshold-${idx}"
                               value="${item.threshold ?? 0.5}" step="0.1">
                    </div>
                    <div class="widget-config-field">
                        <label>On Color</label>
                        <input type="color" class="widget-input" name="item-onColor-${idx}"
                               value="${item.onColor || '#22c55e'}">
                    </div>
                    <div class="widget-config-field">
                        <label>Off Color</label>
                        <input type="color" class="widget-input" name="item-offColor-${idx}"
                               value="${item.offColor || '#6b7280'}">
                    </div>
                    <button type="button" class="widget-btn-small remove-statusbar-item" data-idx="${idx}" style="align-self: flex-end;">×</button>
                </div>
            </div>
        `).join('');

        return `
            <div class="widget-config-field">
                <label>Layout</label>
                <select class="widget-select" name="layout">
                    <option value="horizontal" ${config.layout !== 'vertical' ? 'selected' : ''}>Horizontal</option>
                    <option value="vertical" ${config.layout === 'vertical' ? 'selected' : ''}>Vertical</option>
                </select>
            </div>
            <div class="widget-config-field">
                <label>Indicators</label>
                <div id="statusbar-items-container">
                    ${itemsHtml}
                </div>
                <button type="button" class="widget-btn" id="add-statusbar-item" style="margin-top: 8px;">
                    + Add Indicator
                </button>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        const container = form.querySelector('#statusbar-items-container');
        const addBtn = form.querySelector('#add-statusbar-item');
        let itemCount = (config.items || []).length || 1;

        // Add new indicator
        addBtn?.addEventListener('click', () => {
            const idx = itemCount++;
            const itemHtml = `
                <div class="statusbar-item-config" data-idx="${idx}">
                    <div class="widget-config-row">
                        <div class="widget-config-field" style="flex: 1;">
                            <label>Label</label>
                            <input type="text" class="widget-input" name="item-label-${idx}"
                                   value="" placeholder="Status name">
                        </div>
                        <div class="widget-config-field" style="flex: 2;">
                            <label>Sensor</label>
                            <input type="text" class="widget-input sensor-autocomplete" name="item-sensor-${idx}"
                                   value="" placeholder="Sensor name">
                        </div>
                    </div>
                    <div class="widget-config-row">
                        <div class="widget-config-field">
                            <label>Threshold</label>
                            <input type="number" class="widget-input" name="item-threshold-${idx}"
                                   value="0.5" step="0.1">
                        </div>
                        <div class="widget-config-field">
                            <label>On Color</label>
                            <input type="color" class="widget-input" name="item-onColor-${idx}"
                                   value="#22c55e">
                        </div>
                        <div class="widget-config-field">
                            <label>Off Color</label>
                            <input type="color" class="widget-input" name="item-offColor-${idx}"
                                   value="#6b7280">
                        </div>
                        <button type="button" class="widget-btn-small remove-statusbar-item" data-idx="${idx}" style="align-self: flex-end;">×</button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', itemHtml);

            // Setup autocomplete for new sensor input
            const newInput = container.querySelector(`[name="item-sensor-${idx}"]`);
            if (newInput && typeof setupSensorAutocomplete === 'function') {
                setupSensorAutocomplete(newInput);
            }
        });

        // Remove indicator
        container?.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-statusbar-item')) {
                const item = e.target.closest('.statusbar-item-config');
                if (item && container.querySelectorAll('.statusbar-item-config').length > 1) {
                    item.remove();
                }
            }
        });

        // Setup autocomplete for existing sensor inputs
        form.querySelectorAll('.sensor-autocomplete').forEach(input => {
            if (typeof setupSensorAutocomplete === 'function') {
                setupSensorAutocomplete(input);
            }
        });
    }

    static parseConfigForm(form) {
        const items = [];
        const itemElements = form.querySelectorAll('.statusbar-item-config');

        itemElements.forEach(el => {
            const idx = el.dataset.idx;
            items.push({
                label: form.querySelector(`[name="item-label-${idx}"]`)?.value || '',
                sensor: form.querySelector(`[name="item-sensor-${idx}"]`)?.value || '',
                threshold: parseFloat(form.querySelector(`[name="item-threshold-${idx}"]`)?.value) || 0.5,
                onColor: form.querySelector(`[name="item-onColor-${idx}"]`)?.value || '#22c55e',
                offColor: form.querySelector(`[name="item-offColor-${idx}"]`)?.value || '#6b7280'
            });
        });

        return {
            layout: form.querySelector('[name="layout"]')?.value || 'horizontal',
            items
        };
    }

    // Get list of sensors this widget uses (for SSE subscription)
    getSensors() {
        const { items = [] } = this.config;
        return items.map(item => item.sensor).filter(s => s);
    }
}

// ============================================================================
// BarGraph Widget (compare multiple values)
// ============================================================================

class BarGraphWidget {
    static type = 'bargraph';
    static displayName = 'Bar Graph';
    static description = 'Compare multiple sensor values';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="14" width="4" height="6" fill="currentColor" opacity="0.7"/><rect x="10" y="8" width="4" height="12" fill="currentColor" opacity="0.5"/><rect x="16" y="4" width="4" height="16" fill="currentColor" opacity="0.3"/></svg>';
    static defaultSize = { width: 10, height: 6 };

    constructor(id, config, container) {
        this.id = id;
        this.config = config || {};
        this.container = container;
        this.bars = new Map();
    }

    render() {
        const { orientation = 'vertical', showValues = true, showLabels = true } = this.config;
        const items = this.config.items || [];

        this.element = document.createElement('div');
        this.element.className = 'widget-content bargraph-widget';
        this.element.style.cssText = `
            display: flex;
            flex-direction: ${orientation === 'horizontal' ? 'column' : 'row'};
            align-items: stretch;
            justify-content: space-around;
            gap: 8px;
            padding: 12px;
            height: 100%;
        `;

        items.forEach((item, idx) => {
            const bar = this.createBar(item, idx, orientation, showValues, showLabels);
            this.element.appendChild(bar);
        });

        this.container.appendChild(this.element);
    }

    createBar(item, idx, orientation, showValues, showLabels) {
        const { label = `Bar ${idx + 1}`, color = '#3b82f6', min = 0, max = 100 } = item;
        const isVertical = orientation === 'vertical';

        const barContainer = document.createElement('div');
        barContainer.className = 'bargraph-bar-container';
        barContainer.style.cssText = `
            display: flex;
            flex-direction: ${isVertical ? 'column' : 'row'};
            align-items: center;
            flex: 1;
            gap: 4px;
        `;

        // Label at top/left
        if (showLabels) {
            const labelEl = document.createElement('div');
            labelEl.className = 'bargraph-label';
            labelEl.style.cssText = `
                font-size: 11px;
                color: #9ca3af;
                text-align: center;
                white-space: nowrap;
                ${isVertical ? '' : 'min-width: 50px;'}
            `;
            labelEl.textContent = label;
            barContainer.appendChild(labelEl);
        }

        // Bar track
        const track = document.createElement('div');
        track.className = 'bargraph-track';
        track.style.cssText = `
            ${isVertical ? 'width: 100%; height: 100%;' : 'flex: 1; height: 24px;'}
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            position: relative;
            overflow: hidden;
            ${isVertical ? 'display: flex; flex-direction: column-reverse;' : ''}
        `;

        // Bar fill
        const fill = document.createElement('div');
        fill.className = 'bargraph-fill';
        fill.style.cssText = `
            background: ${color};
            border-radius: 4px;
            transition: all 0.3s ease;
            ${isVertical ? 'width: 100%; height: 0%;' : 'height: 100%; width: 0%;'}
        `;
        track.appendChild(fill);

        barContainer.appendChild(track);

        // Value at bottom/right
        if (showValues) {
            const valueEl = document.createElement('div');
            valueEl.className = 'bargraph-value';
            valueEl.style.cssText = `
                font-size: 12px;
                font-weight: 500;
                color: #d8dce2;
                text-align: center;
                min-width: 40px;
            `;
            valueEl.textContent = '—';
            barContainer.appendChild(valueEl);
        }

        this.bars.set(idx, { container: barContainer, fill, valueEl: barContainer.querySelector('.bargraph-value'), item });

        return barContainer;
    }

    // Update specific bar by index
    updateBar(idx, value) {
        const bar = this.bars.get(idx);
        if (!bar) return;

        const { item, fill, valueEl } = bar;
        const { min = 0, max = 100, unit = '', decimals = 0 } = item;
        const orientation = this.config.orientation || 'vertical';
        const isVertical = orientation === 'vertical';

        // Calculate percentage
        const range = max - min;
        const percent = range > 0 ? Math.max(0, Math.min(100, ((value - min) / range) * 100)) : 0;

        // Update fill
        if (isVertical) {
            fill.style.height = `${percent}%`;
        } else {
            fill.style.width = `${percent}%`;
        }

        // Update value text
        if (valueEl) {
            const displayValue = typeof decimals === 'number' ? value.toFixed(decimals) : value;
            valueEl.textContent = unit ? `${displayValue} ${unit}` : displayValue;
        }
    }

    // Main update - expects object with sensor values by name
    update(values, error = null) {
        if (typeof values === 'object' && values !== null) {
            const { items = [] } = this.config;
            items.forEach((item, idx) => {
                if (item.sensor && values[item.sensor] !== undefined) {
                    this.updateBar(idx, values[item.sensor]);
                }
            });
        }
    }

    // Update by sensor name (called from SSE handler)
    updateBySensor(sensorName, value, error = null) {
        const { items = [] } = this.config;
        items.forEach((item, idx) => {
            if (item.sensor === sensorName) {
                this.updateBar(idx, value);
            }
        });
    }

    static getConfigForm(config = {}) {
        const items = config.items || [{ label: 'Bar 1', sensor: '', min: 0, max: 100, color: '#3b82f6' }];

        const itemsHtml = items.map((item, idx) => `
            <div class="bargraph-item-config" data-idx="${idx}">
                <div class="widget-config-row">
                    <div class="widget-config-field" style="flex: 1;">
                        <label>Label</label>
                        <input type="text" class="widget-input" name="bar-label-${idx}"
                               value="${escapeAttr(item.label || '')}" placeholder="Bar name">
                    </div>
                    <div class="widget-config-field" style="flex: 2;">
                        <label>Sensor</label>
                        <input type="text" class="widget-input sensor-autocomplete" name="bar-sensor-${idx}"
                               value="${escapeAttr(item.sensor || '')}" placeholder="Sensor name">
                    </div>
                </div>
                <div class="widget-config-row">
                    <div class="widget-config-field">
                        <label>Min</label>
                        <input type="number" class="widget-input" name="bar-min-${idx}"
                               value="${item.min ?? 0}">
                    </div>
                    <div class="widget-config-field">
                        <label>Max</label>
                        <input type="number" class="widget-input" name="bar-max-${idx}"
                               value="${item.max ?? 100}">
                    </div>
                    <div class="widget-config-field">
                        <label>Unit</label>
                        <input type="text" class="widget-input" name="bar-unit-${idx}"
                               value="${escapeAttr(item.unit || '')}" placeholder="kW">
                    </div>
                    <div class="widget-config-field">
                        <label>Color</label>
                        <input type="color" class="widget-input" name="bar-color-${idx}"
                               value="${item.color || '#3b82f6'}">
                    </div>
                    <button type="button" class="widget-btn-small remove-bargraph-item" data-idx="${idx}" style="align-self: flex-end;">×</button>
                </div>
            </div>
        `).join('');

        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Orientation</label>
                    <select class="widget-select" name="orientation">
                        <option value="vertical" ${config.orientation !== 'horizontal' ? 'selected' : ''}>Vertical</option>
                        <option value="horizontal" ${config.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="showValues" ${config.showValues !== false ? 'checked' : ''}>
                        <span>Show values</span>
                    </label>
                </div>
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="showLabels" ${config.showLabels !== false ? 'checked' : ''}>
                        <span>Show labels</span>
                    </label>
                </div>
            </div>
            <div class="widget-config-field">
                <label>Bars</label>
                <div id="bargraph-items-container">
                    ${itemsHtml}
                </div>
                <button type="button" class="widget-btn" id="add-bargraph-item" style="margin-top: 8px;">
                    + Add Bar
                </button>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        const container = form.querySelector('#bargraph-items-container');
        const addBtn = form.querySelector('#add-bargraph-item');
        let itemCount = (config.items || []).length || 1;

        // Add new bar
        addBtn?.addEventListener('click', () => {
            const idx = itemCount++;
            const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
            const color = colors[idx % colors.length];

            const itemHtml = `
                <div class="bargraph-item-config" data-idx="${idx}">
                    <div class="widget-config-row">
                        <div class="widget-config-field" style="flex: 1;">
                            <label>Label</label>
                            <input type="text" class="widget-input" name="bar-label-${idx}"
                                   value="" placeholder="Bar name">
                        </div>
                        <div class="widget-config-field" style="flex: 2;">
                            <label>Sensor</label>
                            <input type="text" class="widget-input sensor-autocomplete" name="bar-sensor-${idx}"
                                   value="" placeholder="Sensor name">
                        </div>
                    </div>
                    <div class="widget-config-row">
                        <div class="widget-config-field">
                            <label>Min</label>
                            <input type="number" class="widget-input" name="bar-min-${idx}" value="0">
                        </div>
                        <div class="widget-config-field">
                            <label>Max</label>
                            <input type="number" class="widget-input" name="bar-max-${idx}" value="100">
                        </div>
                        <div class="widget-config-field">
                            <label>Unit</label>
                            <input type="text" class="widget-input" name="bar-unit-${idx}" placeholder="kW">
                        </div>
                        <div class="widget-config-field">
                            <label>Color</label>
                            <input type="color" class="widget-input" name="bar-color-${idx}" value="${color}">
                        </div>
                        <button type="button" class="widget-btn-small remove-bargraph-item" data-idx="${idx}" style="align-self: flex-end;">×</button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', itemHtml);

            // Setup autocomplete for new sensor input
            const newInput = container.querySelector(`[name="bar-sensor-${idx}"]`);
            if (newInput && typeof setupSensorAutocomplete === 'function') {
                setupSensorAutocomplete(newInput);
            }
        });

        // Remove bar
        container?.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-bargraph-item')) {
                const item = e.target.closest('.bargraph-item-config');
                if (item && container.querySelectorAll('.bargraph-item-config').length > 1) {
                    item.remove();
                }
            }
        });

        // Setup autocomplete for existing sensor inputs
        form.querySelectorAll('.sensor-autocomplete').forEach(input => {
            if (typeof setupSensorAutocomplete === 'function') {
                setupSensorAutocomplete(input);
            }
        });
    }

    static parseConfigForm(form) {
        const items = [];
        const itemElements = form.querySelectorAll('.bargraph-item-config');

        itemElements.forEach(el => {
            const idx = el.dataset.idx;
            items.push({
                label: form.querySelector(`[name="bar-label-${idx}"]`)?.value || '',
                sensor: form.querySelector(`[name="bar-sensor-${idx}"]`)?.value || '',
                min: parseFloat(form.querySelector(`[name="bar-min-${idx}"]`)?.value) || 0,
                max: parseFloat(form.querySelector(`[name="bar-max-${idx}"]`)?.value) || 100,
                unit: form.querySelector(`[name="bar-unit-${idx}"]`)?.value || '',
                color: form.querySelector(`[name="bar-color-${idx}"]`)?.value || '#3b82f6'
            });
        });

        return {
            orientation: form.querySelector('[name="orientation"]')?.value || 'vertical',
            showValues: form.querySelector('[name="showValues"]')?.checked !== false,
            showLabels: form.querySelector('[name="showLabels"]')?.checked !== false,
            items
        };
    }

    // Get list of sensors this widget uses (for SSE subscription)
    getSensors() {
        const { items = [] } = this.config;
        return items.map(item => item.sensor).filter(s => s);
    }
}

// ============================================================================
// Digital Widget (CSS)
// ============================================================================

class DigitalWidget extends DashboardWidget {
    static type = 'digital';
    static displayName = 'Digital';
    static description = 'Digital numeric display';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="8" fill="currentColor">123</text></svg>';
    static defaultSize = { width: 8, height: 4 };

    // 7-segment digit patterns: segments a,b,c,d,e,f,g (top, top-right, bottom-right, bottom, bottom-left, top-left, middle)
    static SEGMENT_PATTERNS = {
        '0': [1,1,1,1,1,1,0],
        '1': [0,1,1,0,0,0,0],
        '2': [1,1,0,1,1,0,1],
        '3': [1,1,1,1,0,0,1],
        '4': [0,1,1,0,0,1,1],
        '5': [1,0,1,1,0,1,1],
        '6': [1,0,1,1,1,1,1],
        '7': [1,1,1,0,0,0,0],
        '8': [1,1,1,1,1,1,1],
        '9': [1,1,1,1,0,1,1],
        '-': [0,0,0,0,0,0,1],
        ' ': [0,0,0,0,0,0,0],
        'E': [1,0,0,1,1,1,1],
        'R': [0,0,0,0,1,0,1],
        '.': 'dot',
        ':': 'colon'
    };

    render() {
        const { style = 'default' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content';

        switch (style) {
            case 'lcd':
                this.renderLCD();
                break;
            case 'led':
                this.renderLED();
                break;
            default:
                this.renderDefault();
        }

        this.container.appendChild(this.element);
    }

    renderDefault() {
        this.element.innerHTML = `
            <div class="digital-display" id="digital-${this.id}">----</div>
        `;
        this.displayEl = this.element.querySelector(`#digital-${this.id}`);
        const { color = '#22c55e' } = this.config;
        this.displayEl.style.color = color;
    }

    renderLCD() {
        const { digits = 6, decimals = 0, unit = '' } = this.config;
        const totalDigits = digits + (unit ? 2 : 0); // Extra space for unit

        this.element.innerHTML = `
            <div class="digital-lcd-display" id="digital-lcd-${this.id}">
                <div class="digital-lcd-screen">
                    <svg class="digital-lcd-svg" id="digital-svg-${this.id}" viewBox="0 0 ${totalDigits * 24 + 10} 48">
                        <defs>
                            <linearGradient id="lcd-bg-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" style="stop-color:#c8d4c0"/>
                                <stop offset="50%" style="stop-color:#b8c4b0"/>
                                <stop offset="100%" style="stop-color:#a8b4a0"/>
                            </linearGradient>
                        </defs>
                        <rect x="0" y="0" width="100%" height="100%" fill="url(#lcd-bg-${this.id})" rx="4"/>
                        <g id="digital-digits-${this.id}" transform="translate(5, 6)"></g>
                    </svg>
                </div>
            </div>
        `;
        this.svgEl = this.element.querySelector(`#digital-svg-${this.id}`);
        this.digitsGroup = this.element.querySelector(`#digital-digits-${this.id}`);
        this.updateSegmentDisplay('----');
    }

    renderLED() {
        const { digits = 6, decimals = 0, unit = '', color = '#ff0000' } = this.config;
        const totalDigits = digits + (unit ? 2 : 0);

        this.element.innerHTML = `
            <div class="digital-led-display" id="digital-led-${this.id}">
                <div class="digital-led-screen">
                    <svg class="digital-led-svg" id="digital-svg-${this.id}" viewBox="0 0 ${totalDigits * 24 + 10} 48">
                        <defs>
                            <filter id="led-glow-${this.id}" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="1.5" result="blur"/>
                                <feMerge>
                                    <feMergeNode in="blur"/>
                                    <feMergeNode in="blur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                            <linearGradient id="led-bg-${this.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" style="stop-color:#2a2a2a"/>
                                <stop offset="50%" style="stop-color:#1a1a1a"/>
                                <stop offset="100%" style="stop-color:#0a0a0a"/>
                            </linearGradient>
                        </defs>
                        <rect x="0" y="0" width="100%" height="100%" fill="url(#led-bg-${this.id})" rx="4"/>
                        <g id="digital-digits-${this.id}" transform="translate(5, 6)"></g>
                    </svg>
                </div>
            </div>
        `;
        this.svgEl = this.element.querySelector(`#digital-svg-${this.id}`);
        this.digitsGroup = this.element.querySelector(`#digital-digits-${this.id}`);
        this.updateSegmentDisplay('----');
    }

    // Render a single 7-segment digit at position x
    renderDigit(char, x, isLCD = true) {
        const pattern = DigitalWidget.SEGMENT_PATTERNS[char];
        if (!pattern) return '';

        const { color = '#22c55e' } = this.config;

        // Handle special characters
        if (pattern === 'dot') {
            const onColor = isLCD ? '#3a4a3a' : color;
            const glowFilter = isLCD ? '' : `filter="url(#led-glow-${this.id})"`;
            return `<circle cx="${x + 4}" cy="33" r="2.5" fill="${onColor}" ${glowFilter}/>`;
        }
        if (pattern === 'colon') {
            const onColor = isLCD ? '#3a4a3a' : color;
            const glowFilter = isLCD ? '' : `filter="url(#led-glow-${this.id})"`;
            return `
                <circle cx="${x + 4}" cy="14" r="2" fill="${onColor}" ${glowFilter}/>
                <circle cx="${x + 4}" cy="26" r="2" fill="${onColor}" ${glowFilter}/>
            `;
        }

        // Segment colors
        const onColor = isLCD ? '#3a4a3a' : color;
        const offColor = isLCD ? 'rgba(58, 74, 58, 0.15)' : 'rgba(255, 255, 255, 0.03)';
        const glowFilter = isLCD ? '' : `filter="url(#led-glow-${this.id})"`;

        // Segment paths (relative to digit position)
        // Each digit is 20px wide, 36px tall
        const w = 16, h = 32, t = 3; // width, height, thickness
        const segments = [
            // a - top horizontal
            `<polygon points="${x+2},0 ${x+w-2},0 ${x+w-4},${t} ${x+4},${t}" fill="${pattern[0] ? onColor : offColor}" ${pattern[0] ? glowFilter : ''}/>`,
            // b - top right vertical
            `<polygon points="${x+w},${2} ${x+w},${h/2-2} ${x+w-t},${h/2-4} ${x+w-t},${4}" fill="${pattern[1] ? onColor : offColor}" ${pattern[1] ? glowFilter : ''}/>`,
            // c - bottom right vertical
            `<polygon points="${x+w},${h/2+2} ${x+w},${h-2} ${x+w-t},${h-4} ${x+w-t},${h/2+4}" fill="${pattern[2] ? onColor : offColor}" ${pattern[2] ? glowFilter : ''}/>`,
            // d - bottom horizontal
            `<polygon points="${x+4},${h-t} ${x+w-4},${h-t} ${x+w-2},${h} ${x+2},${h}" fill="${pattern[3] ? onColor : offColor}" ${pattern[3] ? glowFilter : ''}/>`,
            // e - bottom left vertical
            `<polygon points="${x},${h/2+2} ${x+t},${h/2+4} ${x+t},${h-4} ${x},${h-2}" fill="${pattern[4] ? onColor : offColor}" ${pattern[4] ? glowFilter : ''}/>`,
            // f - top left vertical
            `<polygon points="${x},${2} ${x+t},${4} ${x+t},${h/2-4} ${x},${h/2-2}" fill="${pattern[5] ? onColor : offColor}" ${pattern[5] ? glowFilter : ''}/>`,
            // g - middle horizontal
            `<polygon points="${x+3},${h/2-t/2} ${x+w-3},${h/2-t/2} ${x+w-4},${h/2} ${x+w-3},${h/2+t/2} ${x+3},${h/2+t/2} ${x+4},${h/2}" fill="${pattern[6] ? onColor : offColor}" ${pattern[6] ? glowFilter : ''}/>`,
        ];

        return segments.join('');
    }

    updateSegmentDisplay(text) {
        if (!this.digitsGroup) return;

        const { style = 'default' } = this.config;
        const isLCD = style === 'lcd';

        let html = '';
        let x = 0;
        for (const char of text) {
            if (char === '.' || char === ':') {
                html += this.renderDigit(char, x, isLCD);
                x += 8; // Smaller width for dot/colon
            } else {
                html += this.renderDigit(char, x, isLCD);
                x += 22; // Full digit width + spacing
            }
        }

        this.digitsGroup.innerHTML = html;

        // Update SVG viewBox to fit content
        if (this.svgEl) {
            this.svgEl.setAttribute('viewBox', `0 0 ${x + 10} 48`);
        }
    }

    update(value, error = null) {
        super.update(value, error);

        const { style = 'default', decimals = 0, digits = 6, color = '#22c55e', unit = '' } = this.config;

        if (style === 'default') {
            if (!this.displayEl) return;

            if (error) {
                this.displayEl.textContent = 'ERR';
                this.displayEl.style.color = 'var(--accent-red)';
                return;
            }

            const numValue = parseFloat(value) || 0;
            let text = numValue.toFixed(decimals);

            // Pad with zeros if needed
            const parts = text.split('.');
            const intPart = parts[0].padStart(digits - (decimals > 0 ? decimals + 1 : 0), '0');
            text = decimals > 0 ? `${intPart}.${parts[1]}` : intPart;

            if (unit) {
                text += ` ${unit}`;
            }

            this.displayEl.textContent = text;
            this.displayEl.style.color = color;
        } else {
            // LCD or LED style
            if (!this.digitsGroup) return;

            if (error) {
                this.updateSegmentDisplay('ERR');
                return;
            }

            const numValue = parseFloat(value) || 0;
            let text = numValue.toFixed(decimals);

            // Pad with leading spaces/zeros
            const parts = text.split('.');
            const intPart = parts[0].padStart(digits - (decimals > 0 ? decimals + 1 : 0), ' ');
            text = decimals > 0 ? `${intPart}.${parts[1]}` : intPart;

            this.updateSegmentDisplay(text);
        }
    }

    static getConfigForm(config = {}) {
        return `
            <div class="widget-config-field">
                <label>Sensor</label>
                <input type="text" class="widget-input" name="sensor"
                       value="${escapeAttr(config.sensor || '')}" placeholder="Type to search..." autocomplete="off">
            </div>
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-select" name="style">
                    <option value="default" ${!config.style || config.style === 'default' ? 'selected' : ''}>Default (Orbitron font)</option>
                    <option value="lcd" ${config.style === 'lcd' ? 'selected' : ''}>LCD (7-segment, light)</option>
                    <option value="led" ${config.style === 'led' ? 'selected' : ''}>LED (7-segment, glow)</option>
                </select>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Digits</label>
                    <input type="number" class="widget-input" name="digits"
                           value="${config.digits ?? 6}" min="1" max="12">
                </div>
                <div class="widget-config-field">
                    <label>Decimals</label>
                    <input type="number" class="widget-input" name="decimals"
                           value="${config.decimals ?? 0}" min="0" max="4">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Color</label>
                    <input type="color" class="widget-input" name="color"
                           value="${config.color || '#22c55e'}" style="height: 38px; padding: 4px;">
                </div>
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="Optional">
                </div>
            </div>
        `;
    }

    static parseConfigForm(form) {
        return {
            sensor: form.querySelector('[name="sensor"]')?.value || '',
            label: form.querySelector('[name="label"]')?.value || '',
            style: form.querySelector('[name="style"]')?.value || 'default',
            digits: parseInt(form.querySelector('[name="digits"]')?.value) || 6,
            decimals: parseInt(form.querySelector('[name="decimals"]')?.value) || 0,
            color: form.querySelector('[name="color"]')?.value || '#22c55e',
            unit: form.querySelector('[name="unit"]')?.value || ''
        };
    }
}

// ============================================================================
// Chart Widget (Chart.js based)
// ============================================================================

class ChartWidget extends DashboardWidget {
    static type = 'chart';
    static displayName = 'Chart';
    static description = 'Real-time line chart with multiple sensors';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
    static defaultSize = { width: 24, height: 12 };

    // Default colors for sensors
    static COLORS = [
        '#3274d9', '#73bf69', '#f2cc0c', '#ff6b6b', '#a855f7',
        '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6'
    ];

    constructor(id, config, container) {
        super(id, config, container);
        this.charts = new Map();      // zoneId -> Chart.js instance
        this.sensorData = new Map();  // sensorName -> { value, timestamp }
        this.chartStartTime = Date.now();
        this.updateInterval = null;
        this.visibilityHandler = null;
    }

    render() {
        const { zones = [], showTable = true, tableHeight = 100 } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content chart-widget-content';

        // Zones container
        const zonesHtml = zones.map((zone, idx) => `
            <div class="chart-widget-zone" data-zone-id="${zone.id || `zone-${idx}`}">
                <canvas id="chart-canvas-${this.id}-${idx}"></canvas>
            </div>
        `).join('');

        // Table container (if enabled) - IONC table style
        const tableHtml = showTable ? `
            <div class="chart-widget-table-container" style="height: ${tableHeight}px;">
                <div class="chart-widget-table-resizer"></div>
                <div class="chart-widget-table-scroll">
                    <table class="chart-widget-table">
                        <thead>
                            <tr>
                                <th class="col-color"></th>
                                <th class="col-id">ID</th>
                                <th class="col-name">Name</th>
                                <th class="col-type">Type</th>
                                <th class="col-value">Value</th>
                                <th class="col-status">Status</th>
                                <th class="col-supplier">Supplier</th>
                            </tr>
                        </thead>
                        <tbody id="chart-table-${this.id}">
                        </tbody>
                    </table>
                </div>
            </div>
        ` : '';

        // Get saved zones height or use default
        const zonesHeight = this.config.zonesHeight || 150;

        this.element.innerHTML = `
            <div class="chart-widget-zones" style="height: ${zonesHeight}px;">
                ${zonesHtml}
                <div class="chart-widget-zones-resizer"></div>
            </div>
            ${tableHtml}
        `;

        this.container.appendChild(this.element);

        // Initialize charts
        this.initCharts();

        // Initialize zones resizer
        this.initZonesResizer();

        // Initialize table
        if (showTable) {
            this.initTable();
            this.initTableResizer();
        }

        // Load history for all sensors
        this.loadHistory();

        // Start periodic update interval (every 2 seconds, only when visible)
        this.updateInterval = setInterval(() => {
            if (!document.hidden && this.charts.size > 0) {
                this.syncTimeRange();
            }
        }, 2000);

        // Add visibility change handler
        this.visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                // Force refresh charts when page becomes visible
                this.syncTimeRange();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    initCharts() {
        const { zones = [], useTextname = false } = this.config;

        zones.forEach((zone, idx) => {
            const canvas = this.element.querySelector(`#chart-canvas-${this.id}-${idx}`);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const datasets = (zone.sensors || []).map((sensor, sensorIdx) => {
                let label = sensor.label || sensor.name;
                if (useTextname && !sensor.label) {
                    const sensorInfo = typeof getSensorInfo === 'function' ? getSensorInfo(sensor.name) : null;
                    if (sensorInfo?.textname) {
                        label = sensorInfo.textname;
                    }
                }
                return {
                    label,
                    data: [],
                    borderColor: sensor.color || ChartWidget.COLORS[sensorIdx % ChartWidget.COLORS.length],
                    backgroundColor: `${sensor.color || ChartWidget.COLORS[sensorIdx % ChartWidget.COLORS.length]}20`,
                    fill: sensor.fill !== false,
                    tension: sensor.stepped ? 0 : (sensor.smooth !== false ? 0.3 : 0),
                    stepped: sensor.stepped ? 'before' : false,
                    pointRadius: 0,
                    borderWidth: sensor.stepped ? 2 : 1.5
                };
            });

            const timeRange = this.getTimeRange();
            const chart = new Chart(ctx, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    normalized: true,
                    parsing: false,
                    spanGaps: true,
                    interaction: {
                        mode: 'nearest',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: true,
                            backgroundColor: '#22252a',
                            titleColor: '#d8dce2',
                            bodyColor: '#d8dce2',
                            borderColor: '#333840',
                            borderWidth: 1
                        },
                        decimation: {
                            enabled: true,
                            algorithm: 'min-max'
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            display: true,
                            min: timeRange.min,
                            max: timeRange.max,
                            grid: {
                                color: '#333840',
                                drawBorder: false
                            },
                            ticks: {
                                color: '#8a9099',
                                maxTicksLimit: 6,
                                autoSkip: true,
                                source: 'auto'
                            },
                            time: {
                                displayFormats: {
                                    second: 'HH:mm:ss',
                                    minute: 'HH:mm',
                                    hour: 'HH:mm'
                                }
                            }
                        },
                        y: {
                            display: true,
                            position: 'left',
                            grid: {
                                color: '#333840',
                                drawBorder: false
                            },
                            ticks: {
                                color: '#8a9099',
                                maxTicksLimit: 5
                            }
                        }
                    }
                }
            });

            this.charts.set(zone.id || `zone-${idx}`, {
                chart,
                sensors: zone.sensors || []
            });
        });
    }

    initTable() {
        const { zones = [], useTextname = false } = this.config;
        const tbody = this.element.querySelector(`#chart-table-${this.id}`);
        if (!tbody) return;

        // Collect all sensors from all zones with zone index
        const allSensors = [];
        zones.forEach((zone, zoneIdx) => {
            (zone.sensors || []).forEach((sensor, sensorIdx) => {
                // Get sensor info from global state
                const sensorInfo = typeof getSensorInfo === 'function' ? getSensorInfo(sensor.name) : null;
                allSensors.push({
                    ...sensor,
                    zoneIdx,
                    sensorIdx,
                    zoneId: zone.id || `zone-${zoneIdx}`,
                    color: sensor.color || ChartWidget.COLORS[sensorIdx % ChartWidget.COLORS.length],
                    iotype: sensorInfo?.iotype || '',
                    textname: sensorInfo?.textname || ''
                });
            });
        });

        // IONC-style table rows
        tbody.innerHTML = allSensors.map((sensor, idx) => {
            const safeId = sensor.name.replace(/[^a-zA-Z0-9]/g, '_');
            const sensorInfo = typeof getSensorInfo === 'function' ? getSensorInfo(sensor.name) : null;
            const sensorId = sensorInfo?.id || '';
            const supplier = sensorInfo?.supplier || '';
            // Use textname if enabled and available
            const displayName = (useTextname && sensor.textname) ? sensor.textname : sensor.name;
            return `
            <tr data-sensor="${escapeAttr(sensor.name)}" data-zone="${sensor.zoneIdx}" data-idx="${sensor.sensorIdx}">
                <td class="col-color">
                    <span class="color-indicator" style="background: ${sensor.color}"></span>
                </td>
                <td class="col-id">${escapeHtml(String(sensorId))}</td>
                <td class="col-name" title="${escapeAttr(sensor.name)}">${escapeHtml(displayName)}</td>
                <td class="col-type">
                    ${sensor.iotype ? `<span class="type-badge type-${sensor.iotype}">${sensor.iotype}</span>` : ''}
                </td>
                <td class="col-value" id="chart-value-${this.id}-${safeId}" style="color: ${sensor.color}">--</td>
                <td class="col-status">—</td>
                <td class="col-supplier">${escapeHtml(supplier)}</td>
            </tr>
        `}).join('');
    }

    initTableResizer() {
        const container = this.element.querySelector('.chart-widget-table-container');
        const resizer = this.element.querySelector('.chart-widget-table-resizer');
        if (!container || !resizer) return;

        let startY, startHeight;

        const onMouseMove = (e) => {
            const delta = startY - e.clientY;
            const newHeight = Math.max(50, Math.min(300, startHeight + delta));
            container.style.height = `${newHeight}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';

            // Save new height to config
            this.config.tableHeight = parseInt(container.style.height);
            // Trigger save through dashboard manager
            if (window.dashboardManager) {
                dashboardManager.saveDashboard();
            }
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startHeight = container.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    initZonesResizer() {
        const zones = this.element.querySelector('.chart-widget-zones');
        const resizer = this.element.querySelector('.chart-widget-zones-resizer');
        if (!zones || !resizer) return;

        let startY, startHeight;

        const onMouseMove = (e) => {
            const delta = e.clientY - startY;
            const newHeight = Math.max(80, Math.min(500, startHeight + delta));
            zones.style.height = `${newHeight}px`;
            // Trigger chart resize
            this.charts.forEach(({ chart }) => chart.resize());
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';

            // Save new height to config
            this.config.zonesHeight = parseInt(zones.style.height);
            // Trigger save through dashboard manager
            if (window.dashboardManager) {
                dashboardManager.saveDashboard();
            }
        };

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startHeight = zones.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    getTimeRange() {
        // Use widget's own timeRange or default to 15 minutes
        const rangeMs = this.config.timeRange || 900000;
        const now = Date.now();

        let min = this.chartStartTime;
        let max = min + rangeMs;

        // Shift window if current time exceeds
        if (now >= max) {
            const shiftAmount = rangeMs * 0.9;
            this.chartStartTime = min + shiftAmount;
            min = this.chartStartTime;
            max = min + rangeMs;
        }

        return { min, max };
    }

    async loadHistory() {
        const { zones = [] } = this.config;

        for (const zone of zones) {
            const chartData = this.charts.get(zone.id);
            if (!chartData) continue;

            for (let i = 0; i < (zone.sensors || []).length; i++) {
                const sensor = zone.sensors[i];
                try {
                    // Try to load history from SM API
                    const response = await fetch(`/api/sm/sensors/${encodeURIComponent(sensor.name)}/history?limit=200`);
                    if (response.ok) {
                        const history = await response.json();
                        if (history.points && history.points.length > 0) {
                            // Use timestamp as number for decimation to work
                            const data = history.points.map(p => ({
                                x: new Date(p.timestamp).getTime(),
                                y: p.value
                            }));
                            chartData.chart.data.datasets[i].data = data;
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to load history for ${sensor.name}:`, e);
                }
            }

            chartData.chart.update('none');
        }
    }

    update(value, error = null) {
        // This is called for the main sensor (config.sensor)
        // Chart widget uses updateSensor instead
    }

    // Called from SSE handler for each sensor update
    updateSensor(sensorName, value, timestamp = null) {
        // Use timestamp as number for decimation to work with parsing: false
        const ts = timestamp ? new Date(timestamp).getTime() : Date.now();

        // Store current value
        this.sensorData.set(sensorName, { value, timestamp: ts });

        // Update table value
        const safeId = sensorName.replace(/[^a-zA-Z0-9]/g, '_');
        const valueEl = this.element?.querySelector(`#chart-value-${this.id}-${safeId}`);
        if (valueEl) {
            valueEl.textContent = typeof value === 'number' ? value.toFixed(2) : value;
        }

        // Add point to chart
        const { zones = [] } = this.config;
        for (const zone of zones) {
            const chartData = this.charts.get(zone.id);
            if (!chartData) continue;

            const sensorIdx = (zone.sensors || []).findIndex(s => s.name === sensorName);
            if (sensorIdx === -1) continue;

            const dataset = chartData.chart.data.datasets[sensorIdx];
            if (!dataset) continue;

            dataset.data.push({ x: ts, y: value });

            // Limit data points
            if (dataset.data.length > 1000) {
                dataset.data.shift();
            }
        }
    }

    // Called periodically to sync time range and update charts
    syncTimeRange() {
        const timeRange = this.getTimeRange();

        this.charts.forEach(({ chart }) => {
            chart.options.scales.x.min = timeRange.min;
            chart.options.scales.x.max = timeRange.max;
            chart.update('none');
        });
    }

    // Get all sensor names for SSE subscription
    getSensorNames() {
        const { zones = [] } = this.config;
        const names = new Set();
        zones.forEach(zone => {
            (zone.sensors || []).forEach(sensor => {
                names.add(sensor.name);
            });
        });
        return Array.from(names);
    }

    destroy() {
        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Remove visibility handler
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }

        // Destroy all Chart.js instances
        this.charts.forEach(({ chart }) => {
            chart.destroy();
        });
        this.charts.clear();
        this.sensorData.clear();
        super.destroy();
    }

    static TIME_RANGES = [
        { value: 60000, label: '1m' },
        { value: 180000, label: '3m' },
        { value: 300000, label: '5m' },
        { value: 900000, label: '15m' },
        { value: 3600000, label: '1h' },
        { value: 10800000, label: '3h' }
    ];

    static getConfigForm(config = {}) {
        const zones = config.zones || [{ id: 'zone-0', sensors: [] }];
        const timeRange = config.timeRange || 900000; // default 15m

        return `
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeAttr(config.label || '')}" placeholder="Chart title">
            </div>
            <div class="widget-config-field">
                <label>Time Range</label>
                <div class="time-range-selector">
                    ${ChartWidget.TIME_RANGES.map(tr => `
                        <label class="time-range-btn ${timeRange === tr.value ? 'active' : ''}">
                            <input type="radio" name="timeRange" value="${tr.value}" ${timeRange === tr.value ? 'checked' : ''}>
                            <span>${tr.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="widget-config-field">
                <label class="toggle-label">
                    <input type="checkbox" name="showTable" ${config.showTable !== false ? 'checked' : ''}>
                    <span class="toggle-switch"></span>
                    Show sensor table
                </label>
            </div>
            <div class="widget-config-field">
                <label class="toggle-label">
                    <input type="checkbox" name="useTextname" ${config.useTextname ? 'checked' : ''}>
                    <span class="toggle-switch"></span>
                    Use textname
                </label>
            </div>
            <div class="chart-zones-editor" id="chart-zones-editor">
                ${zones.map((zone, zoneIdx) => ChartWidget.renderZoneEditor(zone, zoneIdx)).join('')}
            </div>
            <div class="widget-config-field">
                <button type="button" class="zones-add-btn" onclick="addChartZone()">+ Add Chart Zone</button>
            </div>
        `;
    }

    static renderZoneEditor(zone, zoneIdx) {
        const sensors = zone.sensors || [];
        return `
            <div class="chart-zone-editor" data-zone-idx="${zoneIdx}">
                <div class="chart-zone-header">
                    <span class="chart-zone-title">Zone ${zoneIdx + 1}</span>
                    ${zoneIdx > 0 ? `<button type="button" class="zone-remove-btn" onclick="removeChartZone(${zoneIdx})">×</button>` : ''}
                </div>
                <div class="chart-zone-sensors" id="chart-zone-sensors-${zoneIdx}">
                    ${sensors.map((sensor, sensorIdx) => ChartWidget.renderSensorRow(sensor, zoneIdx, sensorIdx)).join('')}
                </div>
                <div class="chart-zone-add">
                    <input type="text" class="widget-input chart-sensor-input"
                           placeholder="Add sensor..."
                           data-zone-idx="${zoneIdx}"
                           autocomplete="off">
                </div>
            </div>
        `;
    }

    static renderSensorRow(sensor, zoneIdx, sensorIdx) {
        const color = sensor.color || ChartWidget.COLORS[sensorIdx % ChartWidget.COLORS.length];
        return `
            <div class="chart-sensor-row" data-zone-idx="${zoneIdx}" data-sensor-idx="${sensorIdx}">
                <input type="color" class="chart-sensor-color" value="${color}"
                       onchange="updateChartSensorColor(${zoneIdx}, ${sensorIdx}, this.value)">
                <span class="chart-sensor-name">${escapeHtml(sensor.name)}</span>
                <div class="chart-sensor-options">
                    <label class="chart-sensor-option" title="Smooth line (bezier)">
                        <input type="checkbox" name="sensor-${zoneIdx}-${sensorIdx}-smooth" ${sensor.smooth !== false ? 'checked' : ''}>
                        <span>smooth</span>
                    </label>
                    <label class="chart-sensor-option" title="Fill area under line">
                        <input type="checkbox" name="sensor-${zoneIdx}-${sensorIdx}-fill" ${sensor.fill !== false ? 'checked' : ''}>
                        <span>fill</span>
                    </label>
                    <label class="chart-sensor-option" title="Stepped line (discrete)">
                        <input type="checkbox" name="sensor-${zoneIdx}-${sensorIdx}-stepped" ${sensor.stepped ? 'checked' : ''}>
                        <span>stepped</span>
                    </label>
                </div>
                <button type="button" class="chart-sensor-remove" onclick="removeChartSensor(${zoneIdx}, ${sensorIdx})">×</button>
                <input type="hidden" name="sensor-${zoneIdx}-${sensorIdx}-name" value="${escapeAttr(sensor.name)}">
                <input type="hidden" name="sensor-${zoneIdx}-${sensorIdx}-color" value="${color}">
            </div>
        `;
    }

    static parseConfigForm(form) {
        const zones = [];
        const zoneEditors = form.querySelectorAll('.chart-zone-editor');

        zoneEditors.forEach((editor, zoneIdx) => {
            const sensors = [];
            const sensorRows = editor.querySelectorAll('.chart-sensor-row');

            sensorRows.forEach((row, sensorIdx) => {
                const name = row.querySelector('input[type="hidden"][name$="-name"]')?.value;
                const color = row.querySelector('input[type="hidden"][name$="-color"]')?.value;
                const smooth = form.querySelector(`[name="sensor-${zoneIdx}-${sensorIdx}-smooth"]`)?.checked !== false;
                const fill = form.querySelector(`[name="sensor-${zoneIdx}-${sensorIdx}-fill"]`)?.checked !== false;
                const stepped = form.querySelector(`[name="sensor-${zoneIdx}-${sensorIdx}-stepped"]`)?.checked || false;

                if (name) {
                    sensors.push({ name, color, smooth, fill, stepped });
                }
            });

            zones.push({
                id: `zone-${zoneIdx}`,
                sensors
            });
        });

        // Get timeRange from radio button
        const timeRangeInput = form.querySelector('[name="timeRange"]:checked');
        const timeRange = timeRangeInput ? parseInt(timeRangeInput.value) : 900000;

        return {
            label: form.querySelector('[name="label"]')?.value || '',
            timeRange,
            showTable: form.querySelector('[name="showTable"]')?.checked !== false,
            useTextname: form.querySelector('[name="useTextname"]')?.checked || false,
            tableHeight: 100,
            zones
        };
    }
}


// === 62-dashboard-manager.js ===

// ============================================================================
// Widget Registry
// ============================================================================

const WIDGET_TYPES = {
    'gauge': GaugeWidget,
    'level': LevelWidget,
    'led': LedWidget,
    'label': LabelWidget,
    'divider': DividerWidget,
    'statusbar': StatusBarWidget,
    'bargraph': BarGraphWidget,
    'digital': DigitalWidget,
    'toggle': ToggleWidget,
    'pushbutton': PushButtonWidget,
    'setpoint': SetpointWidget,
    'generator': GeneratorWidget,
    'chart': ChartWidget
};

// Grid settings используют константы из 05-constants.js:
// DASHBOARD_GRID_COLS, DASHBOARD_GRID_ROW_HEIGHT, DASHBOARD_GRID_GAP

// ============================================================================
// Dashboard Manager
// ============================================================================

class DashboardManager {
    constructor() {
        this.gridEl = document.getElementById('dashboard-grid');
        this.selectEl = document.getElementById('dashboard-select');
        this.actionsEl = document.getElementById('dashboard-actions');

        this.loadDashboards();
        this.bindEvents();
    }

    bindEvents() {
        // View switcher
        document.getElementById('view-objects-btn')?.addEventListener('click', () => this.switchView('objects'));
        document.getElementById('view-dashboard-btn')?.addEventListener('click', () => this.switchView('dashboard'));

        // Dashboard selector
        this.selectEl?.addEventListener('change', (e) => this.loadDashboard(e.target.value));

        // Dashboard actions
        document.getElementById('dashboard-new-btn')?.addEventListener('click', () => this.showNewDashboardDialog());
        document.getElementById('dashboard-add-widget-btn')?.addEventListener('click', () => this.showWidgetPicker());
        document.getElementById('dashboard-edit-btn')?.addEventListener('click', () => this.toggleEditMode());
        document.getElementById('dashboard-import-btn')?.addEventListener('click', () => this.showImportDialog());
        document.getElementById('dashboard-export-btn')?.addEventListener('click', () => this.exportDashboard());
        document.getElementById('dashboard-delete-btn')?.addEventListener('click', () => this.deleteDashboard());

        // Dialog events
        document.getElementById('dashboard-name-confirm')?.addEventListener('click', () => this.createDashboard());
        document.getElementById('widget-config-apply')?.addEventListener('click', () => this.applyWidgetConfig());
        document.getElementById('import-confirm')?.addEventListener('click', () => this.confirmImport());

        // Import dropzone
        this.setupImportDropzone();

        // Dashboards section collapse toggle
        document.getElementById('dashboards-section-header')?.addEventListener('click', () => {
            const section = document.getElementById('dashboards-section');
            section?.classList.toggle('collapsed');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeWidgetPicker();
                closeWidgetConfig();
                closeDashboardNameDialog();
                closeDashboardImport();
                // Deselect widget
                if (dashboardState.selectedWidgetId) {
                    this.selectWidget(null);
                }
            }

            // Arrow keys for moving selected widget
            // Default: move by grid cell, Shift+Arrow: move by 1px (fine mode)
            if (dashboardState.editMode && dashboardState.selectedWidgetId) {
                const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
                if (arrowKeys.includes(e.key)) {
                    e.preventDefault();
                    this.moveWidgetByKey(e.key, e.shiftKey);
                }
            }
        });

        // Click on grid background deselects widget
        this.gridEl?.addEventListener('click', (e) => {
            if (!dashboardState.editMode) return;
            // Only deselect if clicked directly on grid, not on a widget
            if (e.target === this.gridEl || e.target.classList.contains('dashboard-placeholder')) {
                this.selectWidget(null);
            }
        });
    }

    switchView(view) {
        // Delegate to global switchView function
        if (typeof window.switchView === 'function') {
            window.switchView(view);
        }
        this.saveDashboardSettings();
    }

    // Обновить все виджеты с их текущими значениями
    refreshAllWidgets() {
        dashboardState.widgets.forEach((widget) => {
            if (widget.value !== null) {
                widget.update(widget.value, widget.error);
            }
        });
    }

    loadDashboards() {
        // Load from localStorage
        try {
            const userDashboards = JSON.parse(localStorage.getItem('user-dashboards') || '[]');
            userDashboards.forEach(name => {
                const config = localStorage.getItem(`dashboard:${name}`);
                if (config) {
                    dashboardState.dashboards.set(name, JSON.parse(config));
                }
            });
        } catch (err) {
            console.warn('Failed to load dashboards from localStorage:', err);
        }

        // Load server dashboards
        this.loadServerDashboards();

        // Update selector
        this.updateDashboardSelector();

        // Restore last viewed dashboard
        const lastDashboard = localStorage.getItem('last-dashboard');
        if (lastDashboard && dashboardState.dashboards.has(lastDashboard)) {
            this.loadDashboard(lastDashboard);
        }
    }

    async loadServerDashboards() {
        try {
            const response = await fetch('/api/dashboards');
            if (response.ok) {
                const dashboardInfos = await response.json();
                if (Array.isArray(dashboardInfos) && dashboardInfos.length > 0) {
                    // API returns array of DashboardInfo (name, description, widgetCount, server)
                    for (const info of dashboardInfos) {
                        const name = info.name;
                        if (!name) continue;

                        // Check if dashboard already exists (e.g., from localStorage)
                        const existing = dashboardState.dashboards.get(name);
                        if (existing) {
                            // Mark existing dashboard as server dashboard
                            // (it might have been loaded from localStorage without _server flag)
                            existing._server = true;
                        } else {
                            // Create placeholder - will be loaded on demand
                            dashboardState.dashboards.set(name, {
                                _server: true,
                                _loaded: false,
                                meta: { name, description: info.description || '' }
                            });
                        }
                    }
                    this.updateDashboardSelector();
                }
            }
        } catch (err) {
            console.log('No server dashboards available');
        }
    }

    updateDashboardSelector() {
        if (!this.selectEl) return;

        const currentValue = this.selectEl.value;

        let html = '<option value="">Select dashboard...</option>';

        // Server dashboards
        const serverDashboards = Array.from(dashboardState.dashboards.entries())
            .filter(([_, config]) => config._server);
        if (serverDashboards.length > 0) {
            html += '<optgroup label="Server Dashboards">';
            serverDashboards.forEach(([name]) => {
                html += `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`;
            });
            html += '</optgroup>';
        }

        // User dashboards
        const userDashboards = Array.from(dashboardState.dashboards.entries())
            .filter(([_, config]) => !config._server);
        if (userDashboards.length > 0) {
            html += '<optgroup label="My Dashboards">';
            userDashboards.forEach(([name]) => {
                html += `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`;
            });
            html += '</optgroup>';
        }

        this.selectEl.innerHTML = html;
        this.selectEl.value = currentValue;

        // Also update sidebar dashboards list (legacy hidden section + новые
        // sidebar groups). renderSidebarGroups читает 'user-dashboards' из
        // localStorage — saveDashboard уже обновил key, нужно re-render.
        this.updateSidebarDashboards();
        if (typeof renderSidebarGroups === 'function') {
            renderSidebarGroups();
        }
    }

    updateSidebarDashboards() {
        const listEl = document.getElementById('dashboards-list');
        const countEl = document.getElementById('dashboards-count');
        if (!listEl) return;

        const allDashboards = Array.from(dashboardState.dashboards.entries());
        const serverDashboards = allDashboards.filter(([_, c]) => c._server);
        const userDashboards = allDashboards.filter(([_, c]) => !c._server);

        // Update count
        if (countEl) {
            countEl.textContent = allDashboards.length;
        }

        // Build list HTML
        let html = '';

        // Server dashboards first
        serverDashboards.forEach(([name]) => {
            const isActive = dashboardState.currentDashboard === name;
            html += `
                <li class="dashboard-item server${isActive ? ' active' : ''}" data-name="${escapeAttr(name)}">
                    <svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/>
                        <rect x="14" y="3" width="7" height="7"/>
                        <rect x="14" y="14" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    <span class="dashboard-name">${escapeHtml(name)}</span>
                    <span class="dashboard-badge">srv</span>
                </li>
            `;
        });

        // User dashboards
        userDashboards.forEach(([name]) => {
            const isActive = dashboardState.currentDashboard === name;
            html += `
                <li class="dashboard-item${isActive ? ' active' : ''}" data-name="${escapeAttr(name)}">
                    <svg class="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/>
                        <rect x="14" y="3" width="7" height="7"/>
                        <rect x="14" y="14" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    <span class="dashboard-name">${escapeHtml(name)}</span>
                </li>
            `;
        });

        listEl.innerHTML = html;

        // Bind click events
        listEl.querySelectorAll('.dashboard-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                this.switchView('dashboard');
                this.loadDashboard(name);
                if (this.selectEl) {
                    this.selectEl.value = name;
                }
            });
        });
    }

    // Resolve первый connected server. Используется для legacy fallback и migration.
    _resolveFirstConnectedServerId() {
        if (typeof state === 'undefined' || !state.servers) return null;
        for (const [id, server] of state.servers) {
            if (server.connected) return id;
        }
        return null;
    }

    // Auto-migrate legacy widget configs без serverId / objectName.
    // Single-shot: на первом load после deploy заполняет serverId первым connected
    // и objectName='SharedMemory' (дефолт IONC), сохраняет dashboard config обратно.
    // На следующих load'ах no-op (уже есть оба поля).
    //
    // Покрытие — все widget типы которым нужны sensor подписки:
    //   - active widgets (toggle/button/setpoint/generator) — cfg.sensor
    //   - StatusBar — cfg.items[*].sensor
    //   - Chart — cfg.zones[*].sensors[*]
    //   - BarGraph — cfg.sensors[*] (если есть)
    // Pure-display widgets (label/divider) без sensor контракта — пропускаются.
    //
    // Atomic: если serverId не резолвится (cold init, state.servers ещё пустой),
    // НЕ пишем objectName в одиночку. Иначе сохранили бы half-migrated config
    // с objectName но без serverId, и `updateSensorSubscriptions` всё равно skip'нет
    // widget. На следующем load после установки соединения миграция отработает целиком.
    _migrateLegacyServerIds() {
        const needsServer = (cfg) =>
            cfg.sensor || cfg.sensorId ||
            (Array.isArray(cfg.items) && cfg.items.some(it => it?.sensor)) ||
            (Array.isArray(cfg.zones) && cfg.zones.some(z => Array.isArray(z?.sensors) && z.sensors.length > 0)) ||
            (Array.isArray(cfg.sensors) && cfg.sensors.length > 0);

        let dirty = false;
        for (const widget of dashboardState.widgets.values()) {
            const cfg = widget?.config;
            if (!cfg) continue;
            if (!needsServer(cfg)) continue;

            // Atomic check: для half-state (есть один — нет другого) нужно резолвить serverId.
            // Если не получилось — пропускаем widget, миграция повторится на следующем load.
            if (cfg.serverId && cfg.objectName) continue;
            const resolvedServerId = cfg.serverId || this._resolveFirstConnectedServerId();
            if (!resolvedServerId) continue;

            const filled = {};
            if (!cfg.serverId)   { cfg.serverId = resolvedServerId; filled.serverId = resolvedServerId; }
            if (!cfg.objectName) { cfg.objectName = 'SharedMemory'; filled.objectName = 'SharedMemory'; }
            if (Object.keys(filled).length > 0) {
                dirty = true;
                console.info('dashboard: migrated legacy widget', widget.id, filled);
            }
        }
        if (dirty && typeof dashboardState.currentDashboard === 'string') {
            this.saveDashboard(dashboardState.currentDashboard);
        }
    }

    async loadDashboard(name) {
        if (!name) {
            this.clearDashboard();
            return;
        }

        let config = dashboardState.dashboards.get(name);
        if (!config) {
            console.warn('Dashboard not found:', name);
            this.clearDashboard();
            return;
        }

        // Если уже на этом dashboard и виджеты живы — НЕ пересоздаём их с нуля.
        // sidebar-click + view-toggle теперь не «сбрасывают» layout/values/edit-mode,
        // а лишь освежают подписки и значения (на случай новых SSE-событий или
        // подключившихся серверов). Force-reload — через clearDashboard() либо
        // переключение dashboard'ов.
        if (dashboardState.currentDashboard === name && dashboardState.widgets.size > 0) {
            this._migrateLegacyServerIds();
            this.updateSensorSubscriptions();
            this.initializeWidgetValues();
            return;
        }

        // Lazy load server dashboard if not yet loaded
        if (config._server && !config._loaded) {
            try {
                const response = await fetch(`/api/dashboards/${encodeURIComponent(name)}`);
                if (response.ok) {
                    const fullConfig = await response.json();
                    fullConfig._server = true;
                    fullConfig._loaded = true;
                    dashboardState.dashboards.set(name, fullConfig);
                    config = fullConfig;
                } else {
                    console.error('Failed to load dashboard:', name, response.status);
                    this.clearDashboard();
                    return;
                }
            } catch (err) {
                console.error('Error loading dashboard:', name, err);
                this.clearDashboard();
                return;
            }
        }

        dashboardState.currentDashboard = name;
        this.actionsEl?.classList.remove('hidden');

        // Update sidebar active state
        this.updateSidebarDashboards();

        // Clear existing widgets
        this.clearWidgets();

        // Render widgets
        this.renderDashboard(config);

        // Save last viewed
        localStorage.setItem('last-dashboard', name);

        // Hide delete button for server dashboards (they are read-only on server)
        // Edit button remains visible - user can modify and export to JSON
        const deleteBtn = document.getElementById('dashboard-delete-btn');
        if (config._server) {
            deleteBtn?.classList.add('hidden');
        } else {
            deleteBtn?.classList.remove('hidden');
        }
    }

    renderDashboard(config) {
        if (!this.gridEl) return;

        this.gridEl.innerHTML = '';

        if (!config.widgets || config.widgets.length === 0) {
            this.gridEl.innerHTML = `
                <div class="dashboard-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    <p>Dashboard is empty. Click "Add Widget" to get started.</p>
                </div>
            `;
            return;
        }

        config.widgets.forEach(widgetConfig => {
            this.createWidget(widgetConfig);
        });

        // Subscribe to sensor updates
        this._migrateLegacyServerIds();
        this.updateSensorSubscriptions();

        // Initialize widgets with cached/fetched values
        this.initializeWidgetValues();
    }

    // Initialize widgets with current sensor values (from cache or API)
    async initializeWidgetValues() {
        // Collect unique sensorKeys from subscriptions (после Step 2.5 ключи Map'ов
        // — это полные sensorKey, не короткие имена).
        const sensorKeys = new Set();
        for (const k of dashboardState.sensorSubscriptions.keys()) sensorKeys.add(k);
        for (const k of dashboardState.setpointSubscriptions.keys()) sensorKeys.add(k);
        for (const k of dashboardState.chartSubscriptions.keys()) sensorKeys.add(k);

        if (sensorKeys.size === 0) return;

        // First, try to use cached values from SSE events.
        const uncachedKeys = [];
        for (const cacheKey of sensorKeys) {
            const cached = state.sensorValuesCache.get(cacheKey);
            if (cached) {
                // Use cached value (not older than 60 seconds)
                if (Date.now() - cached.timestamp < 60000) {
                    this.handleSensorUpdate(cacheKey, cached.value, cached.error);
                } else {
                    uncachedKeys.push(cacheKey);
                }
            } else {
                uncachedKeys.push(cacheKey);
            }
        }

        // For uncached sensors, try to fetch from API
        if (uncachedKeys.length > 0) {
            this.fetchSensorValues(uncachedKeys);
        }
    }

    // Fetch sensor values from IONC API. Принимает массив sensorKey'ев
    // (каждый ключ уже кодирует serverId|objectName|sensorName — Step 2.6).
    // Группирует по (serverId, objectName), делает один search request
    // на каждый sensorName (текущий API не поддерживает batch search).
    async fetchSensorValues(sensorKeys) {
        // Group by (serverId, objectName).
        // grpKey = `${serverId}|${objectName}` → Map<sensorName, sensorKey>.
        const groups = new Map();

        for (const key of sensorKeys) {
            const parsed = parseSensorKey(key);
            if (!parsed) continue; // legacy / malformed — пропускаем
            const grpKey = `${parsed.serverId}|${parsed.objectName}`;
            if (!groups.has(grpKey)) groups.set(grpKey, new Map());
            groups.get(grpKey).set(parsed.sensorName, key);
        }

        for (const [grpKey, nameToKey] of groups) {
            const [serverId, objectName] = grpKey.split('|');
            for (const [sensorName, sensorKey] of nameToKey) {
                try {
                    const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors`
                        + `?server=${encodeURIComponent(serverId)}`
                        + `&search=${encodeURIComponent(sensorName)}&limit=1`;
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (!data.sensors || data.sensors.length === 0) continue;
                    const sensor = data.sensors.find(s => s.name === sensorName);
                    if (!sensor) continue;
                    const writeKey = makeSensorKey(serverId, objectName, sensor.name);
                    state.sensorValuesCache.set(writeKey, {
                        value: sensor.value,
                        error: null,
                        timestamp: Date.now()
                    });
                    this.handleSensorUpdate(writeKey, sensor.value, null);
                } catch (err) {
                    console.warn('Failed to fetch sensor value:', sensorKey, err);
                }
            }
        }
    }

    createWidget(widgetConfig) {
        const WidgetClass = WIDGET_TYPES[widgetConfig.type];
        if (!WidgetClass) {
            console.warn('Unknown widget type:', widgetConfig.type);
            return null;
        }

        const { position = {} } = widgetConfig;
        const { col = 0, row = 0, width = 2, height = 1, freePosition, offset } = position;

        // Create widget container
        const container = document.createElement('div');
        container.className = `dashboard-widget widget-${width}x${height}`;
        // Transparent by default for most widgets, but NOT for chart
        const isChart = widgetConfig.type === 'chart';
        const isTransparent = isChart
            ? (widgetConfig.config?.transparent === true)  // chart: explicit true only
            : (widgetConfig.config?.transparent !== false); // others: default true
        if (isTransparent) {
            container.classList.add('transparent');
        }
        // Build transform string (offset + rotation)
        const rotate = widgetConfig.config?.rotate || 0;
        const transforms = [];
        if (offset && (offset.x || offset.y)) {
            transforms.push(`translate(${offset.x || 0}px, ${offset.y || 0}px)`);
        }
        if (rotate) {
            transforms.push(`rotate(${rotate}deg)`);
        }
        if (transforms.length > 0) {
            container.style.transform = transforms.join(' ');
        }
        container.dataset.widgetId = widgetConfig.id;
        container.dataset.type = widgetConfig.type;

        // Free pixel positioning (Shift+drag) or grid snap
        if (freePosition) {
            container.style.position = 'absolute';
            container.style.left = `${freePosition.left}px`;
            container.style.top = `${freePosition.top}px`;
            // Always calculate size from grid cells (width/height are always in cells)
            const gap = DASHBOARD_GRID_GAP;
            const gridEl = this.gridEl || document.querySelector('.dashboard-grid');
            if (gridEl) {
                const gridRect = gridEl.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(gridEl);
                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
                const contentWidth = gridRect.width - paddingLeft * 2;
                const cellWidth = (contentWidth - gap * (DASHBOARD_GRID_COLS - 1)) / DASHBOARD_GRID_COLS;
                const cellHeight = DASHBOARD_GRID_ROW_HEIGHT;
                container.style.width = `${width * cellWidth + (width - 1) * gap}px`;
                container.style.height = `${height * cellHeight + (height - 1) * gap}px`;
            }
            container.classList.add('free-position');
        } else {
            container.style.gridColumn = `${col + 1} / span ${width}`;
            container.style.gridRow = `${row + 1} / span ${height}`;
        }

        // Widget header (always hidden, shows action buttons on hover)
        // Title is rendered inside widget-content by the widget
        container.innerHTML = `
            <div class="widget-header hidden-title">
                <span class="widget-title">${escapeHtml(widgetConfig.config?.label || widgetConfig.type)}</span>
                <div class="widget-actions">
                    <button class="widget-action-btn config" title="Configure">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                        </svg>
                    </button>
                    <button class="widget-action-btn delete" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="widget-resize-handle" title="Drag to resize"></div>
        `;

        // Create widget instance
        const widget = new WidgetClass(widgetConfig.id, widgetConfig.config || {}, container);

        // Маркер для CSS правил (.dashboard-widget[data-active-widget="true"]):
        // используется для edit-mode grayscale и active-disabled индикатора.
        if (widget instanceof ActiveDashboardWidget) {
            container.dataset.activeWidget = 'true';
        }

        widget.render();

        // Initial interactivity sync (без него виджет создаётся в правильном
        // visual state до первого editMode toggle / controlToken event).
        if (typeof widget._updateInteractivityClass === 'function') {
            widget._updateInteractivityClass();
        }

        // Inject title if configured (before widget-content, not inside)
        const title = widgetConfig.config?.title;
        if (title) {
            const widgetContent = container.querySelector('.widget-content');
            if (widgetContent) {
                const titleEl = document.createElement('div');
                titleEl.className = 'widget-title-label' + (widgetConfig.config?.titleBorder ? ' title-badge' : '');
                titleEl.textContent = title;
                // Insert BEFORE widget-content, not inside it
                widgetContent.parentNode.insertBefore(titleEl, widgetContent);
            }
        }

        // Bind widget events
        container.querySelector('.widget-action-btn.config')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showWidgetConfig(widgetConfig.id);
        });

        container.querySelector('.widget-action-btn.delete')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeWidget(widgetConfig.id);
        });

        // Resize handle
        const resizeHandle = container.querySelector('.widget-resize-handle');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                if (!dashboardState.editMode) return;
                e.preventDefault();
                e.stopPropagation();
                this.startResize(widgetConfig.id, container, e);
            });
        }

        // Drag by header
        const header = container.querySelector('.widget-header');
        if (header) {
            header.addEventListener('mousedown', (e) => {
                if (!dashboardState.editMode) return;
                // Ignore clicks on buttons
                if (e.target.closest('.widget-action-btn')) return;
                e.preventDefault();
                this.startDrag(widgetConfig.id, container, e);
            });
        }

        // Select/deselect widget by click in edit mode (toggle)
        container.addEventListener('click', (e) => {
            if (!dashboardState.editMode) return;
            // Ignore clicks on buttons
            if (e.target.closest('.widget-action-btn')) return;
            // Toggle: if already selected, deselect
            if (dashboardState.selectedWidgetId === widgetConfig.id) {
                this.selectWidget(null);
            } else {
                this.selectWidget(widgetConfig.id);
            }
        });

        // Add to grid
        this.gridEl.appendChild(container);

        // Store widget instance
        dashboardState.widgets.set(widgetConfig.id, widget);

        return widget;
    }

    clearWidgets() {
        // Destroy all widget instances
        dashboardState.widgets.forEach(widget => {
            if (widget && typeof widget.destroy === 'function') {
                widget.destroy();
            }
        });
        dashboardState.widgets.clear();
        // Чистим все три карты подписок одновременно с widgets — иначе stale
        // sensor/setpoint/chart subscriptions будут слать update'ы к destroy'нутым widget'ам
        // до следующего updateSensorSubscriptions.
        dashboardState.sensorSubscriptions.clear();
        dashboardState.setpointSubscriptions.clear();
        dashboardState.chartSubscriptions.clear();
    }

    clearDashboard() {
        dashboardState.currentDashboard = null;
        this.clearWidgets();
        this.actionsEl?.classList.add('hidden');

        // Reset selector to empty value
        if (this.selectEl) {
            this.selectEl.value = '';
        }

        // Update sidebar to remove active state
        this.updateSidebarDashboards();

        // Clear last-dashboard from localStorage
        localStorage.removeItem('last-dashboard');

        if (this.gridEl) {
            this.gridEl.innerHTML = `
                <div class="dashboard-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <p>Select a dashboard or create a new one</p>
                </div>
            `;
        }
    }

    showNewDashboardDialog() {
        const overlay = document.getElementById('dashboard-name-overlay');
        const input = document.getElementById('dashboard-name-input');
        const title = document.getElementById('dashboard-name-title');

        if (title) title.textContent = 'New Dashboard';
        if (input) input.value = '';
        overlay?.classList.remove('hidden');
        input?.focus();
    }

    createDashboard() {
        const input = document.getElementById('dashboard-name-input');
        const name = input?.value?.trim();

        if (!name) {
            alert('Please enter a dashboard name');
            return;
        }

        if (dashboardState.dashboards.has(name)) {
            alert('A dashboard with this name already exists');
            return;
        }

        const config = {
            version: DASHBOARD_VERSION,
            meta: {
                name,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            },
            grid: { cols: DASHBOARD_GRID_COLS, rowHeight: DASHBOARD_GRID_ROW_HEIGHT, gap: DASHBOARD_GRID_GAP },
            widgets: []
        };

        dashboardState.dashboards.set(name, config);
        this.saveDashboard(name);
        this.updateDashboardSelector();

        closeDashboardNameDialog();

        // Select the new dashboard
        if (this.selectEl) {
            this.selectEl.value = name;
        }
        this.loadDashboard(name);
    }

    saveDashboard(name = dashboardState.currentDashboard) {
        if (!name) return;

        const config = dashboardState.dashboards.get(name);
        if (!config || config._server) return; // Don't save server dashboards

        config.meta = config.meta || {};
        config.meta.modified = new Date().toISOString();

        // Save to localStorage
        localStorage.setItem(`dashboard:${name}`, JSON.stringify(config));

        // Update user dashboards list
        const userDashboards = Array.from(dashboardState.dashboards.entries())
            .filter(([_, c]) => !c._server)
            .map(([n]) => n);
        localStorage.setItem('user-dashboards', JSON.stringify(userDashboards));
    }

    saveDashboardSettings() {
        localStorage.setItem('dashboard-view', dashboardState.currentView);
    }

    showWidgetPicker() {
        const overlay = document.getElementById('widget-picker-overlay');
        const content = document.getElementById('widget-picker-content');

        if (!content) return;

        content.innerHTML = Object.values(WIDGET_TYPES).map(WidgetClass => `
            <div class="widget-picker-item" data-type="${WidgetClass.type}">
                <div class="widget-picker-icon">${WidgetClass.icon}</div>
                <span class="widget-picker-name">${WidgetClass.displayName}</span>
                <span class="widget-picker-desc">${WidgetClass.description}</span>
            </div>
        `).join('');

        // Bind click events
        content.querySelectorAll('.widget-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                closeWidgetPicker();
                this.showWidgetConfig(null, type);
            });
        });

        overlay?.classList.remove('hidden');
    }

    showWidgetConfig(widgetId, type = null) {
        const overlay = document.getElementById('widget-config-overlay');
        const title = document.getElementById('widget-config-title');
        const content = document.getElementById('widget-config-content');

        if (!content) return;

        // widget-config-content — persistent <div> (live между открытиями
        // диалога). Сбрасываем все idempotency-флаги, которые initConfigHandlers
        // конкретных виджетов выставляют на этом узле, иначе для второго
        // открытия handler'ы рано-return'ят и autocomplete не работает.
        delete content.dataset.activeHandlersWired;
        delete content.dataset.genHandlersWired;

        let config = {};
        let position = {};
        let WidgetClass;

        if (widgetId) {
            // Editing existing widget
            const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
            const widgetConfig = dashboard?.widgets?.find(w => w.id === widgetId);
            if (widgetConfig) {
                type = widgetConfig.type;
                config = widgetConfig.config || {};
                position = widgetConfig.position || {};
            }
        }

        WidgetClass = WIDGET_TYPES[type];
        if (!WidgetClass) return;

        if (title) {
            title.textContent = widgetId ? `Configure ${WidgetClass.displayName}` : `Add ${WidgetClass.displayName}`;
        }

        // Get current size from position, or default
        const currentWidth = position.width || WidgetClass.defaultSize.width;
        const currentHeight = position.height || WidgetClass.defaultSize.height;

        // Chart widget doesn't show transparent option (always opaque)
        const showTransparent = type !== 'chart';
        const transparentHtml = showTransparent ? `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label class="widget-toggle">
                        <input type="checkbox" name="transparent" ${config.transparent !== false ? 'checked' : ''}>
                        <span class="widget-toggle-track"><span class="widget-toggle-thumb"></span></span>
                        <span class="widget-toggle-label">Transparent background</span>
                    </label>
                </div>
            </div>
        ` : '';

        // Title option (shown above widget content)
        const titleHtml = `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Title (optional)</label>
                    <input type="text" class="widget-input" name="title" value="${escapeAttr(config.title || '')}" placeholder="e.g. Engine RPM">
                </div>
                <div class="widget-config-field">
                    <label class="widget-toggle">
                        <input type="checkbox" name="titleBorder" ${config.titleBorder ? 'checked' : ''}>
                        <span class="widget-toggle-track"><span class="widget-toggle-thumb"></span></span>
                        <span class="widget-toggle-label">Badge style</span>
                    </label>
                </div>
            </div>
        `;

        // Rotate option - available for all widget types
        const currentRotate = config.rotate || 0;
        const rotateHtml = `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Rotate</label>
                    <div class="rotate-input-group">
                        <input type="number" name="rotate" value="${currentRotate}" min="0" max="360" step="1">
                        <span class="rotate-unit">°</span>
                        <div class="rotate-quick-buttons">
                            <button type="button" class="rotate-quick-btn" data-angle="0">0°</button>
                            <button type="button" class="rotate-quick-btn" data-angle="90">90°</button>
                            <button type="button" class="rotate-quick-btn" data-angle="180">180°</button>
                            <button type="button" class="rotate-quick-btn" data-angle="270">270°</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        content.innerHTML = `
            ${WidgetClass.getConfigForm(config)}
            ${titleHtml}
            ${transparentHtml}
            ${rotateHtml}
        `;

        // Store context for apply
        content.dataset.widgetId = widgetId || '';
        content.dataset.widgetType = type;

        // Setup legacy in-memory sensor autocomplete for all sensor inputs.
        // Active widgets с usesNewSensorAutocomplete=true используют свой собственный
        // setupSensorAutocomplete (из 41-sensor-autocomplete.js) с резолвом sensor_id;
        // пропускаем legacy attach, чтобы не было дублирующего dropdown'а на одном input.
        if (!WidgetClass.usesNewSensorAutocomplete) {
            this.setupSensorAutocomplete(content, 'sensor');
            this.setupSensorAutocomplete(content, 'sensor2');
        }

        // Setup chart widget autocomplete for zone sensor inputs
        if (type === 'chart') {
            setupChartWidgetAutocomplete();
        }

        // Setup custom number inputs
        setupNumberInputs(content);

        // Setup rotate quick buttons
        const rotateInput = content.querySelector('[name="rotate"]');
        content.querySelectorAll('.rotate-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (rotateInput) {
                    rotateInput.value = btn.dataset.angle;
                }
            });
        });

        // Call widget-specific config handlers if available
        if (typeof WidgetClass.initConfigHandlers === 'function') {
            WidgetClass.initConfigHandlers(content, config);
        }

        overlay?.classList.remove('hidden');
    }

    setupSensorAutocomplete(container, fieldName = 'sensor') {
        const sensorInput = container.querySelector(`[name="${fieldName}"]`);
        if (!sensorInput) return;

        // Wrap input in relative container and add autocomplete dropdown
        const field = sensorInput.closest('.widget-config-field');
        if (!field) return;

        field.classList.add('sensor-autocomplete-field');

        // Create autocomplete container
        const autocompleteContainer = document.createElement('div');
        autocompleteContainer.className = 'widget-sensor-autocomplete';
        autocompleteContainer.style.display = 'none';
        field.appendChild(autocompleteContainer);

        // State
        let autocompleteResults = [];
        let selectedIndex = 0;
        let debounceTimer = null;

        const sensors = Array.from(state.sensorsByName.entries()).map(([name, data]) => ({
            name,
            iotype: data?.iotype || '?',
            textname: data?.textname || ''
        }));

        const hideAutocomplete = () => {
            autocompleteContainer.style.display = 'none';
            autocompleteContainer.innerHTML = '';
            autocompleteResults = [];
            selectedIndex = 0;
        };

        const showAutocomplete = (matches) => {
            if (matches.length === 0) {
                hideAutocomplete();
                return;
            }

            autocompleteResults = matches;
            selectedIndex = 0;

            autocompleteContainer.innerHTML = matches.map((s, i) => `
                <div class="widget-autocomplete-item${i === 0 ? ' selected' : ''}" data-name="${escapeAttr(s.name)}">
                    <span class="sensor-name">${escapeHtml(s.name)}</span>
                    <span class="type-badge type-${s.iotype}">${s.iotype}</span>
                    ${s.textname ? `<span class="sensor-textname">${escapeHtml(s.textname)}</span>` : ''}
                </div>
            `).join('');

            // Click handlers
            autocompleteContainer.querySelectorAll('.widget-autocomplete-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    sensorInput.value = item.dataset.name;
                    hideAutocomplete();
                });
            });

            autocompleteContainer.style.display = 'block';
        };

        const updateSelection = () => {
            const items = autocompleteContainer.querySelectorAll('.widget-autocomplete-item');
            items.forEach((item, i) => {
                item.classList.toggle('selected', i === selectedIndex);
            });
            // Scroll selected into view
            const selected = autocompleteContainer.querySelector('.selected');
            if (selected) {
                selected.scrollIntoView({ block: 'nearest' });
            }
        };

        const navigateAutocomplete = (direction) => {
            if (autocompleteResults.length === 0) return;
            selectedIndex = Math.max(0, Math.min(autocompleteResults.length - 1, selectedIndex + direction));
            updateSelection();
        };

        // Input event - debounced search
        sensorInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = sensorInput.value.trim().toLowerCase();
                if (query.length < AUTOCOMPLETE_MIN_QUERY) {
                    hideAutocomplete();
                    return;
                }

                // Filter: partial match (contains)
                const matches = sensors
                    .filter(s => s.name.toLowerCase().includes(query))
                    .slice(0, 10);

                showAutocomplete(matches);
            }, 150);
        });

        // Keyboard navigation
        sensorInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                sensorInput.value = '';
                sensorInput.blur();
                hideAutocomplete();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateAutocomplete(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateAutocomplete(-1);
            } else if (e.key === 'Enter') {
                if (autocompleteResults.length > 0) {
                    e.preventDefault();
                    sensorInput.value = autocompleteResults[selectedIndex].name;
                    hideAutocomplete();
                }
            }
        });

        // Focus - show autocomplete if text is present
        sensorInput.addEventListener('focus', () => {
            const query = sensorInput.value.trim().toLowerCase();
            if (query.length >= AUTOCOMPLETE_MIN_QUERY) {
                const matches = sensors
                    .filter(s => s.name.toLowerCase().includes(query))
                    .slice(0, 10);
                showAutocomplete(matches);
            }
        });

        // Click outside to hide
        const clickOutsideHandler = (e) => {
            if (!field.contains(e.target)) {
                hideAutocomplete();
            }
        };
        document.addEventListener('click', clickOutsideHandler);

        // Cleanup on overlay close
        const overlay = document.getElementById('widget-config-overlay');
        if (overlay) {
            const observer = new MutationObserver(() => {
                if (overlay.classList.contains('hidden')) {
                    document.removeEventListener('click', clickOutsideHandler);
                    observer.disconnect();
                }
            });
            observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
        }
    }

    applyWidgetConfig() {
        const content = document.getElementById('widget-config-content');
        if (!content) return;

        const widgetId = content.dataset.widgetId;
        const type = content.dataset.widgetType;
        const WidgetClass = WIDGET_TYPES[type];

        if (!WidgetClass) return;

        const config = WidgetClass.parseConfigForm(content);
        const transparent = content.querySelector('[name="transparent"]')?.checked || false;
        config.transparent = transparent;

        // Read title value
        const title = content.querySelector('[name="title"]')?.value?.trim() || '';
        if (title) {
            config.title = title;
        }

        // Read titleBorder value
        const titleBorder = content.querySelector('[name="titleBorder"]')?.checked || false;
        config.titleBorder = titleBorder;

        // Read rotate value
        const rotateInput = content.querySelector('[name="rotate"]');
        const rotate = parseInt(rotateInput?.value) || 0;
        config.rotate = rotate;

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        if (widgetId) {
            // Update existing widget - keep current size
            const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
            if (widgetConfig) {
                widgetConfig.config = config;
                const width = widgetConfig.position.width;
                const height = widgetConfig.position.height;

                // Re-render widget
                const widget = dashboardState.widgets.get(widgetId);
                if (widget) {
                    widget.config = config;
                    widget.container.className = `dashboard-widget widget-${width}x${height}`;
                    widget.container.classList.toggle('transparent', transparent);
                    // Preserve edit-mode class if active
                    if (dashboardState.editMode) {
                        widget.container.classList.add('edit-mode');
                    }
                    // Apply transform (offset + rotation)
                    const offset = widgetConfig.position?.offset;
                    const transforms = [];
                    if (offset && (offset.x || offset.y)) {
                        transforms.push(`translate(${offset.x || 0}px, ${offset.y || 0}px)`);
                    }
                    if (rotate) {
                        transforms.push(`rotate(${rotate}deg)`);
                    }
                    widget.container.style.transform = transforms.length > 0 ? transforms.join(' ') : '';
                    widget.container.querySelector('.widget-title').textContent = config.label || type;
                    // Remove old title and content before re-render
                    widget.container.querySelector('.widget-title-label')?.remove();
                    widget.container.querySelector('.widget-content')?.remove();
                    widget.render();

                    // Inject title if configured (before widget-content, not inside)
                    if (config.title) {
                        const widgetContent = widget.container.querySelector('.widget-content');
                        if (widgetContent) {
                            const titleEl = document.createElement('div');
                            titleEl.className = 'widget-title-label' + (config.titleBorder ? ' title-badge' : '');
                            titleEl.textContent = config.title;
                            // Insert BEFORE widget-content, not inside it
                            widgetContent.parentNode.insertBefore(titleEl, widgetContent);
                        }
                    }
                }
            }
        } else {
            // Add new widget with default size
            const newId = `widget-${Date.now()}`;
            const width = WidgetClass.defaultSize.width;
            const height = WidgetClass.defaultSize.height;
            const position = this.findEmptyPosition(width, height);

            const widgetConfig = {
                id: newId,
                type,
                position: { ...position, width, height },
                config
            };

            dashboard.widgets = dashboard.widgets || [];
            dashboard.widgets.push(widgetConfig);

            this.createWidget(widgetConfig);
        }

        this.saveDashboard();
        this.updateSensorSubscriptions();
        closeWidgetConfig();
    }

    findEmptyPosition(width, height) {
        // Simple algorithm: find first empty position
        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        const widgets = dashboard?.widgets || [];
        const cols = DASHBOARD_GRID_COLS;

        // Build occupancy grid
        const occupied = new Set();
        widgets.forEach(w => {
            const { col, row, width: w2, height: h } = w.position || {};
            for (let c = col; c < col + w2; c++) {
                for (let r = row; r < row + h; r++) {
                    occupied.add(`${c},${r}`);
                }
            }
        });

        // Find first empty position
        for (let row = 0; row < 100; row++) {
            for (let col = 0; col <= cols - width; col++) {
                let fits = true;
                for (let c = col; c < col + width && fits; c++) {
                    for (let r = row; r < row + height && fits; r++) {
                        if (occupied.has(`${c},${r}`)) {
                            fits = false;
                        }
                    }
                }
                if (fits) {
                    return { col, row };
                }
            }
        }

        return { col: 0, row: 0 };
    }

    async removeWidget(widgetId) {
        const confirmed = await showConfirmDialog(
            'Remove Widget',
            'Are you sure you want to remove this widget?',
            'Remove'
        );
        if (!confirmed) return;

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        // Remove from config
        dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);

        // Remove widget instance
        const widget = dashboardState.widgets.get(widgetId);
        if (widget) {
            widget.container.remove();
            widget.destroy();
            dashboardState.widgets.delete(widgetId);
        }

        this.saveDashboard();
        this.updateSensorSubscriptions();
    }

    startResize(widgetId, container, startEvent) {
        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
        if (!widgetConfig) return;

        const gridRect = this.gridEl.getBoundingClientRect();
        const startX = startEvent.clientX;
        const startY = startEvent.clientY;
        const startWidth = widgetConfig.position.width || 2;
        const startHeight = widgetConfig.position.height || 1;

        // Calculate cell size
        const gap = DASHBOARD_GRID_GAP;
        const cellWidth = (gridRect.width - gap * (DASHBOARD_GRID_COLS - 1)) / DASHBOARD_GRID_COLS;
        const cellHeight = DASHBOARD_GRID_ROW_HEIGHT;

        container.classList.add('resizing');

        const onMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // Calculate new size in cells
            const col = widgetConfig.position.col || 0;
            const maxWidth = DASHBOARD_GRID_COLS - col; // Can't extend beyond grid
            let newWidth = Math.max(1, Math.min(maxWidth, Math.round(startWidth + deltaX / (cellWidth + gap))));
            let newHeight = Math.max(1, Math.min(20, Math.round(startHeight + deltaY / (cellHeight + gap))));

            // Update visual preview
            container.style.gridColumn = `${(widgetConfig.position.col || 0) + 1} / span ${newWidth}`;
            container.style.gridRow = `${(widgetConfig.position.row || 0) + 1} / span ${newHeight}`;

            // Store pending size
            container.dataset.pendingWidth = newWidth;
            container.dataset.pendingHeight = newHeight;
        };

        const onMouseUp = () => {
            container.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Apply new size
            const newWidth = parseInt(container.dataset.pendingWidth) || startWidth;
            const newHeight = parseInt(container.dataset.pendingHeight) || startHeight;

            if (newWidth !== startWidth || newHeight !== startHeight) {
                widgetConfig.position.width = newWidth;
                widgetConfig.position.height = newHeight;

                // Update class
                container.className = container.className.replace(/widget-\d+x\d+/, `widget-${newWidth}x${newHeight}`);

                this.saveDashboard();
            }

            delete container.dataset.pendingWidth;
            delete container.dataset.pendingHeight;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    startDrag(widgetId, container, startEvent) {
        // Auto-select widget being dragged
        if (dashboardState.selectedWidgetId !== widgetId) {
            this.selectWidget(widgetId);
        }

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
        if (!widgetConfig) return;

        const gridRect = this.gridEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(this.gridEl);
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;

        // Offset from mouse to container top-left
        const offsetX = startEvent.clientX - containerRect.left;
        const offsetY = startEvent.clientY - containerRect.top;

        // Calculate cell size (grid content area = width minus padding on both sides)
        const gap = DASHBOARD_GRID_GAP;
        const contentWidth = gridRect.width - paddingLeft * 2;
        const cellWidth = (contentWidth - gap * (DASHBOARD_GRID_COLS - 1)) / DASHBOARD_GRID_COLS;
        const cellHeight = DASHBOARD_GRID_ROW_HEIGHT;

        const width = widgetConfig.position.width || 2;
        const height = widgetConfig.position.height || 1;

        // Switch to absolute positioning for smooth drag
        container.classList.add('dragging');
        container.style.position = 'fixed';
        container.style.width = `${containerRect.width}px`;
        container.style.height = `${containerRect.height}px`;
        container.style.left = `${containerRect.left}px`;
        container.style.top = `${containerRect.top}px`;
        container.style.zIndex = '1000';
        container.style.gridColumn = '';
        container.style.gridRow = '';

        // Create placeholder with actual widget size (absolute positioning)
        const placeholder = document.createElement('div');
        placeholder.className = 'widget-drag-placeholder';
        placeholder.style.position = 'absolute';
        placeholder.style.width = `${containerRect.width}px`;
        placeholder.style.height = `${containerRect.height}px`;
        // Initial position (use freePosition if available, otherwise calculate from grid)
        const initCol = widgetConfig.position.col || 0;
        const initRow = widgetConfig.position.row || 0;
        const freePos = widgetConfig.position.freePosition;
        if (freePos) {
            placeholder.style.left = `${freePos.left}px`;
            placeholder.style.top = `${freePos.top}px`;
        } else {
            placeholder.style.left = `${initCol * (cellWidth + gap)}px`;
            placeholder.style.top = `${initRow * (cellHeight + gap)}px`;
        }
        this.gridEl.appendChild(placeholder);

        let pendingCol = initCol;
        let pendingRow = initRow;
        let pendingFreePosition = null;
        let isShiftHeld = startEvent.shiftKey;

        const onMouseMove = (e) => {
            // Move container with mouse
            const widgetLeft = e.clientX - offsetX;
            const widgetTop = e.clientY - offsetY;
            container.style.left = `${widgetLeft}px`;
            container.style.top = `${widgetTop}px`;

            isShiftHeld = e.shiftKey;

            // Calculate position relative to grid content area
            const relativeLeft = widgetLeft - gridRect.left - paddingLeft;
            const relativeTop = widgetTop - gridRect.top - paddingTop;

            if (isShiftHeld) {
                // Free pixel positioning (Shift held)
                // Only store left/top, size comes from width/height (grid cells)
                placeholder.style.display = 'none';
                pendingFreePosition = {
                    left: Math.max(0, relativeLeft),
                    top: Math.max(0, relativeTop)
                };
            } else {
                // Grid snap mode
                placeholder.style.display = '';
                pendingFreePosition = null;

                let newCol = Math.floor(relativeLeft / (cellWidth + gap));
                let newRow = Math.floor(relativeTop / (cellHeight + gap));

                // Clamp to grid bounds
                newCol = Math.max(0, Math.min(DASHBOARD_GRID_COLS - width, newCol));
                newRow = Math.max(0, newRow);

                if (newCol !== pendingCol || newRow !== pendingRow) {
                    pendingCol = newCol;
                    pendingRow = newRow;
                    placeholder.style.left = `${newCol * (cellWidth + gap)}px`;
                    placeholder.style.top = `${newRow * (cellHeight + gap)}px`;
                }
            }
        };

        const onMouseUp = (e) => {
            container.classList.remove('dragging');
            container.classList.remove('free-position');
            container.style.position = '';
            container.style.width = '';
            container.style.height = '';
            container.style.left = '';
            container.style.top = '';
            container.style.zIndex = '';

            placeholder.remove();

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            const useFreePosition = e.shiftKey && pendingFreePosition;

            if (useFreePosition) {
                // Apply free pixel position with size
                widgetConfig.position.freePosition = pendingFreePosition;
                container.style.position = 'absolute';
                container.style.left = `${pendingFreePosition.left}px`;
                container.style.top = `${pendingFreePosition.top}px`;
                container.style.width = `${pendingFreePosition.width}px`;
                container.style.height = `${pendingFreePosition.height}px`;
                container.classList.add('free-position');
                this.saveDashboard();
            } else {
                // Clear free position and apply grid snap
                delete widgetConfig.position.freePosition;

                if (pendingCol !== widgetConfig.position.col || pendingRow !== widgetConfig.position.row) {
                    widgetConfig.position.col = pendingCol;
                    widgetConfig.position.row = pendingRow;
                    this.saveDashboard();
                }

                container.style.gridColumn = `${pendingCol + 1} / span ${width}`;
                container.style.gridRow = `${pendingRow + 1} / span ${height}`;
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    toggleEditMode() {
        dashboardState.editMode = !dashboardState.editMode;
        document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', {
            detail: { editMode: dashboardState.editMode }
        }));

        const editBtn = document.getElementById('dashboard-edit-btn');
        editBtn?.classList.toggle('active', dashboardState.editMode);

        this.gridEl?.classList.toggle('edit-mode', dashboardState.editMode);

        dashboardState.widgets.forEach((widget, id) => {
            widget.container.classList.toggle('edit-mode', dashboardState.editMode);
        });

        if (dashboardState.editMode) {
            this.enableDragAndDrop();
        } else {
            this.disableDragAndDrop();
            // Deselect widget when exiting edit mode
            this.selectWidget(null);
        }
    }

    selectWidget(widgetId) {
        // Deselect previous
        if (dashboardState.selectedWidgetId) {
            const prevWidget = dashboardState.widgets.get(dashboardState.selectedWidgetId);
            prevWidget?.container.classList.remove('selected');
        }

        dashboardState.selectedWidgetId = widgetId;

        // Select new
        if (widgetId) {
            const widget = dashboardState.widgets.get(widgetId);
            widget?.container.classList.add('selected');
        }
    }

    moveWidgetByKey(key, fineMode = false) {
        const widgetId = dashboardState.selectedWidgetId;
        if (!widgetId) return;

        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        if (!dashboard) return;

        const widgetConfig = dashboard.widgets.find(w => w.id === widgetId);
        if (!widgetConfig) return;

        const widget = dashboardState.widgets.get(widgetId);
        if (!widget) return;

        const container = widget.container;

        // Calculate grid parameters
        const gridRect = this.gridEl.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(this.gridEl);
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const gap = DASHBOARD_GRID_GAP;
        const contentWidth = gridRect.width - paddingLeft * 2;
        const cellWidth = (contentWidth - gap * (DASHBOARD_GRID_COLS - 1)) / DASHBOARD_GRID_COLS;
        const cellHeight = DASHBOARD_GRID_ROW_HEIGHT;

        const width = widgetConfig.position.width || 2;
        const height = widgetConfig.position.height || 1;

        if (fineMode) {
            // Fine mode (Shift): move by 1px using freePosition
            // freePosition only stores left/top, size comes from width/height (grid cells)
            let freePos = widgetConfig.position.freePosition;
            if (!freePos) {
                // Convert grid position to pixels
                const col = widgetConfig.position.col || 0;
                const row = widgetConfig.position.row || 0;
                freePos = {
                    left: col * (cellWidth + gap),
                    top: row * (cellHeight + gap)
                };
            }

            const step = 1;
            switch (key) {
                case 'ArrowUp':
                    freePos.top = Math.max(0, freePos.top - step);
                    break;
                case 'ArrowDown':
                    freePos.top = freePos.top + step;
                    break;
                case 'ArrowLeft':
                    freePos.left = Math.max(0, freePos.left - step);
                    break;
                case 'ArrowRight':
                    freePos.left = freePos.left + step;
                    break;
            }

            // Apply free position
            widgetConfig.position.freePosition = freePos;
            container.style.position = 'absolute';
            container.style.left = `${freePos.left}px`;
            container.style.top = `${freePos.top}px`;
            container.classList.add('free-position');
            container.style.gridColumn = '';
            container.style.gridRow = '';
        } else {
            // Grid mode (default): move by one grid cell
            let col = widgetConfig.position.col || 0;
            let row = widgetConfig.position.row || 0;

            switch (key) {
                case 'ArrowUp':
                    row = Math.max(0, row - 1);
                    break;
                case 'ArrowDown':
                    row = row + 1;
                    break;
                case 'ArrowLeft':
                    col = Math.max(0, col - 1);
                    break;
                case 'ArrowRight':
                    col = Math.min(DASHBOARD_GRID_COLS - width, col + 1);
                    break;
            }

            // Update grid position
            widgetConfig.position.col = col;
            widgetConfig.position.row = row;

            // Clear free position if was set
            delete widgetConfig.position.freePosition;

            // Apply grid positioning
            container.style.position = '';
            container.style.left = '';
            container.style.top = '';
            container.classList.remove('free-position');
            container.style.gridColumn = `${col + 1} / span ${width}`;
            container.style.gridRow = `${row + 1} / span ${height}`;
        }

        this.saveDashboard();
    }

    enableDragAndDrop() {
        // Сохраняем bound handlers, чтобы disableDragAndDrop мог их снять.
        // Без этого listeners накапливались при каждом toggle edit-mode.
        this._dndHandlers = this._dndHandlers || new Map(); // widgetId -> {dragstart, dragend}

        dashboardState.widgets.forEach((widget, id) => {
            widget.container.draggable = true;
            // Если уже было повешено (повторный enable без disable) — не дублируем.
            if (this._dndHandlers.has(id)) return;

            const onDragStart = (e) => {
                e.dataTransfer.setData('text/plain', id);
                widget.container.classList.add('dragging');
            };
            const onDragEnd = () => {
                widget.container.classList.remove('dragging');
            };
            widget.container.addEventListener('dragstart', onDragStart);
            widget.container.addEventListener('dragend', onDragEnd);
            this._dndHandlers.set(id, { onDragStart, onDragEnd });
        });

        if (this.gridEl && !this._gridDndHandlers) {
            const onDragOver = (e) => e.preventDefault();
            const onDrop = (e) => {
                e.preventDefault();
                // TODO: Implement grid position calculation
            };
            this.gridEl.addEventListener('dragover', onDragOver);
            this.gridEl.addEventListener('drop', onDrop);
            this._gridDndHandlers = { onDragOver, onDrop };
        }
    }

    disableDragAndDrop() {
        dashboardState.widgets.forEach((widget, id) => {
            widget.container.draggable = false;
            const handlers = this._dndHandlers?.get(id);
            if (handlers) {
                widget.container.removeEventListener('dragstart', handlers.onDragStart);
                widget.container.removeEventListener('dragend', handlers.onDragEnd);
                this._dndHandlers.delete(id);
            }
        });
        if (this.gridEl && this._gridDndHandlers) {
            this.gridEl.removeEventListener('dragover', this._gridDndHandlers.onDragOver);
            this.gridEl.removeEventListener('drop', this._gridDndHandlers.onDrop);
            this._gridDndHandlers = null;
        }
    }

    updateSensorSubscriptions() {
        dashboardState.sensorSubscriptions.clear();
        dashboardState.setpointSubscriptions.clear();
        dashboardState.chartSubscriptions.clear();

        // Helper: добавить (key, id) в Map<key, Set<id>>
        const addSub = (map, key, id) => {
            if (!map.has(key)) map.set(key, new Set());
            map.get(key).add(id);
        };

        dashboardState.widgets.forEach((widget, id) => {
            const cfg = widget.config;
            if (!cfg) return;
            const serverId = cfg.serverId;
            const objectName = cfg.objectName;

            // Main sensor subscription. Без serverId+objectName ключ не строим
            // (legacy widget — миграция заполнит на следующем load).
            if (cfg.sensor && serverId && objectName) {
                addSub(dashboardState.sensorSubscriptions,
                    makeSensorKey(serverId, objectName, cfg.sensor), id);
            }

            // Setpoint sensor subscription (sensor2 — может иметь свой objectName2).
            if (cfg.sensor2 && serverId) {
                const obj2 = cfg.objectName2 || objectName;
                if (obj2) {
                    addSub(dashboardState.setpointSubscriptions,
                        makeSensorKey(serverId, obj2, cfg.sensor2), id);
                }
            }

            // StatusBar items (multiple sensors).
            if (Array.isArray(cfg.items) && serverId && objectName) {
                cfg.items.forEach(item => {
                    if (item?.sensor) {
                        addSub(dashboardState.sensorSubscriptions,
                            makeSensorKey(serverId, objectName, item.sensor), id);
                    }
                });
            }

            // Chart widget subscriptions (multiple sensors from zones).
            if (widget instanceof ChartWidget && typeof widget.getSensorNames === 'function'
                    && serverId && objectName) {
                const sensorNames = widget.getSensorNames();
                for (const sensorName of sensorNames) {
                    addSub(dashboardState.chartSubscriptions,
                        makeSensorKey(serverId, objectName, sensorName), id);
                }
            }
        });

        // Backend-side IONC subscribe для active widget'ов. Без этого
        // BasePoller.poll() видит пустой subscriptions snapshot и не делает
        // poll объекта → SSE не приходит → widget вечно показывает '--'.
        // Chart-renderers подписываются через subscribeToIONCSensor(); active
        // dashboard widgets раньше полагались на side-effect от других
        // подписчиков (object открыт во вкладке Objects). Если ни один tab
        // объект не открыт — active widget оставался без данных. Этот call
        // решает проблему явно.
        this._subscribeActiveSensorsBackend();
    }

    // Группирует sensorId'ы по (serverId, objectName) и шлёт POST
    // /api/objects/{name}/ionc/subscribe?server={id} { sensor_ids: [...] }.
    // Subscribe идёмpotent на backend (Subscribe просто добавляет в Map),
    // поэтому повторные вызовы при редактировании безопасны.
    // Unsubscribe не делаем сознательно: backend подписки shared между
    // viewer'ами, и dashboard'у нельзя «отписать чужие».
    _subscribeActiveSensorsBackend() {
        // grpKey = `${serverId}|${objectName}` → Set<sensorId>.
        const groups = new Map();

        const collect = (cfg) => {
            if (!cfg?.serverId || !cfg?.objectName) return;
            const ids = [];
            if (Number.isFinite(cfg.sensorId))  ids.push(cfg.sensorId);
            if (Number.isFinite(cfg.sensorId2)) ids.push(cfg.sensorId2);
            if (Array.isArray(cfg.items)) {
                cfg.items.forEach(it => {
                    if (Number.isFinite(it?.sensorId)) ids.push(it.sensorId);
                });
            }
            if (ids.length === 0) return;
            const k = `${cfg.serverId}|${cfg.objectName}`;
            if (!groups.has(k)) groups.set(k, new Set());
            ids.forEach(id => groups.get(k).add(id));
        };

        dashboardState.widgets.forEach(widget => collect(widget?.config));

        for (const [grpKey, idSet] of groups) {
            const sepIdx = grpKey.indexOf('|');
            const serverId   = grpKey.slice(0, sepIdx);
            const objectName = grpKey.slice(sepIdx + 1);
            const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/subscribe`
                + `?server=${encodeURIComponent(serverId)}`;
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_ids: Array.from(idSet) })
            }).catch(err => console.warn('dashboard: subscribe failed', grpKey, err));
        }
    }

    handleSensorUpdate(sensorKey, value, error = null, timestamp = null) {
        // sensorKey = ${serverId}|${objectName}|${sensorName} — canonical identity.
        // Извлекаем sensorName для legacy callbacks (updateBySensor / updateSensor),
        // которые внутри widget'ов всё ещё работают с короткими именами.
        const parsed = (typeof parseSensorKey === 'function') ? parseSensorKey(sensorKey) : null;
        const sensorName = parsed?.sensorName ?? sensorKey;

        // Main sensor updates
        const widgetIds = dashboardState.sensorSubscriptions.get(sensorKey);
        if (widgetIds) {
            widgetIds.forEach(id => {
                const widget = dashboardState.widgets.get(id);
                if (widget) {
                    // StatusBar widget uses updateBySensor for items
                    if (typeof widget.updateBySensor === 'function') {
                        widget.updateBySensor(sensorName, value, error);
                    } else {
                        widget.update(value, error);
                    }
                }
            });
        }

        // Setpoint sensor updates
        const setpointWidgetIds = dashboardState.setpointSubscriptions.get(sensorKey);
        if (setpointWidgetIds) {
            setpointWidgetIds.forEach(id => {
                const widget = dashboardState.widgets.get(id);
                if (widget && typeof widget.updateSetpoint === 'function') {
                    widget.updateSetpoint(value, error);
                }
            });
        }

        // Chart widget updates
        const chartWidgetIds = dashboardState.chartSubscriptions.get(sensorKey);
        if (chartWidgetIds) {
            chartWidgetIds.forEach(id => {
                const widget = dashboardState.widgets.get(id);
                if (widget && typeof widget.updateSensor === 'function') {
                    widget.updateSensor(sensorName, value, timestamp);
                }
            });
        }
    }

    exportDashboard() {
        const name = dashboardState.currentDashboard;
        if (!name) return;

        const config = dashboardState.dashboards.get(name);
        if (!config) return;

        // Create clean export (remove internal flags)
        const exportConfig = JSON.parse(JSON.stringify(config));
        delete exportConfig._server;

        const blob = new Blob([JSON.stringify(exportConfig, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    setupImportDropzone() {
        const dropzone = document.getElementById('import-dropzone');
        const fileInput = document.getElementById('import-file-input');

        if (!dropzone || !fileInput) return;

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');

            const file = e.dataTransfer.files[0];
            if (file) this.handleImportFile(file);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleImportFile(file);
        });

        // Import mode toggle
        document.querySelectorAll('[name="import-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const nameField = document.getElementById('import-name-field');
                if (radio.value === 'new') {
                    nameField?.classList.remove('hidden');
                } else {
                    nameField?.classList.add('hidden');
                }
            });
        });
    }

    handleImportFile(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);

                // Validate
                if (!config.widgets || !Array.isArray(config.widgets)) {
                    throw new Error('Invalid dashboard format: missing widgets array');
                }

                // Migrate if needed
                const migrated = migrateDashboard(config);

                dashboardState.pendingImport = migrated;

                // Update UI
                const dropzone = document.getElementById('import-dropzone');
                dropzone?.classList.add('has-file');
                dropzone.querySelector('p').textContent = `${file.name} (${config.widgets.length} widgets)`;

                const nameInput = document.getElementById('import-name-input');
                if (nameInput) {
                    nameInput.value = config.meta?.name || file.name.replace('.json', '');
                }

                document.getElementById('import-confirm').disabled = false;
                document.getElementById('import-error')?.classList.add('hidden');

            } catch (err) {
                const errorEl = document.getElementById('import-error');
                if (errorEl) {
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                }
                document.getElementById('import-confirm').disabled = true;
            }
        };

        reader.readAsText(file);
    }

    showImportDialog() {
        const overlay = document.getElementById('dashboard-import-overlay');
        const dropzone = document.getElementById('import-dropzone');

        // Reset state
        dashboardState.pendingImport = null;
        dropzone?.classList.remove('has-file');
        if (dropzone) dropzone.querySelector('p').textContent = 'Drop JSON file here or click to browse';
        document.getElementById('import-confirm').disabled = true;
        document.getElementById('import-error')?.classList.add('hidden');
        document.getElementById('import-file-input').value = '';

        overlay?.classList.remove('hidden');
    }

    confirmImport() {
        if (!dashboardState.pendingImport) return;

        const mode = document.querySelector('[name="import-mode"]:checked')?.value;
        let name;

        if (mode === 'replace' && dashboardState.currentDashboard) {
            name = dashboardState.currentDashboard;
        } else {
            name = document.getElementById('import-name-input')?.value?.trim();
            if (!name) {
                alert('Please enter a dashboard name');
                return;
            }
        }

        const config = dashboardState.pendingImport;
        config.meta = config.meta || {};
        config.meta.name = name;
        config.meta.modified = new Date().toISOString();

        dashboardState.dashboards.set(name, config);
        this.saveDashboard(name);
        this.updateDashboardSelector();

        closeDashboardImport();

        // Load imported dashboard
        if (this.selectEl) {
            this.selectEl.value = name;
        }
        this.loadDashboard(name);
    }

    deleteDashboard() {
        const name = dashboardState.currentDashboard;
        if (!name) return;

        const config = dashboardState.dashboards.get(name);
        if (config?._server) {
            alert('Cannot delete server dashboards');
            return;
        }

        if (!confirm(`Delete dashboard "${name}"?`)) return;

        dashboardState.dashboards.delete(name);
        localStorage.removeItem(`dashboard:${name}`);

        // Update user dashboards list
        const userDashboards = Array.from(dashboardState.dashboards.entries())
            .filter(([_, c]) => !c._server)
            .map(([n]) => n);
        localStorage.setItem('user-dashboards', JSON.stringify(userDashboards));

        this.updateDashboardSelector();
        this.clearDashboard();
    }
}

// Dashboard migration

// ============================================================================
// DEBUG: регистрация test-only виджета для e2e тестов базового класса.
// Только Playwright-тесты вызывают это. Не использовать в production.
// ============================================================================
window.__DEBUG_REGISTER_TEST_WIDGET = function () {
    if (WIDGET_TYPES['test-active']) return;

    class TestActiveWidget extends ActiveDashboardWidget {
        static type = 'test-active';
        static displayName = 'TEST Active';
        static description = 'TEST-ONLY: smoke widget for ActiveDashboardWidget base';
        static icon = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg>';
        static defaultSize = { width: 4, height: 2 };

        render() {
            this.element = document.createElement('div');
            this.element.className = 'widget-content test-active-widget';
            this.element.innerHTML = `
                <button class="test-active-btn" data-test="write-btn">SET 42</button>
                <div class="test-active-feedback" data-test="feedback">--</div>
                <div class="test-active-command" data-test="command">--</div>
                <div class="test-active-state" data-test="state">idle</div>
            `;
            this.container.appendChild(this.element);

            this.element.querySelector('[data-test="write-btn"]').addEventListener('click', () => {
                this.writeValue(42);
            });
        }

        renderCommand() {
            const el = this.element?.querySelector('[data-test="command"]');
            if (el) el.textContent = String(this.commandValue ?? '--');
            const stateEl = this.element?.querySelector('[data-test="state"]');
            if (stateEl) stateEl.textContent = this.writeState;
        }

        renderFeedback() {
            const el = this.element?.querySelector('[data-test="feedback"]');
            if (el) el.textContent = String(this.feedbackValue ?? '--');
        }

        static getActiveConfigFields() { return ''; }
        static parseActiveConfigFields() { return {}; }
    }

    WIDGET_TYPES['test-active'] = TestActiveWidget;
};


// === 63-dashboard-dialogs.js ===
function migrateDashboard(dashboard) {
    let version = dashboard.version || 0;

    // Future migrations will be added here
    // if (version < 2) { ... }

    dashboard.version = DASHBOARD_VERSION;
    return dashboard;
}

// Dialog close functions
function closeWidgetPicker() {
    document.getElementById('widget-picker-overlay')?.classList.add('hidden');
}

function closeWidgetConfig() {
    document.getElementById('widget-config-overlay')?.classList.add('hidden');
}

function closeDashboardNameDialog() {
    document.getElementById('dashboard-name-overlay')?.classList.add('hidden');
}

function closeDashboardImport() {
    document.getElementById('dashboard-import-overlay')?.classList.add('hidden');
    dashboardState.pendingImport = null;
}

// Confirm Dialog
function showConfirmDialog(title, message, okText = 'OK') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-dialog-overlay');
        const titleEl = document.getElementById('confirm-dialog-title');
        const messageEl = document.getElementById('confirm-dialog-message');
        const okBtn = document.getElementById('confirm-dialog-ok');
        const cancelBtn = document.getElementById('confirm-dialog-cancel');

        if (!overlay) {
            resolve(false);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = okText;

        const cleanup = () => {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlayClick);
        };

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const onOverlayClick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlayClick);

        overlay.classList.remove('hidden');
    });
}

// Setup custom number inputs with arrow buttons
function setupNumberInputs(container) {
    const numberInputs = container.querySelectorAll('input[type="number"]');
    numberInputs.forEach(input => {
        // Skip if already wrapped
        if (input.parentElement.classList.contains('widget-number-wrapper')) return;

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'widget-number-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        // Create arrow buttons
        const arrows = document.createElement('div');
        arrows.className = 'widget-number-arrows';
        arrows.innerHTML = `
            <button type="button" class="widget-number-arrow up">
                <svg viewBox="0 0 10 10"><path d="M2 7 L5 3 L8 7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <button type="button" class="widget-number-arrow down">
                <svg viewBox="0 0 10 10"><path d="M2 3 L5 7 L8 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
        `;
        wrapper.appendChild(arrows);

        // Arrow button handlers
        const step = parseFloat(input.step) || 1;
        arrows.querySelector('.up').addEventListener('click', (e) => {
            e.preventDefault();
            input.stepUp();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        arrows.querySelector('.down').addEventListener('click', (e) => {
            e.preventDefault();
            input.stepDown();
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

// Toggle dual scale fields visibility based on style selection
function toggleDualScaleFields(select) {
    const dualFields = select.closest('.widget-config-form, #widget-config-content')?.querySelector('.dual-scale-fields');
    if (dualFields) {
        dualFields.style.display = select.value === 'dual' ? 'block' : 'none';
    }
}

// Zone field helpers
function addZoneField(btn) {
    const zonesList = btn.closest('.zones-editor').querySelector('.zones-list');
    if (!zonesList) return;

    // Get min/max from the config form
    const form = btn.closest('.widget-config-form') || btn.closest('#widget-config-content');
    const minInput = form?.querySelector('[name="min"]');
    const maxInput = form?.querySelector('[name="max"]');
    const min = parseFloat(minInput?.value) || 0;
    const max = parseFloat(maxInput?.value) || 100;

    const index = zonesList.children.length;
    const zoneHtml = `
        <div class="zone-item">
            <input type="color" class="zone-color" name="zone-color-${index}" value="#ef4444">
            <div class="zone-inputs">
                <input type="number" class="zone-input" name="zone-from-${index}" value="${min}" placeholder="From">
                <span class="zone-separator">→</span>
                <input type="number" class="zone-input" name="zone-to-${index}" value="${max}" placeholder="To">
            </div>
            <button type="button" class="zone-remove-btn" onclick="removeZoneField(this)">×</button>
        </div>
    `;
    zonesList.insertAdjacentHTML('beforeend', zoneHtml);
}

function removeZoneField(btn) {
    btn.closest('.zone-item')?.remove();
}

// ============================================================================
// Chart Widget Zone Helpers
// ============================================================================

function addChartZone() {
    const editor = document.getElementById('chart-zones-editor');
    if (!editor) return;

    const zoneIdx = editor.querySelectorAll('.chart-zone-editor').length;
    const zoneHtml = ChartWidget.renderZoneEditor({ id: `zone-${zoneIdx}`, sensors: [] }, zoneIdx);
    editor.insertAdjacentHTML('beforeend', zoneHtml);

    // Setup autocomplete for new zone
    setupChartSensorAutocomplete(zoneIdx);
}

function removeChartZone(zoneIdx) {
    const editor = document.querySelector(`.chart-zone-editor[data-zone-idx="${zoneIdx}"]`);
    editor?.remove();

    // Re-index remaining zones
    document.querySelectorAll('.chart-zone-editor').forEach((zone, idx) => {
        zone.dataset.zoneIdx = idx;
        zone.querySelector('.chart-zone-title').textContent = `Zone ${idx + 1}`;
        // Update remove button
        const removeBtn = zone.querySelector('.zone-remove-btn');
        if (removeBtn) {
            removeBtn.onclick = () => removeChartZone(idx);
        }
    });
}

function removeChartSensor(zoneIdx, sensorIdx) {
    const row = document.querySelector(`.chart-sensor-row[data-zone-idx="${zoneIdx}"][data-sensor-idx="${sensorIdx}"]`);
    row?.remove();

    // Re-index remaining sensors in this zone
    const sensorsContainer = document.getElementById(`chart-zone-sensors-${zoneIdx}`);
    if (sensorsContainer) {
        sensorsContainer.querySelectorAll('.chart-sensor-row').forEach((row, idx) => {
            row.dataset.sensorIdx = idx;
            // Update hidden inputs names
            row.querySelectorAll('input[type="hidden"]').forEach(input => {
                const nameParts = input.name.split('-');
                nameParts[2] = idx;
                input.name = nameParts.join('-');
            });
        });
    }
}

function updateChartSensorColor(zoneIdx, sensorIdx, color) {
    const row = document.querySelector(`.chart-sensor-row[data-zone-idx="${zoneIdx}"][data-sensor-idx="${sensorIdx}"]`);
    const colorInput = row?.querySelector('input[name$="-color"]');
    if (colorInput) {
        colorInput.value = color;
    }
}

function setupChartSensorAutocomplete(zoneIdx) {
    const input = document.querySelector(`.chart-sensor-input[data-zone-idx="${zoneIdx}"]`);
    if (!input) return;

    let autocompleteContainer = null;
    let autocompleteResults = [];
    let selectedIndex = 0;

    input.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            closeAutocomplete();
            return;
        }

        // Search sensors (use sensorsByName to avoid duplicates from multiple servers)
        const allSensors = Array.from(state.sensorsByName.values());
        autocompleteResults = allSensors
            .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10);

        if (autocompleteResults.length === 0) {
            closeAutocomplete();
            return;
        }

        showAutocomplete();
    });

    input.addEventListener('keydown', (e) => {
        if (!autocompleteContainer) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, autocompleteResults.length - 1);
            updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (autocompleteResults[selectedIndex]) {
                selectSensor(autocompleteResults[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            closeAutocomplete();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(closeAutocomplete, 200);
    });

    function showAutocomplete() {
        if (!autocompleteContainer) {
            autocompleteContainer = document.createElement('div');
            autocompleteContainer.className = 'widget-autocomplete';
            input.parentNode.style.position = 'relative';
            input.parentNode.appendChild(autocompleteContainer);
        }

        selectedIndex = 0;
        autocompleteContainer.innerHTML = autocompleteResults.map((s, i) => `
            <div class="widget-autocomplete-item${i === 0 ? ' selected' : ''}" data-name="${escapeAttr(s.name)}">
                <span class="autocomplete-name">${escapeHtml(s.name)}</span>
                ${s.textname ? `<span class="autocomplete-desc">${escapeHtml(s.textname)}</span>` : ''}
            </div>
        `).join('');

        autocompleteContainer.querySelectorAll('.widget-autocomplete-item').forEach((item, i) => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectSensor(autocompleteResults[i]);
            });
        });
    }

    function updateSelection() {
        autocompleteContainer?.querySelectorAll('.widget-autocomplete-item').forEach((item, i) => {
            item.classList.toggle('selected', i === selectedIndex);
        });
    }

    function closeAutocomplete() {
        autocompleteContainer?.remove();
        autocompleteContainer = null;
    }

    function selectSensor(sensor) {
        // Add sensor to zone
        const sensorsContainer = document.getElementById(`chart-zone-sensors-${zoneIdx}`);
        if (!sensorsContainer) return;

        // Check if sensor is discrete (DI/DO) - set stepped=true, smooth=false
        const isDiscrete = sensor.iotype === 'DI' || sensor.iotype === 'DO';
        const sensorConfig = {
            name: sensor.name,
            fill: true,
            smooth: !isDiscrete,  // smooth off for discrete
            stepped: isDiscrete   // stepped on for discrete
        };

        const sensorIdx = sensorsContainer.querySelectorAll('.chart-sensor-row').length;
        const sensorHtml = ChartWidget.renderSensorRow(sensorConfig, zoneIdx, sensorIdx);
        sensorsContainer.insertAdjacentHTML('beforeend', sensorHtml);

        // Clear input
        input.value = '';
        closeAutocomplete();
    }
}

// Setup autocomplete when widget config dialog opens for chart widget
function setupChartWidgetAutocomplete() {
    const zoneEditors = document.querySelectorAll('.chart-zone-editor');
    zoneEditors.forEach((editor) => {
        const zoneIdx = parseInt(editor.dataset.zoneIdx);
        setupChartSensorAutocomplete(zoneIdx);
    });
}

// ============================================================================
// Add to Dashboard Dialog
// ============================================================================

// State for add-to-dashboard dialog
let addToDashboardState = {
    sensorName: null,
    sensorLabel: null,
    selectedType: 'gauge'
};

function closeAddToDashboard() {
    document.getElementById('add-to-dashboard-overlay')?.classList.add('hidden');
    addToDashboardState.sensorName = null;
    addToDashboardState.sensorLabel = null;
}

function showAddToDashboardDialog(sensorName, sensorLabel = null) {
    const overlay = document.getElementById('add-to-dashboard-overlay');
    const sensorNameEl = document.getElementById('add-to-dashboard-sensor-name');
    const selectEl = document.getElementById('add-to-dashboard-select');
    const typesEl = document.getElementById('add-to-dashboard-types');
    const newNameField = document.getElementById('new-dashboard-name-field');
    const newNameInput = document.getElementById('add-to-dashboard-new-name');
    const okBtn = document.getElementById('add-to-dashboard-ok');

    if (!overlay || !selectEl || !typesEl) return;

    // Store sensor info
    addToDashboardState.sensorName = sensorName;
    addToDashboardState.sensorLabel = sensorLabel || sensorName;
    addToDashboardState.selectedType = 'gauge';

    // Show sensor name
    sensorNameEl.textContent = sensorLabel || sensorName;

    // Populate dashboard select
    selectEl.innerHTML = '<option value="__new__">+ Create New Dashboard</option>';

    // Add user dashboards (editable)
    for (const [name, dashboard] of dashboardState.dashboards) {
        // Skip server dashboards (they're read-only)
        if (!dashboardState.serverDashboards.some(sd => sd.meta?.name === name)) {
            selectEl.innerHTML += `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`;
        }
    }

    // Handle select change
    selectEl.onchange = () => {
        if (selectEl.value === '__new__') {
            newNameField.style.display = 'block';
            newNameInput.focus();
        } else {
            newNameField.style.display = 'none';
        }
    };

    // Populate widget types
    const widgetTypes = [
        { type: 'gauge', name: 'Gauge', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
        { type: 'level', name: 'Level', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><rect x="8" y="10" width="8" height="10" fill="currentColor" opacity="0.3"/></svg>' },
        { type: 'led', name: 'LED', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>' },
        { type: 'label', name: 'Label', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><text x="12" y="16" text-anchor="middle" font-size="12" fill="currentColor">Aa</text></svg>' },
        { type: 'divider', name: 'Divider', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/></svg>' },
        { type: 'statusbar', name: 'Status Bar', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="3" fill="#22c55e"/><circle cx="12" cy="12" r="3" fill="#ef4444"/><circle cx="19" cy="12" r="3" fill="#6b7280"/></svg>' },
        { type: 'bargraph', name: 'Bar Graph', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="14" width="4" height="6" fill="currentColor" opacity="0.7"/><rect x="10" y="8" width="4" height="12" fill="currentColor" opacity="0.5"/><rect x="16" y="4" width="4" height="16" fill="currentColor" opacity="0.3"/></svg>' },
        { type: 'digital', name: 'Digital', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="8" fill="currentColor">123</text></svg>' }
    ];

    typesEl.innerHTML = widgetTypes.map(w => `
        <div class="add-to-dashboard-type ${w.type === addToDashboardState.selectedType ? 'selected' : ''}"
             data-type="${w.type}">
            <span class="widget-type-icon">${w.icon}</span>
            <span class="widget-type-name">${w.name}</span>
        </div>
    `).join('');

    // Handle type selection
    typesEl.querySelectorAll('.add-to-dashboard-type').forEach(el => {
        el.addEventListener('click', () => {
            typesEl.querySelectorAll('.add-to-dashboard-type').forEach(e => e.classList.remove('selected'));
            el.classList.add('selected');
            addToDashboardState.selectedType = el.dataset.type;
        });
    });

    // Handle OK button
    okBtn.onclick = () => {
        const dashboardName = selectEl.value === '__new__'
            ? newNameInput.value.trim()
            : selectEl.value;

        if (!dashboardName) {
            newNameInput.focus();
            return;
        }

        addSensorToDashboard(
            addToDashboardState.sensorName,
            addToDashboardState.sensorLabel,
            dashboardName,
            addToDashboardState.selectedType,
            selectEl.value === '__new__'
        );

        closeAddToDashboard();
    };

    // Reset and show
    newNameField.style.display = 'none';
    newNameInput.value = '';
    overlay.classList.remove('hidden');
}

function addSensorToDashboard(sensorName, sensorLabel, dashboardName, widgetType, createNew) {
    if (!dashboardManager) {
        console.warn('Dashboard manager not initialized');
        return;
    }

    // Create new dashboard if needed
    if (createNew) {
        const newDashboard = {
            version: DASHBOARD_VERSION,
            meta: { name: dashboardName, description: '' },
            grid: { cols: DASHBOARD_GRID_COLS, rowHeight: DASHBOARD_GRID_ROW_HEIGHT, gap: DASHBOARD_GRID_GAP },
            widgets: []
        };
        dashboardState.dashboards.set(dashboardName, newDashboard);
        dashboardManager.updateDashboardList();
    }

    // Get or set current dashboard
    const prevDashboard = dashboardState.currentDashboard;
    dashboardState.currentDashboard = dashboardName;

    // Get widget default config based on type
    const WidgetClass = WIDGET_TYPES[widgetType];
    const defaultSize = WidgetClass?.defaultSize || { width: 2, height: 1 };

    // Find empty position
    const position = dashboardManager.findEmptyPosition(defaultSize.width, defaultSize.height);

    // Create widget config
    const widgetConfig = {
        id: `widget-${Date.now()}`,
        type: widgetType,
        position: { ...position, width: defaultSize.width, height: defaultSize.height },
        config: {
            sensor: sensorName,
            label: sensorLabel,
            min: 0,
            max: 100,
            unit: '',
            decimals: 1
        }
    };

    // Add to dashboard
    const dashboard = dashboardState.dashboards.get(dashboardName);
    if (dashboard) {
        dashboard.widgets = dashboard.widgets || [];
        dashboard.widgets.push(widgetConfig);

        // Save dashboard
        dashboardManager.saveDashboard();

        // If we're viewing this dashboard, create the widget
        if (dashboardState.currentView === 'dashboard' && dashboardState.currentDashboard === dashboardName) {
            dashboardManager.createWidget(widgetConfig);
            dashboardManager.updateSensorSubscriptions();
        }
    }

    // Restore previous dashboard if different
    if (prevDashboard && prevDashboard !== dashboardName) {
        dashboardState.currentDashboard = prevDashboard;
    }

    console.log(`Added ${sensorName} as ${widgetType} to dashboard "${dashboardName}"`);
}

// Global dashboard manager instance (exposed on window for tests)
let dashboardManager = window.dashboardManager = null;

// Helper to update dashboard widgets from SSE events.
// ctx: { serverId, objectName, timestamp } — нужен для построения sensorKey
// (canonical identity sensors во frontend — см. CLAUDE.md "Sensor identity").
function updateDashboardWidgets(sensors, ctx) {
    if (!dashboardManager || !sensors) return;
    if (!ctx || !ctx.serverId || !ctx.objectName) {
        console.warn('updateDashboardWidgets: ctx без serverId/objectName, skip');
        return;
    }

    for (const sensor of sensors) {
        const name = sensor.name;
        const value = sensor.value;
        const error = sensor.error || null;

        if (name !== undefined && value !== undefined) {
            const key = makeSensorKey(ctx.serverId, ctx.objectName, name);
            dashboardManager.handleSensorUpdate(key, value, error, ctx.timestamp || null);
        }
    }
}


// === 99-init.js ===
// Загрузка версии приложения
async function loadAppVersion() {
    try {
        const response = await fetch('/api/version');
        if (response.ok) {
            const data = await response.json();
            const versionEl = document.getElementById('app-version');
            if (versionEl && data.version) {
                versionEl.textContent = `v${data.version}`;
            }
        }
    } catch (err) {
        console.warn('Failed to load app version:', err);
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    // Загружаем версию приложения
    loadAppVersion();

    // Инициализация токена контроля (из URL или localStorage)
    initControlToken();

    // Загружаем конфигурацию приложения (не блокируем загрузку объектов)
    loadAppConfig();

    // Инициализация SSE для realtime обновлений (получаем capabilities при подключении)
    initSSE();

    // Загружаем sidebar конфигурацию (группы)
    await loadSidebar();

    // Загружаем список объектов (заполняет state.servers)
    fetchObjects()
        .then(data => {
            renderObjectsList(data);
            // Загружаем конфигурацию сенсоров per-server (после того как state.servers заполнен)
            loadSensorsConfig().catch(err => {
                console.warn('Не удалось загрузить конфигурацию сенсоров:', err);
            });
        })
        .catch(err => {
            console.error('Error загрузки объектов:', err);
            document.getElementById('objects-list').innerHTML =
                '<li class="alert alert-error">Error loading objects</li>';
        });

    // Кнопка обновления
    document.getElementById('refresh-objects').addEventListener('click', () => {
        fetchObjects()
            .then(renderObjectsList)
            .catch(console.error);
    });

    // Кнопка очистки кэша
    document.getElementById('clear-cache').addEventListener('click', () => {
        if (confirm('Clear all saved settings?\n\nWill be deleted:\n- user dashboards\n- pinned sensors\n- selected charts\n- section order and heights\n- filter settings\n- LogViewer settings\n- control session token')) {
            localStorage.clear();
            location.reload();
        }
    });

    // Кнопка сворачивания боковой панели
    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        state.sidebarCollapsed = sidebar.classList.contains('collapsed');
        saveSettings();
    });

    // Инициализация селектора poll interval
    initPollIntervalSelector();

    // Инициализация UI записи
    initRecordingUI();

    // Loading сохранённых настроек
    loadSettings();

    // Инициализация Dashboard Manager
    dashboardManager = window.dashboardManager = new DashboardManager();

    // Загрузка Launcher нод (не блокируем)
    loadLauncherNodes().catch(err => {
        console.warn('Failed to load launcher nodes:', err);
    });

    // Инициализация Journals (не блокируем)
    initJournals().catch(err => {
        console.warn('Failed to initialize journals:', err);
    });

    // Показываем sidebar группы, скрываем hardcoded секции
    const groupsContainer = document.getElementById('sidebar-groups');
    if (groupsContainer) {
        groupsContainer.style.display = '';
    }
    const legacySections = ['launchers-section', 'objects-section', 'journals-section', 'dashboards-section', 'servers-section'];
    for (const id of legacySections) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }
    renderSidebarGroups();
    applySidebarStatuses();
    // SSE статусы серверов приходят асинхронно, повторно применяем после стабилизации
    setTimeout(applySidebarStatuses, SIDEBAR_STATUS_REAPPLY_DELAY);
});

// Инициализация селектора интервала опроса
function initPollIntervalSelector() {
    const buttons = document.querySelectorAll('.poll-btn');
    const savedInterval = localStorage.getItem('pollInterval');

    // Set активную кнопку
    const setActive = (interval) => {
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.interval === String(interval));
        });
    };

    // Восстановить из localStorage или использовать значение с сервера
    if (savedInterval) {
        setActive(savedInterval);
    } else {
        // По умолчанию 1s
        setActive(1000);
    }

    // Обработчики кликов
    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const interval = parseInt(btn.dataset.interval);
            setActive(interval);
            localStorage.setItem('pollInterval', interval);

            // Обновляем глобальный интервал и перезапускаем автообновление статуса
            state.sse.pollInterval = interval;
            restartAllStatusAutoRefresh();

            // Отправляем на сервер
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (state.control.token) {
                    headers['X-Control-Token'] = state.control.token;
                }
                const response = await fetch('/api/settings/poll-interval', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ interval })
                });
                if (response.ok) {
                    console.log(`Poll interval изменён на ${interval}ms`);
                } else {
                    console.warn('Не удалось изменить poll interval');
                }
            } catch (err) {
                console.error('Error изменения poll interval:', err);
            }
        });
    });
}

// Перезапуск автообновления статуса для всех активных табов
function restartAllStatusAutoRefresh() {
    state.tabs.forEach((tab) => {
        if (tab.renderer && typeof tab.renderer.startStatusAutoRefresh === 'function') {
            tab.renderer.startStatusAutoRefresh();
        }
    });
}


