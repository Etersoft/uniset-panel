# Claude Code Guidelines

## Testing

E2E тесты (Playwright) запускаются через docker compose:

```bash
# Запуск всех тестов
make js-tests

# Перед запуском остановить dev-профиль (если запущен)
docker compose --profile dev down
```

Не запускать тесты напрямую через `npx playwright test` — это может вызвать проблемы с окружением и портами.

## Development Server

```bash
# Запуск dev-сервера
docker compose up dev-viewer -d --build

# Dev-сервер доступен на http://localhost:8000
# Подключается к реальным UniSet2 серверам на портах 9090, 9191, 9292, 9393, 9494, 9595
```

ВАЖНО: Запускать именно `docker compose up dev-viewer`, а не `docker compose --profile dev up`, чтобы избежать конфликта портов между сервисами dev-viewer и viewer (оба используют порт 8000).

## Build

```bash
# Сборка бинарника
go build -mod=vendor -o uniset-panel ./cmd/server

# Сборка через make
make build
```

## Go Backend Conventions

### Именование полей и переменных

| Паттерн | Пример | Правило |
|---------|--------|---------|
| Поля менеджеров в `Handlers` | `serverMgr`, `launcherMgr`, `journalMgr`, `dashboardMgr`, `recordingMgr`, `logServerMgr`, `controlMgr` | Суффикс `Mgr`, camelCase |
| Публичные сеттеры | `SetServerManager(mgr)`, `SetLauncherManager(mgr)` | Полное имя `Manager` (публичный API) |
| SSE event types | `EventObjectData`, `EventServerStatus` | Константы `Event*` в `sse.go` |

### Паттерны handler'ов (`internal/api/`)

Все HTTP handler'ы должны использовать общие хелперы:

```go
// Ответы
h.writeJSON(w, data)              // НЕ json.NewEncoder(w).Encode(data)
h.writeError(w, status, message)  // НЕ http.Error(w, message, status)

// Валидация
name, ok := h.requireObjectName(w, r)  // возвращает ("", false) при ошибке (ответ уже отправлен)
if !ok { return }

// Декодирование
var req MyStruct
if !h.decodeJSONBody(w, r, &req) { return }  // false при ошибке

// Получение poller'а (отдельные функции по типу)
ioncPoller := h.requireIONCPoller(w, name)      // nil при ошибке
modbusPoller := h.requireModbusPoller(w, name)   // nil при ошибке
opcuaPoller := h.requireOPCUAPoller(w, name)     // nil при ошибке
```

**НЕ** использовать `http.Error()` — он возвращает `text/plain`, а `h.writeError()` возвращает JSON `{"error": "..."}`.

### SSE event types

Все SSE event types объявлены как константы в `internal/api/sse.go`:

```go
EventObjectData           // "object_data"
EventObjectsList          // "objects_list"
EventServerStatus         // "server_status"
EventSensorData           // "sensor_data"
EventControlStatus        // "control_status"
EventConnected            // "connected"
EventIONCSensorBatch      // "ionc_sensor_batch"
EventModbusRegisterBatch  // "modbus_register_batch"
EventOPCUASensorBatch     // "opcua_sensor_batch"
EventUWSGateSensorBatch   // "uwsgate_sensor_batch"
EventLauncherStatus       // "launcher_status"
EventLauncherConnection   // "launcher_connection"
EventJournalMessages      // "journal_messages"
EventJournalConnection    // "journal_connection"
```

При добавлении нового SSE event type — добавить константу `Event*` и использовать её везде (включая тесты). Не использовать строковые литералы.

### Константы вместо магических чисел

Все числовые значения для таймаутов, лимитов, размеров буферов, интервалов и портов должны быть именованными константами. Не допускать inline числовых литералов в логике.

**Defaults конфигурации** — экспортированные константы `Default*` в `config/config.go`:

```go
DefaultPollInterval           // 1s — интервал опроса серверов
DefaultControlTimeout         // 60s — таймаут неактивности контроллера
DefaultSensorBatchSize        // 300 — макс. датчиков в запросе
DefaultMaxRecords             // 1000000 — макс. записей recording
DefaultLogStreamBufferSize    // 5000
DefaultLogStreamBatchSize     // 500
DefaultLogStreamBatchInterval // 100ms
```

**Локальные константы** — unexported, в файле где используются:

