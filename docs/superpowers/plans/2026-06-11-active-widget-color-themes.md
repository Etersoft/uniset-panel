# Active Widget Color Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-11-active-widget-color-themes-design.md` (rev. 3, approved).

**Goal:** Дать оператору возможность задавать цвет «акцентного» состояния PushButton и Toggle через 5 пресетов или `custom` с color picker'ами — без CSS-инъекции.

**Architecture:** CSS-variables (`--awc-bg`, `--awc-fg`, derived `--awc-bg-pressed`, `--awc-bg-light`) + theme classes (`awc-theme-*`) на `widget.container`. Opt-in `static supportsColorTheme` в `ActiveDashboardWidget`. Логика — целиком в base class, subclass touch — две строки (флаг + вызов `_applyColorTheme()` в render).

**Tech Stack:** Vanilla JS (concat в `app.js`), CSS3 `color-mix()`, Playwright E2E, vitest unit.

**Branch:** `story/active-widget-color-themes` (от `master` после commit `c3443a0`).

**Phase ordering rationale:**
1. Foundation (constants + base helpers) → 2. PushButton CSS + opt-in → **3. Early E2E gate** (PushButton+danger spec — обязан пройти ПРЕЖДЕ Toggle/custom/config-form) → 4. Config form → 5. Toggle → 6. Visual snapshots → 7. CLAUDE.md.

**Visual snapshot scope (committed up-front):** **compromise 10 frames** —
5 PushButton flat × 5 пресетов + 5 Toggle slider × 5 пресетов. Custom и
другие style'ы — без визуальной регрессии (unit + DOM-assert E2E
покрывают correctness). Если CI окажется неустойчивым на 10 кадров,
сокращаем до 4 (2 PushButton + 2 Toggle — danger + warning как самые
семантически нагруженные).

**Testing commands cheatsheet:**
- Unit (one file): `cd tests/unit && npx vitest run <name>.test.ts`
- E2E (one spec): `make js-tests TEST=single/<spec>.spec.ts`
- Build app.js после правок в `src/`: `make app`
- Full E2E suite — НЕ запускать между phases (дорого); только финальный gate в конце.

---

## File Structure

### Modified

| File | Lines (rough) | Responsibility |
|---|---|---|
| `ui/static/js/src/00-constants.js` | +4 const | Theme names, custom defaults, hex regex |
| `ui/static/js/src/61-dashboard-active-base.js` | +60 | `supportsColorTheme` flag, `_applyColorTheme()`, theme block в getConfigForm/parseConfigForm/initConfigHandlers |
| `ui/static/js/src/61-dashboard-active-button.js` | +2 | `supportsColorTheme = true`, call `_applyColorTheme()` |
| `ui/static/js/src/61-dashboard-active-toggle.js` | +2 | то же для Toggle |
| `ui/static/css/style.css` | +40, ~15 | Migrate existing flat/mushroom/pill/toggle к `var(--awc-*)`, add `.awc-theme-*` rules |
| `CLAUDE.md` | +15 | Document contract |

### Created

| File | Responsibility |
|---|---|
| `tests/unit/dashboard-active-color-theme.test.ts` | Unit для constants, `_applyColorTheme`, getConfigForm, parseConfigForm, initConfigHandlers |
| `tests/single/dashboard-color-theme-pushbutton.spec.ts` | E2E: PushButton тема применяется + backwards-compat + custom + switching |
| `tests/single/dashboard-color-theme-toggle.spec.ts` | E2E: Toggle slider/checkbox accent + OFF regression |
| `tests/single/dashboard-color-theme-visual.spec.ts` | Visual snapshots (10 кадров) |

---

## Task 1: Branch setup

**Files:** none — git operation only.

- [ ] **Step 1: Confirm starting state**

```bash
git status
git log -1 --oneline
```

Expected: clean working tree, HEAD at `c3443a0` (`docs(active-widgets): rev. 3 темизации`).

- [ ] **Step 2: Create branch**

```bash
git checkout -b story/active-widget-color-themes
```

Expected: `Switched to a new branch 'story/active-widget-color-themes'`.

---

## Task 2: Constants

**Files:**
- Modify: `ui/static/js/src/00-constants.js` (добавление в конец)

- [ ] **Step 1: Add constants to `00-constants.js`**

В конец файла (перед закрытием IIFE/module если есть; иначе просто в конец):

```javascript
// === Active widget color themes ===
// Список валидных имён preset-тем. Палитра хексов — в CSS (.awc-theme-*).
const ACTIVE_WIDGET_THEME_NAMES = ['primary', 'danger', 'warning', 'success', 'neutral'];

// Defaults для custom pickers — используются и в config form template,
// и в runtime fallback'е (_applyColorTheme), и в parseConfigForm normalization.
const ACTIVE_WIDGET_CUSTOM_BG_DEFAULT = '#3b82f6';
const ACTIVE_WIDGET_CUSTOM_FG_DEFAULT = '#ffffff';

// Hex validation pattern для нормализации custom pickers'а в parseConfigForm.
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
```

- [ ] **Step 2: Rebuild app.js**

```bash
make app
```

Expected: app.js перегенерирован, no errors.

- [ ] **Step 3: Smoke check — константы доступны глобально**

```bash
grep -c "ACTIVE_WIDGET_THEME_NAMES\|ACTIVE_WIDGET_CUSTOM_BG_DEFAULT\|ACTIVE_WIDGET_CUSTOM_FG_DEFAULT\|HEX_COLOR_REGEX" ui/static/js/app.js
```

Expected: `4` или больше.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/00-constants.js ui/static/js/app.js
git commit -m "feat(active-widgets): добавить константы color theme

ACTIVE_WIDGET_THEME_NAMES — список preset-тем (палитра в CSS).
ACTIVE_WIDGET_CUSTOM_BG_DEFAULT / FG_DEFAULT — единый источник дефолтов
для custom pickers (config form + runtime + parseConfigForm).
HEX_COLOR_REGEX — нормализация custom hex'ов."
```

---

## Task 3: Base class — `_applyColorTheme` (TDD)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js`
- Test: `tests/unit/dashboard-active-color-theme.test.ts` (создаём)

- [ ] **Step 1: Write failing unit test for `_applyColorTheme`**

`tests/unit/dashboard-active-color-theme.test.ts`:

