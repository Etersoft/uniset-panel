# Toggle Widget — `round` style (LED-indicator round button)

**Date:** 2026-06-18
**Branch (proposed):** `story/toggle-round-style`
**Scope:** Single style addition to existing `ToggleWidget`. Параллельный rectangular `button` style (#30, e913b8d), переиспользует ту же LED-конвенцию и темизацию.

## Цель

Добавить четвёртый стиль `round` в `ToggleWidget`. Та же семантика, что у `button` (нажатая / отжатая, configurable LED), но **круглая** форма для плотных дашбордов и для случаев когда оператор хочет круглый visual language.

Тот же visual contract что у rectangular:
- Material flat — без depth, без gradient, без highlight
- Нейтральный серый OFF → цвет темы ON
- LED dot configurable через `ledColor` (default amber `#fde047`)
- LED dark в OFF, glow в ON

Различие — форма (круг) и расположение LED+label на круге: LED dot сверху, label под ним.

## Не входит в scope

- Изменения base class (`ActiveDashboardWidget`). Всё в `ToggleWidget` + CSS блок в `style.css`.
- Migration сохранённых конфигов. Default `style` остаётся `'slider'`; существующие конфиги не трогаются.
- Новые поля конфига. `ledColor` уже существует у rectangular — переиспользуется один-в-один.

## Архитектура

Добавляется в `static styles = ['slider', 'checkbox', 'button', 'round']` массив
`ToggleWidget` (`61-dashboard-active-toggle.js`). Базовый класс уже рендерит style
select когда `styles.length > 1`, плюс сохраняет/читает `config.style`. В base
ничего не меняется.

Dispatch в `render()` / `renderCommand()` / `renderFeedback()` получает четвёртую
ветку:

```javascript
if (style === 'checkbox')      this.renderCheckbox();
else if (style === 'button')   this.renderButton();
else if (style === 'round')    this.renderRound();
else                           this.renderSlider();
```

Аналогично для `renderCommand` / `renderFeedback` (методы
`renderRoundCommand` / `renderRoundFeedback`).

## Визуальный дизайн

См. одобренный mockup:
`docs/superpowers/specs/screenshots/2026-06-18-toggle-round-style/01-design-direction-A-APPROVED.png`

### Идея

Material flat круглая кнопка, читается по трём независимым сигналам:

1. **Цвет фона кнопки** — нейтральный серый `#374151` в OFF, цвет темы (`var(--awc-bg, #3b82f6)`) в ON
2. **LED dot вверху** — тёмный (`#1f2937`) в OFF, горящий цветом `ledColor` с glow в ON
3. **Label по центру** — текст состояния, читаемый при любой теме

### LED цвет

Переиспользуется существующее config-поле `ledColor` от rectangular `button`:
hex string, default `#fde047`, validated через `HEX_COLOR_REGEX`. В config form
conditional row "LED color" появляется когда `style === 'button' || style === 'round'`.

Передаётся через CSS-var `--awc-led` на container (inline, как `--awc-bg` /
`--awc-fg` для custom темы). CSS правила используют `var(--awc-led, #fde047)`.

Sparse serialization сохраняется: `ledColor === '#fde047'` НЕ записывается в
JSON. Уже работает у rectangular — тот же код обслуживает round.

### CSS variables

Те же что у rectangular: `--awc-bg` / `--awc-fg` устанавливает base через
`_applyColorTheme()`. `--awc-led` для LED color (inline на container, как у
rectangular).

```css
.toggle-widget.toggle-style-round .toggle-btn {
    width: 100%; height: 100%; aspect-ratio: 1 / 1; max-width: 100%; max-height: 100%;
    border-radius: 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: none; padding: 0;
    font-weight: 600;
    cursor: pointer;
    position: relative;
    transition: background 0.15s, color 0.15s;
}
.toggle-widget.toggle-style-round .toggle-btn[data-state="off"] {
    background: #374151; color: #d1d5db;
}
.toggle-widget.toggle-style-round .toggle-btn[data-state="on"] {
    background: var(--awc-bg, #3b82f6); color: var(--awc-fg, #ffffff);
}
.toggle-widget.toggle-style-round .toggle-btn::before {
    content: ''; position: absolute; top: 14%;
    width: 12%; height: 12%; border-radius: 50%;
}
.toggle-widget.toggle-style-round .toggle-btn[data-state="off"]::before {
    background: #1f2937; box-shadow: inset 0 1px 2px rgba(0,0,0,0.7);
}
.toggle-widget.toggle-style-round .toggle-btn[data-state="on"]::before {
    background: var(--awc-led, #fde047);
    box-shadow:
        0 0 6px  var(--awc-led, #fde047),
        0 0 10px color-mix(in srgb, var(--awc-led, #fde047) 70%, transparent);
}
.toggle-widget.toggle-style-round .toggle-btn .toggle-round-label {
    margin-top: 12%;
}
```

Размер LED-dot задан в процентах от размера кнопки (`12%`), чтобы масштабироваться
с widget size (1×1 → ~5px, 3×3 → ~15px). У rectangular LED-dot фиксированный
в px из-за horizontal layout (10px); у round пропорциональный лучше работает,
потому что widget может быть от 1×1 до 4×4.

`aspect-ratio: 1 / 1` + `max-width/height: 100%` гарантирует круг даже при
non-square cells: круг центрируется по min(w, h), а не растягивается в эллипс.

### Status states (наследуются от base)

Все обслуживаются существующими механизмами:

| Состояние | Источник | Реализация |
|---|---|---|
| Disabled (no control) | `data-control-blocked="true"` от `_updateInteractivityClass()` | opacity 0.55 + `filter: grayscale(0.7)` |
| Frozen | `data-frozen="true"` от `_applyFeedbackMeta()` | icy cyan tint + ❄ marker через `::after` |
| Pending | `data-write-state="pending"` от `_setWriteState()` | серый outer outline + пульсация |
| Error | `data-write-state="error"` от `_setWriteState()` | **purple** outline (SCADA convention) |
| Divergence | `.diverge` на корневом `.toggle-widget` | жёлтая outer рамка |

`renderRoundCommand` ставит `.diverge` на корневой `.toggle-widget` (как
checkbox/button). CSS правила для disabled / frozen / pending / error уже
есть от других active widgets — переиспользуются селекторами по
`data-active-widget="true"`.

### Label fallback

Тот же fallback chain что у rectangular `button`:

1. `config.label` — если задан и непустой
2. `labelOn` / `labelOff` по `commandValue ?? feedbackValue` (показывает команду при pending)
3. `'—'` — никогда полностью пустая кликабельная зона

При pending command label следует команде (не feedback'у) — оператор видит что он только что выбрал, пока actuator не ответил.

### DOM-структура

```html
<div class="widget-content toggle-widget toggle-style-round">
    <button class="toggle-btn" data-test="btn" data-state="off">
        <span class="toggle-round-label">PUMP-1</span>
    </button>
</div>
```

Один `<button>` элемент с `data-state="on|off"`. LED — `::before` pseudo-element
(не нужен отдельный node). Label — `<span class="toggle-round-label">` для
точечного targeting'а CSS.

### Размер

У ToggleWidget сейчас один size для всех стилей (`static defaultSize = { width: 3, height: 2 }`).
Добавляем static метод `getDefaultSizeForStyle(style)` (по образцу PushButtonWidget):
`round` → `{ width: 2, height: 2 }`; остальные стили — fallback на
`static defaultSize`. Dashboard-manager в `createWidget` уже зовёт
`getDefaultSizeForStyle(config.style)` если метод определён.

Round плотнее чем rectangular (3×2), потому что круглая форма уже подразумевает
компактность и хорошо смотрится в densely packed grid'ах.

Min/max не ограничиваются — оператор может задать 1×1 (~40px, мелкая иконка),
3×3 (~120px), 4×4 (~160px). При non-square cells (например 3×2) круг останется
кругом благодаря `aspect-ratio: 1/1`.

## Конфиг

Никаких новых полей. Все используются как у rectangular `button`:

- `serverId` / `objectName` / `sensor` / `sensorId` — от base sensor binding
- `valueOff` / `valueOn` — number, default 0/1
- `labelOff` / `labelOn` — text, default 'OFF'/'ON' (используются только в label fallback)
- `label` — заголовок (центральный текст кнопки)
- `style` — добавляется опция `round` в select
- `ledColor` — переиспользуется (conditional только для button / round)
- `colorTheme` + custom — от base (`supportsColorTheme = true` уже стоит)
- `requireConfirmation` — от base

`parseActiveConfigFields` уже парсит `ledColor`; нужно расширить condition с
`style === 'button'` на `style === 'button' || style === 'round'` (одна правка).
`initConfigHandlers` — `ledColor` row показывается conditionally при button **или**
round (одна правка).

## Тестирование

### Unit (vitest)

Нет новой чистой логики. Render — чистый DOM/CSS, dispatch тривиален.
Покрытие через E2E.

### E2E (Playwright) — новый файл `tests/single/dashboard-active-toggle-round.spec.ts`

Зеркало rectangular spec'а:

1. **render** — создать toggle с `style='round'`, проверить `.toggle-style-round`
   класс, `.toggle-btn` элемент, `data-state="off"` по умолчанию,
   `.toggle-round-label` с текстом.
2. **click toggles state** — кликнуть, проверить `data-state="on"`, fetch на
   `/api/objects/.../ionc/set` ушёл с `valueOn` и `sensor_id`.
3. **theme=danger** — `config.colorTheme = 'danger'`, computed `background-color`
   ON-state = `rgb(239, 68, 68)`.
4. **divergence** — feedback=0, command=1 → `.diverge` на `.toggle-widget`.
5. **frozen** — `meta.frozen = true` → `data-frozen="true"`, click → no fetch.
6. **label fallback** — пустой `config.label` + value=0 → текст
   `labelOff || 'OFF'`.
7. **ledColor sparse** — default `#fde047` не записывается в JSON;
   `ledColor='#ef4444'` записывается; uppercase нормализуется в lowercase.
8. **style switch** — `style='button'` → `style='round'` сохраняет `ledColor`.

Регрессионный smoke: тесты slider/checkbox/button должны проходить без
изменений.

## Implementation footprint

- `ui/static/js/src/61-dashboard-active-toggle.js`:
  - `'round'` в `static styles`
  - методы `renderRound()` / `renderRoundCommand()` / `renderRoundFeedback()`
  - ветка в трёх dispatcher'ах
  - добавить static `getDefaultSizeForStyle(style)` метод (`round` → 2×2, fallback на `defaultSize`)
  - расширение conditional для `ledColor` в config form (button OR round) — одна правка `||`-условия
  - `_resolveButtonLabel(commandValue, feedbackValue)` переиспользуется напрямую (chain
    идентичен у button и round). Без rename — вызов из обоих рендереров.

  ~50-70 строк добавки.

- `ui/static/css/style.css` — новая секция
  `/* === Toggle widget (round style) === */`. ~40-60 строк.

- `tests/single/dashboard-active-toggle-round.spec.ts` — новый файл.

- `CLAUDE.md` — обновление параграфа ToggleWidget:
  - `static styles = ['slider', 'checkbox', 'button', 'round']`
  - описание `round` стиля + размер 2×2 + reuse `ledColor`

- `docs/dashboards.md`:
  - строка `round` в styles-таблице
  - embed скриншот варианта A

Нет изменений в:
- `60-widget-sensor-binding.js` / `61-dashboard-active-base.js` — base без правок
- `62-dashboard-manager.js` — `WIDGET_TYPES` уже регистрирует Toggle
- backend Go — нет
- migrations / persistence — нет

## Открытые вопросы

Нет. Все вопросы (визуал, размер, LED layout) проработаны на mockup стадии.

## Approved mockup (reference)

| # | Файл | Что показывает |
|---|---|---|
| 1 | `01-design-direction-A-APPROVED.png` | **Финальный одобренный вариант** — LED dot сверху, label по центру. Три секции: default amber, configurable LED color, use case "семантика в LED, нейтральная кнопка". |

При final review реализации сравнивать с `01-design-direction-A-APPROVED.png` —
это референс визуала.
