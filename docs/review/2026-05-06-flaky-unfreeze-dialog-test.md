# Flaky test: ionotifycontroller — "should show unfreeze dialog with both values on single click"

**Дата:** 2026-05-06
**Файл:** `tests/single/ionotifycontroller.spec.ts:1256`

## Симптом

Тест нестабилен. Возможные проявления:

- `unfreezeBtn.click()` падает с "element was detached from the DOM" / "th class='ionc-col-actions' intercepts pointer events" — row перерисовывается между selector resolve и click
- `expect(frozenValueInDialog).toContainText('❄')` падает — диалог открывается, но frozen-значение не отображается (возможно mock не сохранил frozen для этого sensorId)

## Расследование

Запуск с `--repeat-each` на разных коммитах показал:

| Commit | State | Pass rate |
|---|---|---|
| 99b26f2 | до серии fix-коммитов 2026-05-06 | 1/3 (flaky) |
| cad39b0 | + Subscribe сбрасывает lastValues | 2/5 — 5/5 (flaky, разный isolated run) |
| 60aadec | + UWSGate replay из currentValues | not isolated tested |
| 9754409 | + immediate replay в BasePoller.Subscribe | **0/10** (стабильно падает) |

**Вывод:**
- Тест pre-existing flaky уже на 99b26f2 (до моих фиксов).
- `9754409` (immediate replay в `BasePoller.Subscribe`) **усугублял** race — добавлял доп. SSE batch при подписке, IONC row перерисовывалась чаще, click target detached.

## Принятое решение

**Откачен** immediate replay из `BasePoller.Subscribe` (commit после 9754409). Оставлено только сброс `lastValues` (cad39b0) — на следующий poll backend и так отправит всё.

UWSGate replay (60aadec) сохранён — UWSGate push-based, без replay новый подписчик НИКОГДА не получит initial value для уже-подписанного sensor'а (нет poll-резерва как у BasePoller'а).

Frontend имеет fallback через `initializeWidgetValues` + API fetch на cache miss, так что 1s задержка backend'а до first SSE batch не критична.

## Рабочая гипотеза по pre-existing flake

Тест последовательно:
1. Замораживает первый `freeze` button в строке (sensorId неопределён, зависит от того, какой sensor оказался "первым" после загрузки)
2. Нажимает `unfreeze` button в той же row
3. Проверяет что dialog содержит замороженное значение `99999`

Возможные источники флака:
- Row перерисовывается на каждый ionc_sensor_batch (~1s) → element detached между selector resolve и click
- sticky thead перехватывает pointer events если row при rerender'е сдвинулась под header
- Frozen value в backend mock SharedMemory может не сохраняться корректно для конкретного sensorId — диалог получает текущее `real_value` вместо frozen

## Рекомендации для последующего фикса

1. Стабилизировать выбор sensor: не "first frozen button", а explicit `tr[data-sensor-id="N"]` с известным значением до freeze.
2. Перед `unfreezeBtn.click()` дождаться `await expect(unfreezeBtn).toBeStable()` или явный `waitForFunction(() => row не перерисовывается)`.
3. Проверить mock-uniset что freeze для конкретного sensorId сохраняется и возвращается в `frozen_value` поле.
