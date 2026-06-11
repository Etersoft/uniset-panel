# Active Widget Color Themes — Design

**Date:** 2026-06-11
**Scope:** `PushButtonWidget` + `ToggleWidget`. Setpoint и Generator — отдельная следующая итерация.
**Status:** Draft for review.

---

## Goal

Дать оператору возможность задавать цвет «акцентного» состояния active widget'а
(нажатая push-button-кнопка, ON-state toggle) через выбор готовой темы из 5
пресетов или через color picker'ы в режиме `custom`. **Без CSS-инъекции**:
operator не должен и не обязан знать CSS.

## Non-goals

- Темизация passive widget'ов (Level, Gauge, StateLabel и т.п.) — у них уже есть
  `zones` для value-driven окраски, и она самодостаточна.
- Dashboard-level customCss / customClass — рассматривали в обсуждении, отвергли
  как «не для оператора».
- Override OFF/idle/unknown цветов. Тема перекрашивает только «активное»
  состояние (ON для toggle, base button color для push-button). Idle/OFF
  остаются SCADA-нейтральными (серый) для consistency между виджетами.
- Override writeState цветов (`active-success` зелёный / `active-error`
  пурпурный / `active-pending` нейтральный / dirty янтарный / frozen icy).
  Это статусные индикаторы — менять их = ломать SCADA-конвенцию проекта.
- Hover-эффекты. Пресеты на mushroom не имеют hover; на flat hover не нужен —
  «pressed» уже визуально отделён. Pill сохраняет существующий hover из style.

## Data model

Новые поля в `config` для PushButton и Toggle:

```ts
config = {
  // existing fields (sensor, sensorId, serverId, objectName, label, ...)
  colorTheme?: 'default' | 'primary' | 'danger' | 'warning' | 'success' | 'neutral' | 'custom',
  // only when colorTheme === 'custom':
  customBg?: string,  // hex '#RRGGBB' — основной цвет акцентного состояния
  customFg?: string,  // hex '#RRGGBB' — цвет текста / контрастной разметки на акцентном фоне
}
```