```typescript
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, beforeEach } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadBaseClass() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const utils     = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const base      = readFileSync(resolve(SRC_DIR, '60-dashboard-base.js'), 'utf8');
    // Binding helpers нужны для super.getConfigForm / parseConfigForm reuse.
    const binding   = readFileSync(resolve(SRC_DIR, '60-widget-sensor-binding.js'), 'utf8');
    const activeBase = readFileSync(resolve(SRC_DIR, '61-dashboard-active-base.js'), 'utf8');
    new Function(`
        ${constants}
        ${utils}
        ${binding}
        ${base}
        ${activeBase}
        globalThis.ActiveDashboardWidget = ActiveDashboardWidget;
        globalThis.ACTIVE_WIDGET_THEME_NAMES = ACTIVE_WIDGET_THEME_NAMES;
        globalThis.ACTIVE_WIDGET_CUSTOM_BG_DEFAULT = ACTIVE_WIDGET_CUSTOM_BG_DEFAULT;
        globalThis.ACTIVE_WIDGET_CUSTOM_FG_DEFAULT = ACTIVE_WIDGET_CUSTOM_FG_DEFAULT;
        globalThis.HEX_COLOR_REGEX = HEX_COLOR_REGEX;
    `)();
}

declare global {
    var ActiveDashboardWidget: any;
    var ACTIVE_WIDGET_THEME_NAMES: string[];
    var ACTIVE_WIDGET_CUSTOM_BG_DEFAULT: string;
    var ACTIVE_WIDGET_CUSTOM_FG_DEFAULT: string;
    var HEX_COLOR_REGEX: RegExp;
}

beforeEach(() => loadBaseClass());

// Minimal subclass для тестов: skip ctor side-effects.
function makeTestable(config: any, supports = true) {
    class W extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = supports;
        constructor(c: any) {
            super('test-id', c, document.createElement('div'));
        }
    }
    return new W(config);
}

describe('_applyColorTheme — base class theme application', () => {
    it('no-op when supportsColorTheme=false (default)', () => {
        const w = makeTestable({ colorTheme: 'danger' }, false);
        w._applyColorTheme();
        expect(w.container.className).not.toMatch(/awc-theme-/);
        expect(w.container.dataset.colorTheme).toBeUndefined();
    });

    it('adds awc-theme-<name> class for preset', () => {
        const w = makeTestable({ colorTheme: 'danger' });
        w._applyColorTheme();
        expect(w.container.classList.contains('awc-theme-danger')).toBe(true);
        expect(w.container.dataset.colorTheme).toBe('danger');
    });

    it('switches class on preset → preset transition', () => {
        const w = makeTestable({ colorTheme: 'danger' });
        w._applyColorTheme();
        w.config.colorTheme = 'success';
        w._applyColorTheme();
        expect(w.container.classList.contains('awc-theme-danger')).toBe(false);
        expect(w.container.classList.contains('awc-theme-success')).toBe(true);
        expect(w.container.dataset.colorTheme).toBe('success');
    });

    it('custom: applies inline vars + awc-theme-custom class', () => {
        const w = makeTestable({ colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' });
        w._applyColorTheme();
        expect(w.container.classList.contains('awc-theme-custom')).toBe(true);
        expect(w.container.style.getPropertyValue('--awc-bg')).toBe('#ff6600');
        expect(w.container.style.getPropertyValue('--awc-fg')).toBe('#000000');
        expect(w.container.dataset.colorTheme).toBe('custom');
    });

    it('custom → preset cleanup: inline vars removed, custom class removed', () => {
        const w = makeTestable({ colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' });
        w._applyColorTheme();
        w.config = { colorTheme: 'danger' };
        w._applyColorTheme();
        expect(w.container.style.getPropertyValue('--awc-bg')).toBe('');
        expect(w.container.style.getPropertyValue('--awc-fg')).toBe('');
        expect(w.container.classList.contains('awc-theme-custom')).toBe(false);
        expect(w.container.classList.contains('awc-theme-danger')).toBe(true);
    });

    it('preset → default cleanup: класс убран, vars не вмешиваются', () => {
        const w = makeTestable({ colorTheme: 'danger' });
        w._applyColorTheme();
        w.config = { colorTheme: 'default' };
        w._applyColorTheme();
        expect(w.container.className).not.toMatch(/awc-theme-/);
        expect(w.container.dataset.colorTheme).toBeUndefined();
    });

    it('corrupted theme value → no class, no data attribute', () => {
        const w = makeTestable({ colorTheme: 'hacked' });
        w._applyColorTheme();
        expect(w.container.className).not.toMatch(/awc-theme-/);
        expect(w.container.dataset.colorTheme).toBeUndefined();
    });

    it('custom without customBg/Fg → uses defaults', () => {
        const w = makeTestable({ colorTheme: 'custom' });
        w._applyColorTheme();
        expect(w.container.style.getPropertyValue('--awc-bg')).toBe(ACTIVE_WIDGET_CUSTOM_BG_DEFAULT);
        expect(w.container.style.getPropertyValue('--awc-fg')).toBe(ACTIVE_WIDGET_CUSTOM_FG_DEFAULT);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: FAIL — `w._applyColorTheme is not a function` (метод ещё не существует).

- [ ] **Step 3: Add `supportsColorTheme` + `_applyColorTheme` to base**

`ui/static/js/src/61-dashboard-active-base.js` — добавить в класс
`ActiveDashboardWidget` после существующих static fields, перед constructor:

```javascript
// === Color theming ===
// Opt-in флаг: subclass переопределяет в true, чтобы получить:
//  - "Color theme" select в config form
//  - валидацию colorTheme в parseConfigForm
//  - применение _applyColorTheme в render
// Subclass'ы без CSS-поддержки --awc-* остаются false → нет нерабочего select'а.
static supportsColorTheme = false;
```

Затем добавить метод `_applyColorTheme` (после `_updateInteractivityClass`,
перед `destroy`):

```javascript
// Применяет theme к this.container (а не this.element — для consistency со
// статус-классами data-active-widget / active-success / active-error и т.п.,
// которые тоже живут на container).
//
// Идемпотентен: чистит прошлое состояние перед установкой нового. Это load-bearing
// для in-place reconfigure path (если будущая live preview перестанет делать full
// re-render). При текущем full-rebuild через applyWidgetConfig (62-dashboard-manager.js)
// container.className wipe'ится — но inline style.--awc-bg НЕ затрагивается,
// поэтому removeProperty обязателен.
_applyColorTheme() {
    if (!this.constructor.supportsColorTheme) return;
    const c = this.container;
    if (!c) return;

    // 1. Cleanup previous theme classes.
    Array.from(c.classList)
        .filter(cls => cls.startsWith('awc-theme-'))
        .forEach(cls => c.classList.remove(cls));

    // 2. Cleanup previous inline vars (для случая custom → preset / default).
    c.style.removeProperty('--awc-bg');
    c.style.removeProperty('--awc-fg');

    const theme = this.config?.colorTheme;
    const valid = theme === 'custom'
        || (theme && ACTIVE_WIDGET_THEME_NAMES.includes(theme));

    if (!valid) {
        delete c.dataset.colorTheme;
        return;
    }
    c.dataset.colorTheme = theme;

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
```

- [ ] **Step 4: Rebuild app.js + run tests**

```bash
make app
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: 8 passing tests.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/app.js \
        tests/unit/dashboard-active-color-theme.test.ts
git commit -m "feat(active-widgets): _applyColorTheme + supportsColorTheme в base

Идемпотентный метод применяет theme к this.container (consistency со
статус-классами). Чистит прошлые theme-классы и inline vars при каждом
вызове — load-bearing для potential live-preview path. Текущий
applyWidgetConfig делает full re-render, но container reuse'ится и
className wipe'ится; inline style при этом сохраняется, поэтому
явный removeProperty обязателен.

8 unit-тестов: preset/custom apply, switching, cleanup, corrupted no-op,
defaults для custom без значений, no-op при supportsColorTheme=false."
```

---

## Task 4: PushButton CSS migration to CSS vars

**Files:**
- Modify: `ui/static/css/style.css:9293-9351` (flat/mushroom/pill блоки)

> **Цель:** ввести `var(--awc-*)` fallback'и с теми же хексами что сейчас.
> Default-вид не меняется (visual identity). Theme classes пока не существуют
> — этот шаг исключительно подготавливает CSS под будущее задание `--awc-bg`.

- [ ] **Step 1: Replace flat/mushroom/pill rules**

`ui/static/css/style.css` строки 9293–9351 (текущие три style блока). Заменить
содержимое существующих rules:

```css
/* === flat (default) — Material primary === */
.pushbutton-style-flat .pb-btn {
    padding: 10px 24px;
    background: var(--awc-bg, #3b82f6);
    color: var(--awc-fg, #fff);
    border: none;
    border-radius: 6px;
    font-size: 13px;
    box-shadow: 0 2px 4px rgba(0,0,0,.3);
}
.pushbutton-style-flat .pb-btn.pressed {
    background: var(--awc-bg-pressed, #2563eb);
    transform: translateY(1px);
    box-shadow: 0 1px 2px rgba(0,0,0,.3);
}

/* === mushroom — SCADA круглая ===
   Default visual fallback: light=#ef4444, dark=#b91c1c, border=#7f1d1d.
   При теме: light/dark/border derive'ятся от --awc-bg через color-mix. */
.pushbutton-style-mushroom .pb-btn {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%,
                                var(--awc-bg-light, #ef4444),
                                var(--awc-bg,       #b91c1c));
    border: 3px solid;
    border-color: color-mix(in srgb, var(--awc-bg, #7f1d1d), black 30%);
    color: var(--awc-fg, #fff);
    font-size: 11px;
    box-shadow: 0 4px 8px rgba(0,0,0,.5), inset 0 -4px 8px rgba(0,0,0,.3);
}
.pushbutton-style-mushroom .pb-btn.pressed {
    box-shadow: 0 1px 3px rgba(0,0,0,.5), inset 0 4px 8px rgba(0,0,0,.4);
    transform: translateY(2px);
}

/* === pill — Compact outline === */
.pushbutton-style-pill .pb-btn {
    padding: 8px 18px;
    background: transparent;
    color: #d8dce2;
    border: 2px solid #6b7280;
    border-radius: 20px;
    font-size: 12px;
}
.pushbutton-style-pill .pb-btn:hover {
    border-color: var(--awc-bg, #22c55e);
    color: var(--awc-bg, #22c55e);
}
.pushbutton-style-pill .pb-btn.pressed {
    background: var(--awc-bg, #22c55e);
    color: var(--awc-fg, #fff);
    border-color: var(--awc-bg, #22c55e);
}
```

> `pb-pulse-flash` keyframe (строки 9344–9351) **НЕ ТРОГАТЬ** — статусный
> feedback, явно out of scope (см. spec Non-goals).

- [ ] **Step 2: Smoke check default visual unchanged**

```bash
docker compose up dev-viewer -d --build
```

Открыть `http://localhost:8000`, перейти на любой dashboard с PushButton.
Кнопка должна выглядеть точно так же как до правок (flat — синий
`#3b82f6`, mushroom — красный gradient, pill — outline).

Если визуально что-то поменялось → fallback хексы в `var(--awc-*, …)` не
совпадают со старыми. Проверь diff. Это не нужно автоматизировать сейчас —
финальный visual snapshot phase покроет.

- [ ] **Step 3: Commit**

```bash
git add ui/static/css/style.css
git commit -m "refactor(active-widgets): PushButton CSS — migrate цвета на var(--awc-*)

Все хардкоженные цвета (#3b82f6 / #2563eb / #ef4444 / #b91c1c / #7f1d1d /
#22c55e) заменены на var(--awc-bg/--awc-fg/--awc-bg-pressed/--awc-bg-light
с fallback'ом на текущий хекс). Default-вид не меняется — theme classes
ещё не существуют. Mushroom border теперь через color-mix(awc-bg, black 30%),
fallback на #7f1d1d сохраняет старый цвет.

pb-pulse-flash keyframe НЕ темизуется — статусный feedback (см. spec)."
```

---

## Task 5: PushButton opt-in + render call

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-button.js`

- [ ] **Step 1: Add `supportsColorTheme = true`**

`ui/static/js/src/61-dashboard-active-button.js` строка 26 — после
`static styles = ['flat', 'mushroom', 'pill'];`:

```javascript
static supportsColorTheme = true;
```

- [ ] **Step 2: Call `_applyColorTheme()` at end of render**

`ui/static/js/src/61-dashboard-active-button.js`, `render()` метод. Сейчас
он заканчивается на `btn.addEventListener('click', ...)`. Перед закрывающей
скобкой `}` метода добавить:

```javascript
this._applyColorTheme();
```

Финальный фрагмент `render()`:

```javascript
const btn = this.element.querySelector('[data-test="btn"]');
if (this._currentMode() === 'momentary') {
    this._bindMomentary(btn);
} else {
    btn.addEventListener('click', () => this._onPulseClick());
}
this._applyColorTheme();
```

- [ ] **Step 3: Rebuild + smoke**

```bash
make app
```

Открыть dev-viewer, проверить что PushButton всё ещё рендерится без visual
изменений (без темы — fallback хексы).

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-button.js ui/static/js/app.js
git commit -m "feat(active-widgets): PushButton opt-in темизации

static supportsColorTheme = true + вызов _applyColorTheme() в конце render.
Без темы (config.colorTheme отсутствует / 'default') — fallback хексы в
var() выдают существующие цвета, default-вид не меняется."
```

---

## Task 6: PushButton + danger — EARLY VERIFICATION POINT

> **Spec Verification Strategy:** этот E2E spec — early gate. Должен пройти
> ДО перехода к Toggle / custom / config form. Если что-то ниже (Toggle CSS
> или config form) сломает этот тест — стоп, починить, потом продолжить.

**Files:**
- Modify: `ui/static/css/style.css` — добавить `.awc-theme-*` rules
- Create: `tests/single/dashboard-color-theme-pushbutton.spec.ts`

- [ ] **Step 1: Add theme classes to CSS**

`ui/static/css/style.css` — в самый конец файла:

```css
/* ============================================================================
 * Active widget color themes — preset palette + derive contract.
 * Опт-ин через JS static supportsColorTheme; класс/inline-vars ставятся на
 * widget.container (.dashboard-widget) методом _applyColorTheme.
 *
 * Single source of truth для палитры. CSS-переменные --awc-bg-pressed и
 * --awc-bg-light auto-derive'ятся для ЛЮБОГО themed элемента через атрибут
 * data-color-theme (выставляется в _applyColorTheme) — DRY: одно правило
 * на все 5 пресетов + custom.
 * ============================================================================ */
.awc-theme-primary  { --awc-bg: #3b82f6; --awc-fg: #fff;    }
.awc-theme-danger   { --awc-bg: #ef4444; --awc-fg: #fff;    }
.awc-theme-warning  { --awc-bg: #fbbf24; --awc-fg: #1f2937; }
.awc-theme-success  { --awc-bg: #22c55e; --awc-fg: #fff;    }
.awc-theme-neutral  { --awc-bg: #6b7280; --awc-fg: #fff;    }
/* custom — vars приходят inline через style.setProperty в _applyColorTheme */

/* Auto-derive pressed/light для всех themed widget'ов (preset и custom).
   Условие [data-color-theme] совпадает только для tagged container'ов,
   так что default widget'ы остаются на своих fallback хексах. */
[data-color-theme] {
    --awc-bg-pressed: color-mix(in srgb, var(--awc-bg), black 15%);
    --awc-bg-light:   color-mix(in srgb, var(--awc-bg), white 25%);
}
```

- [ ] **Step 2: Write failing E2E spec**

`tests/single/dashboard-color-theme-pushbutton.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const VIEWER_URL = process.env.BASE_URL || 'http://localhost:8000';

test.describe('PushButton color theme', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).PushButtonWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    async function createPbDashboard(page: any, overrides: any = {}) {
        await page.evaluate((cfgOverrides: any) => {
            const w: any = window;
            const widgetCfg = {
                id: 'pb-theme-1',
                type: 'pushbutton',
                config: {
                    sensor: 'TEST_BTN',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'flat',
                    label: 'TEST',
                    ...cfgOverrides,
                },
                position: { col: 0, row: 0, width: 2, height: 1 },
            };
            w.dashboardState.dashboards.set('TEST_PB_THEME', {
                meta: { name: 'TEST_PB_THEME', description: '' },
                widgets: [widgetCfg],
            });
            w.dashboardManager.loadDashboard('TEST_PB_THEME');
            w.switchView('dashboard');
        }, overrides);
        await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('theme=danger: container получает awc-theme-danger class + data-color-theme', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'danger' });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).toHaveClass(/awc-theme-danger/);
        await expect(container).toHaveAttribute('data-color-theme', 'danger');
    });

    test('theme=danger: computed background — красный (#ef4444)', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'danger', style: 'flat' });
        const bg = await page.evaluate(() => {
            const btn = document.querySelector('.pushbutton-widget .pb-btn') as HTMLElement;
            return getComputedStyle(btn).backgroundColor;
        });
        // #ef4444 → rgb(239, 68, 68)
        expect(bg).toMatch(/rgb\(\s*239,\s*68,\s*68\s*\)/);
    });

    test('backwards-compat: без colorTheme — нет awc-theme-* класса, цвет = текущий flat blue', async ({ page }) => {
        await createPbDashboard(page); // no colorTheme
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).not.toHaveClass(/awc-theme-/);
        const hasDataAttr = await container.evaluate((el) => 'colorTheme' in (el as HTMLElement).dataset);
        expect(hasDataAttr).toBe(false);

        const bg = await page.evaluate(() => {
            const btn = document.querySelector('.pushbutton-widget .pb-btn') as HTMLElement;
            return getComputedStyle(btn).backgroundColor;
        });
        // #3b82f6 → rgb(59, 130, 246)
        expect(bg).toMatch(/rgb\(\s*59,\s*130,\s*246\s*\)/);
    });
});
```

- [ ] **Step 3: Rebuild + run E2E**

```bash
make app
make js-tests TEST=single/dashboard-color-theme-pushbutton.spec.ts
```

Expected: 3 passing tests.

> Если тест «backwards-compat» падает — `var(--awc-bg, #3b82f6)` fallback
> не работает где-то выше по каскаду. Проверь что `_applyColorTheme`
> возвращается рано при отсутствии theme и НЕ ставит `data-color-theme`.

- [ ] **Step 4: Commit**

```bash
git add ui/static/css/style.css \
        tests/single/dashboard-color-theme-pushbutton.spec.ts
git commit -m "feat(active-widgets): preset themes CSS + PushButton E2E gate

5 preset тем (.awc-theme-primary/danger/warning/success/neutral) в style.css.
Pressed/light derive'ятся через color-mix на [data-color-theme] — DRY,
одно правило на все 5 пресетов + custom.

E2E spec dashboard-color-theme-pushbutton — early verification point из
spec Verification Strategy:
- theme=danger → awc-theme-danger + data-color-theme='danger' атрибут
- computed background = rgb(239,68,68)
- backwards-compat: без темы — нет класса, цвет = текущий #3b82f6"
```

---

## Task 7: Theme block в getConfigForm (TDD)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js:307-335`
- Test: `tests/unit/dashboard-active-color-theme.test.ts` (расширяем)

- [ ] **Step 1: Append failing tests for `getConfigForm`**

В тот же файл `tests/unit/dashboard-active-color-theme.test.ts` дописать в конец:

```typescript
describe('getConfigForm — theme block rendering', () => {
    class Supports extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = true;
    }
    class NoSupport extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = false;
    }

    it('renders theme select with 7 options when supportsColorTheme=true', () => {
        const html = Supports.getConfigForm({});
        const div = document.createElement('div');
        div.innerHTML = html;
        const sel = div.querySelector('[name="colorTheme"]') as HTMLSelectElement;
        expect(sel).toBeTruthy();
        expect(sel.querySelectorAll('option')).toHaveLength(7);
    });

    it('omits theme select when supportsColorTheme=false', () => {
        const html = NoSupport.getConfigForm({});
        const div = document.createElement('div');
        div.innerHTML = html;
        expect(div.querySelector('[name="colorTheme"]')).toBeNull();
        expect(div.querySelector('[name="customBg"]')).toBeNull();
    });

    it('theme select appears AFTER style select AND BEFORE requireConfirmation', () => {
        class Styled extends globalThis.ActiveDashboardWidget {
            static supportsColorTheme = true;
            static styles = ['flat', 'mushroom']; // > 1 → style select рендерится
        }
        const html = Styled.getConfigForm({});
        const div = document.createElement('div');
        div.innerHTML = html;
        const styleSel = div.querySelector('[name="style"]') as HTMLElement;
        const themeSel = div.querySelector('[name="colorTheme"]') as HTMLElement;
        const reqCb   = div.querySelector('[name="requireConfirmation"]') as HTMLElement;
        expect(styleSel && themeSel && reqCb).toBeTruthy();
        // compareDocumentPosition: returns DOCUMENT_POSITION_FOLLOWING (4) если B следует за A.
        expect(styleSel.compareDocumentPosition(themeSel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(themeSel.compareDocumentPosition(reqCb)   & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('pre-selects current colorTheme on reopen', () => {
        const html = Supports.getConfigForm({ colorTheme: 'warning' });
        const div = document.createElement('div');
        div.innerHTML = html;
        const sel = div.querySelector('[name="colorTheme"]') as HTMLSelectElement;
        expect(sel.value).toBe('warning');
    });

    it('custom row уже видима при reopen с colorTheme=custom', () => {
        const html = Supports.getConfigForm({ colorTheme: 'custom', customBg: '#abc123', customFg: '#222222' });
        const div = document.createElement('div');
        div.innerHTML = html;
        const row = div.querySelector('[data-color-custom-row]') as HTMLElement;
        expect(row).toBeTruthy();
        const bg = div.querySelector('[name="customBg"]') as HTMLInputElement;
        const fg = div.querySelector('[name="customFg"]') as HTMLInputElement;
        expect(bg.value).toBe('#abc123');
        expect(fg.value).toBe('#222222');
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: 5 new tests FAIL (`null` returned for theme select), previous 8 still pass.

- [ ] **Step 3: Modify `getConfigForm` in base**

`ui/static/js/src/61-dashboard-active-base.js:307` — заменить тело
`static getConfigForm(config = {})`. Существующий код возвращает строку с
sensor binding, style select, label, requireConfirmation, спред
`getActiveConfigFields`. Вставляем theme-блок **между style-select'ом и
label'ом**:

```javascript
static getConfigForm(config = {}) {
    const styleSelect = (this.styles && this.styles.length > 1)
        ? `
        <div class="widget-config-field">
            <label>Style</label>
            <select class="widget-input" name="style" data-test="cfg-style">
                ${this.styles.map(s => `<option value="${escapeAttr(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
        </div>
        `
        : '';

    const themeBlock = this.supportsColorTheme
        ? `
        <div class="widget-config-field">
            <label>Color theme</label>
            <select class="widget-input" name="colorTheme" data-test="cfg-colorTheme">
                <option value="default" ${(config.colorTheme || 'default') === 'default' ? 'selected' : ''}>Default (style-native)</option>
                <option value="primary" ${config.colorTheme === 'primary' ? 'selected' : ''}>Primary (blue)</option>
                <option value="danger"  ${config.colorTheme === 'danger'  ? 'selected' : ''}>Danger (red)</option>
                <option value="warning" ${config.colorTheme === 'warning' ? 'selected' : ''}>Warning (amber)</option>
                <option value="success" ${config.colorTheme === 'success' ? 'selected' : ''}>Success (green)</option>
                <option value="neutral" ${config.colorTheme === 'neutral' ? 'selected' : ''}>Neutral (gray)</option>
                <option value="custom"  ${config.colorTheme === 'custom'  ? 'selected' : ''}>Custom…</option>
            </select>
            <small class="widget-config-hint">
                Theme влияет на «активное» состояние (нажатая кнопка / ON-toggle).
            </small>
        </div>
        <div class="widget-config-row" data-color-custom-row style="display:${config.colorTheme === 'custom' ? '' : 'none'}">
            <div class="widget-config-field">
                <label>Custom bg</label>
                <input type="color" class="widget-input" name="customBg"
                       value="${escapeAttr(config.customBg || ACTIVE_WIDGET_CUSTOM_BG_DEFAULT)}"
                       data-test="cfg-customBg">
            </div>
            <div class="widget-config-field">
                <label>Custom fg</label>
                <input type="color" class="widget-input" name="customFg"
                       value="${escapeAttr(config.customFg || ACTIVE_WIDGET_CUSTOM_FG_DEFAULT)}"
                       data-test="cfg-customFg">
                <small class="widget-config-hint">
                    Видим только на виджетах с текстом (label).
                </small>
            </div>
        </div>
        `
        : '';

    return `
        ${renderSensorBindingFields(config, { fieldPrefix: '' })}
        ${styleSelect}
        ${themeBlock}
        <div class="widget-config-field">
            <label>Label (optional)</label>
            <input type="text" class="widget-input" name="label"
                   value="${escapeAttr(config.label || '')}" placeholder="Leave empty to hide header">
        </div>
        <div class="widget-config-field">
            <label class="widget-checkbox-label">
                <input type="checkbox" name="requireConfirmation"
                       ${config.requireConfirmation ? 'checked' : ''}>
                <span>Require confirmation before write</span>
            </label>
        </div>
    ` + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
}
```

- [ ] **Step 4: Rebuild + run tests**

```bash
make app
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/app.js \
        tests/unit/dashboard-active-color-theme.test.ts
git commit -m "feat(active-widgets): theme block в base getConfigForm

Conditional rendering по static supportsColorTheme: select из 7 опций +
custom-row с color picker'ами. Pre-select текущей темы при reopen;
custom-row уже visible если config.colorTheme === 'custom'.
Hint для customFg: 'Видим только на виджетах с текстом (label)'.

Позиционирование подтверждено unit-тестом через compareDocumentPosition:
theme block после style select, перед requireConfirmation.

Setpoint/Generator (supportsColorTheme=false) не получают theme-блок —
no UX bug нерабочего контрола."
```

---

## Task 8: parseConfigForm — нормализация (TDD)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js:342-353`
- Test: `tests/unit/dashboard-active-color-theme.test.ts` (расширяем)

- [ ] **Step 1: Append failing tests**

В конец `tests/unit/dashboard-active-color-theme.test.ts`:

```typescript
describe('parseConfigForm — theme normalization', () => {
    class Supports extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = true;
    }
    class NoSupport extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = false;
    }

    function buildForm(html: string) {
        const f = document.createElement('form');
        f.innerHTML = html;
        return f;
    }

    function baseHtml(extra = '') {
        // Минимум что должен распарсить super-parse: sensor binding + label + requireConfirmation.
        return `
            <input type="text" name="sensor" value="X" />
            <input type="hidden" name="sensorId" value="42" />
            <input type="text" name="objectName" value="SharedMemory" />
            <input type="text" name="serverId" value="srv1" />
            <input type="text" name="label" value="" />
            <input type="checkbox" name="requireConfirmation" />
            ${extra}
        `;
    }

    it('default → выпускается из result (sparse)', () => {
        const f = buildForm(baseHtml(`<select name="colorTheme"><option value="default" selected /></select>`));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBeUndefined();
        expect(out.customBg).toBeUndefined();
        expect(out.customFg).toBeUndefined();
    });

    it('preset value preserved', () => {
        const f = buildForm(baseHtml(`<select name="colorTheme"><option value="danger" selected /></select>`));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBe('danger');
    });

    it('corrupted value → normalized to default → выпускается', () => {
        const f = buildForm(baseHtml(`<select name="colorTheme"><option value="hacked" selected /></select>`));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBeUndefined();
    });

    it('custom с валидными hex', () => {
        const f = buildForm(baseHtml(`
            <select name="colorTheme"><option value="custom" selected /></select>
            <input type="text" name="customBg" value="#abcdef" />
            <input type="text" name="customFg" value="#000000" />
        `));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBe('custom');
        expect(out.customBg).toBe('#abcdef');
        expect(out.customFg).toBe('#000000');
    });

    it('custom с невалидным customBg → дефолт', () => {
        const f = buildForm(baseHtml(`
            <select name="colorTheme"><option value="custom" selected /></select>
            <input type="text" name="customBg" value="red" />
            <input type="text" name="customFg" value="" />
        `));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBe('custom');
        expect(out.customBg).toBe(ACTIVE_WIDGET_CUSTOM_BG_DEFAULT);
        expect(out.customFg).toBe(ACTIVE_WIDGET_CUSTOM_FG_DEFAULT);
    });

    it('supportsColorTheme=false — все theme поля игнорируются', () => {
        const f = buildForm(baseHtml(`
            <select name="colorTheme"><option value="danger" selected /></select>
            <input type="text" name="customBg" value="#abcdef" />
        `));
        const out = NoSupport.parseConfigForm(f);
        expect(out.colorTheme).toBeUndefined();
        expect(out.customBg).toBeUndefined();
    });

    it('preserves base fields (sensor binding, label, requireConfirmation)', () => {
        const f = buildForm(baseHtml());
        const out = Supports.parseConfigForm(f);
        expect(out.sensor).toBe('X');
        expect(out.sensorId).toBe(42);
        expect(out.objectName).toBe('SharedMemory');
        expect(out.serverId).toBe('srv1');
        expect(out.label).toBe('');
        expect(out.requireConfirmation).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: 7 new tests fail (colorTheme handling absent), 13 previous pass.

- [ ] **Step 3: Modify `parseConfigForm`**

`ui/static/js/src/61-dashboard-active-base.js:342-353` — заменить тело:

```javascript
static parseConfigForm(form) {
    const binding = parseSensorBindingFields(form, { fieldPrefix: '' });
    const base = {
        ...binding,
        label:      form.querySelector('[name="label"]')?.value || '',
        requireConfirmation: form.querySelector('[name="requireConfirmation"]')?.checked || false,
    };
    const styleEl = form.querySelector('[name="style"]');
    if (styleEl) base.style = styleEl.value;
    const extra = this.parseActiveConfigFields ? this.parseActiveConfigFields(form) : {};
    const result = { ...base, ...extra };

    // --- THEME normalization (новое; всё выше — без изменений) ---
    if (!this.supportsColorTheme) return result;

    const raw = form.querySelector('[name="colorTheme"]')?.value || 'default';
    const allowed = ['default', 'custom', ...ACTIVE_WIDGET_THEME_NAMES];
    const theme = allowed.includes(raw) ? raw : 'default';

    // Sparse: 'default' выпускается (не пачкает JSON dashboard'а).
    if (theme === 'default') return result;

    if (theme !== 'custom') return { ...result, colorTheme: theme };

    // Custom — нормализуем hex'ы: пустые / невалидные → дефолты.
    const rawBg = form.querySelector('[name="customBg"]')?.value?.trim() || '';
    const rawFg = form.querySelector('[name="customFg"]')?.value?.trim() || '';
    const customBg = HEX_COLOR_REGEX.test(rawBg) ? rawBg : ACTIVE_WIDGET_CUSTOM_BG_DEFAULT;
    const customFg = HEX_COLOR_REGEX.test(rawFg) ? rawFg : ACTIVE_WIDGET_CUSTOM_FG_DEFAULT;
    return { ...result, colorTheme: 'custom', customBg, customFg };
}
```

- [ ] **Step 4: Rebuild + run tests**

```bash
make app
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: all 20 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/app.js \
        tests/unit/dashboard-active-color-theme.test.ts
git commit -m "feat(active-widgets): parseConfigForm — normalization темы

Sparse serialization: colorTheme='default' НЕ записывается в result —
clean diff'ы dashboard.json. Corrupted preset value → 'default' →
выпускается → JSON 'лечится' при первом save.

Custom hex'ы нормализуются через HEX_COLOR_REGEX: пустые / невалидные
(e.g. 'red', '#abc' short hex) → ACTIVE_WIDGET_CUSTOM_BG/FG_DEFAULT.

supportsColorTheme=false → theme поля игнорируются (graceful no-op).

7 новых unit'ов покрывают: sparse default, preset preserved, corrupted,
custom valid/invalid hex, no-support no-op, base fields preserved."
```

---

## Task 9: initConfigHandlers — conditional reveal (TDD)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js:359-363`
- Test: `tests/unit/dashboard-active-color-theme.test.ts` (расширяем)

- [ ] **Step 1: Append failing tests**

В конец `tests/unit/dashboard-active-color-theme.test.ts`:

```typescript
describe('initConfigHandlers — custom row reveal', () => {
    class Supports extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = true;
    }

    function buildForm() {
        const f = document.createElement('form');
        f.innerHTML = `
            <input type="text" name="sensor" value="" />
            <input type="hidden" name="sensorId" value="" />
            <input type="text" name="objectName" value="SharedMemory" />
            <input type="text" name="serverId" value="" />
            <select name="colorTheme">
                <option value="default">d</option>
                <option value="danger">danger</option>
                <option value="custom">custom</option>
            </select>
            <div data-color-custom-row style="display:none">
                <input type="text" name="customBg" value="" />
                <input type="text" name="customFg" value="" />
            </div>
        `;
        return f;
    }

    it('default selection → custom row hidden', () => {
        const f = buildForm();
        Supports.initConfigHandlers(f, { colorTheme: 'default' });
        const row = f.querySelector('[data-color-custom-row]') as HTMLElement;
        expect(row.style.display).toBe('none');
    });

    it('change to custom → row revealed', () => {
        const f = buildForm();
        Supports.initConfigHandlers(f, { colorTheme: 'default' });
        const sel = f.querySelector('[name="colorTheme"]') as HTMLSelectElement;
        sel.value = 'custom';
        sel.dispatchEvent(new Event('change'));
        const row = f.querySelector('[data-color-custom-row]') as HTMLElement;
        expect(row.style.display).toBe('');
    });

    it('change custom → preset → row hidden again', () => {
        const f = buildForm();
        Supports.initConfigHandlers(f, { colorTheme: 'custom' });
        const sel = f.querySelector('[name="colorTheme"]') as HTMLSelectElement;
        sel.value = 'danger';
        sel.dispatchEvent(new Event('change'));
        const row = f.querySelector('[data-color-custom-row]') as HTMLElement;
        expect(row.style.display).toBe('none');
    });

    it('idempotency: повторный init не вешает второй listener', () => {
        const f = buildForm();
        Supports.initConfigHandlers(f, {});
        Supports.initConfigHandlers(f, {});
        const sel = f.querySelector('[name="colorTheme"]') as HTMLSelectElement;
        sel.value = 'custom';
        let changeCount = 0;
        const row = f.querySelector('[data-color-custom-row]') as HTMLElement;
        const observer = new MutationObserver(() => changeCount++);
        observer.observe(row, { attributes: true, attributeFilter: ['style'] });
        sel.dispatchEvent(new Event('change'));
        observer.disconnect();
        expect(changeCount).toBe(1); // ровно один style-mutation, не два
    });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: 4 new tests fail (handler not attached), 20 previous pass.

- [ ] **Step 3: Modify `initConfigHandlers`**

`ui/static/js/src/61-dashboard-active-base.js:359-363`:

```javascript
static initConfigHandlers(form, config = {}) {
    if (form.dataset.activeHandlersWired === 'true') return;
    form.dataset.activeHandlersWired = 'true';
    initSensorBindingHandlers(form, config, { fieldPrefix: '' });

    // --- THEME reveal handler (всё выше — без изменений) ---
    if (!this.supportsColorTheme) return;
    const themeSel = form.querySelector('[name="colorTheme"]');
    const customRow = form.querySelector('[data-color-custom-row]');
    if (!themeSel || !customRow) return;  // graceful: themeBlock не отрендерился
    const update = () => {
        customRow.style.display = themeSel.value === 'custom' ? '' : 'none';
    };
    themeSel.addEventListener('change', update);
    update();  // initial sync (для reopen с config.colorTheme === 'custom')
}
```

- [ ] **Step 4: Rebuild + run tests**

```bash
make app
cd tests/unit && npx vitest run dashboard-active-color-theme.test.ts
```

Expected: all 24 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/app.js \
        tests/unit/dashboard-active-color-theme.test.ts
git commit -m "feat(active-widgets): initConfigHandlers — reveal custom row

Conditional reveal через 'change' listener на theme select. Idempotency
гарантирована существующим activeHandlersWired guard (отдельный
colorHandlersWired НЕ нужен). update() вызывается сразу для initial sync
при reopen с custom config.

Для subclass'ов с supportsColorTheme=false themeSel === null → graceful no-op
без attach'а listener'а (нет false-positive wiring)."
```

---

## Task 10: PushButton custom E2E

**Files:**
- Modify: `tests/single/dashboard-color-theme-pushbutton.spec.ts` (дополняем)

- [ ] **Step 1: Append failing custom tests**

В конец `tests/single/dashboard-color-theme-pushbutton.spec.ts` (внутри
`test.describe`), после backwards-compat теста:

```typescript
    test('theme=custom: inline vars set, container получает awc-theme-custom', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).toHaveClass(/awc-theme-custom/);
        await expect(container).toHaveAttribute('data-color-theme', 'custom');

        const vars = await container.evaluate((el: HTMLElement) => ({
            bg: el.style.getPropertyValue('--awc-bg'),
            fg: el.style.getPropertyValue('--awc-fg'),
        }));
        expect(vars.bg).toBe('#ff6600');
        expect(vars.fg).toBe('#000000');

        const bg = await page.evaluate(() => {
            const btn = document.querySelector('.pushbutton-widget .pb-btn') as HTMLElement;
            return getComputedStyle(btn).backgroundColor;
        });
        // #ff6600 → rgb(255, 102, 0)
        expect(bg).toMatch(/rgb\(\s*255,\s*102,\s*0\s*\)/);
    });

    test('switching: danger → custom → default cleanup (inline vars cleared)', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'danger' });
        // Меняем config и форсим re-render через applyWidgetConfig API.
        await page.evaluate(() => {
            const w: any = window;
            const dash = w.dashboardState.dashboards.get('TEST_PB_THEME');
            // applyWidgetConfig симулирует save из dialog'а: меняет cfg + re-render content.
            w.dashboardManager.applyWidgetConfig(
                dash.widgets[0].id,
                dash.widgets[0].type,
                { ...dash.widgets[0].config, colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' },
                false
            );
        });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).toHaveClass(/awc-theme-custom/);

        // Переключаемся обратно в default — inline vars должны очиститься.
        await page.evaluate(() => {
            const w: any = window;
            const dash = w.dashboardState.dashboards.get('TEST_PB_THEME');
            w.dashboardManager.applyWidgetConfig(
                dash.widgets[0].id,
                dash.widgets[0].type,
                { ...dash.widgets[0].config, colorTheme: 'default', customBg: undefined, customFg: undefined },
                false
            );
        });
        await expect(container).not.toHaveClass(/awc-theme-/);
        const vars = await container.evaluate((el: HTMLElement) => ({
            bg: el.style.getPropertyValue('--awc-bg'),
            fg: el.style.getPropertyValue('--awc-fg'),
        }));
        expect(vars.bg).toBe('');
        expect(vars.fg).toBe('');
    });
```

- [ ] **Step 2: Run E2E**

```bash
make js-tests TEST=single/dashboard-color-theme-pushbutton.spec.ts
```

Expected: 5 passing tests (3 prior + 2 new).

> Если switching test падает с «cannot read property of undefined» —
> `applyWidgetConfig` signature мог измениться; проверь
> `62-dashboard-manager.js:1213+` и адаптируй вызов.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-color-theme-pushbutton.spec.ts
git commit -m "test(active-widgets): PushButton custom + switching E2E

- theme=custom: inline --awc-bg/--awc-fg + awc-theme-custom class +
  computed background = #ff6600
- switching danger → custom → default: cleanup inline vars при возврате
  на default (regression guard для контракта _applyColorTheme step 2)"
```

---

## Task 11: Toggle CSS migration + opt-in + E2E

**Files:**
- Modify: `ui/static/css/style.css:9191-9258` (toggle блоки)
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js`
- Create: `tests/single/dashboard-color-theme-toggle.spec.ts`

- [ ] **Step 1: Migrate Toggle CSS to vars**

`ui/static/css/style.css:9191-9258` — заменить ON state rules:

```css
/* Slider — ON track (theme: --awc-bg перекрашивает; OFF/unknown — нейтральные) */
.toggle-widget .toggle-track.fb-on      { background: var(--awc-bg, #22c55e); }
.toggle-widget .toggle-track.fb-off     { background: #374151; border: 1px solid #4b5563; }
.toggle-widget .toggle-track.fb-unknown { background: #1f2937; border: 1px dashed #6b7280; }
```

И аналогично для checkbox style (строки ~9236):

```css
.toggle-widget .toggle-cb.fb-on {
    background: var(--awc-bg, #22c55e);
    border-color: var(--awc-bg, #22c55e);
}
.toggle-widget .toggle-cb.fb-on::after {
    color: var(--awc-fg, #fff);
    /* ... остальные свойства как сейчас (font-size/content) ... */
}
```

> **Внимание:** не трогать `.toggle-track.diverge` (статусная divergence-граница).
> Не трогать `.toggle-widget.toggle-style-checkbox.diverge` — тоже статус.

- [ ] **Step 2: Add Toggle opt-in + render call**

`ui/static/js/src/61-dashboard-active-toggle.js` — после
`static styles = ['slider', 'checkbox'];`:

```javascript
static supportsColorTheme = true;
```

В `render()` метод — после dispatch'а на `renderSlider()` / `renderCheckbox()`
добавить:

```javascript
this._applyColorTheme();
```

(Тема применяется на `this.container` — каскадирует и в slider, и в checkbox
вне зависимости от того, какой path выбран renderSlider/renderCheckbox.)

- [ ] **Step 3: Write Toggle E2E spec**

`tests/single/dashboard-color-theme-toggle.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Toggle color theme', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).ToggleWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    async function createToggleDashboard(page: any, overrides: any = {}) {
        await page.evaluate((cfgOverrides: any) => {
            const w: any = window;
            const widgetCfg = {
                id: 'tog-theme-1',
                type: 'toggle',
                config: {
                    sensor: 'TEST_TOG',
                    sensorId: 200,
                    objectName: 'SharedMemory',
                    style: 'slider',
                    valueOff: 0,
                    valueOn: 1,
                    labelOff: 'OFF',
                    labelOn: 'ON',
                    ...cfgOverrides,
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            w.dashboardState.dashboards.set('TEST_TOG_THEME', {
                meta: { name: 'TEST_TOG_THEME', description: '' },
                widgets: [widgetCfg],
            });
            w.dashboardManager.loadDashboard('TEST_TOG_THEME');
            w.switchView('dashboard');
        }, overrides);
        await page.locator('.toggle-widget').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('slider theme=warning: ON track — amber (#fbbf24)', async ({ page }) => {
        await createToggleDashboard(page, { style: 'slider', colorTheme: 'warning' });
        // Set state to ON
        await page.evaluate(() => {
            const w: any = window;
            const wg = w.dashboardState.widgets.get('tog-theme-1');
            wg.update(1, null, null);
        });
        await expect(page.locator('.toggle-track.fb-on').first()).toBeVisible();
        const bg = await page.evaluate(() => {
            const t = document.querySelector('.toggle-track.fb-on') as HTMLElement;
            return getComputedStyle(t).backgroundColor;
        });
        // #fbbf24 → rgb(251, 191, 36)
        expect(bg).toMatch(/rgb\(\s*251,\s*191,\s*36\s*\)/);
    });

    test('slider OFF track НЕ меняется при theme — gray-neutral regression', async ({ page }) => {
        await createToggleDashboard(page, { style: 'slider', colorTheme: 'danger' });
        await page.evaluate(() => {
            const w: any = window;
            const wg = w.dashboardState.widgets.get('tog-theme-1');
            wg.update(0, null, null);
        });
        await expect(page.locator('.toggle-track.fb-off').first()).toBeVisible();
        const bg = await page.evaluate(() => {
            const t = document.querySelector('.toggle-track.fb-off') as HTMLElement;
            return getComputedStyle(t).backgroundColor;
        });
        // #374151 → rgb(55, 65, 81)
        expect(bg).toMatch(/rgb\(\s*55,\s*65,\s*81\s*\)/);
    });

    test('checkbox theme=danger: ON background = #ef4444, checkmark = #fff', async ({ page }) => {
        await createToggleDashboard(page, { style: 'checkbox', colorTheme: 'danger' });
        await page.evaluate(() => {
            const w: any = window;
            const wg = w.dashboardState.widgets.get('tog-theme-1');
            wg.update(1, null, null);
        });
        await expect(page.locator('.toggle-cb.fb-on').first()).toBeVisible();
        const styles = await page.evaluate(() => {
            const cb = document.querySelector('.toggle-cb.fb-on') as HTMLElement;
            const after = window.getComputedStyle(cb, '::after');
            return {
                bg: getComputedStyle(cb).backgroundColor,
                checkmark: after.color,
            };
        });
        expect(styles.bg).toMatch(/rgb\(\s*239,\s*68,\s*68\s*\)/);
        expect(styles.checkmark).toMatch(/rgb\(\s*255,\s*255,\s*255\s*\)/);
    });

    test('backwards-compat: без colorTheme — нет awc-theme-* класса, ON цвет = #22c55e', async ({ page }) => {
        await createToggleDashboard(page); // no colorTheme
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tog-theme-1').update(1, null, null);
        });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.toggle-widget') }).first();
        await expect(container).not.toHaveClass(/awc-theme-/);
        const bg = await page.evaluate(() => {
            const t = document.querySelector('.toggle-track.fb-on') as HTMLElement;
            return getComputedStyle(t).backgroundColor;
        });
        // #22c55e → rgb(34, 197, 94)
        expect(bg).toMatch(/rgb\(\s*34,\s*197,\s*94\s*\)/);
    });
});
```

- [ ] **Step 4: Rebuild + run E2E**

```bash
make app
make js-tests TEST=single/dashboard-color-theme-toggle.spec.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add ui/static/css/style.css ui/static/js/src/61-dashboard-active-toggle.js \
        ui/static/js/app.js tests/single/dashboard-color-theme-toggle.spec.ts
git commit -m "feat(active-widgets): Toggle темизация — slider + checkbox

CSS: .toggle-track.fb-on и .toggle-cb.fb-on background — var(--awc-bg, #22c55e)
с fallback на текущий зелёный. OFF/unknown/diverge НЕ темизуются.

Toggle opt-in: supportsColorTheme=true + вызов _applyColorTheme() после
dispatch на renderSlider/renderCheckbox.

E2E 4 теста:
- slider warning ON → amber
- slider OFF без изменений при теме (regression guard)
- checkbox danger ON → red + checkmark white
- backwards-compat без темы → green #22c55e сохраняется"
```

---

## Task 12: Visual snapshots (compromise scope — 10 frames)

**Files:**
- Create: `tests/single/dashboard-color-theme-visual.spec.ts`

> Compromise scope (10 кадров) committed up-front в plan'е:
> 5 PushButton flat × 5 пресетов + 5 Toggle slider × 5 пресетов.
> Mushroom/pill/checkbox style'и и custom покрыты unit + DOM-assert E2E
> в Tasks 7, 11.

- [ ] **Step 1: Create visual spec**

`tests/single/dashboard-color-theme-visual.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const THEMES = ['primary', 'danger', 'warning', 'success', 'neutral'] as const;

test.describe('Color theme visual snapshots — compromise 10 frames', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).PushButtonWidget !== 'undefined' &&
            typeof (window as any).ToggleWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    for (const theme of THEMES) {
        test(`PushButton flat × ${theme}`, async ({ page }) => {
            await page.evaluate((t) => {
                const w: any = window;
                w.dashboardState.dashboards.set('VISUAL_PB', {
                    meta: { name: 'VISUAL_PB', description: '' },
                    widgets: [{
                        id: 'pb-v', type: 'pushbutton',
                        config: { sensor: 'X', sensorId: 1, objectName: 'SharedMemory',
                                  style: 'flat', label: 'TEST', colorTheme: t },
                        position: { col: 0, row: 0, width: 3, height: 2 },
                    }],
                });
                w.dashboardManager.loadDashboard('VISUAL_PB');
                w.switchView('dashboard');
            }, theme);
            const btn = page.locator('.pushbutton-widget').first();
            await btn.waitFor({ state: 'visible' });
            await expect(btn).toHaveScreenshot(`pb-flat-${theme}.png`);
        });

        test(`Toggle slider × ${theme}`, async ({ page }) => {
            await page.evaluate((t) => {
                const w: any = window;
                w.dashboardState.dashboards.set('VISUAL_TOG', {
                    meta: { name: 'VISUAL_TOG', description: '' },
                    widgets: [{
                        id: 'tog-v', type: 'toggle',
                        config: { sensor: 'Y', sensorId: 2, objectName: 'SharedMemory',
                                  style: 'slider', valueOff: 0, valueOn: 1,
                                  labelOff: 'OFF', labelOn: 'ON', colorTheme: t },
                        position: { col: 0, row: 0, width: 3, height: 2 },
                    }],
                });
                w.dashboardManager.loadDashboard('VISUAL_TOG');
                w.switchView('dashboard');
                // Toggle в ON для visual ON-state.
                setTimeout(() => {
                    w.dashboardState.widgets.get('tog-v').update(1, null, null);
                }, 100);
            }, theme);
            const wg = page.locator('.toggle-widget').first();
            await wg.waitFor({ state: 'visible' });
            await page.locator('.toggle-track.fb-on').first().waitFor({ state: 'visible', timeout: 3000 });
            await expect(wg).toHaveScreenshot(`tog-slider-${theme}.png`);
        });
    }
});
```

- [ ] **Step 2: Generate baseline snapshots**

```bash
make js-tests TEST=single/dashboard-color-theme-visual.spec.ts -- --update-snapshots
```

> Если `make js-tests` не пробрасывает флаги — выполнить через `docker compose`
> напрямую:
> `docker compose run --rm playwright-single npx playwright test single/dashboard-color-theme-visual.spec.ts --update-snapshots`

Expected: 10 .png кадров в `tests/single/dashboard-color-theme-visual.spec.ts-snapshots/`.

- [ ] **Step 3: Verify visual sanity (вручную)**

Открой 5 PushButton PNG: должны быть синяя / красная / янтарная / зелёная /
серая кнопки соответственно. Открой 5 Toggle PNG: track ON-зона тех же цветов.

Если хоть один кадр выглядит «не как должно» (например, warning amber не
амбер) — починить CSS и regenerate. Не коммитить «битый» baseline.

- [ ] **Step 4: Run без update — должны пройти**

```bash
make js-tests TEST=single/dashboard-color-theme-visual.spec.ts
```

Expected: 10 passing tests (compared against just-generated baselines).

- [ ] **Step 5: Commit**

```bash
git add tests/single/dashboard-color-theme-visual.spec.ts \
        tests/single/dashboard-color-theme-visual.spec.ts-snapshots/
git commit -m "test(active-widgets): visual snapshots — compromise 10 frames

5 PushButton flat × 5 пресетов + 5 Toggle slider × 5 пресетов.
Compromise scope из spec — Mushroom/pill/checkbox style'и и custom
покрыты unit + DOM-assert E2E."
```

---

## Task 13: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (раздел про active widgets)

- [ ] **Step 1: Add documentation to CLAUDE.md**

В `CLAUDE.md`, в существующую секцию «**Subclass contract — обычно НЕ трогай**»
(там перечислены `getConfigForm`, `parseConfigForm` и т.п.) — добавить:

```markdown
- `_applyColorTheme()` — наследуется из base, вызывается из render subclass'а
  ОДНОЙ строкой. Сам метод трогать не надо.
- `static supportsColorTheme` — opt-in флаг (default `false` в base).
  Subclass переопределяет в `true`, чтобы получить «Color theme» select в
  config form и применение темы в render. См. подраздел ниже.
```

В конце раздела active widgets (после блока про Setpoint/Generator) добавить
новый подраздел:

```markdown
### Color themes для active widgets

5 preset тем (primary/danger/warning/success/neutral) + custom через color
pickers. Реализованы через CSS-variables (`--awc-bg`, `--awc-fg`,
derived `--awc-bg-pressed`, `--awc-bg-light`) и theme classes
(`awc-theme-<name>`) на `widget.container`.

**Opt-in:**
```javascript
class MyWidget extends ActiveDashboardWidget {
    static supportsColorTheme = true;  // получает theme select в config form
    render() {
        // ... existing logic ...
        this._applyColorTheme();  // одна строка в конце render
    }
}
```

**Контракт subclass:**
- `static supportsColorTheme = true` (default `false` в base).
- Вызов `this._applyColorTheme()` в конце `render()` (на `this.container`
  каскадирует во все вложенные элементы виджета через CSS-vars).
- В CSS использовать `var(--awc-bg, <current-hex>)` / `var(--awc-fg, …)` /
  `var(--awc-bg-pressed, …)` с fallback на текущий хекс — default-вид
  не меняется.

**Палитра — single source of truth в `style.css`** (раздел
«Active widget color themes — preset palette»). JS знает только имена
(`ACTIVE_WIDGET_THEME_NAMES` в `00-constants.js`).

**Defaults для custom** (`ACTIVE_WIDGET_CUSTOM_BG_DEFAULT`,
`ACTIVE_WIDGET_CUSTOM_FG_DEFAULT`) — используются в config form template,
parseConfigForm normalization, и runtime fallback'е `_applyColorTheme`.

**Не темизуются** (статусные индикаторы, SCADA-конвенция):
- `pb-pulse-flash` keyframe (жёлтый flash при pulse click)
- `active-success` (зелёный) / `active-error` (purple) / `active-pending` /
  dirty (янтарный) / frozen (icy cyan)
- `divergence`-граница на toggle (жёлтая)

**Sparse serialization:** `colorTheme === 'default'` НЕ записывается в
JSON dashboard'а (выпускается из parseConfigForm). Это сохраняет clean
diff'ы export'ов.

Spec: `docs/superpowers/specs/2026-06-11-active-widget-color-themes-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): color themes contract для active widgets

Subclass contract: supportsColorTheme opt-in + _applyColorTheme() в render.
Палитра в CSS, JS знает только имена. Defaults в константах. Sparse
serialization 'default'. Список не-темизуемых статусных цветов.

Ссылка на spec."
```

---

## Task 14: Final verification

**Files:** none — integration verification.

- [ ] **Step 1: Run ALL unit tests (color theme + sibling regression)**

```bash
cd tests/unit && npx vitest run
```

Expected: все тесты pass (включая `dashboard-active-color-theme.test.ts`
со всеми 24 тестами + existing suites без regression).

- [ ] **Step 2: Run targeted E2E specs**

```bash
make js-tests TEST=single/dashboard-color-theme-pushbutton.spec.ts
make js-tests TEST=single/dashboard-color-theme-toggle.spec.ts
make js-tests TEST=single/dashboard-color-theme-visual.spec.ts
# Regression sibling specs:
make js-tests TEST=single/dashboard-active-button.spec.ts
make js-tests TEST=single/dashboard-active-toggle.spec.ts
make js-tests TEST=single/dashboard-active-setpoint.spec.ts
make js-tests TEST=single/dashboard-active-generator.spec.ts
make js-tests TEST=single/dashboard-active-base.spec.ts
```

Expected: все pass. Sibling specs покрывают regression: что theme block
НЕ протёк в Setpoint/Generator (supportsColorTheme=false → нет theme
select в их config form), и что existing PushButton/Toggle behavior
не сломан CSS migration'ом.

- [ ] **Step 3: Manual smoke в браузере**

```bash
docker compose up dev-viewer -d --build
```

Открыть `http://localhost:8000`, создать dashboard с PushButton.
В edit dialog'е:
- Theme select виден после style, перед requireConfirmation.
- Default option выбран по умолчанию.
- Выбор Custom — появляется custom-row с двумя color picker'ами.
- Выбор preset (e.g. Danger) → save → кнопка краснеет.
- Custom со значениями `#ff6600` / `#000000` → save → оранжевая кнопка с тёмным текстом.

Создать Setpoint widget → в config form theme select **отсутствует**
(opt-in check).

- [ ] **Step 4: Final commit (если по итогам smoke выявились правки)**

Если в Step 3 нашлись микро-фиксы — отдельный commit. Иначе пропустить.

- [ ] **Step 5: Push branch**

```bash
git push -u origin story/active-widget-color-themes
```

---

## Self-Review (предварительно, не дублируем независимый ревью)

**1. Spec coverage:** каждая секция spec → задача:
- Data model (constants) → Task 2
- `_applyColorTheme` + helpers → Task 3
- PushButton integration → Tasks 4 + 5
- Theme classes CSS → Task 6
- Config form: getConfigForm → Task 7; parseConfigForm → Task 8;
  initConfigHandlers → Task 9
- Toggle integration → Task 11
- Visual snapshots → Task 12 (compromise scope явно фиксирован)
- Verification Strategy early gate → Task 6 (PushButton+danger E2E
  ПРЕЖДЕ Toggle/custom/config-form)
- Documentation update → Task 13 (отдельный task per reviewer hint)
- Final verification → Task 14

**2. Type consistency:** имена сквозные:
- `_applyColorTheme()` (private hook) — единое имя везде.
- `supportsColorTheme` (static, в base = false, override в PushButton/Toggle = true).
- `ACTIVE_WIDGET_THEME_NAMES` / `ACTIVE_WIDGET_CUSTOM_BG_DEFAULT` /
  `ACTIVE_WIDGET_CUSTOM_FG_DEFAULT` / `HEX_COLOR_REGEX` — JS-имена,
  используются в Tasks 2 → 3 → 7 → 8 → 9 (init handlers зависит от form
  selectors, а не от констант — но remediation в parseConfigForm пользуется
  HEX_COLOR_REGEX).
- `awc-theme-<name>` / `awc-theme-custom` / `data-color-theme` /
  `[data-color-custom-row]` — CSS / DOM hooks, последовательны.

**3. Placeholder scan:** нет «TBD», «handle edge cases», нет «similar to».
Все code-блоки полные, готовые к copy-paste. Все commands с expected output.

---

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-06-11-active-widget-color-themes.md`. Two execution
options:

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review
between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans,
batch execution with checkpoints.

Which approach?
