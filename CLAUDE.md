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

### Стратегия починки упавших тестов

Если при прогоне часть тестов упала:

1. **Расследовать** и **чинить** только упавшие тесты (анализировать ошибки, исправлять код тестов/приложения)
2. **Перезапускать** только исправленные тесты (не весь набор) для проверки фикса
3. **Только после починки всех упавших** делать генеральный прогон всех тестов (`make js-tests`)

Не запускать полный набор тестов после каждого единичного фикса — это долго и неэффективно.

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
| Конфиг-поля в `Handlers` | `sidebarConfig *config.SidebarConfig` | camelCase, nil = дефолт |
| Публичные сеттеры | `SetServerManager(mgr)`, `SetLauncherManager(mgr)`, `SetSidebarConfig(cfg)` | Полное имя `Manager` / `Config` (публичный API) |
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
ioncPoller, ok := h.requireIONCPoller(w, r)        // (*ionc.Poller, bool)
modbusPoller, ok := h.requireModbusPoller(w, r)    // (*modbus.Poller, bool)
opcuaPoller, ok := h.requireOPCUAPoller(w, r)      // (*opcua.Poller, bool)
uwsgatePoller, ok := h.requireUWSGatePoller(w, r)  // (*uwsgate.Poller, bool)
```

**НЕ** использовать `http.Error()` — он возвращает `text/plain`, а `h.writeError()` возвращает JSON `{"error": "..."}`.

> **Примечание:** Некоторые handler'ы ещё используют `json.NewDecoder` напрямую (5 мест) и `r.PathValue("name")` напрямую (16 мест) вместо `decodeJSONBody` / `requireObjectName`. Миграция — отдельная задача.

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
DefaultAddr                   // ":8181" — адрес веб-сервера
DefaultRecordingPath          // "./recording.db" — путь к файлу записи
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

### Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `00-constants.js` | Все именованные константы (таймауты, лимиты, размеры) |
| `00-state.js` | Глобальное состояние `state` |
| `06-utils.js` | Утилиты: `escapeHtml()`, `debounce()` |
| `10-base-renderer.js` | `BaseObjectRenderer`, все миксины (`FilterMixin`, `PinManagementMixin`, `ParamsManagerMixin` и др.) |
| `08-signal-generator.js` | `SignalGenerator` — общий движок генерации сигналов (square/sin/cos/linear/random). Используется IONC renderer'ом и активным generator-виджетом dashboard'а |
| `61-dashboard-active-base.js` | `ActiveDashboardWidget extends DashboardWidget` — базовый класс для write-capable виджетов dashboard'а |
| `61-dashboard-active-toggle.js` | `ToggleWidget` — активный двух-состояный переключатель (DI/DO/AI/AO) |
| `41-sensor-autocomplete.js` | `setupSensorAutocomplete(...)` — переиспользуемый IONC sensor selector с debounced search |

### Active dashboard widgets

Для записи значений в датчики из dashboard'а используется базовый класс
`ActiveDashboardWidget` (`61-dashboard-active-base.js`). Конкретные активные
виджеты (toggle/checkbox/button/setpoint/generator) реализуются в файлах
**`61-dashboard-active-*.js`** (единый префикс гарантирует, что в lex-order
конкатенации база загружается раньше наследников) и регистрируются в
`WIDGET_TYPES` (`62-dashboard-manager.js`).

**Контракт `ActiveDashboardWidget`:**
- `writeValue(value)` — orchestrator: проверяет `isInteractive()` + `_confirm()`, затем дёргает `_doWrite(value)`. Главный entry point для UI-инициированной записи (click handler виджета).
- `_doWrite(value)` — actual fetch на `/api/objects/{config.objectName}/ionc/set?server=...` без UI guards. Используется напрямую для release/OFF path push-button'ов и подобных операций где second POST должен дойти даже если controlToken отозван между ON и OFF (иначе actuator виснет в ON). Server validation (sensorId/serverId/objectName) сохраняется. Default `objectName = 'SharedMemory'`, `sensor_id` из `config.sensorId` с fallback на `config.sensor`.
- `update(value, error)` — приходит от SSE через dashboard manager, обновляет `feedbackValue`
- `commandValue` / `feedbackValue` — раздельное хранение «команда vs обратная связь» (SCADA pattern)
- `writeState`: `idle | pending | success | error` — отображается через CSS-классы `.active-*` на контейнере (стили в `style.css`). Цвета: success — зелёный, error — **пурпурный** (НЕ красный: в SCADA red зарезервирован за процессными авариями). Dirty (для setpoint) — янтарный (`#fbbf24`).
- `isInteractive()` — `false` в edit mode и при отсутствии controlToken
- `_updateInteractivityClass()` — реактивно обновляет `active-disabled` класс и `data-control-blocked` атрибут
  по событиям `dashboardEditModeChanged` / `controlStatusChanged` (dispatched из dashboard-manager и control модулей)