**Defaults:**
- `colorTheme` отсутствует / `'default'` → виджет рендерится **точно как сейчас**
  (полная backwards-compat для существующих dashboard'ов).
- `customBg` / `customFg` без `colorTheme === 'custom'` — игнорируются.

**Custom field defaults в config form:**
- `customBg` — `#3b82f6` (текущий flat-primary blue).
- `customFg` — `#ffffff`.

**Persistence:** обычные поля widget config'а, сохраняются вместе с dashboard'ом
в localStorage (user dashboards) или экспортируются в JSON (server / fork).
Никаких отдельных storage-key'ев.

## Preset palette

Хексы зафиксированы в `00-constants.js` как `ACTIVE_WIDGET_COLOR_THEMES`:

| Тема     | bg        | fg        | Назначение                          |
|----------|-----------|-----------|--------------------------------------|
| primary  | `#3b82f6` | `#ffffff` | Material primary; информационное.    |
| danger   | `#ef4444` | `#ffffff` | STOP, EMERGENCY, abort.              |
| warning  | `#fbbf24` | `#1f2937` | ACK ALARM, attention, hold. Тёмный fg для контраста. |
| success  | `#22c55e` | `#ffffff` | START, RUN, OK.                      |
| neutral  | `#6b7280` | `#ffffff` | RESET, no-op, технические команды.   |
| default  | —         | —         | Не переопределяет style.             |

Pressed-вариант (более тёмный) **auto-derive** через CSS `color-mix(in srgb, var(--awc-bg), black 15%)`.

> **Совместимость `color-mix()`:** поддерживается во всех Chromium-based
> браузерах ≥ 111 (март 2023), Firefox ≥ 113, Safari ≥ 16.4. Целевая аудитория
> панели — Chrome/Edge ≥ 120 в SCADA-станциях, ограничение нерелевантно.

Light-вариант (для mushroom radial-gradient highlight) — `color-mix(in srgb, var(--awc-bg), white 25%)`.

## Architecture

### CSS-variables contract

Один общий namespace для всех active widget'ов — `--awc-*` (active widget color):

```css
/* defaults — наследуются из preset class'а или inline-style для custom */
--awc-bg: <accent color>;
--awc-fg: <text on accent>;
--awc-bg-pressed: color-mix(in srgb, var(--awc-bg), black 15%);
--awc-bg-light:   color-mix(in srgb, var(--awc-bg), white 25%);
```

### Theme classes

Пресеты — обычные CSS-классы на root-контейнере виджета:

```css
.awc-theme-primary  { --awc-bg: #3b82f6; --awc-fg: #fff; }
.awc-theme-danger   { --awc-bg: #ef4444; --awc-fg: #fff; }
.awc-theme-warning  { --awc-bg: #fbbf24; --awc-fg: #1f2937; }
.awc-theme-success  { --awc-bg: #22c55e; --awc-fg: #fff; }
.awc-theme-neutral  { --awc-bg: #6b7280; --awc-fg: #fff; }
/* default → класс не ставится; виджет использует свои style-specific цвета */
/* custom → класс `awc-theme-custom` + inline style="--awc-bg:..; --awc-fg:.." */
```

### Widget integration

**Base class helpers (`61-dashboard-active-base.js`):**

Чтобы subclass'ы не дублировали логику, base предоставляет два метода:

```js
// Возвращает ' awc-theme-<name>' (с ведущим пробелом) или ''.
// Subclass конкатенирует в свой className при render.
_getThemeClass() {
    const t = this.config?.colorTheme;
    if (!t || t === 'default') return '';
    if (!ACTIVE_WIDGET_COLOR_THEMES.includes(t) && t !== 'custom') return '';
    return ` awc-theme-${t}`;
}

// Если colorTheme === 'custom', выставляет inline CSS-vars на переданный root.
// Idempotent: безопасно вызывать на каждом render.
_applyThemeVars(rootEl) {
    if (!rootEl) return;
    if (this.config?.colorTheme === 'custom') {
        rootEl.style.setProperty('--awc-bg', this.config.customBg || '#3b82f6');
        rootEl.style.setProperty('--awc-fg', this.config.customFg || '#ffffff');
    } else {
        rootEl.style.removeProperty('--awc-bg');
        rootEl.style.removeProperty('--awc-fg');
    }
}
```

**PushButton (`61-dashboard-active-button.js`):**

Render-метод добавляет theme class и зовёт `_applyThemeVars`:

```js
const style = this._currentStyle();
this.element = document.createElement('div');
this.element.className =
    `widget-content pushbutton-widget pushbutton-style-${style}${this._getThemeClass()}`;
this.element.innerHTML = `<button class="pb-btn" data-test="btn">${escapeHtml(label)}</button>`;
this.container.appendChild(this.element);
this._applyThemeVars(this.element);
```

CSS (новое в `style.css`):

```css
/* flat — Material primary с CSS vars */
.pushbutton-style-flat .pb-btn {
    /* fallback на текущий синий когда awc vars не заданы */
    background: var(--awc-bg, #3b82f6);
    color:      var(--awc-fg, #fff);
}
.pushbutton-style-flat .pb-btn.pressed {
    background: var(--awc-bg-pressed, #2563eb);
}

/* mushroom — параметризованный radial-gradient.
   --awc-bg-light auto-derived для highlight. */
.pushbutton-style-mushroom .pb-btn {
    background: radial-gradient(circle at 30% 30%,
                                var(--awc-bg-light, #ef4444),
                                var(--awc-bg,       #b91c1c));
    border-color: color-mix(in srgb, var(--awc-bg, #ef4444), black 30%);
    color:        var(--awc-fg, #fff);
}

/* pill — outline-стиль; тема перекрашивает hover/pressed-fill */
.pushbutton-style-pill .pb-btn:hover {
    border-color: var(--awc-bg, #22c55e);
    color:        var(--awc-bg, #22c55e);
}
.pushbutton-style-pill .pb-btn.pressed {
    background:   var(--awc-bg, #22c55e);
    border-color: var(--awc-bg, #22c55e);
    color:        var(--awc-fg, #fff);
}
```

> **Default-цвета в fallback'ах хексами, не через изменение `awc-bg` дефолта.**
> Если бы мы поставили `--awc-bg: #3b82f6` глобально на `.pushbutton-widget`,
> mushroom без темы превратился бы в синий. Поэтому fallback в `var(--awc-bg, …)`
> подставляет style-нативный цвет — и `default` тема визуально неотличима от
> текущего поведения.

**Toggle (`61-dashboard-active-toggle.js`):**

Тот же контракт — конкатенирует `_getThemeClass()` и зовёт `_applyThemeVars`:

```js
this.element.className =
    `widget-content toggle-widget toggle-style-${style}${this._getThemeClass()}`;
// ... innerHTML / append ...
this._applyThemeVars(this.element);
```

Subclass touch на каждый widget — ровно две строки. Setpoint / Generator
получат темизацию даром в следующей итерации (только CSS — base уже знает).

CSS:

```css
/* Slider — ON track */
.toggle-widget .toggle-track.fb-on {
    background: var(--awc-bg, #22c55e);
}
/* OFF/unknown НЕ переопределяем — остаются gray-neutral по умолчанию SCADA. */

/* Checkbox — accent fill */
.toggle-widget .toggle-cb.fb-on {
    background:   var(--awc-bg, #22c55e);
    border-color: var(--awc-bg, #22c55e);
}
.toggle-widget .toggle-cb.fb-on::after {
    /* checkmark цвет = fg темы (для warning'а на жёлтом → тёмный) */
    color: var(--awc-fg, #fff);
}
```

> **divergence-граница (`fb-on + diverge`) остаётся жёлтой**, она статусная,
> не темизуется. Тема влияет только на «спокойный» ON.

### Config form

Базовый класс `ActiveDashboardWidget` уже владеет общими полями (sensor binding,
label, requireConfirmation, style). Добавляем тему туда же, **сразу после style
select'а, перед requireConfirmation** — чтобы НЕ дублировать блок в каждом
subclass'е:

```js
// В ActiveDashboardWidget.getConfigForm() добавить блок:
<div class="widget-config-row">
    <div class="widget-config-field">
        <label>Color theme</label>
        <select class="widget-input" name="colorTheme" data-test="cfg-colorTheme">
            <option value="default">Default (style-native)</option>
            <option value="primary">Primary (blue)</option>
            <option value="danger">Danger (red)</option>
            <option value="warning">Warning (amber)</option>
            <option value="success">Success (green)</option>
            <option value="neutral">Neutral (gray)</option>
            <option value="custom">Custom…</option>
        </select>
    </div>
</div>
<div class="widget-config-row" data-color-custom-row style="display:none">
    <div class="widget-config-field">
        <label>Custom bg</label>
        <input type="color" class="widget-input" name="customBg"
               value="${config.customBg || '#3b82f6'}" data-test="cfg-customBg">
    </div>
    <div class="widget-config-field">
        <label>Custom fg</label>
        <input type="color" class="widget-input" name="customFg"
               value="${config.customFg || '#ffffff'}" data-test="cfg-customFg">
    </div>
</div>
```

`initConfigHandlers` в base — conditional reveal custom-блока при выборе
`custom` (idempotent через `form.dataset.colorHandlersWired`, как сейчас
делается у `setpoint-style`).

`parseConfigForm` в base — добавить парсинг полей.

**Subclass'ы НЕ трогаются** (PushButton / Toggle). Это ключевое преимущество
размещения логики в base — Setpoint / Generator получат темизацию даром, когда
в их CSS появятся соответствующие `var(--awc-*)`.

> **Контракт:** subclass'ы, которые не хотят темизацию (Generator в первой
> итерации scope), просто не используют `--awc-*` vars в своём CSS — поле в
> config form всё равно отрендерится, но визуального эффекта не даст. Это
> приемлемый компромисс ради DRY. Когда (если) подхватим Setpoint/Generator —
> только CSS меняем.

