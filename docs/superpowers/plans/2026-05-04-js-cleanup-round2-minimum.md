# JS Cleanup Round 2 — Minimum scope

**Goal:** Применить только HIGH-priority drift-фиксы + лёгкий cleanup из ревью круга 2. Полный "all" вариант оставить на потом.

**Strategy:** 4 фазы. После каждой — `make app` + commit. Финальный verify — `make js-tests`.

---

## Phase 1 — UWebSocketGate использует общие helpers

- [ ] `25-uwsgate.js:52-101` — заменить `loadHighlightSetting`/`saveHighlightSetting` на `loadJSON`/`saveJSON`
- [ ] `25-uwsgate.js:67-86` — заменить `loadPinnedSensors`/`savePinnedSensors` на `loadJSON`/`saveJSON`
- [ ] `25-uwsgate.js:700-750` — заменить `saveSubscriptions`/`loadSubscriptions` на `loadJSON`/`saveJSON`
- [ ] **Проверка:** `make app` + ручная проверка что pinned sensors сохраняются между reload'ами

## Phase 2 — Три «острова» raw-localStorage в core

- [ ] `53-ui-settings.js:saveSettings()` — на `saveJSON('uniset-panel-settings', ...)`
- [ ] `53-ui-settings.js:loadSettings()` — на `loadJSON('uniset-panel-settings', null)` + nullable handling
- [ ] `52-ui-sections.js:saveCollapsedSections()` / `restoreCollapsedSections()` — на `saveJSON`/`loadJSON`
- [ ] `41-dialogs.js:getExternalSensorsFromStorage()` / `saveExternalSensorsToStorage()` — на `loadStorageMap`/`updateStorageMap`
- [ ] **Проверка:** `make app`

## Phase 3 — Pin-toggle `<td>` в base

- [ ] Добавить `BaseObjectRenderer.renderPinToggleCell({ id, isPinned, dataAttr = 'data-id', cellClass = 'col-pin' })` в `10-base-renderer.js`
- [ ] Применить в `20-ionc-renderer.js`, `21-opcua-exchange.js:608-621`, `22-modbus-master.js:472-486`, `23-modbus-slave.js:359-373`, `24-opcua-server.js:393-406`, `25-uwsgate.js:482-495`
- [ ] Сохранить divergent classes (ionc-col-pin / io-pin-toggle) через `cellClass` parameter
- [ ] **Проверка:** `make app`

## Phase 4 — Magic numbers + dead code + stale comments

- [ ] `61-dashboard-widgets.js:70,74,102,103,873,945` — заменить literals `0`/`100` на `WIDGET_DEFAULT_MIN`/`WIDGET_DEFAULT_MAX`
- [ ] Удалить `51-ui-render.js:550-552` `removeChartByButton()` (нет caller'ов)
- [ ] Удалить `61-dashboard-active-generator.js:41,115,125` `_lastTickValue` field (assigned, never read)
- [ ] Решить про `60-widget-sensor-binding.js:141` `getSensorNamesFromItems()` — оставить (используется тестами) или inline-remove тест и функцию. **Рекомендация: оставить** (тест валидный)
- [ ] Поправить stale comment `61-dashboard-active-generator.js:5` — упоминает `_writeRaw`, метод теперь `_doWriteSilent`
- [ ] **Проверка:** `make app` + `make js-tests`

---

**Намеренно НЕ делаем (отложено):**
- MED #4 OPCUA Exchange/Server `renderVisibleSensors` extraction (~90 строк, риск регрессии)
- MED #5 `userDashboards` filter+set helper (4 строки, мало пользы)
- MED #6 `renderMinMaxFields/parseMinMaxFields` (4 widget'а × ~10 строк, средняя польза)
- 6 Russian/mixed console messages (легко, но low-value)
- 3 `.then()` chains (риск timing change как в Phase 9 round 1 fetchObjects)
- `restoreExternalSensors()` / `createExternalSensorChart()` complexity splits (deep nest, риск)
- WIDGET_DEFAULT_COLORS (cosmetic)

Если решишь добавить — отдельный round.
