# Pre-existing flaky/broken tests на 2026-04-30

В рамках Task 15 (final validation плана `2026-04-30-dashboard-multi-ionc-all-widgets.md`) `make js-tests` показал 3 падающих теста. Все три — pre-existing, **не вызваны** Task'ами 11-14 этой story.

Verified: оба `dashboard-sse` теста стабильно падают и на `77012ed` (Task 13 done, до Task 14 commit). Recording-status — env-зависимый.

## 1. dashboard-sse.spec.ts:19 — "виджеты имеют подписки на сенсоры"

**Симптом:** `dashboardState.sensorSubscriptions.size === 0` после открытия первого server dashboard.

**Корень:** server dashboard `system-overview.json` ссылается на сенсор `Sensor15099_S` (см. `config/dashboards/system-overview.json:27`), которого нет в `tests/mock-server/server.js` (там Sensor1_S…Sensor200_S). Migration не может заполнить триплет → `_subscribeActiveSensorsBackend` пропускает widget → подписок нет.

**Тип:** environment / mock-data mismatch, **не** регрессия кода.

**Дополнительная архитектурная заметка:** даже если бы сенсор существовал, в этом branch'е есть скрытый chicken-and-egg в cold-start migration:

1. `loadDashboard` вызывает `_migrateLegacyBinding()` (line 444 в `62-dashboard-manager.js`)
2. `state.sensorsByKey` пуст (никто не открывал IONC tabs / objects view)
3. Migration возвращает 0 → bindings остаются bare → `updateSensorSubscriptions` ничего не добавляет
4. `_pendingMigration = true`, надежда на `tryResolvePendingMigration()` через SSE
5. Но SSE `ionc_sensor_batch` приходит только для **подписанных** сенсоров (backend polling driven by /ionc/subscribe POSTs)
6. Подписок нет → polling нет → SSE нет → migration retry никогда не срабатывает

**Follow-up для отдельного PR:** добавить proactive bootstrap в `tryResolvePendingMigration()` или `loadDashboard`: если `_pendingMigration` после первой попытки, async fetch `/api/objects?type=IONotifyController` per server + `/api/objects/{name}/ionc/sensors?server=...` per object → populate `sensorsByKey` → re-run migration. Это та же логика, что используется в config-dialog binding helpers, можно generalize.

## 2. dashboard-sse.spec.ts:94 — "несколько виджетов с разными sensor подписками"

Та же причина что #1. `Array.from(subs.keys())` пустой массив.

## 3. recording.spec.ts:127 — "API /api/recording/status возвращает статус"

**Симптом:** `response.ok()` returns `false` (не-200). Тест ожидает `configured: true`, но в test env recordingMgr либо не сконфигурирован, либо `GetStats()` возвращает ошибку.

**Тип:** environment, recording subsystem не настроен в `docker-compose.yml` / mock-server fixture. Не связано с dashboard work.

## Прочее

- 470 passed (включая весь dashboard работу: dashboard-multi-server-isolation 12, dashboard-active-toggle 15, dashboard-widgets 21, dashboard-widget-binding-multi-server 5, dashboard-widget-settings 7, и т.д.)
- 4 skipped (нормально для Playwright `test.skip()`)
- Unit: 30/30 pass

## Решение для текущей PR

Не блокирует merge. Failures документированы здесь, follow-up для proactive sensorsByKey bootstrap — отдельный issue.
