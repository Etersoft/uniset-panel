# State Label Widget Design

**Date:** 2026-06-01
**Status:** Approved (awaiting user spec review before plan)
**Author:** Claude (Opus 4.7) + Pavel Vaynerman

## Goal

Новый passive dashboard widget `StateLabelWidget` — отображает текст с цветом
фона / шрифта / миганием в зависимости от значения датчика. Маппинг через
список диапазонов (first-match wins) с поддержкой открытых границ.

## Background

Существующие widget'ы покрывают близкие, но не точно эту задачу:

- `LabelWidget` — статичный текст, без привязки к датчику.
- `LedWidget` — boolean threshold (ON/OFF) с двумя цветами; не подходит для
  multi-state (RUN / STOP / FAULT / WARN).
- `StatusBarWidget` — массив LED индикаторов с подписями, но без многосостоянного
  текста с цветами фона / blink behavior.
- `DigitalWidget` — показывает число с единицами, без mapping.

Использование: SCADA-style status indicators (mode displays, alarm panels,
machine states), где значение датчика — это enum / состояние / диапазон, а
оператору нужно видеть человеко-читаемое имя состояния с цветом и опционально
мигание для привлечения внимания.

## Non-Goals

- **Multi-sensor binding** (как StatusBar). Один widget = один датчик. Если нужно
  N датчиков — N widget'ов.
- **Write capability**. Это passive widget, без command path. Если нужна запись —
  отдельный active widget (Toggle / PushButton) в комбинации.
- **Сложный pattern animation** (fade gradient, slide, blink-pulse-shape).
  Blink = простой opacity toggle 1↔0.25.
- **Calculated states** (формулы, JS-expressions). Только числовые диапазоны.

## Architecture

```
SSE update → updateBySensor(name, value, error, ctx)
                          │
                          ▼
                resolveStateLabel(value, states, fallbackCfg, prevState)
                          │  (pure function — testable без DOM)
                          ▼
                { source: 'match'|'raw'|'ignore'|'default', state: {text,fg,bg,blink} | null }
                          │
                          ▼
                _applyState(state, source)
                  ├─ stopBlink()
                  ├─ textContent / color / background
                  └─ startBlink(state.blink) if blink ≠ none
```

**Файлы:**
- *new* — `ui/static/js/src/61-dashboard-widget-state-label.js` — `StateLabelWidget`
  class + module-level pure helpers `resolveStateLabel`, `findStateOverlaps`.
- *modify* — `ui/static/js/src/06-utils.js` — добавить `renderStateListEditor`,
  `parseStateList` (по аналогии с `renderColorZonesEditor`/`parseColorZones`).
- *modify* — `ui/static/js/src/62-dashboard-manager.js` — register widget type
  в `WIDGET_TYPES`, `defaultSize`.
- *modify* — `ui/static/css/style.css` — `.state-label-widget`,
  `.state-label-text`.
- *modify* — `docs/dashboards.md` — раздел про State Label widget.
- *test* — `tests/unit/state-label-resolve.test.ts`,
  `tests/unit/state-label-render.test.ts`,
  `tests/single/dashboard-state-label.spec.ts`.

## Config Schema

