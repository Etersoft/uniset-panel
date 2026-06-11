# Active Widget Color Themes — Design

**Date:** 2026-06-11
**Scope:** `PushButtonWidget` + `ToggleWidget`. Setpoint и Generator — отдельная
следующая итерация.
**Status:** Draft for review (rev. 2 — после independent review).

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
- Override `pb-pulse-flash` keyframe (жёлтый импульс при pulse-mode click).
  Pulse flash — статусный feedback «команда послана», семантика идентична
  yellow ack-flash на SCADA HMI. Не темизуется (у `warning`-темы flash
  совпадёт с background — это accepted, оператор всё равно увидит pressed
  и команда уйдёт; визуальное подтверждение даёт writeState success/error).
- Hover-эффекты. Пресеты на mushroom не имеют hover; на flat hover не нужен —
  «pressed» уже визуально отделён. Pill сохраняет существующий hover из style.
- Темизация Setpoint и Generator config form. В первой итерации они НЕ
  показывают «Color theme» select, чтобы оператор не видел нерабочий контрол.
  Включение — через flip `static supportsColorTheme = true` + правки CSS.

## Data model

Новые поля в `config` для PushButton и Toggle:

```ts
config = {
  // existing fields (sensor, sensorId, serverId, objectName, label, ...)
  colorTheme?: 'primary' | 'danger' | 'warning' | 'success' | 'neutral' | 'custom',
  // only when colorTheme === 'custom':
  customBg?: string,  // '#RRGGBB' — основной цвет акцентного состояния
  customFg?: string,  // '#RRGGBB' — цвет текста / контрастной разметки
}
```

> **Sparse serialization:** значение `'default'` НЕ сериализуется (выпускается
> из JSON при save). Это сохраняет clean diff'ы dashboard.json: widget без
> явной темы не получает шумного `"colorTheme":"default"` в экспорте.
> Runtime: отсутствие поля и `'default'` обрабатываются идентично.

**Defaults и константы:**

Все хекс-литералы и список валидных имён живут в `ui/static/js/src/00-constants.js`:

```js
// Источник правды для валидации имён темы (Custom исключение — обрабатывается отдельно).
// Палитра хексов — в CSS (style.css, .awc-theme-*). JS не знает цветов.
const ACTIVE_WIDGET_THEME_NAMES = ['primary', 'danger', 'warning', 'success', 'neutral'];

// Defaults для custom pickers — используются и в config form template,
// и в runtime fallback'е (один источник истины).
const ACTIVE_WIDGET_CUSTOM_BG_DEFAULT = '#3b82f6';
const ACTIVE_WIDGET_CUSTOM_FG_DEFAULT = '#ffffff';

// Hex validation pattern (для нормализации в parseConfigForm).
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
```

**Backwards-compat:**
- `colorTheme` отсутствует / `'default'` → виджет рендерится **точно как сейчас**.
- `customBg` / `customFg` без `colorTheme === 'custom'` — игнорируются.

**Persistence:** обычные поля widget config'а, сохраняются вместе с dashboard'ом
в localStorage (user dashboards) или экспортируются в JSON (server / fork).

## Preset palette

Палитра — **исключительно в CSS** (`style.css`). JS не дублирует хексы; в
`00-constants.js` лежит только список имён для валидации. Любая правка цвета
темы = одно место (CSS rule).

| Тема     | bg        | fg        | Назначение                                    |
|----------|-----------|-----------|------------------------------------------------|
| primary  | `#3b82f6` | `#ffffff` | Material primary; информационное.              |
| danger   | `#ef4444` | `#ffffff` | STOP, EMERGENCY, abort.                        |
| warning  | `#fbbf24` | `#1f2937` | ACK ALARM, attention, hold (тёмный fg).        |
| success  | `#22c55e` | `#ffffff` | START, RUN, OK.                                |
| neutral  | `#6b7280` | `#ffffff` | RESET, no-op, технические команды.             |
| default  | —         | —         | Класс не ставится → style-native цвет.         |

Pressed-вариант (более тёмный) **auto-derive** через CSS
`color-mix(in srgb, var(--awc-bg), black 15%)`.
Light-вариант (для mushroom highlight stop) — `color-mix(in srgb, var(--awc-bg), white 25%)`.

> **Совместимость `color-mix()`:** Chromium ≥ 111, Firefox ≥ 113, Safari ≥ 16.4.
> Целевая аудитория — Chrome/Edge ≥ 120 в SCADA-станциях.

