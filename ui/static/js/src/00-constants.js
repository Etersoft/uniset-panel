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
