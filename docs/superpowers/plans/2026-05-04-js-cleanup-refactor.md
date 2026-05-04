# JS Cleanup Refactor — план

**Goal:** Применить все находки из ревью 2026-05-04 (3 параллельных агента) к `ui/static/js/src/`.

**Strategy:** работаем фазами от безопасных к рискованным. После каждой фазы — `make app` + (для финальной) `make js-tests`.

---

## Phase 1 — Dead code & low-risk renames (быстрые победы)

- [ ] Удалить `VirtualScrollMixin.showVScrollLoadingIndicator()` (`10-base-renderer.js:120-123`) — нет вызовов
- [ ] Удалить `RangeBarsWidget.getSensors()` (`61-dashboard-widgets.js:701-703`) — нет вызовов
- [ ] Удалить `BarGraphWidget.getSensors()` (`61-dashboard-widgets.js:977-979`) — нет вызовов
- [ ] Удалить орфан-комментарий `61-dashboard-widget-gauge.js:1032`
- [ ] Удалить `onclick="event.stopPropagation()"` в `30-log-viewer.js:83`, добавить `.logviewer-controls` в `NO_TOGGLE_ZONE_SELECTOR` в `_setupSectionDelegation()` (`10-base-renderer.js`)
- [ ] **Commit + `make app`**

## Phase 2 — Magic numbers → constants

- [ ] Перенести `CHART_COLORS` (`40-charts.js:7-8`) в `00-constants.js`
- [ ] Перенести 4-цветную чарт-тему из `06-utils.js:159-222` (`createLineChartConfig`) в `00-constants.js` как `CHART_THEME = { tooltipBg, gridLine, tickColor, textColor }`
- [ ] Добавить `WIDGET_DEFAULT_MIN = 0` / `WIDGET_DEFAULT_MAX = 100` в `00-constants.js`; применить в `61-dashboard-widget-gauge.js` (6 мест) и `61-dashboard-widgets.js` (5 мест) и `06-utils.js:298`
- [ ] Добавить `DEFAULT_VARIABLE_HISTORY_COUNT = 100` для `40-charts.js:110,119`
- [ ] Добавить `OPCUA_ERROR_HISTORY_DEFAULT_MAX = 100` для `21-opcua-exchange.js:324`
- [ ] Добавить `IONC_DIALOG_FOCUS_DELAY_MS = 50` для `41-dialogs.js:37`
- [ ] Добавить `SPEEDOMETER_DEFAULT_MAX_RPM = 4000` для `61-dashboard-widget-gauge.js:338`
- [ ] Добавить `ROTATE_QUICK_ANGLES = [180, 270]` для `62-dashboard-manager.js:1014,1019,1020`
- [ ] **Commit + `make app`**

## Phase 3 — Helpers extraction

- [ ] `escapeRegex(str)` в `06-utils.js`; заменить inline в `30-log-viewer.js:859`, метод в `35-journal.js:418-420`
- [ ] `loadStorageMap(key, defaults={})` / `updateStorageMap(key, mutator)` в `06-utils.js`; применить в `53-ui-settings.js:1-13/33-57/238-258/271-296/359-378`, `10-base-renderer.js:203-225/563-585`, `55-sidebar-groups.js:31-49`
- [ ] `loadJSON(key, fallback)` / `saveJSON(key, value)` в `06-utils.js`; применить в `55-sidebar-groups.js:31-49,261`, `62-dashboard-manager.js:163`
- [ ] `getConnectedServerIds()` в `06-utils.js`; применить в `40-charts.js:140-163` (`loadSensorsConfig`) и `62-dashboard-manager.js:382-389` (bootstrap)
- [ ] `fetchJSONOrThrow(url, opts, errPrefix)` в `06-utils.js`; делегировать `BaseObjectRenderer.fetchJSON` (`10-base-renderer.js:1804-1813`) и 8 fetch-helper'ов в `40-charts.js:18-131`
- [ ] `buildIONCSensorsUrl({objectName, serverId, search, limit})` в `41-sensor-autocomplete.js`; применить в `62-dashboard-manager.js:406-408,592-594`
- [ ] **Commit + `make app`**

## Phase 4 — Active widget consolidation

