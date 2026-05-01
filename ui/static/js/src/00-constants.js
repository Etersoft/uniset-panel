// ============================================================================
// Константы UI
// ============================================================================

// === Таймауты и интервалы (мс) ===
const FILTER_DEBOUNCE_DELAY = 300;
const DOUBLE_CLICK_THRESHOLD = 250;
const SIDEBAR_STATUS_REAPPLY_DELAY = 3000;
const ANIMATION_REMOVAL_DELAY = 500;
const AUTOCOMPLETE_DEBOUNCE_DELAY = 150;
const JOURNAL_SEARCH_DEBOUNCE_DELAY = 300;
const JOURNAL_HIGHLIGHT_DURATION = 2000;
const JOURNAL_SCROLL_LOAD_RATIO = 0.8;
const TIMER_UPDATE_INTERVAL_MS = 100;
const LAUNCHER_AUTO_REFRESH_INTERVAL = 5000;
const LAUNCHER_ACTION_REFRESH_DELAY = 1000;
const LAUNCHER_BULK_ACTION_REFRESH_DELAY = 1500;
const STATUS_DISPLAY_UPDATE_INTERVAL = 1000;
const RECORDING_STATUS_POLL_INTERVAL = 5000;
const CONTROL_PING_INTERVAL = 30000;
const CONTROL_DEFAULT_TIMEOUT_SEC = 60;
const SETTINGS_FILTER_DEBOUNCE_DELAY = 200;
const SENSOR_AUTOCOMPLETE_BLUR_DELAY_MS = 150;
const UI_DEBUG_LOG_STORAGE_KEY = 'uniset-ui-debug-log';

// === SSE ===
const SSE_DEFAULT_POLL_INTERVAL = 5000;
const SSE_RESUBSCRIBE_DELAY = 1000;
const SSE_RECOVERY_PROBE_INTERVAL = 30000;
const SSE_MAX_RECONNECT_ATTEMPTS = 10;
const SSE_BASE_RECONNECT_DELAY = 1000;
const SSE_MAX_RECONNECT_DELAY = 30000;
const SSE_RECONNECT_JITTER_RATIO = 0.1;       // ±10% jitter на reconnect delay
const SSE_SIDEBAR_POLL_MULTIPLIER = 6;        // sidebar polling реже чем данные
const POLL_INTERVAL_SELECTOR_DEFAULT_MS = 1000;

// === LogViewer ===
const LOGVIEWER_MAX_RECONNECT_ATTEMPTS = 5;
const LOGVIEWER_BASE_RECONNECT_DELAY = 1000;
const LOGVIEWER_MAX_RECONNECT_DELAY = 30000;
const LOGVIEWER_FILTER_DEBOUNCE_DELAY = 300;
const LOGVIEWER_AUTOSCROLL_THRESHOLD_PX = 50;
const LOGVIEWER_BUFFER_OPTIONS = [500, 1000, 2000, 5000, 10000, 20000, 50000];

// === Retry ===
const RESTORE_SENSORS_RETRY_DELAY_MS = 100;
const RESTORE_SENSORS_INITIAL_DELAY_MS = 200;
const RESTORE_SENSORS_MAX_ATTEMPTS = 30; // × RESTORE_SENSORS_RETRY_DELAY_MS = 3s max wait for tab init

// === Лимиты данных ===
const MAX_CHART_POINTS = 1000;
const MAX_LOG_LINES = 10000;
const VIRTUAL_SCROLL_CHUNK_SIZE = 200;
const JOURNAL_DEFAULT_LIMIT = 100;
const SENSOR_AUTOCOMPLETE_LIMIT = 20;
const SENSOR_AUTOCOMPLETE_FOCUS_LIMIT = 10;
const DASHBOARD_SENSOR_REGISTRY_FETCH_LIMIT = 10000;
const DASHBOARD_SENSOR_CACHE_TTL_MS = 60000;
const BYTES_PER_KIB = 1024;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'];

// === Виртуальный скролл (px) ===
const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_BUFFER_ROWS = 10;
const VIRTUAL_SCROLL_LOAD_THRESHOLD = 200;
const VIRTUAL_SCROLL_PERCENT_THRESHOLD = 80;
const SIMPLE_INFINITE_SCROLL_THRESHOLD = 100;