```js
{
  // Single sensor binding (как Digital/Label)
  serverId, objectName, sensor, sensorId,

  // States: first-match wins, optional from/to для открытых диапазонов.
  // Inclusive: from ≤ value ≤ to. Omitted from = -Infinity, omitted to = +Infinity.
  states: [
    { from: 0,    to: 0,    text: 'OFF',   fg: '#fff', bg: '#6b7280', blink: 'none' },
    { from: 1,    to: 1,    text: 'RUN',   fg: '#fff', bg: '#22c55e', blink: 'none' },
    { from: 2,    to: 2,    text: 'FAULT', fg: '#fff', bg: '#ef4444',
      blink: { interval: 500 } },                                        // вечно
    { from: 80,   to: 100,  text: 'HIGH',  fg: '#111', bg: '#fbbf24',
      blink: { interval: 800, duration: 5000 } },                        // 5 sec flash при transition
    {              to: 0,    text: 'LOW',   fg: '#fff', bg: '#3b82f6' },  // value ≤ 0
    { from: 100,           text: 'OVER',  fg: '#fff', bg: '#ef4444' },  // value ≥ 100
  ],

  // Fallback policy (когда нет match или error/null)
  fallback: 'raw',         // 'raw' (default) | 'ignore' | 'default'
  fallbackHold: false,     // только для 'ignore': true = удержать последний valid state; false = blank
  defaultState: {          // только для 'default'
    text: '--', fg: '#9ca3af', bg: '#1f2937', blink: 'none'
  },

  // Optional UI tuning (как у Label)
  fontSize: 'auto',  // 'auto' (fit-to-widget) | 12 | 14 | 16 | 20 | ...
  bold: false,
  align: 'center',   // 'left' | 'center' | 'right'
}
```

**Schema notes:**

- `from`/`to` — числа или omitted (пустое поле в editor = -∞/+∞). Inclusive.
- `text` — строка, отображаемая когда state matches.
- `fg` / `bg` — hex или CSS color. Если omitted — наследует с widget container.
- `blink: 'none'` (или omitted) — не мигает.
- `blink: { interval: ms }` — мигает каждые `interval` ms всё время пока state активен.
- `blink: { interval: ms, duration: ms }` — мигает на протяжении `duration` ms
  при transition в этот state, потом останавливается. Timer reset при смене state.
- `fallback: 'raw'` — показывает голое число без `fg/bg` (визуальный сигнал
  «не сконфигурировано»).
- `fallbackHold` имеет смысл только при `fallback: 'ignore'`.

## Mapping Engine

Pure module-level функции, testable без DOM:

```js
// resolveStateLabel — основной resolver.
// prevState нужен только для 'ignore' + 'fallbackHold' path.
function resolveStateLabel(value, states, fallbackCfg, prevState) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return _applyFallback(fallbackCfg, prevState, value);
    }
    const numValue = Number(value);
    for (const s of states) {
        const lo = s.from !== undefined && s.from !== '' ? Number(s.from) : -Infinity;
        const hi = s.to   !== undefined && s.to   !== '' ? Number(s.to)   : +Infinity;
        if (numValue >= lo && numValue <= hi) {
            return { source: 'match', state: s };
        }
    }
    return _applyFallback(fallbackCfg, prevState, numValue);
}

function _applyFallback(cfg, prevState, value) {
    const policy = cfg?.policy || 'raw';
    if (policy === 'raw') {
        return { source: 'raw', state: { text: String(value ?? '--') } };
    }
    if (policy === 'ignore') {
        if (cfg?.hold && prevState) return { source: 'ignore', state: prevState };
        return { source: 'ignore', state: null };
    }
    if (policy === 'default') {
        return { source: 'default', state: cfg?.defaultState || { text: '--' } };
    }
    return { source: 'raw', state: { text: String(value) } };
}

// findStateOverlaps — для editor warning. Возвращает массив [i, j] пар индексов
// перекрывающихся state'ов. Используется чтобы пометить state'ы которые
// никогда не сработают из-за first-match precedence.
function findStateOverlaps(states) { /* ... */ }
```

**Invariants:**

- `resolveStateLabel` — чистая функция. No side effects, no DOM access.
- Первое match выигрывает — порядок states имеет значение, controlled by editor drag.
- Открытые диапазоны через `-Infinity` / `+Infinity` — числовые сравнения корректны.
- При `value = NaN` (например error path) — попадает в fallback.

## Rendering

### DOM

```html
<div class="widget-content state-label-widget">
  <div class="state-label-text">RUN</div>
</div>
```

### `render()`

Создаёт DOM, ставит ref `this.textEl`, применяет `align`/`bold`/`fontSize` из
config, настраивает auto-fit (если `fontSize === 'auto'`). НЕ применяет state —
это делает первый `update()`.

### `update(value, error)`