```go
// api/sse.go
sseEventBufferSize    // 50 — буфер канала SSE событий
sseHeartbeatInterval  // 25s — heartbeat для keep-alive

// api/control.go
controlReleaseGracePeriod  // 3s — задержка перед освобождением контроля при disconnect

// api/handlers_server.go
minPollIntervalMs, maxPollIntervalMs  // 1000, 300000 — границы poll interval

// api/handlers.go
defaultHistoryCount  // 100 — кол-во записей истории переменной

// api/handlers_ionc.go
defaultIONCPageLimit  // 100 — лимит пагинации IONC датчиков

// api/handlers_journal.go
defaultJournalLimit, maxJournalLimit  // 100, 1000 — пагинация журнала

// api/handlers_logserver.go
defaultLogServerHost, defaultLogServerPort  // "localhost", 3333 — fallback LogServer

// uwsgate/client.go
wsHandshakeTimeout, wsReconnectBase, wsReconnectMax  // 10s, 1s, 30s
```

**Правила:**
- `Default*` (exported) — для значений из `config.go`, которые могут использоваться в других пакетах и CLI флагах
- `camelCase` (unexported) — для локальных констант конкретного файла
- Константа должна быть в том же файле, где используется
- Сообщения об ошибках могут ссылаться на константы: `fmt.Sprintf("must be between %d and %d", min, max)`

### Структура `cmd/server/main.go`

Функция `main()` вызывает `setup*()` хелперы, каждый из которых отвечает за инициализацию одной подсистемы:

```
setupStorage()           → storage.Storage
setupControl()           → *ControlManager
setupRecording()         → *recording.Manager
setupServerCallbacks()   → wiring SSE + recording callbacks
setupLauncher()          → *launcher.Manager
setupHandlers()          → *Handlers
setupDashboards()        → *dashboard.Manager
setupJournals()          → *journal.Manager + pollers
setupSMPoller()          → *sm.Poller
```

При добавлении новой подсистемы — создать `setup*()` функцию, не раздувать `main()`.

### Конструкторы с конфиг-структурой

Конструкторы с 4+ параметрами используют config struct:

```go
// ДА — именованные поля
instance := server.NewInstance(server.AppConfig{
    Server:       cfg,
    Storage:      store,
    PollInterval: interval,
})

// НЕТ — позиционные параметры
instance := server.NewInstance(cfg, store, interval, ttl, supplier, batchSize, cb1, cb2, cb3, ...)
```

### Тесты

- Табличные тесты (`tests := []struct{...}`) для проверки нескольких вариантов входных данных
- `httptest.NewServer` + `httptest.NewRecorder` для handler тестов
- Mock-серверы через `httptest.NewServer` с `http.ServeMux` для имитации UniSet2 API
- Файлы тестов: `*_test.go` в том же пакете, именование `Test<Function>_<Scenario>`

## JavaScript модули

**ВАЖНО:** Файл `ui/static/js/app.js` генерируется автоматически из модулей в `ui/static/js/src/`. НЕ редактировать app.js напрямую!

### После изменений в JS-файлах

```bash
# Пересобрать app.js после любых изменений в src/
make app

# Или полная сборка (app + бинарник)
make build
```

### Структура модулей

Файлы нумеруются для контроля порядка конкатенации (зависимости):

| Диапазон | Категория | Что размещать |
|----------|-----------|---------------|
| 00-09 | Core | Глобальный state, константы, SSE, control token, recording |
| 10-19 | Base renderers | BaseObjectRenderer, mixins, простые рендереры |
| 20-29 | Specific renderers | IONC, OPCUA, Modbus, UWSGate, UNetExchange, Launcher рендереры |
| 30-39 | Components | LogViewer, Journal и другие самостоятельные компоненты |
| 40-49 | Charts/Dialogs | Графики, модальные окна |
| 50-59 | UI functions | Табы, секции, настройки, render-функции, sidebar groups |
| 60-69 | Dashboard | Dashboard base, widgets, manager, dialogs |
| 99 | Init | DOMContentLoaded, инициализация |

### Правила размещения кода

- **Новый рендерер** → `2X-renderer-name.js`
- **Новая утилита** → создать `0X-name.js` в диапазоне 00-09
- **Изменение SSE** → `04-sse.js`
- **Новый UI компонент** → `5X-ui-name.js`

## Debugging UI

Для отладки проблем с UI (особенно с SSE, подписками, сетевыми запросами) используй Playwright.

