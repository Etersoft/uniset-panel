# Flaky test: ionotifycontroller — "should show unfreeze dialog with both values on single click"

**Дата:** 2026-05-06
**Файл:** `tests/single/ionotifycontroller.spec.ts:1256`

## Симптом

Тест нестабилен: иногда падает на `unfreezeBtn.click()` с ошибкой "element was detached from the DOM" / "th class='ionc-col-actions' intercepts pointer events", иногда — на `expect(frozenValueInDialog).toContainText('❄')` (диалог открывается, но frozen-значение не отображается).

## Подтверждение pre-existing

Тест был воспроизведён failing на **99b26f2** (commit ДО серии fix-коммитов cad39b0 → 60aadec → 9754409, относящихся к toggle reset + launcher status dot + poller cache replay). Это означает что флакейность существовала независимо от изменений 2026-05-06 и НЕ является регрессией.

Проверено: `git checkout 99b26f2 -- internal/poller/... internal/sm/... internal/uwsgate/...` + `make build` + `npx playwright test ... -g 'should show unfreeze dialog with both values on single click'` → 1/1 fail (на `frozenValueInDialog.toContainText('❄')`).

## Рабочая гипотеза

Тест последовательно:
1. Замораживает первый `freeze` button в строке (sensorId неопределён, зависит от того, какой sensor оказался "первым" после загрузки)
2. Нажимает `unfreeze` button в той же row
3. Проверяет что dialog содержит замороженное значение `99999`

Возможные источники флака:
- Row перерисовывается на каждый ionc_sensor_batch (~1s) → element detached между selector resolve и click
- sticky thead перехватывает pointer events если row при rerender'е сдвинулась под header
- Frozen value в backend mock SharedMemory может не сохраняться корректно для конкретного sensorId — диалог получает текущее `real_value` вместо frozen

## Действия

Не починено в текущей итерации. Помечено как known flaky. Остальные **483 теста** (`make js-tests`) проходят стабильно после фиксов cad39b0/60aadec/9754409.

## Рекомендации для последующего фикса

1. Стабилизировать выбор sensor: не "first frozen button", а explicit `tr[data-sensor-id="N"]` с известным значением до freeze.
2. Перед `unfreezeBtn.click()` дождаться `await expect(unfreezeBtn).toBeStable()` или явный `waitForFunction(() => row не перерисовывается)`.
3. Проверить mock-uniset что freeze для конкретного sensorId сохраняется и возвращается в `frozen_value` поле.