## Architecture

### CSS-variables contract

Один общий namespace для всех active widget'ов — `--awc-*` (active widget color):

```
--awc-bg:         <accent color>;
--awc-fg:         <text on accent>;
--awc-bg-pressed: color-mix(in srgb, var(--awc-bg), black 15%);
--awc-bg-light:   color-mix(in srgb, var(--awc-bg), white 25%);
```

> **Почему `awc-`** (краткий префикс): namespace должен быть коротким, чтобы не
> загромождать widget-specific селекторы (`.pushbutton-style-flat`,
> `.toggle-track`). Не пересекается с существующими `widget-`, `dashboard-`,
> `pushbutton-`, `toggle-` префиксами проекта.

### Theme classes (CSS)

Пресеты — обычные CSS-классы на root-контейнере виджета. Single source of truth
для палитры:

```css
.awc-theme-primary  { --awc-bg: #3b82f6; --awc-fg: #fff; }
.awc-theme-danger   { --awc-bg: #ef4444; --awc-fg: #fff; }
.awc-theme-warning  { --awc-bg: #fbbf24; --awc-fg: #1f2937; }
.awc-theme-success  { --awc-bg: #22c55e; --awc-fg: #fff; }
.awc-theme-neutral  { --awc-bg: #6b7280; --awc-fg: #fff; }
/* default → класс не ставится; виджет использует свои style-specific цвета */
/* custom → класс `awc-theme-custom` + inline style="--awc-bg:..; --awc-fg:.." */
```

### Scoping: класс и vars кладутся на `this.container`

> **Важное архитектурное решение.** Класс `awc-theme-*` и inline-vars
> ставятся на **`this.container`** (`.dashboard-widget` — внешняя обёртка
> виджета), а не на `this.element` (`.widget-content` — содержимое).

Причина — consistency с уже существующими статус-классами:
- `data-active-widget="true"`, `data-control-blocked`, `data-frozen` — на `container`
- `active-success`, `active-error`, `active-pending`, `active-disabled` — на `container`

Vars каскадируются вниз через CSS-variable inheritance, так что внутренние
CSS-правила (`.toggle-track.fb-on { background: var(--awc-bg, ...) }`) работают
независимо от того, на каком уровне vars set'нуты.

**Future-proof bonus:** селекторы вида `.dashboard-widget.awc-theme-warning
.pb-btn` становятся осмысленными — если статусные классы должны взаимодействовать
с темой (e.g. `active-error` приоритетнее темы), это будет естественно
выражаться без специальных трюков.

### Base class — opt-in флаг

`ActiveDashboardWidget` (в `61-dashboard-active-base.js`):

```js
class ActiveDashboardWidget extends DashboardWidget {
    // Opt-in: subclass переопределяет в true, чтобы получить:
    //  - "Color theme" select в config form
    //  - валидацию colorTheme в parseConfigForm
    //  - применение _applyColorTheme в render
    // Subclass'ы без CSS-поддержки --awc-* остаются false → нет нерабочего select'а.
    static supportsColorTheme = false;

    // Применяет theme к this.container:
    //   - удаляет любой ранее установленный awc-theme-* класс
    //   - ставит новый класс (если theme не 'default')
    //   - если custom — выставляет inline CSS vars
    //   - если не custom — удаляет inline CSS vars (cleanup)
    // Idempotent: безопасно вызывать на каждом render и при переключении темы.
    _applyColorTheme() {
        if (!this.constructor.supportsColorTheme) return;
        const c = this.container;
        if (!c) return;

        // 1. Очистка предыдущей темы — удаляем все awc-theme-* классы.
        // classList.forEach позволяет удалить по предикату без re-scan.
        Array.from(c.classList)
            .filter(cls => cls.startsWith('awc-theme-'))
            .forEach(cls => c.classList.remove(cls));

        const theme = this.config?.colorTheme;
        const valid = theme === 'custom'
            || (theme && ACTIVE_WIDGET_THEME_NAMES.includes(theme));

        // 2. Сброс inline vars (для случая custom → preset / default).
        c.style.removeProperty('--awc-bg');
        c.style.removeProperty('--awc-fg');

        // 3. data-color-theme атрибут — для E2E (явный assertion на тему).
        if (valid) {
            c.dataset.colorTheme = theme;
        } else {
            delete c.dataset.colorTheme;
        }

        if (!valid) return; // default или corrupted — выходим без class/vars

        if (theme === 'custom') {
            c.classList.add('awc-theme-custom');
            c.style.setProperty('--awc-bg',
                this.config.customBg || ACTIVE_WIDGET_CUSTOM_BG_DEFAULT);
            c.style.setProperty('--awc-fg',
                this.config.customFg || ACTIVE_WIDGET_CUSTOM_FG_DEFAULT);
        } else {
            c.classList.add(`awc-theme-${theme}`);
        }
    }
}
```