- `_recomputeTitle()` — единая точка владения tooltip'ом: приоритет `error message > 'Take control to interact' > пусто`
- `requireConfirmation` — опция в config, по умолчанию выкл.
- `usesNewSensorAutocomplete = true` — дефолт; dashboard-manager пропускает legacy in-memory autocomplete для всех ActiveDashboardWidget'ов
- `static getConfigForm` базового класса рендерит objectName select + sensor input + hidden sensorId + style select (когда `static styles.length > 1`) + label + requireConfirmation
- `static parseConfigForm` базового класса парсит base поля (sensor/sensorId/objectName/label/requireConfirmation/style) + spread `parseActiveConfigFields()`
- `static initConfigHandlers` базового класса загружает IONC objects dropdown и подключает `setupSensorAutocomplete` с `resetOnObjectChange`. Idempotent через `form.dataset.activeHandlersWired`

**Subclass contract — переопределяй:**
- `render()`, `renderCommand()`, `renderFeedback()` — DOM/обновления
- `static getActiveConfigFields(config)` — дополнительные поля формы
- `static parseActiveConfigFields(form)` — парсинг этих полей (return `{}` merge'ится в config)
- `static styles = [...]` + `static defaultStyle` — несколько визуальных стилей; base рендерит style select автоматически
- `_confirm(value)` — заменить `window.confirm` на красивый dialog

**Subclass contract — НЕ трогай:**
- `getConfigForm`, `parseConfigForm`, `initConfigHandlers`, `writeValue`, `_doWrite`, `usesNewSensorAutocomplete`,
  `_setWriteState`, `_recomputeTitle`, `_updateInteractivityClass` — наследуется и достаточно

**CSS-маркер:** dashboard-manager в `createWidget` выставляет `container.dataset.activeWidget = 'true'`
для всех `widget instanceof ActiveDashboardWidget`. CSS правила (edit-mode grayscale, active-disabled)
используют селектор `[data-active-widget="true"]` — развязаны от конкретных имён типов.

**ToggleWidget (`61-dashboard-active-toggle.js`):** двух-состояный переключатель для DI/DO/AI/AO датчиков.
Конфиг: `objectName` (IONC объект), `sensorId` (числовой ID), `valueOff`/`valueOn` (любые числа),
`labelOff`/`labelOn` (текстовые подписи), `style` (default `'slider'` — список из `static styles`).

**Поддерживаемые стили** через `static styles = ['slider', 'checkbox']`:
- **`slider`** (default, defaultSize 3×2): слитая композиция — цвет track = feedback,
  позиция handle = command, жёлтая граница на `.toggle-track` при divergence.
  Layout column: name (top) + track + state-text (bottom).
- **`checkbox`** (defaultSize 2×1 рекомендован): material flat 24×24 + label справа.
  ✓ при ON, dashed «?» при unknown, жёлтая граница на корневом `.toggle-widget` при divergence.
  Click anywhere on widget triggers writeValue. Layout row: `[checkbox] name`.

`render()` диспатчит на `renderSlider()` / `renderCheckbox()` по `config.style`. Аналогично
`renderCommand()` / `renderFeedback()`. Корневой div получает класс `toggle-style-{slider|checkbox}`.

Серый «unknown» при `feedback ≠ valueOn ≠ valueOff` (типично для AI/AO) — фактическое
число в `title` tooltip обоих стилей.

**PushButtonWidget (`61-dashboard-active-button.js`):** write-only momentary/pulse
кнопка для команд (RESET, START, STOP, ACK ALARM). Семантически отличается от
toggle: нет двух-состоянного латча, feedback от своего sensor'а игнорируется
(fire-and-forget команда).

Конфиг: `objectName` (от base), `sensorId` (от base), `valueOn`/`valueOff` (числа),
`mode` (`'pulse'` default | `'momentary'`), `pulseWidth` (ms, default 500), `style`,
`label`, `requireConfirmation` (от base; в `momentary` режиме НЕ работает —
warning в форме).

**Поддерживаемые стили** через `static styles = ['flat', 'mushroom', 'pill']`:
- **`flat`** (default, defaultSize 2×1): Material primary blue button. Для group
  of buttons, частые действия.
- **`mushroom`** (defaultSize 2×2 — через `getDefaultSizeForStyle`): SCADA-classic
  круглая красная объёмная. Для emergency / mode switches (STOP, EMERGENCY).
- **`pill`** (defaultSize 2×1): minimal outline pill, заполняется при нажатии.
  Для частых маловажных действий (ACK ALARM).

**Поведение:**
- `pulse`: click → POST valueOn → wait `pulseWidth` ms → POST valueOff. Visual flash
  (yellow, 300ms) для feedback мгновенно. Второй POST через `_writeValueRaw` (= base
  `_doWrite`) — без confirm dialog **и без isInteractive guard**: если controlToken
  отозван между ON и pulseWidth-таймером, OFF всё равно дойдёт. Иначе actuator завис бы в ON.
- `momentary`: mousedown → POST valueOn; window-level mouseup → POST valueOff
  (window-listener гарантирует release даже при mouseleave). Release path также
  через `_writeValueRaw` — bypass interactivity guard.

`update()` override игнорирует SSE feedback от sensor'а. `renderCommand`/`renderFeedback` —
no-op (push-button показывает только команду + общий writeState `pending`/`error`).

**SetpointWidget (`61-dashboard-active-setpoint.js`):** числовой задатчик
для AI/AO датчиков. Произвольное значение в `[min, max]` с шагом `step`.

Конфиг: `objectName` (от base), `sensorId` (от base), `min`/`max`/`step`
(числа), `unit` (текст: '°C', '%', 'Pa'), `applyMode` (`'manual'` default |
`'auto'`), `style`, `label` (от base), `requireConfirmation` (от base).

**Поддерживаемые стили** через `static styles = ['input', 'slider', 'stepper']`:
- **`input`** (default, defaultSize 3×2): текстовый input + Apply кнопка.
  В dirty state (cmd ≠ fb) — жёлтая граница input'а, видны Apply + Cancel.
  Enter = apply, Esc = cancel.
- **`slider`** (defaultSize 3×2): horizontal slider + value-label сверху +
  min/max подписи снизу. В manual mode change-event (release) триггерит apply.
- **`stepper`** (defaultSize 3×2): кнопки `−` / `+` + value-label.
  Stepper всегда auto-apply on click (applyMode игнорируется).

**Apply mode:**
- `manual`: пользователь явно жмёт Apply (или Enter). До того value «dirty».
- `auto`: debounce 500ms на input/slider change → автоотправка.

**Inline-edit:** двойной клик на value-display (slider или stepper) →
input на месте → Enter apply / Esc cancel / blur apply. Используется для
точного ввода когда slider/stepper неудобен. Inline-edit Enter/blur всегда
применяет независимо от applyMode (иначе slider+manual+inline → soft-lock).

**Two-way:** `feedbackValue` от SSE + `commandValue` (что пользователь
установил, до Apply). Расхождение → CSS `.dirty`. Когда feedback догнал
command (с tolerance step/2 — для AI/AO float) → dirty снимается автоматически.

**Validation:** значения вне `[min, max]` обрезаются (clamp). В config-форме
`step≤0` нормализуется в 1, при `min>max` пара свапается, NaN → 0/100.

**GeneratorWidget (`61-dashboard-active-generator.js`):** обёртка вокруг
SignalGenerator engine (`08-signal-generator.js`) для запуска тестовых
сигналов в датчик с dashboard'а.

Конфиг: `objectName` (от base), `sensorId` (от base), `label` (от base),
`requireConfirmation` (от base), `type` (`square` default | `sin` | `cos`
| `linear` | `random`), `min`/`max`, и conditional поля по типу:
- `linear`/`sin`/`cos`: `step`, `pause` (ms)
- `square`: `pulseWidth`, `pause` (ms)
- `random`: `period` (ms)

**Стиль один — `compact`** (defaultSize 3×1): label слева, текущее
значение по центру (зелёный когда running, '--' когда stopped), toggle
Start/Stop справа (зелёный фон когда running). `static styles = []` —
base.getConfigForm не рендерит style select.

**Behavior:**
- Toggle on → создаёт `SignalGenerator` instance, `start()`, onTick →
  `_writeRaw(value)` (custom helper, fire-and-forget POST без per-tick
  confirm/state). serverId/sensorId/url cached в `_start` — не walk
  state.servers Map каждый тик.
- Toggle off → `signalGen.stop()`, instance = null, value → '--', cache cleared.
- Double-start guard: `if (this._signalGen) return;` — защита от race.
- POST error → автостоп + `active-error` (purple border + tooltip).
- ControlToken released во время работы → автостоп через override
  `_updateInteractivityClass`.
- `destroy()` override → `_stop()` + `super.destroy()` (нет утечек таймеров).
- `update()` override = no-op (SSE feedback игнорируется как у PushButton).
- `requireConfirmation` спрашивается ОДИН РАЗ при Start, не на каждом тике.
- Не persist running state между reload'ами (после reload всегда stopped).

**Config form:** conditional поля по type через `initConfigHandlers` override —
type select change handler показывает/скрывает соответствующие row'ы.
Idempotency через `form.dataset.genHandlersWired`. Обязательно зовёт
`super.initConfigHandlers` для sensor autocomplete + IONC dropdown.

**Sensor autocomplete (`41-sensor-autocomplete.js`):** утилита
`setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId)` — debounce 150ms,
dropdown с keyboard navigation (↑↓/Enter/Esc), сохраняет (name, id) пару. Используется
в config-формах активных widget'ов. При смене IONC объекта — `resetOnObjectChange()`
обнуляет выбор.

**Backend для UI:** `GET /api/objects?server=ID&type=IONotifyController` — отфильтрованный
по типу список объектов с метаданными `[{name, objectType}]`. Без `type` — back-compat
плоский список имён.

**Generator engine:** общий движок `SignalGenerator` (`08-signal-generator.js`) переиспользуется
IONC renderer'ом (`20-ionc-renderer.js`) и активным generator-виджетом (когда будет реализован).

**E2E:** smoke-тест базового класса в `tests/single/dashboard-active-base.spec.ts`
(использует `window.__DEBUG_REGISTER_TEST_WIDGET()` debug-хук). E2E ToggleWidget'а
в `tests/single/dashboard-active-toggle.spec.ts` (13 сценариев: 8 для slider —
write-flow, состояния fb-on/off/unknown/diverge, custom labels, edit-mode block,
control-token block, custom objectName routing; 5 для checkbox style — render
.toggle-cb, click anywhere triggers write, fb-on/unknown, diverge на root).

### Правила размещения кода

- **Новый рендерер** → `2X-renderer-name.js`
- **Новая утилита** → добавить в `06-utils.js` или создать `0X-name.js`
- **Новая константа** → добавить в `00-constants.js`
- **Изменение SSE** → `04-sse.js`
- **Новый UI компонент** → `5X-ui-name.js`

### Именование JS констант

- **`UPPER_CASE`** — для иммутабельных значений: таймауты, лимиты, размеры сетки, пороги (`MAX_CHART_POINTS`, `DASHBOARD_GRID_COLS`, `CHART_COLORS`)
- **`camelCase`** — для мутабельного состояния, реестров и Map/Set объектов (`state`, `dashboardState`, `objectRenderers`)
- Магические числа → именованные константы в `00-constants.js`

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
   - **localStorage ключи** — все пользовательские настройки (pinned, heights, collapse, sort и т.д.)
   - **DOM-поиск** — `this.getEl(id)` / `getElementInTab(tabKey, id)`

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
| UNetExchange | `unet` | `unet:recv:42`, `unet:send:7` |

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

При поиске элементов внутри вкладок использовать `this.getEl()` / `this.getEls()` (в рендерерах) или `getElementInTab()` (в standalone-функциях) вместо `document.getElementById()`:

```javascript
// ✅ В рендерерах (BaseObjectRenderer, LogViewer) — используй this.getEl()
const tbody = this.getEl(`mbs-registers-tbody-${this.objectName}`);
const rows = this.getEls('.sensor-row');

// ✅ В standalone-функциях (53-ui-settings.js и др.) — используй getElementInTab()
const container = getElementInTab(tabKey, `io-container-inputs-${objectName}`);

// ❌ НЕПРАВИЛЬНО — может найти элемент из другой вкладки с тем же ID
const tbody = document.getElementById(`mbs-registers-tbody-${this.objectName}`);
```

**Почему важно:**
- При работе с несколькими серверами может быть несколько объектов с одинаковым именем (например, `SharedMemory` на разных серверах)
- `getElementById` найдёт первый элемент с таким ID, который может принадлежать другой вкладке
- `getEl()` / `getElementInTab()` ищут элемент внутри панели конкретной вкладки (`.tab-panel[data-name="${tabKey}"]`)

**Доступные API:**
```javascript
// В рендерерах (BaseObjectRenderer, LogViewer) — методы экземпляра
this.getEl(elementId)     // ищет по ID внутри панели this.tabKey
this.getEls(cssSelector)  // ищет все по CSS-селектору внутри панели this.tabKey

// В standalone-функциях — глобальные функции из 51-ui-render.js
getElementInTab(tabKey, elementId)
getElementsInTab(tabKey, selector)
```

**Что НЕ трогать** — `document.getElementById()` допустим для:
- Глобальных синглтон-элементов (sidebar, tabs-header, control-dialog и т.д.)
- Глобальных диалогов IONC (`ionc-set-*`, `ionc-freeze-*`, `ionc-gen-*`, `ionc-dialog-body`)
- Launcher-рендерера (использует уникальный `nodeId`, конфликтов не бывает)
- Journal (использует уникальный `journalId`)
- Dashboard (глобальный синглтон)

### localStorage ключи

Все пользовательские настройки (pinned items, высоты секций, порядок секций, состояние collapse и т.д.) сохраняются в localStorage по `tabKey`, а не по `objectName`:

```javascript
// ✅ ПРАВИЛЬНО — ключ по tabKey (уникален для каждого сервера)
saved[this.tabKey] = value;

// ❌ НЕПРАВИЛЬНО — конфликт при одинаковых объектах с разных серверов
saved[this.objectName] = value;
```

**При чтении** — fallback на `objectName` для обратной совместимости со старыми данными:
```javascript
const value = saved[this.tabKey] ?? saved[this.objectName];
```

**Standalone-функции** (в `53-ui-settings.js`, `52-ui-sections.js`) должны принимать `tabKey` как параметр и использовать его для DOM-поиска и localStorage:
```javascript
// ✅ Функция принимает tabKey и objectName
function setupIOResize(tabKey, objectName, type) {
    const container = getElementInTab(tabKey, `io-container-${type}-${objectName}`);
    // localStorage ключ по tabKey
    saved[`${tabKey}-${type}`] = height;
}
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
- **НЕ** использовать `document.getElementById()` для элементов внутри вкладок — в рендерерах `this.getEl()`, в standalone-функциях `getElementInTab(tabKey, id)`
- **НЕ** использовать `objectName` для ключей localStorage — использовать `tabKey`
- **НЕ** создавать новые стили для одинаковых элементов - использовать существующие общие классы

Полная документация: `docs/naming-conventions.md`

## Sensor identity (multi-server)

Для уникальной идентификации датчика во frontend используется
**`sensorKey`** — строка формата `${serverId}|${objectName}|${sensorName}`
(разделитель `|`, чтобы не путать с `:` в `tabKey`).

Helper: `makeSensorKey(serverId, objectName, sensorName)` /
`parseSensorKey(key)` в `09-sensor-key.js`.

**Правила:**

| Сценарий | Ключ |
|---|---|
| Подписка / cache в dashboard | `sensorKey` |
| API path | `objectName` (path) + `serverId` (query) |
| UI display label | `sensorName` (короткое имя) |
| Active widget config | сохранять `serverId` + `objectName` + `sensor` (имя) + `sensorId` (числовой) |

**Запрещено:**
- `Map<sensorName, ...>` для dashboard-wide state (cache, подписки, routing)
- `_resolveServerId()` как primary source — только legacy fallback с warning
- Передавать sensors в dashboard update path без `(serverId, objectName)` контекста

SSE handler `ionc_sensor_batch` уже получает `serverId` и `objectName` в
payload — используй их для построения `sensorKey` при cache/routing.

Когда добавляешь новую активную widget'у — base class уже сохраняет
`serverId` через unified `getConfigForm`/`parseConfigForm`. Subclass этим
не занимается.
