# Toggle Widget — `button` style (LED indicator)

**Date:** 2026-06-16
**Branch (proposed):** `story/toggle-button-style`
**Scope:** Single style addition to existing `ToggleWidget`.

## Цель

Добавить третий стиль в `ToggleWidget` — `button` — для случаев когда оператору
нужен чётко различимый "нажата/отжата" вид (в отличие от плавного `slider`-track
или мелкого `checkbox`'а). Визуал: material flat button с **горящим жёлтым LED
индикатором** на лицевой стороне.

Главный driver — SCADA-узнаваемость: LED-индикатор это конвенция, оператор
сразу читает "горит — значит включено", даже периферическим зрением.

## Не входит в scope

- Изменения base class (`ActiveDashboardWidget`). Всё в `ToggleWidget` +
  CSS блок в `style.css`.
- Migration сохранённых dashboard конфигов. Дефолтный стиль не меняется —
  `slider` остаётся default'ом. Существующие конфиги без `ledColor` получают
  жёлтый по умолчанию.

## Архитектура

Добавляется в `static styles = ['slider', 'checkbox', 'button']` массив
`ToggleWidget` (`61-dashboard-active-toggle.js`). Базовый класс
`ActiveDashboardWidget` уже рендерит style select когда `styles.length > 1`,
плюс уже сохраняет/читает `config.style`. Никаких изменений в base.

Dispatch в `render()`/`renderCommand()`/`renderFeedback()` получает третью ветку:

```javascript
if (style === 'checkbox')      this.renderCheckbox();
else if (style === 'button')   this.renderButton();
else                           this.renderSlider();
```

Аналогично для `renderCommand`/`renderFeedback` (через приватные методы
`renderButtonCommand`/`renderButtonFeedback`).

## Визуальный дизайн

### Идея

Кнопка-индикатор: лицевая сторона = текст label + маленький круглый LED.
Состояние читается по **трём независимым сигналам**:

1. **Цвет фона кнопки** — нейтральный тёмно-серый в OFF, цвет темы в ON
2. **LED** — потушен (тёмный) в OFF, горит ярко в ON с soft glow
3. **Box shadow** — субтильный outer shadow в OFF, inset shadow + outer glow в ON

### LED цвет

LED-индикатор **настраивается в конфиге виджета** через поле `ledColor`
(hex string). Default — жёлтый `#fde047` ("powered/active" SCADA convention).

Поле живёт в config form button-стиля как color picker (как `customBg`/
`customFg` у custom theme). На уровне CSS LED цвет передаётся через CSS-var
`--awc-led` (inline на container, как `--awc-bg`/`--awc-fg` для custom темы).

```css
.toggle-widget.toggle-style-button .toggle-btn[data-state="on"]::before {
    background: var(--awc-led, #fde047);
    box-shadow:
        0 0 8px  var(--awc-led, #fde047),
        0 0 14px color-mix(in srgb, var(--awc-led, #fde047) 70%, transparent);
}
```

`color-mix` автоматически даст правильный glow вокруг любого выбранного цвета.

Sparse serialization: `ledColor === '#fde047'` НЕ записывается в JSON
(как `colorTheme === 'default'`) — чистый diff'ы export'ов.

**Зачем настраивать:** оператор может зашить семантику в LED цвет (зелёный =
"норма работает", красный = "alarm активен", синий = "ручной режим"),
независимо от color theme самой кнопки.

### CSS variables

Все цвета — через существующий contract `--awc-bg` / `--awc-fg`, который
устанавливает base class через `_applyColorTheme()`. Никаких новых vars не
вводится.

```css
.toggle-widget.toggle-style-button .toggle-btn[data-state="off"] {
    background: #374151;
    color: #d1d5db;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08),
                0 2px 4px rgba(0,0,0,0.4);
}
.toggle-widget.toggle-style-button .toggle-btn[data-state="on"] {
    background: var(--awc-bg, #3b82f6);
    color: var(--awc-fg, #ffffff);
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.35),
                0 0 12px color-mix(in srgb, var(--awc-bg, #3b82f6) 50%, transparent);
}
.toggle-widget.toggle-style-button .toggle-btn::before {
    /* LED dot. Точные размеры — implementation detail. */
}
.toggle-widget.toggle-style-button .toggle-btn[data-state="off"]::before {
    background: #1f2937;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.6);
}
.toggle-widget.toggle-style-button .toggle-btn[data-state="on"]::before {
    background: #fde047;
    box-shadow: 0 0 8px #fde047, 0 0 14px rgba(253,224,71,0.7);
}
```

Темы (`awc-theme-danger`, `awc-theme-success`, ...) — переопределяют
`--awc-bg` / `--awc-fg`, как у всех themed widget'ов. Это уже работает.

### Status states (наследуются от base)

Состояния `disabled` / `frozen` / `pending` / `error` / `divergence` уже
обслуживаются базовыми механизмами:

| Состояние | Источник | Реализация |
|---|---|---|
| Disabled (no control) | `data-control-blocked="true"` от `_updateInteractivityClass()` | opacity 0.55 + `filter: grayscale(0.7)`, LED `box-shadow: none`, `opacity: 0.4` |
| Frozen | `data-frozen="true"` от `_applyFeedbackMeta()` | icy cyan tint + ❄ marker через `::after` |
| Pending | `data-write-state="pending"` от `_setWriteState()` | серый outer outline + пульсация |
| Error | `data-write-state="error"` от `_setWriteState()` | **purple** outline (SCADA convention, не red) |
| Divergence | `.diverge` class от `renderCommand` | жёлтая outer рамка |

`renderButtonCommand` ставит `.diverge` на корневой `.toggle-widget` (так же
как checkbox style — рамка вокруг кнопки лучше читается чем внутри). CSS
правила для disabled / frozen / pending / error уже есть в `style.css` от
других active widget'ов — переиспользуем их селекторами по
`data-active-widget="true"` который base class и так выставляет на container.

### Label fallback

Кнопка показывает `config.label`. Fallback chain (выпадение из верхнего —
к нижнему):

1. `config.label` — если задан и непустой
2. `_currentLabel()` — `labelOn` / `labelOff` по текущему value (как в slider)
3. `'—'` — никогда полностью пустая кликабельная зона

Шаги 2 и 3 гарантируют что button никогда не рендерится пустым — оператор
получает hint что нажимать.

### DOM-структура

```html
<div class="widget-content toggle-widget toggle-style-button">
    <button class="toggle-btn" data-test="btn" data-state="off">
        PUMP-1
    </button>
</div>
```

Один `<button>` элемент с `data-state="on|off"`. LED — `::before`
pseudo-element (не нужен отдельный node). Никаких track/handle/checkbox div'ов.

### Размер

`static defaultSize = { width: 3, height: 2 }` — уже совпадает с базовым
default toggle'а (slider тоже 3×2). `minSize` / `maxSize` тоже не меняются.

3×2 даёт ~120×60px при стандартной сетке — достаточно для touch-friendly area
и читаемого label.

## Конфиг

Новое поле:

- **`ledColor`** — hex color (validated via `HEX_COLOR_REGEX`), default
  `#fde047`. Только для `style === 'button'`. В config form появляется
  conditional row "LED color" с color picker. Sparse: дефолт не пишется
  в JSON. Поле инвалидируется если style сменили обратно на slider/checkbox
  (читается, но не пишется при save).

Существующие поля без изменений:

- `serverId` / `objectName` / `sensor` / `sensorId` — от base sensor binding
- `valueOff` / `valueOn` — number, default 0/1
- `labelOff` / `labelOn` — text, default 'OFF'/'ON' (на button НЕ показываются
  но остаются в конфиге для совместимости при переключении стиля + используются
  в fallback chain)
- `label` — заголовок (на button это содержимое самой кнопки)
- `style` — добавляется опция `button` в select
- `colorTheme` + custom — от base
- `requireConfirmation` — от base

`parseActiveConfigFields` расширяется: парсит `ledColor` когда
`style === 'button'`. `initConfigHandlers` — toggle conditional row при
смене style (как в SetpointWidget для orientation/zones).

## Тестирование

### Unit (vitest)

Нет новой чистой логики — рендеринг чисто DOM/CSS, dispatch тривиален.
Если потребуется юнит — обертки вокруг `_currentLabel()` для button (fallback
chain). Решение по факту — если получится изолировать тестируемую функцию,
напишем; иначе всё покрывается E2E.

### E2E (Playwright) — новый файл `tests/single/dashboard-active-toggle-button.spec.ts`

Минимальный набор:

1. **render** — создать toggle с `style='button'`, проверить что
   `.toggle-style-button` класс есть, `.toggle-btn` элемент есть,
   `data-state="off"` по умолчанию.
2. **click toggles state** — кликнуть, проверить `data-state` стал `"on"`,
   проверить fetch на `/api/objects/.../ionc/set` ушёл с `valueOn`.
3. **theme=danger** — `config.colorTheme = 'danger'`, проверить computed
   `background-color` ON-state = `rgb(239, 68, 68)`.
4. **divergence** — feedback=0, command=1 → `.diverge` класс на
   `.toggle-widget`, computed `box-shadow` содержит жёлтый.
5. **frozen** — `meta.frozen = true` → `data-frozen="true"`, click → no fetch
   (interactivity blocked).
6. **label fallback** — пустой `config.label` + value=0 → текст в кнопке
   `labelOff || 'OFF'`.

Регрессионный smoke: тесты `dashboard-active-toggle.spec.ts` (существующие
slider/checkbox) должны проходить без изменений.

## Implementation footprint

- `ui/static/js/src/61-dashboard-active-toggle.js` — добавить `'button'` в
  `static styles`, методы `renderButton()` / `renderButtonCommand()` /
  `renderButtonFeedback()`, ветка в dispatcher'ах. ~40-60 строк добавки.
- `ui/static/css/style.css` — новая секция "Toggle button style"
  с правилами по селектору `.toggle-widget.toggle-style-button`. ~50-80 строк.
- `tests/single/dashboard-active-toggle-button.spec.ts` — новый файл.
- `CLAUDE.md` — добавить параграф в ToggleWidget секцию: `static styles =
  ['slider', 'checkbox', 'button']`, описание стиля.

Нет изменений в:
- `60-widget-sensor-binding.js` / `61-dashboard-active-base.js` — base без правок
- `62-dashboard-manager.js` — `WIDGET_TYPES` уже регистрирует Toggle
- backend Go — нет
- migrations / persistence — нет (новый style автоматически сохраняется/
  читается через существующий `config.style`)

## Открытые вопросы

Нет. Все вопросы по визуалу проработаны на mockup стадии.

## Approved mockups (reference)

Скриншоты mockup'ов, утверждённые user'ом — итоговая реализация должна
визуально соответствовать им. Лежат в
`docs/superpowers/specs/screenshots/2026-06-16-toggle-button-style/`:

| # | Файл | Что показывает |
|---|---|---|
| 1 | `01-design-variants.png` | 5 вариантов дизайна (LED / Rocker / Status bar / Deep industrial / DIP-switch). Выбран **A — LED indicator**. |
| 2 | `02-themes-default-amber.png` | LED button с amber LED на 5 color themes + custom (primary/danger/warning/success/neutral/violet). |
| 3 | `03-status-states.png` | Status matrix: normal OFF/ON, disabled, frozen, pending, error, divergence. Подтверждает что disabled читается на всех темах. |
| 4 | `04-led-color-configurable-APPROVED.png` | **Финальный одобренный вариант** — configurable `ledColor` (default amber + примеры green/red/blue/white/cyan/magenta LED на разных button темах + use case "семантика в LED, нейтральная кнопка"). |

При final review реализации сравнивать с `04-...-APPROVED.png` — это
референс визуала.