### Widget integration

**PushButton (`61-dashboard-active-button.js`):**

```js
class PushButtonWidget extends ActiveDashboardWidget {
    static supportsColorTheme = true;  // opt-in
    // ... existing fields ...

    render() {
        const style = this._currentStyle();
        const label = this.config?.label || this.config?.sensor || 'BUTTON';
        this.element = document.createElement('div');
        this.element.className = `widget-content pushbutton-widget pushbutton-style-${style}`;
        this.element.innerHTML = `<button class="pb-btn" data-test="btn">${escapeHtml(label)}</button>`;
        this.container.appendChild(this.element);
        this._applyColorTheme();  // ← одна строка subclass touch
        // ... existing click/momentary binding ...
    }
}
```

**Toggle (`61-dashboard-active-toggle.js`):**

```js
class ToggleWidget extends ActiveDashboardWidget {
    static supportsColorTheme = true;  // opt-in
    // ...

    render() {
        // ... existing className build для toggle-style-${style} ...
        this._applyColorTheme();  // ← одна строка subclass touch
    }
}
```

> Subclass touch per widget — ровно одна строка в render. Setpoint / Generator
> остаются на `static supportsColorTheme = false` (наследуется из base) → их
> config form не получает theme select.

### Re-render контракт

`62-dashboard-manager.js applyWidgetConfig` после save конфига полностью
удаляет `.widget-content` и вызывает `renderWidgetContent` заново → создаётся
новый widget instance, у которого `render()` зовёт `_applyColorTheme()` уже
свежим. Cleanup происходит автоматически (старый container с прошлым классом
удаляется вместе с widget instance, новый создаётся с актуальным).

**Контракт `_applyColorTheme()` идемпотентен** — пункты 1–3 чистят прошлое
состояние перед установкой нового. Это позволяет:
- вызывать на каждом render (включая в потенциальном live-preview path);
- безопасно использовать при in-place reconfigure (если когда-то добавим без
  full rebuild — спецификация уже корректна).

**Live preview в edit dialog — не реализуется в этой итерации.** Оператор
увидит результат после Apply. Зафиксировано явно.

### CSS (новое в `style.css`)

```css
/* === PushButton: flat — Material primary с CSS vars === */
.pushbutton-style-flat .pb-btn {
    background: var(--awc-bg, #3b82f6);
    color:      var(--awc-fg, #fff);
}
.pushbutton-style-flat .pb-btn.pressed {
    background: var(--awc-bg-pressed, #2563eb);
}

/* === PushButton: mushroom — параметризованный radial-gradient === */
.pushbutton-style-mushroom .pb-btn {
    background: radial-gradient(circle at 30% 30%,
                                var(--awc-bg-light, #ef4444),
                                var(--awc-bg,       #b91c1c));
    /* Border — fallback на текущий #7f1d1d (red-900), чтобы default mushroom
       был визуально неотличим от старого. Когда тема задана, --awc-bg
       определён, и border вычисляется из неё. */
    border-color: color-mix(in srgb, var(--awc-bg, #7f1d1d), black 30%);
    color: var(--awc-fg, #fff);
}

/* === PushButton: pill — outline-стиль === */
.pushbutton-style-pill .pb-btn:hover {
    border-color: var(--awc-bg, #22c55e);
    color:        var(--awc-bg, #22c55e);
}
.pushbutton-style-pill .pb-btn.pressed {
    background:   var(--awc-bg, #22c55e);
    border-color: var(--awc-bg, #22c55e);
    color:        var(--awc-fg, #fff);
}

/* === Toggle: slider — ON track === */
.toggle-widget .toggle-track.fb-on {
    background: var(--awc-bg, #22c55e);
}
/* OFF/unknown НЕ переопределяем — gray-neutral по умолчанию SCADA. */

/* === Toggle: checkbox — accent fill === */
.toggle-widget .toggle-cb.fb-on {
    background:   var(--awc-bg, #22c55e);
    border-color: var(--awc-bg, #22c55e);
}
.toggle-widget .toggle-cb.fb-on::after {
    color: var(--awc-fg, #fff);  /* checkmark для warning'а тёмный */
}

/* === Preset themes (single source of truth) === */
.awc-theme-primary  { --awc-bg: #3b82f6; --awc-fg: #fff;     }
.awc-theme-danger   { --awc-bg: #ef4444; --awc-fg: #fff;     }
.awc-theme-warning  { --awc-bg: #fbbf24; --awc-fg: #1f2937;  }
.awc-theme-success  { --awc-bg: #22c55e; --awc-fg: #fff;     }
.awc-theme-neutral  { --awc-bg: #6b7280; --awc-fg: #fff;     }
/* awc-theme-custom — vars приходят inline; класс выставляется для разметки */
.awc-theme-custom   { /* maintained by inline style */ }
```