```js
update(value, error = null) {
    const v = error ? null : value;
    const { states = [], fallback = 'raw', fallbackHold = false, defaultState } = this.config;
    const fallbackCfg = { policy: fallback, hold: fallbackHold, defaultState };

    const { source, state } = resolveStateLabel(v, states, fallbackCfg, this._lastValidState);

    if (source === 'match' || source === 'default') {
        this._lastValidState = state;
    }
    this._applyState(state, source);
}
```

### `_applyState(state, source)`

```js
_applyState(state, source) {
    this._stopBlink();
    if (!state) {  // 'ignore' + no hold
        this.textEl.textContent = '';
        this.element.style.background = '';
        this.textEl.style.color = '';
        return;
    }
    this.textEl.textContent = state.text ?? '';
    this.textEl.style.color = state.fg || '';
    this.element.style.background = (source === 'raw') ? '' : (state.bg || '');
    if (state.blink && state.blink !== 'none' && source !== 'raw') {
        this._startBlink(state.blink);
    }
}
```

## Blink

```js
_startBlink(blinkCfg) {
    const interval = parseIntegerOrDefault(blinkCfg.interval, 500);
    if (interval < 100) return;  // sanity floor — иначе CPU spinner
    this._blinkVisible = true;
    this._blinkTimer = setInterval(() => {
        this._blinkVisible = !this._blinkVisible;
        this.element.style.opacity = this._blinkVisible ? '1' : '0.25';
    }, interval);
    if (blinkCfg.duration && blinkCfg.duration > 0) {
        this._blinkStopTimer = setTimeout(() => this._stopBlink(), blinkCfg.duration);
    }
}

_stopBlink() {
    if (this._blinkTimer) { clearInterval(this._blinkTimer); this._blinkTimer = null; }
    if (this._blinkStopTimer) { clearTimeout(this._blinkStopTimer); this._blinkStopTimer = null; }
    this.element.style.opacity = '1';
}

destroy() {
    this._stopBlink();
    super.destroy?.();
}
```

**Blink notes:**

- Opacity 1 ↔ 0.25 — мягче чем full hide; не дёргает layout (display не меняется).
- Timer reset при смене state — `_stopBlink` всегда первое в `_applyState`.
- `duration` timer параллельно с `interval` — `setTimeout` cleanup'ит оба
  таймера через `_stopBlink`.
- Sanity floor `interval < 100ms` — защита от CPU spinner при misconfig.
- Tab visibility: при background tab браузер throttle'ит таймеры — это OK
  для нашего use case.

## Config Form + State List Editor

Reuse существующих helpers + новый компонент:

- `renderSensorBindingFields` / `parseSensorBindingFields` / `initSensorBindingHandlers`
  — без изменений, single-sensor binding как у Digital/Label.
- `renderStateListEditor(states)` — новый, в `06-utils.js`. Аналог
  `renderColorZonesEditor`, но row содержит: reorder buttons, `from`, `to`,
  `text`, `fg` color, `bg` color, blink-popover trigger, remove button.
- `parseStateList(container)` — парсер обратный.
- Blink настройка через mini-popover (иконка часов) — `none` /
  `forever` + interval input / `for duration` + interval + duration inputs.

### Reorder UX

State'ы переставляются через пару кнопок `↑` / `↓` слева в каждой строке.
**Reuse existing CSS class `.section-move-btn`** (22×22, hover → accent-blue,
disabled на крайних позициях) — тот же стиль что у reorder секций tab-панели
(Charts / IO / Variables). Это даёт визуальное единообразие с уже привычным
паттерном.

```html
<div class="section-reorder-buttons">
    <button class="section-move-btn" data-move="up"   title="Move up">↑</button>
    <button class="section-move-btn" data-move="down" title="Move down">↓</button>
</div>
```

Поведение:
- Клик `↑` swap с предыдущей строкой; `↓` swap со следующей.
- На первой строке `↑` disabled, на последней `↓` disabled.
- При reorder — `findStateOverlaps` пересчитывается, overlap warning обновляется.
- Конкретно drag-and-drop **не** делаем (YAGNI — section pattern в проекте тоже без drag).