### Способ 1: MCP Playwright Plugin (рекомендуется)

Используй встроенные MCP инструменты браузера для интерактивной отладки:

```
# Открыть страницу
mcp__plugin_playwright_playwright__browser_navigate url=http://localhost:8000

# Сделать снимок состояния (accessibility tree)
mcp__plugin_playwright_playwright__browser_snapshot

# Кликнуть на элемент по ref из snapshot
mcp__plugin_playwright_playwright__browser_click ref="..." element="description"

# Посмотреть сетевые запросы
mcp__plugin_playwright_playwright__browser_network_requests includeStatic=false

# Посмотреть console логи
mcp__plugin_playwright_playwright__browser_console_messages level=info

# Выполнить JavaScript в браузере
mcp__plugin_playwright_playwright__browser_evaluate function="() => window.state?.tabs"
```

**Преимущества:**
- Интерактивная отладка прямо в Claude Code
- Не требует написания скриптов
- Видны все сетевые запросы и console логи
- Можно выполнять произвольный JS в контексте страницы

### Способ 2: Playwright скрипты

Для сложных сценариев или автоматизации используй скрипты:

**Почему Playwright:**
- Перехватывает все HTTP запросы/ответы (включая те, что не отображаются в Network tab)
- Захватывает console.log из браузера
- Автоматизирует сценарии взаимодействия
- Позволяет инспектировать состояние приложения программно

**Пример отладочного скрипта:**

```javascript
// tests/debug-something.js
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  // Перехват запросов
  page.on('request', request => {
    if (request.url().includes('subscribe')) {
      console.log('>> REQUEST:', request.method(), request.url());
      console.log('   POST data:', request.postData());
    }
  });

  page.on('response', async response => {
    if (response.url().includes('subscribe')) {
      console.log('<< RESPONSE:', response.status(), response.url());
      console.log('   Body:', await response.text());
    }
  });

  // Захват console.log
  page.on('console', msg => {
    console.log('BROWSER:', msg.text());
  });

  await page.goto('http://localhost:8000');

  // ... сценарий взаимодействия ...

  // Инспекция состояния
  const state = await page.evaluate(() => {
    return window.state?.someProperty;
  });
  console.log('State:', state);

  await page.waitForTimeout(60000); // Держим браузер открытым
  await browser.close();
})();
```

**Запуск:**

```bash
cd tests
node debug-something.js
```

**Важно:** Скрипт должен находиться в `tests/`, где доступен `@playwright/test` из node_modules.

## UI Naming Conventions

При работе с кодом UI (`ui/static/js/app.js`) соблюдать следующие правила именования:

### Ключевые идентификаторы

| Идентификатор | Формат | Пример | Использование |
|--------------|--------|--------|---------------|
| `tabKey` | `${serverId}:${objectName}` | `77b5af18:MBSlave1` | Уникальный ключ вкладки для `state.tabs`, `moveSectionUp/Down`, `loadSectionOrder` |
| `objectName` | имя объекта | `MBSlave1` | API endpoints, DOM ID элементов, `data-section` атрибуты, `toggleSection` |
| `serverId` | хэш или константа | `77b5af18`, `sm` | Идентификация сервера |
| `sectionId` | `${prefix}-${objectName}` | `charts-MBSlave1` | `data-section` атрибут, `toggleSection` |

### Правила использования

1. **`tabKey` использовать для:**
   - `state.tabs.get(tabKey)` - доступ к состоянию вкладки
   - `moveSectionUp(tabKey, sectionId)` / `moveSectionDown(tabKey, sectionId)`
   - `loadSectionOrder(tabKey)` / `saveSectionOrder(tabKey)`
   - Атрибут `data-name` на панелях вкладок

2. **`objectName` использовать для:**
   - API endpoints: `/api/objects/${objectName}/...`
   - DOM ID элементов: `${prefix}-${objectName}`
   - `data-section` атрибуты: `${prefix}-${objectName}`
   - `toggleSection(sectionId)` и `restoreCollapsedSections(objectName)`

3. **В рендерерах:**
   ```javascript
   this.objectName  // имя объекта (MBSlave1)
   this.tabKey      // полный ключ (77b5af18:MBSlave1)
   ```

