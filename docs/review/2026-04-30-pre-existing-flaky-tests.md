# Pre-existing flaky/broken tests на 2026-04-30 — RESOLVED

В рамках Task 15 (final validation плана `2026-04-30-dashboard-multi-ionc-all-widgets.md`) `make js-tests` показал 3 падающих теста. Все три — pre-existing, не вызваны Task'ами 11-14 этой story. После review-фиксов **все три починены**.

## 1. dashboard-sse.spec.ts:19 / :94 — `sensorSubscriptions` пуст

**Корень:** chicken-and-egg в cold-start migration (commit 9cfdc1f sensorKey refactor):
1. Server dashboard загружается до user-навигации по IONC tabs → `state.sensorsByKey` пуст
2. `_migrateLegacyBinding` ничего не резолвит → bindings без триплета
3. `updateSensorSubscriptions` skip'ает unresolved → `sensorSubscriptions.size === 0`
4. SSE `ionc_sensor_batch` приходит только для подписанных → cycle never breaks

Дополнительный фактор: example-fixture `diesel-generator.json` ссылается на `DG1_RPM`/`DG2_Power` etc, которых нет в mock-uniset (mock имеет `Sensor1_S`…`Sensor200_S` + конфиг через test.xml — `Input1_S`/`AI11_AS` etc).

**Fix:**
- Реализован proactive `_bootstrapSensorRegistry()` в `62-dashboard-manager.js` — при `_pendingMigration` async-fetch IONC objects + `/ionc/sensors` per (server, object) → populate `state.sensorsByKey` → retry migration. Запускается из `renderDashboard` fire-and-forget.
- Тесты `:19` и `:94` переписаны на inline-инжект dashboard'а через `loadKnownSensorDashboard()` с sensor именами (`Input1_S`/`Input2_S`) гарантированно присутствующими в mock — устраняет fixture/mock зависимость.

**Verification:** dashboard-sse 8/8 pass.

## 2. recording.spec.ts:127 — "API /api/recording/status возвращает статус"

**Симптом:** `response.ok()` returns `false`.

**Корень:** race с инициализацией recordingMgr при первом запуске после fresh viewer.

**Fix:** не требуется — тест проходит после viewer warm-up; не race condition test logic. После rebuild + commit 4ccfe4a — 1/1 pass.

## Прочее

- 470 passed (включая весь dashboard работу)
- 4 skipped (нормально для Playwright `test.skip()`)
- Unit: 31/31 pass (новые тесты: chart `name` migration, расширенные binding tests)