// === Высоты секций (px) ===
const DEFAULT_SECTION_HEIGHT = 300;
const MIN_SECTION_HEIGHT = 100;
const MAX_SECTION_HEIGHT = 800;
const LOGVIEWER_DEFAULT_HEIGHT = 200;
const LOGVIEWER_MIN_HEIGHT = 100;
const LOGVIEWER_MAX_HEIGHT = 600;
const CHARTS_CONTAINER_MIN_HEIGHT = 150;
const SENSORS_CONTAINER_MIN_HEIGHT = 200;
const JOURNAL_CONTAINER_MIN_HEIGHT = 150;
const JOURNAL_CONTAINER_MAX_HEIGHT = 800;
const DATA_TABLE_DEFAULT_HEIGHT = 320;
const DATA_TABLE_MAX_HEIGHT = 700;
const UWSGATE_SENSORS_DEFAULT_HEIGHT = 400;
const OPCUA_DIAGNOSTICS_DEFAULT_HEIGHT = 260;
const OPCUA_DIAGNOSTICS_MIN_HEIGHT = 160;
const OPCUA_DIAGNOSTICS_MAX_HEIGHT = 600;

// === Dashboard сетка ===
const DASHBOARD_GRID_COLS = 48;
const DASHBOARD_GRID_ROW_HEIGHT = 30;
const DASHBOARD_GRID_GAP = 4;
const DASHBOARD_POSITION_SCAN_ROWS = 100;
const DASHBOARD_MAX_WIDGET_HEIGHT = 20;
const DASHBOARD_DEFAULT_WIDGET_WIDTH = 2;
const DASHBOARD_DEFAULT_WIDGET_HEIGHT = 1;
const DASHBOARD_DRAG_Z_INDEX = 1000;
const DASHBOARD_FINE_MOVE_STEP_PX = 1;

// === Sensor autocomplete dropdown ===
const SENSOR_AUTOCOMPLETE_DROPDOWN_Z_INDEX = 10000;

// === Recording export ===
const RECORDING_EXPORT_URLS = {
    sqlite: '/api/export/database',
    csv:    '/api/export/csv',
    json:   '/api/export/json',
};

// === Journal time ranges (мс) ===
// '1M' = 30 дней (фиксированный «месяц» для real-time журнала, не календарный).
const JOURNAL_TIME_RANGE_MS = {
    '15m': 15 * 60 * 1000,
    '1h':  60 * 60 * 1000,
    '3h':  3 * 60 * 60 * 1000,
    '10h': 10 * 60 * 60 * 1000,
    '1d':  24 * 60 * 60 * 1000,
    '3d':  3 * 24 * 60 * 60 * 1000,
    '1w':  7 * 24 * 60 * 60 * 1000,
    '1M':  30 * 24 * 60 * 60 * 1000,
};

// === Временные диапазоны (сек) ===
const DEFAULT_CHART_TIME_RANGE = 900;
const CHART_TIME_RANGES_SECONDS = [
    { seconds: 60, label: '1m' },
    { seconds: 180, label: '3m' },
    { seconds: 300, label: '5m' },
    { seconds: 900, label: '15m' },
    { seconds: 3600, label: '1h' },
    { seconds: 10800, label: '3h' }
];
const CHART_TIME_RANGES_MS = CHART_TIME_RANGES_SECONDS.map(({ seconds, label }) => ({
    value: seconds * 1000,
    label
}));

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

// === PushButtonWidget ===
const PUSHBUTTON_DEFAULT_PULSE_WIDTH_MS = 500;
const PUSHBUTTON_MIN_PULSE_WIDTH_MS = 50;
const PUSHBUTTON_FLASH_MS = 300;

// === SetpointWidget ===
const SETPOINT_AUTO_APPLY_DEBOUNCE_MS = 500;
const SETPOINT_DEFAULT_MIN = 0;
const SETPOINT_DEFAULT_MAX = 100;
const SETPOINT_DEFAULT_STEP = 1;