4. **`serverId` в состоянии вкладки:**
   ```javascript
   // Получение serverId из состояния вкладки
   const tabState = state.tabs.get(this.tabKey);
   const serverId = tabState?.serverId || '';  // Важно: serverId (не serverID!)

   // Формирование параметра для API запроса
   const serverParam = serverId ? `server=${encodeURIComponent(serverId)}` : '';
   ```
   **ВАЖНО:** В `state.tabs` используется `serverId` (camelCase с маленькой буквой d), а не `serverID`.

### SSE и графики (Charts)

Графики идентифицируются через `varName` в формате `${prefix}:${sensor.name}`:

| Тип объекта | Prefix | Пример varName |
|-------------|--------|----------------|
| ModbusMaster, ModbusSlave | `mb` | `mb:AI70_S` |
| OPCUAExchange, OPCUAServer | `ext` | `ext:Temperature` |
| IONotifyController | `io` | `io:AI_Temp_S` |
| UWebSocketGate | `ws` | `ws:SensorName` |
| UNetExchange | `unet` | `unet:SensorName` |

**При обработке SSE событий для обновления графиков:**
```javascript
// Modbus: modbus_register_batch
const varName = `mb:${reg.name}`;  // НЕ reg.id!
const chartData = tabState.charts.get(varName);

// OPCUA: opcua_sensor_batch
const varName = `ext:${sensor.name}`;  // НЕ sensor.id!
const chartData = tabState.charts.get(varName);
```

### Константы serverId

| Место | Константа | Значение | Назначение |
|-------|-----------|----------|------------|
| Frontend (app.js) | `SM_SERVER_ID` | `"sm"` | SharedMemory события |
| Backend (sse.go) | `SharedMemoryServerID` | `"sm"` | SharedMemory события |

### Поиск DOM элементов

При поиске элементов внутри вкладок использовать `getElementInTab()` вместо `document.getElementById()`:

```javascript
// ✅ ПРАВИЛЬНО - ищет элемент внутри панели конкретной вкладки
const fillCheckbox = getElementInTab(tabKey, `fill-${displayName}-${varName}`);

// ❌ НЕПРАВИЛЬНО - может найти элемент из другой вкладки с тем же ID
const fillCheckbox = document.getElementById(`fill-${displayName}-${varName}`);
```

**Почему важно:**
- При работе с несколькими серверами может быть несколько объектов с одинаковым именем (например, `SharedMemory` на разных серверах)
- `getElementById` найдёт первый элемент с таким ID, который может принадлежать другой вкладке
- `getElementInTab` сначала находит панель вкладки по `tabKey`, затем ищет элемент внутри неё

**Доступные функции:**
```javascript
// Найти один элемент по ID внутри вкладки
getElementInTab(tabKey, elementId)

// Найти все элементы по CSS-селектору внутри вкладки
getElementsInTab(tabKey, selector)
```

### Единообразие UI элементов

Одинаковые элементы интерфейса должны использовать одинаковые CSS классы и HTML структуру во всех рендерерах:

| Элемент | CSS класс | HTML структура |
|---------|-----------|----------------|
| Pin toggle | `pin-toggle`, `pin-toggle.pinned` | `<span class="pin-toggle" data-id="...">○/📌</span>` |
| Pin column | `col-pin` | `<th class="col-pin">...</th>` |
| Chart toggle | `chart-toggle`, `chart-toggle-input`, `chart-toggle-label` | Input + Label с SVG иконкой |

> **Примечание:** IONC использует `ionc-col-pin` вместо `col-pin`, IO-таблицы используют `io-pin-toggle` вместо `pin-toggle`. Это исторические расхождения.

**Правило:** При добавлении нового рендерера или нового UI элемента проверь существующие рендереры и используй те же классы и структуру.

### Частые ошибки

- **НЕ** использовать `tabKey` для `data-section` атрибутов (использовать `objectName`)
- **НЕ** использовать `objectName` для `state.tabs` (использовать `tabKey`)
- **НЕ** путать форматы `sectionId` - всегда `${prefix}-${objectName}`
- **НЕ** использовать `id` для varName графиков - использовать `name`
- **НЕ** использовать разные prefixes для ModbusMaster/Slave - оба используют `mb`
- **НЕ** использовать `document.getElementById()` для элементов внутри вкладок (использовать `getElementInTab()`)
- **НЕ** создавать новые стили для одинаковых элементов - использовать существующие общие классы

Полная документация: `docs/naming-conventions.md`