- [ ] Добавить `_doWriteSilent(value)` (или `_doWrite` с `{showState=false}` опцией) в `61-dashboard-active-base.js`; переписать `61-dashboard-active-generator.js:_writeRaw` и `20-ionc-test-signal.js:_writeTestSignalValue` под него
- [ ] Добавить `renderValueOnOffFields(config)` / `parseValueOnOffFields(form)` в `61-dashboard-active-base.js`; применить в Toggle (`192-236`) и PushButton (`169-235`)
- [ ] Добавить `renderLabelField(config)` / `parseLabelField(form)` в `60-widget-sensor-binding.js`; применить в passive widget'ах (`61-dashboard-widgets.js` 8 occurrences, `61-dashboard-widget-gauge.js` 2 occurrences)
- [ ] **Commit + `make app`**

## Phase 5 — Renderer template-method consolidation

- [ ] Добавить `subscribeToChartSensorLocal()` в `BaseObjectRenderer` или мixin; переписать override'ы в `21-opcua-exchange.js:661-667`, `22-modbus-master.js:501-506`, `23-modbus-slave.js:388-393`, `24-opcua-server.js:435-440`
- [ ] Добавить `setupNamedSectionResize(prefix, storageKey, heightProp, options)` в `ResizableSectionMixin` (`10-base-renderer.js`); переписать `loadSensorsHeight + setupSensorsResize` в `21/22/23/24-*.js`
- [ ] Добавить `static loadingIdPrefix` + general `showLoadingIndicator(show)` в `BaseObjectRenderer`; удалить override'ы в `20-ionc-renderer.js:349-352`, `21-opcua-exchange.js:673-678`, `24-opcua-server.js:442-447`
- [ ] **Commit + `make app`**

## Phase 6 — IONC dialogs unification

- [ ] Расширить `_ioncSensorAction(endpoint, body, mutateSensor, onError, autoCloseDialog?)` в `20-ionc-renderer.js:716-735`; route три closure'а (set `:599-625`, freeze `:665-697`, unfreeze `:780-804`) через него
- [ ] **Commit + `make app`**

## Phase 7 — initSSE() refactor

- [ ] В `04-sse.js`: вытащить `_sseHandlers = { event_name: fn }` lookup-объект (14 событий); `safeHandle(evt, fn)` обёртка для try/catch + `console.warn` boilerplate; `Object.entries(_sseHandlers).forEach(([evt, fn]) => eventSource.addEventListener(evt, safeHandle(evt, fn)))`
- [ ] **Commit + `make app`**

## Phase 8 — Dashboard manager splits

- [ ] Разбить `createWidget()` (`62-dashboard-manager.js:615-746`) на `_buildWidgetHeader()`, `_applyPositioning()`, `_attachWidgetInteractions()`
- [ ] Разбить `showWidgetConfig()` (`:931-1057`) на `_resolveWidgetContext`, `_resetIdempotencyFlags`, `_buildCommonConfigHtml`, `_wireRotateButtons`
- [ ] Разбить `startDrag()` (`:1286-1431`) — извлечь `onMouseMove` и `onMouseUp` в методы класса; явные state'ы вместо ad-hoc shift-key branching
- [ ] **Commit + `make app`**

## Phase 9 — Style consistency pass

- [ ] Привести naming к canonical `bindEvents()`: переименовать `setupEventHandlers` (log-viewer), `setupEventListeners` (uwsgate), `bindRowEvents` (uwsgate)
- [ ] Перевести Russian log strings в `04-sse.js` (13×), `99-init.js`, `51-ui-render.js`, `50-ui-tabs.js` на English («SSE: error handling X», «Failed to load X»)
- [ ] Заменить `parseInt(form...value, 10)` на `parseIntegerOrDefault` в `61-dashboard-active-button.js:222`, `20-ionc-renderer.js:591,667`
- [ ] Конвертировать `99-init.js:36-44,52-53` `.then().catch()` → `await`
- [ ] Конвертировать `60-widget-sensor-binding.js:152-153`, `41-dialogs.js:115-119,817-823` `.then()` → `await`
- [ ] `10-base-renderer.js:763-765` — заменить `valA == null` на explicit `=== null || === undefined` (или оставить `== null` consistent — выбираем последнее, так компактнее)
- [ ] Стандартизовать имя catch-параметра на `err` (`25-uwsgate.js:770`, `60-widget-sensor-binding.js:169`)
- [ ] **Commit + `make app`**

## Phase 10 — Verify

- [ ] `make app` — финальная пересборка
- [ ] `go test ./...` — backend тесты (для уверенности что не зацепили)
- [ ] `make js-tests` — полный E2E прогон
- [ ] Если что-то упало — починить только упавшие, retry, потом полный прогон

---

**Total:** ~10 commits, охватывают все 35 находок.