> **Default-fallback хексами в `var(...)` вместо global default.** Если бы мы
> поставили `--awc-bg: #3b82f6` на `.pushbutton-widget`, mushroom без темы стал
> бы синим. Fallback inside `var(--awc-bg, ...)` подставляет style-нативный
> цвет, и `default` тема визуально идентична текущему поведению.

> **`divergence`-граница на toggle (`fb-on + diverge`) остаётся жёлтой** — она
> статусная, не темизуется.

### Config form

Базовый класс `ActiveDashboardWidget` владеет общими полями (sensor binding,
label, requireConfirmation, style). Theme-блок добавляется в `getConfigForm`
**условно по `supportsColorTheme`**, сразу после style select'а, перед
requireConfirmation:

```js
// В ActiveDashboardWidget.getConfigForm() — добавить после style block:
const themeBlock = this.constructor.supportsColorTheme
    ? `
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
                <small class="widget-config-hint">
                    Theme влияет на «активное» состояние (нажатая кнопка / ON-toggle).
                </small>
            </div>
        </div>
        <div class="widget-config-row" data-color-custom-row style="display:none">
            <div class="widget-config-field">
                <label>Custom bg</label>
                <input type="color" class="widget-input" name="customBg"
                       value="${config.customBg || ACTIVE_WIDGET_CUSTOM_BG_DEFAULT}"
                       data-test="cfg-customBg">
            </div>
            <div class="widget-config-field">
                <label>Custom fg</label>
                <input type="color" class="widget-input" name="customFg"
                       value="${config.customFg || ACTIVE_WIDGET_CUSTOM_FG_DEFAULT}"
                       data-test="cfg-customFg">
                <small class="widget-config-hint">
                    Видим только на виджетах с текстом (label).
                </small>
            </div>
        </div>
    `
    : '';
```

Pre-select правильной опции при reopen: тот же паттерн `selected` на нужном
`<option>` (обычный для проекта; не выписываю отдельно).

`initConfigHandlers` в base — conditional reveal custom-блока при выборе
`custom` (idempotent через `form.dataset.colorHandlersWired`, как у
`setpoint-style`).

`parseConfigForm` в base — нормализация (см. ниже).

### Config validation & normalization

Вся канонизация — **в одном месте**, `parseConfigForm` в base:

```js
parseConfigForm(form) {
    const base = super.parseConfigForm(form);
    if (!this.constructor.supportsColorTheme) return base;

    const raw = form.querySelector('[name="colorTheme"]')?.value || 'default';
    const allowed = ['default', 'custom', ...ACTIVE_WIDGET_THEME_NAMES];
    const theme = allowed.includes(raw) ? raw : 'default';

    // Sparse: 'default' выпускается из JSON.
    if (theme === 'default') return base;

    if (theme !== 'custom') return { ...base, colorTheme: theme };

    // Custom — нормализуем hex'ы: пустые / невалидные → дефолты.
    const rawBg = form.querySelector('[name="customBg"]')?.value?.trim() || '';
    const rawFg = form.querySelector('[name="customFg"]')?.value?.trim() || '';
    const customBg = HEX_COLOR_REGEX.test(rawBg) ? rawBg : ACTIVE_WIDGET_CUSTOM_BG_DEFAULT;
    const customFg = HEX_COLOR_REGEX.test(rawFg) ? rawFg : ACTIVE_WIDGET_CUSTOM_FG_DEFAULT;
    return { ...base, colorTheme: 'custom', customBg, customFg };
}
```

**Канонизация на load:** `_applyColorTheme()` сам валидирует через
`ACTIVE_WIDGET_THEME_NAMES.includes(theme) || theme === 'custom'` — corrupted
config не падает, рендерится как default. При первом save оператора corrupted
поле «лечится» через parseConfigForm.

