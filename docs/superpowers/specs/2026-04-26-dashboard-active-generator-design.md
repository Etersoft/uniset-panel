# GeneratorWidget — Design Spec

**Status:** Approved
**Date:** 2026-04-26
**Branch:** `story/dashboard-active-controls`

## Overview

Пятый и последний active dashboard widget. Записывает в датчик значение по математическому закону во времени (square / sin / cos / linear / random) — оборачивает существующий `SignalGenerator` engine (`08-signal-generator.js`) в дашборд-виджет с UX для запуска/остановки и отображения текущего значения.

## Goals

- Дать оператору возможность запустить тестовый сигнал в датчик прямо с dashboard, без открытия IONC view.
- Минималистичный widget — один стиль, кнопка Start/Stop + value.
- Параметры (type / min / max / period / etc.) настраиваются через config dialog (как у других active widgets).

## Non-Goals

- Множественные visual styles (только compact).
- Inline parameter editing (через config dialog only).
- Persist running state между reload'ами (после reload всегда stopped).
- Запуск нескольких генераторов одного widget'а параллельно.
- История значений / sparkline (можно добавить отдельным виджетом если понадобится).

## Architecture

```
┌────────────────────────────────────────────┐
│ GeneratorWidget extends ActiveDashboardWidget │
│                                            │
│  config: {                                 │
│    sensor, sensorId, objectName, label,    │ ── от base
│    requireConfirmation                     │
│    type, min, max, step, pause,            │ ── специфичные
│    pulseWidth, period                      │
│  }                                         │
│                                            │
│  state:                                    │
│    _signalGen: SignalGenerator|null        │
│    _lastTickValue: number|null             │
│                                            │
│  методы:                                   │
│    _onToggle()  — start/stop по клику      │
│    _start()     — создать SG, запустить    │
│    _stop()      — остановить, обнулить SG  │
│    _isRunning() — true если SG активен     │
│    _writeRaw(v) — POST без per-tick checks │
│    update()     — no-op (feedback игнор.)  │
│    destroy()    — _stop + super            │
└────────────────────────────────────────────┘

       │ создаёт/управляет
       ▼
┌────────────────────────────────────────────┐
│ SignalGenerator (08-signal-generator.js)   │
│   start() / stop() / isRunning()           │
│   onTick(value) колбэк                     │
└────────────────────────────────────────────┘
```

## Visual Style

### compact (single style, default 3×1)

```
┌─────────────────────────────────────┐
│ SIN WAVE      847    [●─────○]     │
│ ↑ label       ↑value ↑toggle       │
└─────────────────────────────────────┘
```