// === Signal Generator ===
const GENERATOR_DEFAULT_MIN = 0;
const GENERATOR_DEFAULT_MAX = 100;
const GENERATOR_DEFAULT_STEP = 10;
const GENERATOR_DEFAULT_PAUSE_MS = 200;
const GENERATOR_DEFAULT_PULSE_WIDTH_MS = 500;
const GENERATOR_DEFAULT_SQUARE_PAUSE_MS = 500;
const GENERATOR_DEFAULT_PERIOD_MS = 1000;
const GENERATOR_DEFAULT_WAVE_MIN = -50;
const GENERATOR_DEFAULT_WAVE_MAX = 50;
const GENERATOR_DEFAULT_WAVE_PAUSE_MS = 100;
const GENERATOR_DEFAULT_WAVE_POINTS = 100;
const GENERATOR_DEFAULT_LINEAR_STEP = 1;
const GENERATOR_DEFAULT_RANDOM_PERIOD_MS = 5000;
const GENERATOR_DEFAULT_IONC_SQUARE_PULSE_WIDTH_MS = 2000;
const GENERATOR_DEFAULT_IONC_SQUARE_PAUSE_MS = 2000;
const GENERATOR_MIN_PAUSE_MS = 1;
const GENERATOR_MIN_PULSE_WIDTH_MS = 1;
const GENERATOR_MIN_PERIOD_MS = 100;
const GENERATOR_MIN_WAVE_PAUSE_MS = 10;
const GENERATOR_MIN_WAVE_POINTS = 4;
const SIGNAL_GENERATOR_MIN_UPDATE_INTERVAL_MS = 50;
const SIGNAL_GENERATOR_TICKS_PER_PERIOD = 20;

// === ChartWidget ===
const CHART_WIDGET_DEFAULT_TABLE_HEIGHT = 100;
const CHART_WIDGET_TABLE_MIN_HEIGHT = 50;
const CHART_WIDGET_TABLE_MAX_HEIGHT = 300;
const CHART_WIDGET_DEFAULT_ZONES_HEIGHT = 150;
const CHART_WIDGET_ZONES_MIN_HEIGHT = 80;
const CHART_WIDGET_ZONES_MAX_HEIGHT = 500;
const CHART_WIDGET_SYNC_INTERVAL_MS = 2000;
const CHART_WIDGET_DEFAULT_TIME_RANGE_MS = DEFAULT_CHART_TIME_RANGE * 1000;
const CHART_WIDGET_TIME_WINDOW_SHIFT_RATIO = 0.9;
const CHART_WIDGET_HISTORY_LIMIT = 200;
const CHART_WIDGET_X_MAX_TICKS = 6;
const CHART_WIDGET_Y_MAX_TICKS = 5;
const OBJECT_CHART_HISTORY_LIMIT = 200;
const CHART_LINE_TENSION = 0.3;
const CHART_LINE_BORDER_WIDTH = 1.5;
const CHART_STEPPED_LINE_BORDER_WIDTH = 2;
const UNET_CHART_LINE_TENSION = 0.1;
const UNET_CHART_MAX_POINTS = 300;
const UNET_CHART_X_MAX_TICKS = 6;
const CHART_LEGEND_BOX_WIDTH = 12;
const CHART_LEGEND_PADDING = 8;
const GAUGE_FALLBACK_MAJOR_STEP = 2000;
const STATUS_WIDGET_DEFAULT_THRESHOLD = 0.5;
const DIGITAL_SEGMENT_WIDTH = 16;
const DIGITAL_SEGMENT_HEIGHT = 32;
const DIGITAL_SEGMENT_THICKNESS = 3;
const DIGITAL_DIGIT_SLOT_WIDTH = 24;
const DIGITAL_SPECIAL_CHAR_ADVANCE = 8;
const DIGITAL_DIGIT_ADVANCE = 22;
const DIGITAL_VIEWBOX_PADDING = 10;
const DIGITAL_VIEWBOX_HEIGHT = 48;

if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, {
        CHART_LINE_TENSION,
        CHART_LINE_BORDER_WIDTH,
        CHART_STEPPED_LINE_BORDER_WIDTH,
        UNET_CHART_LINE_TENSION
    });
}