**Overlap warning:** `findStateOverlaps(states)` вызывается на каждое изменение
editor'а (add/remove/reorder/edit from/to); rows которые перекрываются с
предшествующими (т.е. потенциально никогда не сработают) получают ⚠ badge
с подсказкой "Overlaps state #N — поставить выше через ↑, чтобы получить
приоритет".

**Fallback section** — radio buttons:
- ⦿ Show raw value (default)
- ○ Ignore  □ Hold last state
- ○ Default state — inline mini-editor (text/fg/bg/blink, same shape как state row)

**Appearance section** — collapsed по умолчанию: fontSize select (auto / 12 / 14
/ 16 / 20 / 24 / 32), bold checkbox, align select.

## Edge Cases

| Сценарий | Поведение |
|---|---|
| `value = null` | Fallback (raw → "--", ignore → blank/hold, default → defaultState) |
| `value = NaN` (parse fail) | То же что null |
| `error !== null` | Treated as null — fallback path |
| Все state'ы overlap, value matches multiple | First-match: первое state в массиве wins |
| Pустой `states: []` | Каждый value → fallback |
| `blink.interval < 100ms` | Не запускается (sanity floor) |
| `blink.duration` истёк, value не сменился | Stop blink, текст остаётся со static fg/bg |
| Widget destroy во время blink | `_stopBlink` cleanup'ит таймеры (no leak) |
| State с `text: ''` (пустой) | Допустимо — показывает только фон (visual badge) |
| Reorder state'ов в editor | New first-match: тот state с большим приоритетом выигрывает |

## Testing Strategy

### Unit — `tests/unit/state-label-resolve.test.ts`

- `resolveStateLabel`:
  - closed range match (value within [from, to])
  - open `from` (only `to` set)
  - open `to` (only `from` set)
  - fully open (no `from`, no `to`) — matches everything
  - first-match precedence with overlap
  - exact match `[from=5, to=5]`
  - no match → fallback 'raw' returns raw value as text
  - no match → fallback 'ignore' returns null
  - no match → fallback 'ignore' + hold returns prevState
  - no match → fallback 'default' returns defaultState
  - `null` value → fallback path
  - `NaN` value → fallback path
- `findStateOverlaps`:
  - empty list → []
  - no overlaps → []
  - two overlapping ranges → [[0, 1]]
  - open-ended range covering all → multiple overlaps

### Unit — `tests/unit/state-label-render.test.ts`

- `render()` создаёт `.state-label-widget` + `.state-label-text` с правильными
  inline styles из config (align/bold/fontSize).
- `update(value)` для каждого fallback policy ставит правильный text/fg/bg.
- Blink (с `vi.useFakeTimers()`):
  - `_startBlink({interval: 500})` toggle'ит opacity при `vi.advanceTimersByTime`
  - `duration` останавливает blink после N ms
  - state change clear'ит timers (no leak — assertion на `clearInterval` call)
- `destroy()` cleanup'ит таймеры.

### E2E — `tests/single/dashboard-state-label.spec.ts`

- Create widget через UI (Add Widget → State Label)
- Configure через dialog: добавить 3 state'а, save
- Симулировать SSE update через `window.dashboardState.widgets.get(id).update(value)`
  — текст и фон меняются для каждого значения
- Open config второй раз — состояния persist
- Overlap warning visible когда два state перекрываются

## Constants

```javascript
// 00-constants.js
STATE_LABEL_BLINK_MIN_INTERVAL_MS = 100;   // sanity floor
STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS = 500;
STATE_LABEL_DEFAULT_FONT_SIZE_PX = 14;
```

## Open Questions

Нет. Все вопросы решены в clarifying-фазе:
- Mapping: ranges с optional `from`/`to`
- Blink: interval + optional duration (per state)
- Fallback: default = 'raw', опции `ignore` (+ hold) и `default`
- Overlap resolution: first-match, editor показывает ⚠ warning
- Sensor binding: single (как Digital/Label)
