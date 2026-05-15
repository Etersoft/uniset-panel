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

### Стратегия прогона тестов (общее правило)

Полный `make js-tests` стоит **дорого** (15+ минут с docker spin-up'ом и npm install'ом единичной @playwright/test зависимости перед каждым из двух стэков — single + multi). Поэтому:

**При разработке фичи / исправлении бага:**
1. **Прогон только релевантных тестов** — те, что касаются изменённого кода:
   - Backend (Go): `go test ./internal/<pkg>/ -run TestName -v`
   - Unit JS (vitest): `cd tests/unit && npx vitest run <file>.test.ts`
   - E2E (Playwright): `make js-tests TEST=single/<spec>.spec.ts` или `make js-tests TEST=integration/<spec>.spec.ts`
2. После всех правок — **один генеральный прогон** `make js-tests` как final gate перед коммитом/пушем.

**При починке упавших тестов** (subset вышеуказанной стратегии):
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
| `06-utils.js` | Утилиты: `escapeHtml()`, `escapeAttr()`, `debounce()`, `parseIntegerOrDefault()`, `parseDecimalInputOrDefault()`, `parseNumberOrDefault()`, `getFirstConnectedServerId()`, `setupResizeHandle()`, `bindSingleDoubleClick()`, `createLineChartConfig()`, `renderColorZonesEditor()`/`parseColorZones()` |
| `09-sensor-key.js` | `makeSensorKey()`/`parseSensorKey()` (полный triplet `serverId\|objectName\|sensorName`), `makeGroupKey()`/`parseGroupKey()` (две части — для batch-операций `serverId\|objectName`) |
| `10-base-renderer.js` | `BaseObjectRenderer`, все миксины (`FilterMixin`, `PinManagementMixin`, `ParamsManagerMixin`, `VirtualScrollMixin`, `BatchRenderMixin` и др.). Содержит `_setupSectionDelegation()` — единый click-handler для всех секций tab-панели (см. ниже) |
| `08-signal-generator.js` | `SignalGenerator` — общий движок генерации сигналов (square/sin/cos/linear/random). Используется IONC renderer'ом и активным generator-виджетом dashboard'а |
| `60-dashboard-base.js` | `DashboardWidget` — базовый read-only widget; включает `static getColorForZones(value, zones)` — общий resolver цветовой зоны (используется LevelWidget, GaugeWidget) |
| `61-dashboard-active-base.js` | `ActiveDashboardWidget extends DashboardWidget` — базовый класс для write-capable виджетов dashboard'а |
| `61-dashboard-active-toggle.js` | `ToggleWidget` — активный двух-состояный переключатель (DI/DO/AI/AO) |
| `60-widget-sensor-binding.js` | Общие helpers для config-полей `serverId` + `objectName` + `sensor` + `sensorId`; используются active и read-only dashboard widgets |
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
- `update(value, error, meta)` — приходит от SSE через dashboard manager. `value`+`error` обновляют `feedbackValue`/`error`; `meta = { frozen, blocked }` — статусные флаги датчика. Subclass'ы которые игнорируют value (PushButton, Generator) ВСЁ РАВНО должны вызвать `_applyFeedbackMeta(meta)` — frozen блокирует запись.
- `_applyFeedbackMeta(meta)` — сохранить `feedbackMeta` и реактивно вызвать `_updateInteractivityClass()` если `frozen` поменялся. Используется subclass override'ами `update()` без последующего `renderFeedback`.
- `isFrozen()` — `!!feedbackMeta?.frozen`. Когда true, `isInteractive()` возвращает false и UI блокируется.
- `commandValue` / `feedbackValue` — раздельное хранение «команда vs обратная связь» (SCADA pattern)
- `writeState`: `idle | pending | success | error` — отображается через CSS-классы `.active-*` на контейнере (стили в `style.css`). Цвета: success — зелёный, error — **пурпурный** (НЕ красный: в SCADA red зарезервирован за процессными авариями). Dirty (для setpoint) — янтарный (`#fbbf24`).
- `isInteractive()` — `false` в edit mode, при отсутствии controlToken, **или когда `isFrozen()` true** (заморожен sensor нельзя записать).
- `_updateInteractivityClass()` — реактивно обновляет `active-disabled` класс и data-* атрибуты:
  - `data-control-blocked="true"` — нейтральная блокировка (edit mode / no token), серый opacity 0.6
  - `data-frozen="true"` — sensor latched, icy cyan tint + ❄ marker (CSS `::after`), opacity 0.88 (feedback хорошо читается). **Не наслаивается** с `data-control-blocked` — приоритет frozen
  - Триггеры: события `dashboardEditModeChanged` / `controlStatusChanged` + изменение `feedbackMeta.frozen` через `_applyFeedbackMeta`