## Edge cases

| Случай | Поведение |
|---|---|
| Существующий dashboard без `colorTheme` | Полный backwards-compat: рендерится как сейчас (fallback хексы в `var()`). |
| `colorTheme === 'default'` в JSON (legacy) | Runtime обрабатывает идентично отсутствию поля; при save выпускается (sparse). |
| `colorTheme === 'custom'` + пустой/невалидный `customBg` | Runtime: подставляется `ACTIVE_WIDGET_CUSTOM_BG_DEFAULT`. Save: нормализуется через `HEX_COLOR_REGEX`. |
| `colorTheme === '<unknown>'` (corrupted JSON) | `_applyColorTheme` рендерит как default. При reopen+save через form — нормализуется в `'default'` и выпускается. |
| Browser без `color-mix()` | Pressed/light vars не вычисляются → выпадают на default flat/mushroom. Acceptable. |
| Export → JSON → import в чужую панель без новых констант | Поле сериализуется как строка; новая панель игнорирует — рендерит default. |
| Switching theme'ы preset → custom → preset (на одном widget'е через config save) | `applyWidgetConfig` делает full re-render → cleanup vars автоматический. `_applyColorTheme` идемпотентен и тоже очищает inline vars в not-custom ветке. |
| User dashboard fork от server'ного с темой | Тема как обычное поле copy через JSON.parse(JSON.stringify), без специальной обработки. |

## Testing

### Unit (vitest, `tests/unit/`)

**`dashboard-active-color-theme.test.ts`:**
- `getConfigForm` рендерит theme select с 7 опциями когда `supportsColorTheme=true`.
- `getConfigForm` НЕ рендерит theme select когда `supportsColorTheme=false`
  (regression guard для Setpoint/Generator).
- `parseConfigForm` для `colorTheme='default'` — поле НЕ попадает в результат
  (sparse serialization).
- `parseConfigForm` для каждого preset'а — возвращает корректное имя.
- `parseConfigForm` для `colorTheme='custom'` — возвращает customBg/customFg.
- `parseConfigForm` для `colorTheme='custom'` без значений pickers — подставляет
  `ACTIVE_WIDGET_CUSTOM_BG_DEFAULT/FG_DEFAULT`.
- `parseConfigForm` для `customBg='red'` (non-hex) → дефолт.
- `parseConfigForm` для `customBg='#abc'` (short hex) → дефолт.
- `parseConfigForm` для `colorTheme='hacked'` (corrupted) → `'default'` →
  поле выпускается.
- `_applyColorTheme` ставит `awc-theme-danger` класс + `data-color-theme`
  атрибут на container.
- `_applyColorTheme` при custom ставит inline vars + `awc-theme-custom` класс.
- `_applyColorTheme` при переходе custom → preset очищает inline vars.
- `_applyColorTheme` при переходе preset_A → preset_B очищает старый класс.
- `_applyColorTheme` no-op когда `supportsColorTheme=false`.
- `initConfigHandlers` показывает/скрывает custom-row при смене select'а.
- `initConfigHandlers` idempotency: повторный вызов не вешает второй listener.

### E2E (Playwright, `tests/single/`)

**`dashboard-color-theme-pushbutton.spec.ts`:**
- Создать PushButton с `colorTheme='danger'` → root `.dashboard-widget` имеет
  класс `awc-theme-danger` и `data-color-theme="danger"`.
- Computed style `.pb-btn` background содержит rgb эквивалент `#ef4444`.
- Switch на `colorTheme='custom'` + `customBg='#ff6600'` → inline
  `style.--awc-bg === '#ff6600'`.
- Switch с custom обратно на `default` (через config save) → inline vars и
  класс удалены, computed background = старый `#3b82f6` (flat default).
- **Backwards-compat:** legacy widget config без `colorTheme` → DOM без
  `awc-theme-*` класса, computed background = текущий стиль flat (regression guard).

**`dashboard-color-theme-toggle.spec.ts`:**
- Slider track при `fb-on` + `theme='warning'` → computed background = rgb
  эквивалент `#fbbf24`.
- OFF track НЕ меняется (regression guard).
- Checkbox `fb-on` + `theme='danger'` → background `#ef4444`, checkmark color `#fff`.

### Visual smoke (required)

> Снято из «опционально» — для SCADA-панели цвета имеют семантическую нагрузку,
> visual regression обязателен.