- **`label`** — `config.label || config.sensor || 'Generator'`. Truncate `text-overflow: ellipsis`, `white-space: nowrap`, max-width auto.
- **`value`** — `_lastTickValue` или `--` если stopped. Зелёный (#22c55e) когда running, серый (#6b7280) когда stopped.
- **`toggle`** — slider Start/Stop. CSS:
  - Stopped: `background: #374151` (серый), handle слева
  - Running: `background: #22c55e` (зелёный), handle справа
  - Width 42px, handle 18px, transition 0.15s

### Sizes

- `defaultSize: { width: 3, height: 1 }` — оптимально для compact
- `minSize: { width: 2, height: 1 }` — label может скрыться, останется value+toggle
- `maxSize: { width: 6, height: 2 }` — нет смысла больше для compact

## Config Form

`getActiveConfigFields(config)` возвращает HTML с полями (после base полей: objectName/sensor/label/requireConfirmation):

```html
<row>
  <field>type [square|sin|cos|linear|random]</field>
</row>
<row>
  <field>min</field>
  <field>max</field>
</row>
<!-- Conditional fields by type -->
<!-- type ∈ {linear, sin, cos}: -->
<row>
  <field>step (число точек/шаг)</field>
  <field>pause (ms)</field>
</row>
<!-- type === square: -->
<row>
  <field>pulseWidth (ms)</field>
  <field>pause (ms)</field>
</row>
<!-- type === random: -->
<row>
  <field>period (ms)</field>
</row>
```

Conditional показ — JS handler в `initConfigHandlers`: при изменении type select показывает/скрывает соответствующие поля. Дефолтный type = `square`.

### Validation (parseActiveConfigFields)

Те же правила что в IONC dialog (`20-ionc-renderer.js` ~lines 1240-1275):

- `min`, `max` — числа, `max > min`
- `step` — для linear/sin/cos: число, `≠ 0`
- `pause` — для linear/sin/cos/square: число, `> 0`
- `pulseWidth` — для square: число, `> 0`
- `period` — для random: число, `>= 100` (защита от чрезмерной нагрузки)

При невалидных значениях `parseActiveConfigFields` возвращает дефолты + warning в console (не блокирует save — base.parseConfigForm уже сохранил остальные поля).

## Behavior

### Start (toggle off → on)

1. `isInteractive()` check (controlToken + не-edit mode). Если false — игнор.
2. Если `requireConfirmation === true` → `_confirm('Start generator on SENSOR?')`. Если cancel — игнор.
3. Создать `SignalGenerator` instance с config'ом + `onTick: (value) => this._onTick(value)`.
4. `signalGen.start()`. UI: toggle переключается на зелёный (`.running` class на toggle element). Value начинает обновляться.
5. `_signalGen` сохраняется как property для управления.

### Stop (toggle on → off)

1. `_signalGen.stop()`, `_signalGen = null`.
2. `_lastTickValue = null`.
3. UI: toggle серый, value → `--`.

### onTick (от SignalGenerator)

1. `_lastTickValue = value`.
2. Update value display в DOM.
3. `_writeRaw(value)` — fire-and-forget POST на `ionc/set`. Без `_confirm` (уже подтверждено при Start), без `_setWriteState('pending')` (no point per-tick), без `commandValue` обновления (нет точки в two-way binding для генератора).
4. На POST error — `console.warn` + `_stop()` + UI: показать `active-error` border (purple, как у других active widgets) + tooltip "Generator stopped: <reason>".

### Edit mode toggle

`_onToggle()` начинается с `if (!this.isInteractive()) return;` — что покрывает edit mode (через base `isInteractive()`).

### ControlToken released во время работы

При срабатывании `controlStatusChanged` event base зовёт `_updateInteractivityClass`. Override в Generator: дополнительно проверить и остановить генератор если работает.

```js
_updateInteractivityClass() {
    super._updateInteractivityClass();
    if (this._isRunning() && !this.isInteractive()) {
        this._stop();
    }
}
```

### Config changed (apply config dialog)

Dashboard manager после apply пересоздаёт widget instance (destroy + new). Это автоматически останавливает работающий генератор. Новый instance стартует в stopped state.

### Widget removed (delete)

`destroy()` override вызывает `_stop()` потом `super.destroy()`. Гарантия — нет утечки `setInterval`'ов.

### update(value, error) — SSE feedback

No-op (как PushButton). Generator не привязан к feedback от sensor'а — UI показывает что генератор послал в `_lastTickValue`. Сохраняем `feedbackValue` для совместимости с base, но НЕ вызываем `renderFeedback`.

## Disabled state

Через общий механизм `ActiveDashboardWidget`:
- `data-active-widget="true"` на контейнере → grayscale в edit mode
- `active-disabled` class когда `!isInteractive()` → cursor not-allowed
- `data-control-blocked` атрибут → tooltip "Take control to interact"

## Error Handling

**POST error (ionc/set вернул не 200):**
- console.warn(detailed error)
- `_stop()` — генератор останавливается
- `_setWriteState('error', message)` через base — purple border + tooltip с error
- Юзер видит error → проверяет config или connectivity → пытается снова Start

**SignalGenerator onTick exception:**
- Уже catch'нут в `SignalGenerator.tick()` (внутренний try/catch с `console.error`).
- Generator продолжает идти.

**Sensor not configured при Start:**
- `_writeRaw` зовёт base helper который проверяет `config.sensorId`. Если null → `_setWriteState('error', 'Sensor not configured')` + `_stop`.

## Tests (E2E)

`tests/single/dashboard-active-generator.spec.ts`:

1. **renders compact widget**: `.generator-widget` visible с label + value + toggle.
2. **toggle Start fires SignalGenerator + first POST**: click toggle → `_signalGen` instance создан, есть POST на `/ionc/set` в течение 200ms.
3. **toggle Stop останавливает + value=--**: click toggle running → `_signalGen=null`, value text === `--`.
4. **toggle disabled в edit mode**: editMode=true → click toggle → no Start, no POST.
5. **toggle disabled без controlToken**: hasController=false → click → no Start.
6. **config dialog conditional fields**: select type=random → видны period, скрыты step/pause/pulseWidth.
7. **config change останавливает running**: start gen → apply config → gen stopped (`_signalGen===null`).
8. **destroy останавливает**: removeWidget → `_signalGen===null` (можно проверить через тест-хук).
9. **multiple ticks fire**: после Start подождать ~600ms (для random period=200ms) → ≥3 POST'а сделаны.
10. **requireConfirmation один раз при Start**: requireConfirmation=true → Start → confirm dialog 1 раз → onTick fires N раз без новых dialog'ов.

Regression sweep:
- Все active widget specs
- dashboard-widgets.spec.ts (count 12 → 13)

## Files

| File | Action | Notes |
|---|---|---|
| `ui/static/js/src/61-dashboard-active-generator.js` | **Create** | ~250 lines |
| `ui/static/js/src/62-dashboard-manager.js` | **Modify** (line ~6-19) | add `'generator': GeneratorWidget` |
| `ui/static/css/style.css` | **Modify** (append) | `.generator-widget` + `.gen-label/value/toggle` |
| `tests/single/dashboard-active-generator.spec.ts` | **Create** | 10 E2E case'ов |
| `tests/single/dashboard-widgets.spec.ts` | **Modify** (line 4 + 183/193) | count 12 → 13 |
| `CLAUDE.md` | **Modify** | Active widgets section — параграф про GeneratorWidget |

## Open Questions

(Все ключевые вопросы решены — закрыто 3 multiple-choice clarifying в брейнсторме.)

## Future Enhancements (out of scope)

- Sparkline preview сигнала (рисовать последние N tick'ов в widget'е).
- Persist running state в localStorage с restore prompt.
- Расширенный `card` стиль с visualization.
- Multiple генераторов в одном widget'е (chain или array).