## Edge cases

| Случай | Поведение |
|---|---|
| Существующий dashboard без `colorTheme` | Полный backwards-compat: рендерится как сейчас (fallback хексы в `var()`). |
| `colorTheme: 'custom'` + пустой `customBg` | Подставляется default `#3b82f6`. Pickers заполнены, в JSON значение сохранится при следующем save. |
| `colorTheme` с неизвестным значением (corrupted config) | Приравнивается к `default` (через select fallback при load: если value не в options, остаётся `default`). |
| Browser без `color-mix()` (старый Firefox, Safari < 16.4) | Pressed/light vars не вычисляются → выпадают на default flat/mushroom. Acceptable (целевая аудитория ≥ Chrome 120). Log/breakage не критичный. |
| Export → JSON → import в чужую панель без новых констант | Поле `colorTheme` сериализуется как строка, безопасно. Если новая панель не знает `colorTheme` → игнорирует, рендерит default. |

## Testing

**Unit (vitest, `tests/unit/`):**
- `dashboard-active-color-theme.test.ts`:
  - `getConfigForm` рендерит select с 7 опциями.
  - `parseConfigForm` возвращает `colorTheme` + `customBg/Fg`.
  - `parseConfigForm` для `colorTheme='custom'` без значений ставит дефолты.
  - `initConfigHandlers` показывает/скрывает custom-row при смене select'а.
  - idempotency: повторный `initConfigHandlers` не вешает второй listener.