Golden snapshots в `tests/single/__screenshots__/`:
- PushButton: 5 пресетов × 3 style (flat/mushroom/pill) + 1 custom × 1 style = 16 кадров.
- Toggle: 5 пресетов × 2 style (slider/checkbox) + 1 custom × 1 style = 11 кадров.

Если scope визуального тестирования окажется неподъёмным для CI — допустимо
сократить до golden'ов «pressed/ON состояние flat PushButton × 5 пресетов» и
«ON slider × 5 пресетов» (10 кадров) с явной фиксацией compromise в work plan.

## Verification Strategy

**Correctness defined as:**
1. Backwards-compat: ни один существующий dashboard визуально не меняется при
   merge'е изменений (нет `colorTheme` → нет `awc-theme-*` класса → fallback
   хексы выдают текущие цвета).
2. Theme applied correctly: при выборе preset/custom DOM получает соответствующий
   класс / inline-vars; computed style показывает ожидаемый rgb.
3. Cleanup: переключение темы (включая custom → preset / default) НЕ оставляет
   орфанных inline-vars или старых theme-классов на container.
4. Opt-in честный: Setpoint и Generator после merge'а НЕ показывают «Color theme»
   select в config form.

**Verification method:**
- Unit tests покрывают (2), (3), (4) на уровне DOM-mock'ов (vitest + jsdom).
- E2E backwards-compat test (раздел Testing) покрывает (1) явно.
- Visual snapshots — финальный gate для (2) на реальном browser rendering.

**Early verification point:**
Первый имплементируемый E2E spec — `PushButton + theme='danger'` рендерится
корректно. Должен пройти ПРЕЖДЕ чем переходить к Toggle / custom / config form.
Это catch-all для CSS var contract и `_applyColorTheme` core path.

## Migration

Никаких миграций — поле опциональное, дефолт = текущее поведение. Server-side
dashboard JSON НЕ валидируется (backend просто прокидывает), backend изменений
не требуется.

## Risks & mitigations

| Риск | Mitigation |
|---|---|
| Тема `warning` + flat → жёлтый фон + белый текст = низкий контраст | Палитра warning имеет `fg=#1f2937` (тёмный). |
| Mushroom выглядит «плоско» когда тема перекрасила оба stop'а на одинаковый цвет | `color-mix` для `--awc-bg-light` (lighter 25%) — gradient сохраняет 3D-эффект. |
| Custom pickers позволяют выбрать `bg=#000 fg=#000` (нечитаемо) | Принимаем — explicit user choice. Не валидируем contrast (operator-tool). |
| `color-mix()` не поддерживается | Pressed/light vars не вычисляются → pressed визуально совпадает с idle. Тема всё равно применяется, не блокирующее. |
| Палитра дублирована между JS и CSS → расхождение | Single source of truth в CSS. JS знает только имена. |
| Setpoint/Generator получают select без visual эффекта (UX bug) | `static supportsColorTheme = false` (default) — нет form-блока. Включается с правками CSS в следующей итерации. |
| `colorTheme: 'default'` шум в JSON у каждого save'нутого widget'а | Sparse serialization — поле выпускается на save. |
| Mushroom border цвет в default слегка сдвигается (`#7f1d1d` → computed darker) | Fallback в `var(--awc-bg, #7f1d1d)` сохраняет старый border. |

## Documentation update (post-implementation)

После merge'а добавить в `CLAUDE.md`:
- Раздел active widgets — `static supportsColorTheme` opt-in флаг.
- Subclass contract — `_applyColorTheme()` в «обычно НЕ трогай».
- Раздел utils / общих хелперов — `ACTIVE_WIDGET_THEME_NAMES`,
  `ACTIVE_WIDGET_CUSTOM_BG_DEFAULT`/`FG_DEFAULT`, `HEX_COLOR_REGEX`.

## Out of scope (next iterations)

- Setpoint темизация (slider track ON-zone, stepper accent) — flip
  `supportsColorTheme = true` + CSS.
- Generator темизация (value-text цвет когда running, Start/Stop button accent).
- Live preview темы прямо в edit dialog (до Apply).
- Per-state цвета push-button (разный bg для ON и OFF — сейчас 1 акцент).
- Theme presets как пользовательский kit (загружать additional palette из
  конфига). Палитра зашита в CSS — изменение требует rebuild.
- Custom-class escape hatch — отложен до реального запроса.
- Server-side validation of dashboard JSON (включая `colorTheme`) — backend
  сейчас просто прокидывает, валидации нет.
