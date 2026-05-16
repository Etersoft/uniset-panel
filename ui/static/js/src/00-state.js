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
        pollInterval: SSE_DEFAULT_POLL_INTERVAL, // будет обновлено с сервера
        reconnectAttempts: 0,
        maxReconnectAttempts: SSE_MAX_RECONNECT_ATTEMPTS,
        baseReconnectDelay: SSE_BASE_RECONNECT_DELAY,
        maxReconnectDelay: SSE_MAX_RECONNECT_DELAY,
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
        timeoutSec: CONTROL_DEFAULT_TIMEOUT_SEC,
        pingIntervalId: null  // ID интервала ping
    }
};

// IONC@server registry для combobox'а в config-форме widget'ов.
// Lazy-populated; TTL 5 минут (IONC_REGISTRY_TTL_MS); ручное обновление через кнопку ↻.
state.ioncRegistry = {
    fetchedAt:    0,                  // ms; 0 = never fetched
    isFetching:   false,              // race guard для ↻ во время in-flight
    fetchPromise: null,               // shared promise для concurrent waiters
    servers:      new Map(),          // serverId → { serverName, connected, objects: [name,...] }
    lastError:    null,               // string|null — последняя ошибка fetch'а (cache не cleared)
};