**E2E (Playwright, `tests/single/`):**
- `dashboard-color-theme-pushbutton.spec.ts`:
  - Создать PushButton с `colorTheme='danger'` → root `.pushbutton-widget`
    имеет класс `awc-theme-danger`.
  - Computed style `.pb-btn` background содержит rgb эквивалент `#ef4444`.
  - Switch на `colorTheme='custom'` + `customBg='#ff6600'` → inline
    `style="--awc-bg:#ff6600..."` на root.
- `dashboard-color-theme-toggle.spec.ts`:
  - Аналогично: slider track при `fb-on` + theme получает корректный bg.
  - OFF track НЕ меняется при изменении темы (regression guard).

**Visual smoke (опционально):** добавить скриншоты в visual catalog
(см. memory `project_widget_visual_catalog.md`).

## Migration

Никаких миграций — поле опциональное, дефолт = текущее поведение.

## Risks & mitigations

| Риск | Mitigation |
|---|---|
| Тема `warning` + flat → жёлтый фон + белый текст = низкий контраст | Палитра warning имеет `fg=#1f2937` (тёмный). Зафиксировано в `ACTIVE_WIDGET_COLOR_THEMES`. |
| Mushroom выглядит «плоско» когда тема перекрасила оба stop'а на одинаковый цвет | Используем `color-mix` для `--awc-bg-light` (lighter 25%) — gradient сохраняет 3D-эффект для любой темы. |
| Custom pickers позволяют выбрать `bg=#000 fg=#000` (нечитаемо) | Принимаем — это explicit user choice. Не валидируем contrast (operator-tool, не публичный UI). |
| `color-mix()` не поддерживается | Pressed/light vars вычисляются в браузере → fallback значит pressed визуально совпадает с idle. Не блокирующее, тема всё равно применяется. |

## Out of scope (next iterations)

- Setpoint темизация (slider track ON-zone, stepper accent).
- Generator темизация (value-text цвет когда running, Start/Stop button accent).
- Per-state цвета push-button (разный bg для ON и OFF — сейчас 1 акцент).
- Theme presets как пользовательский kit (загружать additional palette из
  конфига). Хексы зашиты в JS — изменение требует rebuild.
- Custom-class escape hatch — отложен до реального запроса.