- `_recomputeTitle()` — единая точка владения tooltip'ом: приоритет `error message > 'Sensor is frozen — unfreeze to control' > 'Take control to interact' > пусто`
- `requireConfirmation` — опция в config, по умолчанию выкл.
- `usesNewSensorAutocomplete = true` — дефолт; dashboard-manager пропускает legacy in-memory autocomplete для всех ActiveDashboardWidget'ов
- `static getConfigForm` базового класса рендерит binding-поля через `renderSensorBindingFields()`: server select + objectName select + sensor input + hidden sensorId; затем style select (когда `static styles.length > 1`) + label + requireConfirmation
- `static parseConfigForm` базового класса парсит base поля через `parseSensorBindingFields()`: `serverId`/`objectName`/`sensor`/`sensorId` + label/requireConfirmation/style + spread `parseActiveConfigFields()`
- `static initConfigHandlers` базового класса вызывает `initSensorBindingHandlers()`: загружает IONC objects dropdown по выбранному server, подключает `setupSensorAutocomplete` и сбрасывает sensor при смене server/object. Idempotent через `form.dataset.activeHandlersWired` + binding-level dataset flags

**Subclass contract — переопределяй:**
- `render()`, `renderCommand()`, `renderFeedback()` — DOM/обновления
- `static getActiveConfigFields(config)` — дополнительные поля формы
- `static parseActiveConfigFields(form)` — парсинг этих полей (return `{}` merge'ится в config)
- `static styles = [...]` + `static defaultStyle` — несколько визуальных стилей; base рендерит style select автоматически
- `_confirm(value)` — заменить `window.confirm` на красивый dialog

**Subclass contract — обычно НЕ трогай:**
- `getConfigForm`, `parseConfigForm`, `writeValue`, `_doWrite`, `usesNewSensorAutocomplete`,
  `_setWriteState`, `_recomputeTitle` — наследуется и достаточно
- `initConfigHandlers` можно переопределять только для дополнительных form handlers; обязательно вызвать `super.initConfigHandlers(form, config)` ровно один раз
- `_updateInteractivityClass` можно переопределять только для дополнительной реакции на блокировку; обязательно вызвать `super._updateInteractivityClass()`

**CSS-маркер:** dashboard-manager в `createWidget` выставляет `container.dataset.activeWidget = 'true'`
для всех `widget instanceof ActiveDashboardWidget`. CSS правила (edit-mode grayscale, active-disabled)
используют селектор `[data-active-widget="true"]` — развязаны от конкретных имён типов.

**ToggleWidget (`61-dashboard-active-toggle.js`):** двух-состояный переключатель для DI/DO/AI/AO датчиков.
Конфиг: `serverId`/`objectName`/`sensor`/`sensorId` (от base), `valueOff`/`valueOn` (любые числа),
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

Конфиг: `serverId`/`objectName`/`sensor`/`sensorId` (от base), `valueOn`/`valueOff` (числа),
`mode` (`'pulse'` default | `'momentary'`), `pulseWidth` (ms, default 500), `style`,
`label`, `requireConfirmation` (от base; в `momentary` режиме confirm применяется к ON-записи,
а release/OFF path уходит через raw write без повторного диалога — warning в форме).

**Поддерживаемые стили** через `static styles = ['flat', 'mushroom', 'pill']`.
Размер при размещении: dashboard-manager в createWidget берёт
`getDefaultSizeForStyle(config.style)` если есть style в config, иначе
fallback на `static defaultSize` (3×2 — для flat по умолчанию).
- **`flat`** (default, defaultSize 3×2): Material primary blue button. 3×2 даёт
  запас под надпись (раньше 2×1 был тесен — текст налезал на края).
- **`mushroom`** (defaultSize 3×3 через `getDefaultSizeForStyle`): SCADA-classic
  круглая красная объёмная. Для emergency / mode switches (STOP, EMERGENCY).
- **`pill`** (defaultSize 3×1): minimal outline pill, заполняется при нажатии.
  Для частых маловажных действий (ACK ALARM).

**Поведение:**
- `pulse`: click → POST valueOn → wait `pulseWidth` ms → POST valueOff. Visual flash
  (yellow, 300ms) для feedback мгновенно. Второй POST через `_writeValueRaw` (= base
  `_doWrite`) — без confirm dialog **и без isInteractive guard**: если controlToken
  отозван между ON и pulseWidth-таймером, OFF всё равно дойдёт. Иначе actuator завис бы в ON.
- `momentary`: mousedown → POST valueOn; window-level mouseup → POST valueOff
  (window-listener гарантирует release даже при mouseleave). Release path также
  через `_writeValueRaw` — bypass interactivity guard.

`update(value, error, meta)` override игнорирует value (renderFeedback не вызывается —
push-button fire-and-forget), но meta.frozen обрабатывается через `_applyFeedbackMeta` —
`isInteractive()` вернёт false и click заблокируется. Иначе аварийная команда (STOP/RESET)
ушла бы на frozen sensor silent no-op'ом и оператор не узнал бы что не сработало.
`renderCommand`/`renderFeedback` — no-op (push-button показывает только команду +
общий writeState `pending`/`error`).

**SetpointWidget (`61-dashboard-active-setpoint.js`):** числовой задатчик
для AI/AO датчиков. Произвольное значение в `[min, max]` с шагом `step`.

Конфиг: `serverId`/`objectName`/`sensor`/`sensorId` (от base), `min`/`max`/`step`
(числа), `unit` (текст: '°C', '%', 'Pa'), `applyMode` (`'manual'` default |
`'auto'`), `style`, `label` (от base), `requireConfirmation` (от base).

**Поддерживаемые стили** через `static styles = ['input', 'slider', 'stepper']`:
- **`input`** (default, defaultSize 3×2): текстовый input + Apply кнопка.
  В dirty state (cmd ≠ fb) — жёлтая граница input'а, видны Apply + Cancel.
  Enter = apply, Esc = cancel.
- **`slider`** (defaultSize 6×4 horizontal / 4×6 vertical через
  `static getDefaultSizeForStyle(style, config)`): custom-rendered
  (БЕЗ нативного `<input type="range">`). Mouse-friendly UX для SCADA HMI:
  - **Click anywhere on track** → handle прыгает + один POST.
  - **Drag** (mousedown → mousemove → mouseup) → один POST на release.
    Промежуточные mousemove только обновляют handle position.
  - **Inline-edit** двойным кликом по числу → input на месте.
  - **Двойной клик по handle** → handle прыгает в 0 (если `min ≤ 0 ≤ max`).
    Если 0 вне диапазона — no-op. Quick-action для «обнуления» setpoint'а
    без drag'а до нулевой отметки.
  - **`zones: [{from, to, color}]`** — цветные зоны на треке (формат как у
    Gauge/Level; используется `renderColorZonesEditor`/`parseColorZones`
    из `06-utils.js`). Если `zones` задан — `setpoint-slider-fill` не
    рендерится (зоны заменяют fill).
  - **Orientation** через config-поле `'horizontal'` (default) | `'vertical'`.
    В vertical track вертикальный, top = max, bottom = min, drag по Y инвертируется.
  - **`fb-marker`** ▾ (под треком для horizontal, слева от трека для vertical) —
    показывает `feedbackValue` ТОЛЬКО когда виджет dirty (`commandValue ≠ null`).
  - **Two-mode feedback tracking:**
    - Idle (`commandValue === null`) → handle следует за `feedbackValue`
      по приходу SSE (включая дрейф датчика без участия оператора).
    - Dirty (после клика/драга) → handle стоит на `commandValue`,
      `fb-marker` показывает текущий `feedbackValue`.
    - Auto-snap dirty → idle когда `|cmd - fb| < step/2` (в `update()`).
  - **No-jump-during-drag**: пока `_sliderDragging === true`, входящие SSE
    обновления записывают `feedbackValue` но НЕ перерисовывают handle —
    handle остаётся под курсором.
  - **No-data**: до первого SSE update root получает класс
    `.setpoint-slider-no-data`, value = `--`, fill/handle dimmed.
  - **Layout DOM**: для horizontal `<div class="setpoint-slider-labels">` —
    sibling AFTER `track-wrap` (нормальный flex flow); для vertical —
    INSIDE `track-wrap` как `position:absolute` справа от трека.
    Единицы измерения (`unit`) рендерятся рядом с max-меткой
    (`<span>${max} ${unit}</span>`).
  - **Value bubble follows handle**: `<span class="setpoint-slider-value">` —
    absolute child `track-wrap`. В renderFeedback ставится
    `style.left = pct%` (h) / `style.bottom = pct%` (v) — бабл двигается
    синхронно с handle. CSS reserves место `margin-top: 28px` (h) или
    `margin-left: 60px` (v) на `track-wrap`. Старый `.setpoint-slider-value-row`
    скрыт через `display: none` (legacy wrapper, удалён из innerHTML).
  - **Zero mark**: когда `min < 0 && max > 0`, в track-wrap рендерятся два
    элемента — `.setpoint-slider-zero-tick` (тонкий контрастный штрих
    поперёк трека) и `.setpoint-slider-zero-label` ('0' в строке labels между
    min и max). Оба позиционируются по `(0 - min) / (max - min) * 100%`.
    Strict inequality — когда ноль совпадает с границей, метка не рендерится.
  - **`fillOrigin`** (`'zero'` default | `'min'` | `'max'`) — откуда
    рисуется заливка. `'zero'`: signed от нуля (вправо для positive,
    влево для negative; fallback на `'min'` если ноль вне диапазона).
    `'min'`: legacy, от левого/нижнего края до значения. `'max'`: зеркало —
    от значения до правого/верхнего края. Реализовано через inline
    `style.left + style.width` (h) / `style.bottom + style.height` (v) на
    `.setpoint-slider-fill` в `renderFeedback`.
  - **`applyMode` ИГНОРИРУЕТСЯ** для slider style — write всегда происходит
    на release/click (нет manual/auto wait). Поле скрывается в config-форме.
  - **Listener cleanup**: window-level `mousemove`/`mouseup` слушатели
    сохраняются как `this._onSliderMove`/`_onSliderUp` и удаляются в
    `destroy()` (чтобы при переключении dashboard'а во время drag не
    остались висячие обработчики).
- **`stepper`** (defaultSize 3×2): кнопки `−` / `+` + value-label.
  Stepper всегда auto-apply on click (applyMode игнорируется).

**Conditional config form** (`initConfigHandlers` override):
- Когда `style='slider'` выбран в edit-диалоге, `applyMode`-row скрывается,
  появляются `orientation` + `zones` rows. Switch обратно — наоборот.
  Идемпотентно через `form.dataset.setpointStyleHandlersWired`.

**Migration существующих конфигов** с `style='slider'`:
- `applyMode` (`'manual'`/`'auto'`) — игнорируется в runtime, дропается
  при следующем save из config-формы.
- `orientation` — отсутствует → defaults to `'horizontal'`.
- `zones` — отсутствует → defaults to `[]` (без зон, обычный fill).

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

Конфиг: `serverId`/`objectName`/`sensor`/`sensorId` (от base), `label` (от base),
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
  state.servers Map каждый тик. `serverId` берётся из config; legacy fallback
  на первый connected server допустим только для старых dashboard-конфигов.
- Toggle off → `signalGen.stop()`, instance = null, value → '--', cache cleared.
- Double-start guard: `if (this._signalGen) return;` — защита от race.
- POST error → автостоп + `active-error` (purple border + tooltip).
- ControlToken released во время работы → автостоп через override
  `_updateInteractivityClass`.
- `destroy()` override → `_stop()` + `super.destroy()` (нет утечек таймеров).
- `update(value, error, meta)` override игнорирует value (UI показывает значения
  от генератора, не от датчика), но вызывает `_applyFeedbackMeta(meta)` — frozen
  через `isInteractive()`+override `_updateInteractivityClass` триггерит автостоп.
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
IONC renderer'ом (`20-ionc-renderer.js`) и активным generator-виджетом dashboard'а.

**E2E:** smoke-тест базового класса в `tests/single/dashboard-active-base.spec.ts`
(использует `window.__DEBUG_REGISTER_TEST_WIDGET()` debug-хук). Active widgets покрыты
отдельными spec'ами: `dashboard-active-toggle.spec.ts`, `dashboard-active-button.spec.ts`,
`dashboard-active-setpoint.spec.ts`, `dashboard-active-generator.spec.ts`; config persistence —
`dashboard-widget-settings.spec.ts`.

### Zones reuse picker

Виджеты с `zones: [{from, to, color}]` — Setpoint slider, Gauge, Level — рендерят
inline-picker над zones-editor для переиспользования предыдущих наборов.

Wiring per widget:
- В `static getConfigForm` (или `getActiveConfigFields` для Setpoint) — вызвать
  `renderZonesReusePicker(widgetType, currentDashboard, currentWidgetId)` ПЕРЕД
  `renderColorZonesEditor(...)`.
- В `static initConfigHandlers(form, config)` — `setupZonesReusePicker(form);`
  (idempotent, можно звать многократно).
- History push автоматически из `62-dashboard-manager.js applyWidgetConfig` —
  никаких ручных вызовов из widget класса.

Константы: `ZONES_HISTORY_MAX`, `ZONES_PICKER_MAX_HEIGHT_PX`,
`ZONES_HISTORY_STORAGE_KEY` (все в `00-constants.js`).

### Правила размещения кода

- **Новый рендерер** → `2X-renderer-name.js`
- **Новая утилита** → добавить в `06-utils.js` или создать `0X-name.js`
- **Новая константа** → добавить в `00-constants.js`
- **Изменение SSE** → `04-sse.js`
- **Новый UI компонент** → `5X-ui-name.js`

### Section click handling (event delegation)

Все секции tab-панели (collapse/expand, move-up/move-down, charts pause,
add-sensor, time-range, IO sequential) обслуживаются **одним делегированным
click-обработчиком** на корне tab-панели — методом
`BaseObjectRenderer._setupSectionDelegation()`. Вызывается из `50-ui-tabs.js`
сразу после `renderer.initialize()`. Idempotent через
`panel.dataset.sectionDelegationWired`.

**Не пиши `onclick="toggleSection(...)"` / `onclick="moveSectionUp(...)"` /
`onclick="event.stopPropagation()"` в шаблонах renderer'ов** — добавляй
data-атрибуты, которые делегация уже знает:

| Контрол | Маркер для делегации |
|---|---|
| Move-up button | `<button class="section-move-up" data-move-section="${id}">` |
| Move-down button | `<button class="section-move-down" data-move-section="${id}">` |
| Add Sensor | `<button class="add-sensor-btn">` |
| Charts pause | `<button class="charts-pause-btn">` |
| Time range button | `<button class="time-range-btn" data-range="${seconds}">` |
| IO sequential checkbox | `<input id="io-sequential-${objectName}">` (handler ставится прямо в `_setupSectionDelegation` через `getEl`) |
| Section root | `<div class="collapsible-section" data-section="${id}-${objectName}" data-section-id="${id}">` |
| Header (toggle) | `<div class="collapsible-header">` (без onclick) |

**ВАЖНО — `data-section-id` vs `data-move-section`:**
- `data-section-id="${id}"` — на корне `.collapsible-section` (тесты query'ят по нему: `[data-section-id="charts"]`)
- `data-move-section="${id}"` — на move-кнопках. **НЕ переиспользуй `data-section-id` на кнопках** — селектор `[data-section-id="X"]` начнёт матчить 3 элемента (root + 2 кнопки), сломает strict-mode в Playwright тестах.

**No-toggle zones:** клик внутри `.section-reorder-buttons`, `.filter-bar`,
`.charts-time-range`, `.io-filter-wrapper`, `.io-sequential-toggle`,
`.add-sensor-btn`, `.header-indicators`, `.header-channels`,
`.header-indicator-dot` — НЕ toggle'ит секцию (раньше для этого был inline
`event.stopPropagation()`, теперь — explicit zone в делегации).

Если в твоей секции появляется новая «no-toggle» область — добавь её
class в `NO_TOGGLE_ZONE_SELECTOR` в `_setupSectionDelegation`.

### Общие хелперы (избегай дубликатов)

| Хелпер | Где | Когда использовать |
|---|---|---|
| `escapeHtml(text)` | `06-utils.js` | Любая динамическая вставка в `innerHTML` (текстовый контекст) |
| `escapeAttr(text)` | `06-utils.js` | Динамическая вставка в HTML-атрибут (`title="${escapeAttr(x)}"`). `escapeHtml` НЕ покрывает кавычки в attribute-context |
| `parseIntegerOrDefault(value, fallback)` | `06-utils.js` | Парсинг integer'а из user input / dataset / form. Безопаснее голого `parseInt(x, 10)` (NaN guard) |
| `parseDecimalInputOrDefault(value, fallback)` | `06-utils.js` | Парсинг float (с поддержкой `,` как разделителя) |
| `parseNumberOrDefault(value, fallback)` | `06-utils.js` | Парсинг number вообще |
| `getFirstConnectedServerId()` | `06-utils.js` | Legacy fallback для widget'ов / migrations: первый connected server |
| `getElementInTab(tabKey, id)` / `getElementsInTab(tabKey, sel)` | `51-ui-render.js` | DOM lookup внутри панели tab (для standalone функций; в renderer'ах — `this.getEl()`/`this.getEls()`) |
| `makeSensorKey(serverId, objectName, sensorName)` / `parseSensorKey(key)` | `09-sensor-key.js` | Идентификация датчика во frontend (full triplet) |
| `makeGroupKey(serverId, objectName)` / `parseGroupKey(key)` | `09-sensor-key.js` | Группировка по (server, object) для batch-операций (subscribe, fetch sensors) |
| `DashboardWidget.getColorForZones(value, zones)` | `60-dashboard-base.js` | Static — выбор цвета по `zones[]` config (Level, Gauge, ...) |
| `bindSingleDoubleClick(el, single, double, delay)` | `06-utils.js` | Различение single/double click (используется IONC freeze quick-action) |
| `setupResizeHandle(handle, container, min, save, max, onResize, opts)` | `06-utils.js` | Resize-handle pattern (mousedown→move→up) |
| `canonicalizeZones(zones)` | `06-utils.js` | Канонический JSON-ключ для dedup (sort by from, lowercase color, fixed precision). Используется в `addZonesToHistory`. Не вызывать напрямую из renderer'ов. |
| `getZonesHistory()` / `addZonesToHistory(zones, sourceType)` | `06-utils.js` | localStorage CRUD для Recent zones. FIFO cap = `ZONES_HISTORY_MAX`. Move-to-front при duplicate. No-op для пустого `zones`. Push вызывается из `dashboard-manager.applyWidgetConfig` после save. |
| `getDashboardZoneSources(dashId, excludeWidgetId)` | `06-utils.js` | Live-read widget'ов текущего dashboard'а с непустыми zones, исключая редактируемый. Возвращает `{widgetId, widgetType, sensorLabel, zones}[]`. |
| `renderZonesReusePicker(currentType, dashId, currentWidgetId)` | `06-utils.js` | HTML для блока reuse-picker'а над `renderColorZonesEditor`. Группировка: Recent → same-class → others alphabetical. Возвращает `''` если оба источника пусты. |
| `setupZonesReusePicker(form)` | `06-utils.js` | Click-delegation на `.zone-chip` элементах. Idempotent (`form.dataset.zonesPickerWired`). Вызывать в `static initConfigHandlers` каждого widget'а с zones. |
| `applyZonesToEditor(form, zones)` | `06-utils.js` | DOM-replace `.zones-list` через `renderColorZoneItem`. Используется внутри `setupZonesReusePicker` click handler'а. |

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
- **НЕ** использовать `document.getElementById()` для элементов внутри вкладок — в рендерерах `this.getEl()`, в standalone-функциях `getElementInTab(tabKey, id)`. Исключения по CLAUDE.md: глобальные синглтоны (sidebar/tabs-header), Launcher (`nodeId`), Journal (`journalId`), Dashboard, IONC dialogs (`ionc-set-*`, `ionc-freeze-*`, `ionc-gen-*`)
- **НЕ** использовать `objectName` для ключей localStorage — использовать `tabKey`
- **НЕ** создавать новые стили для одинаковых элементов - использовать существующие общие классы
- **НЕ** писать inline `onclick="..."` / `onchange="..."` в шаблонах renderer'ов для секций — добавь data-атрибуты, делегация в `_setupSectionDelegation()` уже их обработает. Inline допустим только для глобальных IONC dialog'ов (Cancel-кнопок) и helper'ов типа `addZoneField(this)` (передача self)
- **НЕ** использовать `parseInt(x, 10)` напрямую для user input / dataset — `parseIntegerOrDefault(x, fallback)` (защита от NaN). `parseInt(x, 10)` оставлять только для гарантированно валидных id, считанных из самого DOM, который мы рендерили
- **НЕ** дублировать `_resolveServerId()` логику inline (`for (const [id, srv] of state.servers) if (srv.connected) ...`) — `getFirstConnectedServerId()` из `06-utils.js`
- **НЕ** дублировать color-zone resolution — `DashboardWidget.getColorForZones(value, zones)` static
- **НЕ** переиспользовать `data-section-id` атрибут на move-кнопках секций — они должны иметь `data-move-section` (иначе `[data-section-id="X"]` селектор сломает Playwright strict mode)
- **НЕ** применять regex к escapeHtml'нутой строке для highlight — символы `<`, `>`, `&`, `"`, `'`, `=` после escape не совпадут с поисковым запросом. Сначала split raw → escape каждый фрагмент → wrap match'и (см. `JournalRenderer.highlightText`)

Полная документация: `docs/naming-conventions.md`

## Sensor identity (multi-server)

Для уникальной идентификации датчика во frontend используется
**`sensorKey`** — строка формата `${serverId}|${objectName}|${sensorName}`
(разделитель `|`, чтобы не путать с `:` в `tabKey`).

Helpers в `09-sensor-key.js`:
- `makeSensorKey(serverId, objectName, sensorName)` / `parseSensorKey(key)` — full triplet
- `makeGroupKey(serverId, objectName)` / `parseGroupKey(key)` — две части (для batch-операций над датчиками одного объекта)

**Правила:**

| Сценарий | Ключ |
|---|---|
| Подписка / cache в dashboard | `sensorKey` |
| API path | `objectName` (path) + `serverId` (query) |
| UI display label | `sensorName` (короткое имя) |
| Active widget config | сохранять `serverId` + `objectName` + `sensor` (имя) + `sensorId` (числовой) |

**Запрещено:**
- `Map<sensorName, ...>` для dashboard-wide state (cache, подписки, routing)
- `_resolveServerId()` (instance method в `ActiveDashboardWidget`) как primary source — только legacy fallback с warning. Сам метод делегирует в `getFirstConnectedServerId()` из `06-utils.js`.
- Передавать sensors в dashboard update path без `(serverId, objectName)` контекста

SSE handler `ionc_sensor_batch` уже получает `serverId` и `objectName` в
payload — используй их для построения `sensorKey` при cache/routing.

Когда добавляешь новую активную widget'у — base class уже сохраняет
`serverId` через unified `getConfigForm`/`parseConfigForm`. Subclass этим
не занимается.
