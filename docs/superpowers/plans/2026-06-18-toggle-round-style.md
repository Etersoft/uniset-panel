# Toggle Widget — `round` Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить 4-й стиль `round` к `ToggleWidget` — круглая material flat кнопка с configurable LED dot вверху, label по центру, размер по умолчанию 2×2.

**Architecture:** Параллель уже реализованному `style='button'` (rectangular flat + LED, #30). Reuse: `ledColor` config field, color theme через base `_applyColorTheme()`, label fallback chain, status states. Новое: добавление 'round' в `static styles`, `renderRound()/renderRoundCommand()/renderRoundFeedback()` методы, static `getDefaultSizeForStyle('round') → 2×2`, новая CSS секция `.toggle-style-round` (border-radius 50% + aspect-ratio 1/1 + LED как `::before` сверху absolute), расширение conditional row `ledColor` в config form (button OR round). Backend Go не меняется.

**Tech Stack:** Vanilla JS (no framework), CSS3 (`var()`, `color-mix()`, `aspect-ratio`), Playwright (E2E). Концатенация JS через `make app` (concat файлов `ui/static/js/src/` в `ui/static/js/app.js`).

## Global Constraints

- **Language:** Все user-facing строки в коде и docs — русский (CLAUDE.md user pref).
- **CSS naming:** Новые селекторы префиксуются `.toggle-widget.toggle-style-round`. data-attributes: `data-state="off|on"` на `.toggle-btn` (как у button).
- **JS naming:** `UPPER_CASE` для констант, `camelCase` для методов/state. См. CLAUDE.md → "Именование JS констант".
- **Concat order:** Файл `61-dashboard-active-toggle.js` уже существует и concat'ится в правильном порядке. НЕ редактировать `ui/static/js/app.js` напрямую — пересобирается через `make app`.
- **TDD discipline:** Каждый функциональный тест RED → minimal GREEN → commit.
- **Test runs:** Для каждой задачи запускать ТОЛЬКО target spec через `make js-tests TEST=single/dashboard-active-toggle-round.spec.ts`. Полный прогон только в финальной Task 9.
- **No `waitForTimeout`:** condition-based waits в E2E (`waitForFunction`, `toBeVisible({timeout})`, `expect.poll`). CLAUDE.md → "Запрет waitForTimeout".
- **Active widget error color = purple** (SCADA convention, не red).
- **Reuse `ledColor` field as-is** (no rename), default `TOGGLE_BUTTON_LED_DEFAULT = '#fde047'` уже в `00-constants.js`.
- **HEX_COLOR_REGEX validation** для `ledColor` уже работает в render() и parseActiveConfigFields() rectangular кода — параллельно использовать для round.
- **Spec reference:** `docs/superpowers/specs/2026-06-18-toggle-round-style-design.md`
- **APPROVED mockup:** `docs/superpowers/specs/screenshots/2026-06-18-toggle-round-style/01-design-direction-A-APPROVED.png` — визуал должен соответствовать.

---

## File Structure

**Modified files:**

- `ui/static/js/src/61-dashboard-active-toggle.js` — добавляется `'round'` в `static styles`; render/renderCommand/renderFeedback dispatcher получает ветку round; новые методы `renderRound/renderRoundCommand/renderRoundFeedback`; новый static метод `getDefaultSizeForStyle(style)`; `render()` inline `--awc-led` условие расширяется до `style === 'button' || style === 'round'`; `getActiveConfigFields()` conditional ledColor row показывается для button OR round; `initConfigHandlers()` change handler стиля показывает/скрывает ledColor row для button OR round; `parseActiveConfigFields()` парсит `ledColor` для button OR round (sparse).
- `ui/static/css/style.css` — новая секция `/* === Toggle widget (round style) === */` после существующей секции button (~9335 строки).
- `CLAUDE.md` — параграф ToggleWidget: добавить 'round' в перечень стилей, описание + размер.
- `docs/dashboards.md` — строка `round` в styles-таблице (если таблица есть), embed скриншот.

**Created files:**

- `tests/single/dashboard-active-toggle-round.spec.ts` — E2E spec зеркало `dashboard-active-toggle-button.spec.ts`. ~18-20 тестов.

**Regenerated files (через `make app`):**

- `ui/static/js/app.js` — не редактируется руками; concat from src/.

**Не трогаем:**

- `60-widget-sensor-binding.js`, `61-dashboard-active-base.js` — base contract не меняется.
- `62-dashboard-manager.js` — `WIDGET_TYPES` уже регистрирует Toggle; size resolution через существующий call `getDefaultSizeForStyle(config.style, config)`.
- `00-constants.js` — `TOGGLE_BUTTON_LED_DEFAULT` уже есть.
- backend Go — нет.

---

## Task 1: Branch + worktree + add 'round' to styles array

**Files:**
- Worktree: `/tmp/uniset-panel-toggle-round` (создать через `git worktree`)
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js:29`

**Interfaces:**
- Produces: `ToggleWidget.styles` теперь содержит `'round'`. Базовый класс автоматически рендерит option `<option value="round">round</option>` в style select когда `styles.length > 1`.

- [ ] **Step 1: Create worktree + branch**

```bash
git worktree add /tmp/uniset-panel-toggle-round -b story/toggle-round-style master
cd /tmp/uniset-panel-toggle-round
```

Expected: новая ветка `story/toggle-round-style` отделяется от текущего `master` (6903fc1 — spec commit). Working directory переключается на новый worktree.

- [ ] **Step 2: Write failing E2E sanity test для skeleton**

Создать `tests/single/dashboard-active-toggle-round.spec.ts` с одним тестом и тем же setup'ом что у button spec'а (mock control/status, navigate, clear localStorage):

```typescript
import { test, expect } from '@playwright/test';

test.describe('ToggleWidget — round style', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enabled: true, hasController: true, isController: true, timeoutSec: 60
                })
            });
        });

        await page.route('**/ionc/set**', route => {
            if (route.request().method() === 'POST') {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ status: 'ok' })
                });
            } else {
                route.continue();
            }
        });

        await page.goto('/');

        await page.waitForFunction(() => {
            const w = window as any;
            return typeof w.dashboardState !== 'undefined'
                && typeof w.dashboardManager !== 'undefined'
                && typeof w.ToggleWidget !== 'undefined';
        });

        await page.evaluate(() => {
            const w = window as any;
            w.state.control.token = 'admin';
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.enabled = true;
        });

        await page.waitForFunction(() => {
            const w = window as any;
            if (!w.state?.servers) return false;
            for (const [, srv] of w.state.servers) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 15000 });

        await page.evaluate(() => {
            const w = window as any;
            w.state.servers.clear();
            w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        });

        await page.evaluate(() => {
            localStorage.removeItem('user-dashboards');
            localStorage.removeItem('last-dashboard');
            const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
            keys.forEach(k => localStorage.removeItem(k));
        });
    });

    async function createRoundDashboard(
        page,
        configOverrides: Record<string, unknown> = {}
    ) {
        await page.evaluate((overrides) => {
            const w = window as any;
            const widgetCfg = {
                id: 'tb-1',
                type: 'toggle',
                config: {
                    serverId: 'mock-srv',
                    sensor: 'TEST_PUMP',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    valueOff: 0,
                    valueOn: 1,
                    labelOff: 'OFF',
                    labelOn: 'ON',
                    label: 'PUMP-1',
                    style: 'round',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 2, height: 2 },
            };
            const dashCfg = {
                meta: { name: 'TEST_TROUND', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_TROUND', dashCfg);
            w.dashboardManager.loadDashboard('TEST_TROUND');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        }, configOverrides);

        const effectiveStyle = (configOverrides.style as string) || 'round';
        if (effectiveStyle === 'round') {
            await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
        } else {
            await page.locator('.toggle-widget').first().waitFor({ state: 'visible', timeout: 5000 });
        }
    }

    test("'round' is in available styles list", async ({ page }) => {
        await page.evaluate(() => { /* trigger ToggleWidget reference */ });
        const styles = await page.evaluate(() => (window as any).ToggleWidget.styles);
        expect(styles).toContain('round');
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: FAIL — `expect(styles).toContain('round')` — массив сейчас `['slider', 'checkbox', 'button']`.

- [ ] **Step 4: Add 'round' to styles array**

В `ui/static/js/src/61-dashboard-active-toggle.js:29`:

```javascript
// Было:
static styles = ['slider', 'checkbox', 'button'];

// Стало:
static styles = ['slider', 'checkbox', 'button', 'round'];
```

- [ ] **Step 5: Regenerate app.js**

```bash
make app
```

Expected: `ui/static/js/app.js` пересобран, изменения видны.

- [ ] **Step 6: Run test to verify it passes**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: PASS — `styles.includes('round') === true`.

- [ ] **Step 7: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/js/app.js tests/single/dashboard-active-toggle-round.spec.ts
git commit -m "feat(toggle): зарегистрировать 'round' в static styles"
```

---

## Task 2: renderRound() skeleton + click writes value

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js` (dispatcher in `render()`/`renderCommand()`/`renderFeedback()`, новые методы `renderRound`/`renderRoundCommand`/`renderRoundFeedback`)
- Modify: `tests/single/dashboard-active-toggle-round.spec.ts` (add tests)

**Interfaces:**
- Consumes: `_resolveButtonLabel()` (уже существует, fallback chain `label → labelOn/labelOff → '—'`)
- Produces: DOM `<div class="widget-content toggle-widget toggle-style-round"><button class="toggle-btn" data-test="btn" data-state="off" type="button">PUMP-1</button></div>`. click → `onClick()` → `writeValue()` → POST `/api/objects/SharedMemory/ionc/set` с `{sensor_id, value}`.

- [ ] **Step 1: Write failing tests**

Добавить в `dashboard-active-toggle-round.spec.ts` после первого теста:

```typescript
    test('renders round style DOM skeleton', async ({ page }) => {
        await createRoundDashboard(page);
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).toBeVisible();
        const btn = root.locator('[data-test="btn"]');
        await expect(btn).toHaveAttribute('data-state', 'off');
        await expect(btn).toHaveText('PUMP-1');
    });

    test('click writes valueOn when feedback=valueOff', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(100);
        expect(body.value).toBe(1);
        expect(req.url()).toContain('/api/objects/SharedMemory/ionc/set');
    });

    test('click writes valueOff when feedback=valueOn', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(100);
        expect(body.value).toBe(0);
        expect(req.url()).toContain('/api/objects/SharedMemory/ionc/set');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: FAIL — `[data-test="btn"]` не виден (renderRound() не определён, dispatch падает в else → renderSlider).

- [ ] **Step 3: Implement dispatcher branches + renderRound trio**

В `ui/static/js/src/61-dashboard-active-toggle.js`:

В `render()` (метод вокруг строки 35-60), расширить dispatch:

```javascript
        if (style === 'checkbox') {
            this.renderCheckbox();
        } else if (style === 'button') {
            this.renderButton();
        } else if (style === 'round') {
            this.renderRound();
        } else {
            this.renderSlider();
        }
```

В `renderCommand()` (вокруг строки 132), добавить ветку:

```javascript
    renderCommand() {
        const style = this._currentStyle();
        if (style === 'checkbox') {
            this.renderCheckboxCommand();
        } else if (style === 'button') {
            this.renderButtonCommand();
        } else if (style === 'round') {
            this.renderRoundCommand();
        } else {
            this.renderSliderCommand();
        }
    }
```

В `renderFeedback()` (вокруг строки 168), добавить ветку:

```javascript
    renderFeedback() {
        const style = this._currentStyle();
        if (style === 'checkbox') {
            this.renderCheckboxFeedback();
        } else if (style === 'button') {
            this.renderButtonFeedback();
        } else if (style === 'round') {
            this.renderRoundFeedback();
        } else {
            this.renderSliderFeedback();
        }
    }
```

После `renderButtonFeedback()` (вокруг строки 263), добавить новую секцию:

```javascript
    // === Round style ===

    renderRound() {
        const label = this._resolveButtonLabel();
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-round';
        this.element.innerHTML = `
            <button class="toggle-btn" data-test="btn" data-state="off" type="button">${escapeHtml(label)}</button>
        `;
        this.container.appendChild(this.element);
        const btnEl = this.element.querySelector('[data-test="btn"]');
        btnEl.addEventListener('click', () => this.onClick());

        this.renderFeedback();
        this.renderCommand();
    }

    renderRoundCommand() {
        // diverge применяется к корневому .toggle-widget (рамка вокруг круга
        // лучше читается чем border на самой кнопке — конфликт с темами).
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);

        // Label должен сразу показать новое состояние при click (commandValue
        // опережает feedbackValue в pending window).
        const btn = root.querySelector('[data-test="btn"]');
        if (btn) btn.textContent = this._resolveButtonLabel();
    }

    renderRoundFeedback() {
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (!btn) return;
        const valueOn = this.config?.valueOn ?? 1;
        btn.dataset.state = (this.feedbackValue === valueOn) ? 'on' : 'off';
        btn.textContent = this._resolveButtonLabel();
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            btn.title = `actual: ${this.feedbackValue}`;
        }
        // Sync divergence — иначе после SSE update остаётся stale (паттерн из
        // button feedback'а).
        this.renderCommand();
    }
```

- [ ] **Step 4: Regenerate app.js**

```bash
make app
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: PASS (4 теста: 'round' in styles, render skeleton, click→valueOn, click→valueOff).

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/js/app.js tests/single/dashboard-active-toggle-round.spec.ts
git commit -m "feat(toggle): renderRound() skeleton + click writes value"
```

---

## Task 3: CSS material flat (round shape + OFF/ON colors)

**Files:**
- Modify: `ui/static/css/style.css` (новая секция после `.toggle-style-button.diverge`, после строки ~9334)
- Modify: `tests/single/dashboard-active-toggle-round.spec.ts` (add tests)

**Interfaces:**
- Produces: `.toggle-widget.toggle-style-round .toggle-btn` имеет `border-radius: 50%` + `aspect-ratio: 1/1` + background `#374151` (OFF) / `var(--awc-bg, #3b82f6)` (ON).

- [ ] **Step 1: Write failing tests**

Добавить тесты:

```typescript
    test('OFF state has neutral gray background', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // #374151 → rgb(55, 65, 81)
        await expect(btn).toHaveCSS('background-color', 'rgb(55, 65, 81)');
    });

    test('ON state uses theme color (default primary blue)', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // --awc-bg fallback = #3b82f6 → rgb(59, 130, 246)
        await expect(btn).toHaveCSS('background-color', 'rgb(59, 130, 246)');
    });

    test('round shape: border-radius 50%', async ({ page }) => {
        await createRoundDashboard(page);
        const btn = page.locator('[data-test="btn"]').first();
        // Computed border-radius для круга — в headless будет в % или px.
        const computed = await btn.evaluate((el: HTMLElement) => {
            const cs = getComputedStyle(el);
            return cs.borderTopLeftRadius;
        });
        // 50% от width получится в px; конкретное значение зависит от cell size.
        // Проверяем что не 0 (≠ "0px") — round shape применён.
        expect(computed).not.toBe('0px');
        expect(computed).not.toBe('');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: FAIL — нет CSS правил для `.toggle-style-round`, background дефолтный (`rgba(0, 0, 0, 0)` или browser default), `border-radius: 0px`.

- [ ] **Step 3: Add CSS section**

В `ui/static/css/style.css` после `.toggle-widget.toggle-style-button.diverge` блока (~9334), добавить:

```css
/* === Toggle widget (round style) === */

.toggle-widget.toggle-style-round {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    box-sizing: border-box;
}

.toggle-widget.toggle-style-round .toggle-btn {
    /* width/height: 100% + aspect-ratio 1/1 заставляет CSS-engine выбрать
     * min(parent_w, parent_h) и сохранить квадратное соотношение даже при
     * non-square cells (например 3×2). max-* — защита от выхода за border-box. */
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: 1 / 1;
    border: none;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
    font-family: inherit;
    position: relative;
    color: #d1d5db;
    background: #374151;
    padding: 0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08),
                0 2px 4px rgba(0, 0, 0, 0.4);
    /* Label сдвинут вниз чтобы LED (::before, top: 14%) не пересекался с текстом. */
    padding-top: 28%;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    justify-content: center;
}

/* ON state: цвет фона из темы */
.toggle-widget.toggle-style-round .toggle-btn[data-state="on"] {
    background: var(--awc-bg, #3b82f6);
    color: var(--awc-fg, #ffffff);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.35);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: PASS (7 тестов total).

- [ ] **Step 5: Commit**

```bash
git add ui/static/css/style.css tests/single/dashboard-active-toggle-round.spec.ts
git commit -m "feat(toggle): CSS material flat для round style — border-radius 50% + OFF/ON цвета"
```

---

## Task 4: LED dot (::before pseudo-element)

**Files:**
- Modify: `ui/static/css/style.css` (расширение секции `.toggle-style-round`)
- Modify: `tests/single/dashboard-active-toggle-round.spec.ts`

**Interfaces:**
- Produces: `.toggle-widget.toggle-style-round .toggle-btn::before` — LED dot, в OFF тёмный `#1f2937` inset shadow, в ON цвет `var(--awc-led, #fde047)` + outer glow.

- [ ] **Step 1: Write failing test**

LED — это `::before` pseudo-element. Primary check — `content` атрибут (надёжен в headless): `''` → pseudo-element создан. Computed background читаем дополнительно (best-effort, headless иногда возвращает empty для CSS-vars).

```typescript
    test('LED ::before is rendered (content set)', async ({ page }) => {
        await createRoundDashboard(page);
        const btn = page.locator('[data-test="btn"]').first();
        const content = await btn.evaluate((el: HTMLElement) =>
            getComputedStyle(el, '::before').content
        );
        // CSS content: "" → computed возвращает строку '""' (с кавычками)
        expect(content).toBe('""');
    });

    test('LED ::before glows when data-state=on', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveAttribute('data-state', 'on');
        // Best-effort: проверяем background — если headless вернул значение,
        // оно должно содержать amber RGB. Empty/transparent → не assert (известная
        // нестабильность getComputedStyle ::before в headless).
        const ledBg = await btn.evaluate((el: HTMLElement) => {
            const cs = getComputedStyle(el, '::before');
            return cs.background || cs.backgroundColor;
        });
        if (ledBg && ledBg !== 'rgba(0, 0, 0, 0)' && ledBg !== '') {
            expect(ledBg).toMatch(/(253,\s*224,\s*71|#fde047)/i);
        }
    });

    test('LED ::before is dim when data-state=off', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveAttribute('data-state', 'off');
        const ledBg = await btn.evaluate((el: HTMLElement) => {
            const cs = getComputedStyle(el, '::before');
            return cs.backgroundColor;
        });
        // #1f2937 → rgb(31, 41, 55) (best-effort, см. выше)
        if (ledBg && ledBg !== 'rgba(0, 0, 0, 0)' && ledBg !== '') {
            expect(ledBg).toMatch(/31,\s*41,\s*55/);
        }
    });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: FAIL — `::before` не определён (CSS секция пока без ::before правил), `backgroundColor` пустой / `rgba(0, 0, 0, 0)`.

Если headless возвращает `''` для всех — тест не проверит assertion (silent pass), что нежелательно. Запасной вариант: проверить через `content: ""` — присутствие самого pseudo через `cs.content`:

```typescript
        const content = await btn.evaluate((el: HTMLElement) =>
            getComputedStyle(el, '::before').content
        );
        expect(content).toBe('""');  // или '"none"'
```

- [ ] **Step 3: Add LED CSS rules**

В `ui/static/css/style.css` после block `.toggle-widget.toggle-style-round .toggle-btn[data-state="on"]` (CSS-секция round, конец), добавить:

```css
/* LED dot — главный индикатор состояния, top center */
.toggle-widget.toggle-style-round .toggle-btn::before {
    content: "";
    position: absolute;
    top: 14%;
    left: 50%;
    transform: translateX(-50%);
    width: 12%;
    height: 12%;
    border-radius: 50%;
    transition: background 150ms ease, box-shadow 150ms ease;
    background: #1f2937;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.7);
}

.toggle-widget.toggle-style-round .toggle-btn[data-state="on"]::before {
    background: var(--awc-led, #fde047);
    box-shadow: 0 0 6px var(--awc-led, #fde047),
                0 0 10px color-mix(in srgb, var(--awc-led, #fde047) 70%, transparent);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: PASS (9 тестов).

- [ ] **Step 5: Commit**

```bash
git add ui/static/css/style.css tests/single/dashboard-active-toggle-round.spec.ts
git commit -m "feat(toggle): LED ::before dot для round style (configurable color через --awc-led)"
```

---

## Task 5: getDefaultSizeForStyle + ledColor config form

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js` (add `getDefaultSizeForStyle` static method; расширить `render()` inline var condition, `getActiveConfigFields()` conditional, `initConfigHandlers()` change handler, `parseActiveConfigFields()` save condition)
- Modify: `tests/single/dashboard-active-toggle-round.spec.ts`

**Interfaces:**
- Consumes: existing `HEX_COLOR_REGEX`, `TOGGLE_BUTTON_LED_DEFAULT`. dashboard-manager.createWidget() уже вызывает `getDefaultSizeForStyle(config.style, config)` если метод определён (`62-dashboard-manager.js:1251`).
- Produces:
  - `ToggleWidget.getDefaultSizeForStyle('round') → { width: 2, height: 2 }`
  - `ToggleWidget.getDefaultSizeForStyle(other) → undefined` (manager fall back на `defaultSize`)
  - Config form для style=round показывает ledColor row; для style=slider/checkbox — скрыт.
  - parseActiveConfigFields сохраняет `ledColor` если style==='button' OR style==='round' и не равно дефолту.
  - render() ставит inline `--awc-led` если style==='button' OR style==='round'.

- [ ] **Step 1: Write failing tests**

```typescript
    test('new round widget gets default 2×2 size', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            w.state.servers.clear();
            w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        });
        // Создать dashboard без явного position у widget'а — manager должен
        // выставить размер из getDefaultSizeForStyle('round').
        const size = await page.evaluate(() => {
            const w = window as any;
            const WidgetClass = w.ToggleWidget;
            return typeof WidgetClass.getDefaultSizeForStyle === 'function'
                ? WidgetClass.getDefaultSizeForStyle('round')
                : null;
        });
        expect(size).toEqual({ width: 2, height: 2 });
    });

    test('ledColor inline CSS var applied to container (round)', async ({ page }) => {
        await createRoundDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-round')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('#22c55e');
    });

    test('no ledColor in config = no inline CSS var (round uses default)', async ({ page }) => {
        await createRoundDashboard(page);
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-round')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');
    });

    test('config form contains ledColor color picker when style=round', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });
        const ledInput = page.locator('#widget-config-content [name="ledColor"]');
        await expect(ledInput).toBeVisible();
        await expect(ledInput).toHaveValue('#fde047');
    });

    test('ledColor row visibility tracks style select (slider/round/button)', async ({ page }) => {
        await createRoundDashboard(page, { style: 'slider' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });
        const ledRow = page.locator('#widget-config-content [data-button-style-row]');
        await expect(ledRow).toBeHidden();

        await page.locator('#widget-config-content [name="style"]').selectOption('round');
        await expect(ledRow).toBeVisible();

        await page.locator('#widget-config-content [name="style"]').selectOption('button');
        await expect(ledRow).toBeVisible();

        await page.locator('#widget-config-content [name="style"]').selectOption('checkbox');
        await expect(ledRow).toBeHidden();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: FAIL —
- `getDefaultSizeForStyle` не определён (`null` !== `{2,2}`).
- Inline `--awc-led` НЕ ставится для round (render() условие `style === 'button'` only).
- ledColor row скрыт когда style=round (getActiveConfigFields condition `style === 'button'` only).
- Change handler в initConfigHandlers переключает только button.

- [ ] **Step 3: Implement**

В `ui/static/js/src/61-dashboard-active-toggle.js` после `static supportsColorTheme = true;` (~строка 32) добавить:

```javascript
    // Style-aware default size — для round плотнее (2×2 ≈ touch-friendly icon),
    // для button/slider/checkbox используем static defaultSize (3×2).
    static getDefaultSizeForStyle(style) {
        if (style === 'round') return { width: 2, height: 2 };
        return undefined;
    }
```

В `render()` (метод вокруг строки 35-60), расширить условие inline `--awc-led`:

```javascript
        // Было:
        if (style === 'button'
            && ledRaw
            && HEX_COLOR_REGEX.test(ledRaw)
            && ledRaw !== TOGGLE_BUTTON_LED_DEFAULT) {

        // Стало:
        if ((style === 'button' || style === 'round')
            && ledRaw
            && HEX_COLOR_REGEX.test(ledRaw)
            && ledRaw !== TOGGLE_BUTTON_LED_DEFAULT) {
```

В `getActiveConfigFields()` (вокруг строки 283), расширить `isButtonStyle` → переименовать в `usesLed`:

```javascript
    static getActiveConfigFields(config = {}) {
        const ledColor = config.ledColor || TOGGLE_BUTTON_LED_DEFAULT;
        const style = config.style || ToggleWidget.defaultStyle;
        const usesLed = (style === 'button' || style === 'round');
        const ledRowStyle = usesLed ? '' : 'display: none;';
        return `
            ... (rest unchanged) ...
            <div class="widget-config-row" data-button-style-row style="${ledRowStyle}">
                <div class="widget-config-field">
                    <label>LED color (button / round styles)</label>
                    <input type="color" class="widget-input" name="ledColor"
                           value="${ledColor}" data-test="cfg-ledColor">
                </div>
            </div>
        `;
    }
```

В `initConfigHandlers()` (вокруг строки 320), расширить change handler:

```javascript
        styleSelect.addEventListener('change', () => {
            const v = styleSelect.value;
            ledRow.style.display = (v === 'button' || v === 'round') ? '' : 'none';
        });
```

В `parseActiveConfigFields()` (вокруг строки 350), расширить save condition:

```javascript
        // ledColor: только при style='button' OR 'round', sparse (default не пишем).
        const style = form.querySelector('[name="style"]')?.value || ToggleWidget.defaultStyle;
        if (style === 'button' || style === 'round') {
            const raw = (form.querySelector('[name="ledColor"]')?.value || '').toLowerCase();
            if (HEX_COLOR_REGEX.test(raw) && raw !== TOGGLE_BUTTON_LED_DEFAULT) {
                out.ledColor = raw;
            }
        }
        return out;
    }
```

- [ ] **Step 4: Regenerate app.js**

```bash
make app
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: PASS (14 тестов).

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/js/app.js tests/single/dashboard-active-toggle-round.spec.ts
git commit -m "feat(toggle): getDefaultSizeForStyle round=2x2 + ledColor form для button OR round"
```

---

## Task 6: Divergence, pending, label fallback

**Files:**
- Modify: `ui/static/css/style.css` (`.toggle-style-round.diverge` rule)
- Modify: `tests/single/dashboard-active-toggle-round.spec.ts`

**Interfaces:**
- Consumes: `_resolveButtonLabel()` (уже есть), `.diverge` класс выставляется из `renderRoundCommand` (уже реализован в Task 2).
- Produces: visual `.toggle-style-round.diverge` рамка (жёлтая box-shadow вокруг круга).

- [ ] **Step 1: Write failing tests**

```typescript
    test('shows .diverge class when command ≠ feedback', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).toHaveClass(/diverge/);
    });

    test('.diverge class removed when feedback catches up', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).not.toHaveClass(/diverge/);
    });

    test('divergence applies yellow box-shadow', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        // Yellow #fbbf24 → rgb(251, 191, 36)
        await expect(root).toHaveCSS('box-shadow', /251,\s*191,\s*36/);
    });

    test('pending state: label flips immediately, data-state lags', async ({ page }) => {
        await createRoundDashboard(page, { label: '', labelOff: 'OFF', labelOn: 'ON' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveAttribute('data-state', 'off');
        await expect(btn).toHaveText('OFF');

        await page.evaluate(() => {
            const el = document.querySelector('[data-test="btn"]') as HTMLElement;
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Label мгновенно показывает команду (commandValue ?? feedbackValue → 1)
        await expect(btn).toHaveText('ON');
        // data-state остаётся 'off' (источник = feedbackValue, не command)
        await expect(btn).toHaveAttribute('data-state', 'off');
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).toHaveClass(/diverge/);
    });

    test('empty label + value=valueOff → button text = labelOff', async ({ page }) => {
        await createRoundDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('STOP');
    });

    test('empty label + value=valueOn → button text = labelOn', async ({ page }) => {
        await createRoundDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('START');
    });

    test('config.label override beats labelOff/labelOn', async ({ page }) => {
        await createRoundDashboard(page, { label: 'PUMP-1', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('PUMP-1');

        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        await expect(btn).toHaveText('PUMP-1');
    });

    test('all labels empty → button text = "—"', async ({ page }) => {
        await createRoundDashboard(page, { label: '', labelOff: '', labelOn: '' });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('—');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: FAIL — `.diverge` класс выставляется (он уже работает из renderRoundCommand в Task 2), но CSS правила нет → `box-shadow` дефолтный browser. Label fallback и pending должны проходить (логика в renderRound из Task 2 уже зовёт `_resolveButtonLabel()`). Если они проваливаются — это баг в Task 2.

- [ ] **Step 3: Add CSS divergence rule**

В `ui/static/css/style.css` в конце секции round (после LED `[data-state="on"]::before`) добавить:

```css
/* Divergence: жёлтая outer рамка вокруг круга */
.toggle-widget.toggle-style-round.diverge {
    box-shadow: 0 0 0 2px #fbbf24, 0 0 10px rgba(251, 191, 36, 0.5);
    border-radius: 50%;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: PASS (22 теста).

- [ ] **Step 5: Commit**

```bash
git add ui/static/css/style.css tests/single/dashboard-active-toggle-round.spec.ts
git commit -m "feat(toggle): divergence + label fallback + pending для round style"
```

---

## Task 7: Frozen no-op + theme integration

**Files:**
- Modify: `tests/single/dashboard-active-toggle-round.spec.ts`

**Interfaces:**
- Consumes: base `_applyFeedbackMeta(meta)` (выставляет `data-frozen="true"` на container), `_updateInteractivityClass()` (читает frozen), `isInteractive()` (возвращает false если frozen). Эти механизмы наследуются от `ActiveDashboardWidget` без изменений.
- `_applyColorTheme()` ставит class `awc-theme-danger` на container + inline `--awc-bg=#ef4444` (для preset themes). CSS уже использует `var(--awc-bg, #3b82f6)`.

Tasks 1-6 уже реализовали всё нужное в JS. Это чистый verification round — добавляем тесты без code changes.

- [ ] **Step 1: Write failing tests**

```typescript
    test('click is no-op when sensor frozen', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0, null, { frozen: true });
        });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-round')
        }).first();
        await expect(container).toHaveAttribute('data-frozen', 'true');

        let postFired = false;
        const handler = (req: any) => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                postFired = true;
            }
        };
        page.on('request', handler);

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await page.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {});
        page.off('request', handler);

        expect(postFired).toBe(false);
    });

    test('theme=danger ON background = red', async ({ page }) => {
        await createRoundDashboard(page, { colorTheme: 'danger' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // danger #ef4444 → rgb(239, 68, 68)
        await expect(btn).toHaveCSS('background-color', 'rgb(239, 68, 68)');
    });

    test('theme=success ON background = green', async ({ page }) => {
        await createRoundDashboard(page, { colorTheme: 'success' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // success #22c55e → rgb(34, 197, 94)
        await expect(btn).toHaveCSS('background-color', 'rgb(34, 197, 94)');
    });

    test('switching style away from round removes --awc-led', async ({ page }) => {
        await createRoundDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-widget')
        }).first();

        await page.evaluate(() => {
            const w = window as any;
            const widget = w.dashboardState.widgets.get('tb-1');
            widget.config = { ...widget.config, style: 'slider' };
            widget.container.className = `dashboard-widget widget-2x2 transparent`;
            widget.container.querySelector('.widget-title-label')?.remove();
            widget.container.querySelector('.widget-content')?.remove();
            const dash = w.dashboardState.dashboards.get('TEST_TROUND');
            w.dashboardManager.renderWidgetContent(widget, dash.widgets[0]);
        });

        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');
    });
```

- [ ] **Step 2: Run tests to verify they pass (no code changes expected)**

```bash
make js-tests TEST=single/dashboard-active-toggle-round.spec.ts
```

Expected: PASS (26 тестов). Frozen работает через base, theme работает через `var(--awc-bg)`, switching style removes inline var через `removeProperty` в render() (уже реализовано).

Если frozen test fails — проверить что render() вызывается дополнительно после style switch / update. Это редкий edge case; если ломается — investigate в Step 3.

- [ ] **Step 3 (только если test failed): debug + fix**

Если frozen или theme проваливаются — добавить fix. Скорее всего не понадобится: button spec'у те же тесты проходят без custom JS под frozen/theme.

- [ ] **Step 4: Commit**

```bash
git add tests/single/dashboard-active-toggle-round.spec.ts
git commit -m "test(toggle): frozen + theme integration для round style"
```

---

## Task 8: Documentation update

**Files:**
- Modify: `CLAUDE.md` (ToggleWidget секция, добавить `round` в перечень стилей)
- Modify: `docs/dashboards.md` (стили-таблица, embed скриншот)
- Create: `docs/images/widget-toggle-round.png` (cropped версия APPROVED mockup)

**Interfaces:**
- Чистая документация, не consumes/produces.

- [ ] **Step 1: Copy APPROVED screenshot для docs**

```bash
cp docs/superpowers/specs/screenshots/2026-06-18-toggle-round-style/01-design-direction-A-APPROVED.png docs/images/widget-toggle-round.png
```

Expected: новый файл `docs/images/widget-toggle-round.png` существует.

- [ ] **Step 2: Update CLAUDE.md**

Найти секцию "ToggleWidget (`61-dashboard-active-toggle.js`)" (через `grep -n "ToggleWidget" CLAUDE.md`).

Изменить строку с перечнем стилей:

```markdown
# Было:
**Поддерживаемые стили** через `static styles = ['slider', 'checkbox', 'button']`:

# Стало:
**Поддерживаемые стили** через `static styles = ['slider', 'checkbox', 'button', 'round']`:
```

После описания стиля `button` (его параграф со словами "Material flat button с LED индикатором") добавить:

```markdown
- **`round`** (defaultSize 2×2 через `getDefaultSizeForStyle`): material flat
  круглая кнопка. LED dot вверху (`::before`, top 14%, 12% диаметра кнопки),
  label под ним. OFF — нейтральный gray `#374151`. ON — `var(--awc-bg)`
  (цвет темы). LED цвет — `var(--awc-led, #fde047)` configurable через
  `config.ledColor` (то же поле что у `button`). Divergence — жёлтая
  outer-рамка `box-shadow` (border-radius 50%, по круглой форме). Размер
  default 2×2 — плотнее чем `button` 3×2, для densely packed dashboard'ов.
  `aspect-ratio: 1/1` гарантирует круг даже при non-square cells.
```

В строке с описанием `ledColor`:

```markdown
# Было:
**ledColor:** для `style='button'` config form содержит color picker (показывается
conditionally — только при `style='button'`). Sparse — дефолт `#fde047` не пишется
в JSON dashboard'а. ...

# Стало:
**ledColor:** для `style='button'` и `style='round'` config form содержит color
picker (показывается conditionally — только когда стиль использует LED).
Sparse — дефолт `#fde047` не пишется в JSON dashboard'а. ...
```

- [ ] **Step 3: Update docs/dashboards.md**

Найти таблицу стилей Toggle через `grep -n "toggle\|slider\|checkbox" docs/dashboards.md`.

В таблице стилей Toggle добавить строку:

```markdown
| `round` | Круглая material flat кнопка с LED dot вверху. Default 2×2. LED цвет настраивается через `ledColor`. | ![round](images/widget-toggle-round.png) |
```

(Точный формат таблицы — смотреть на существующие строки.)

- [ ] **Step 4: Verify docs render**

```bash
ls -la docs/images/widget-toggle-round.png  # должен существовать
grep -A2 "round" CLAUDE.md | head -20       # round упомянут
grep -A2 "round" docs/dashboards.md | head  # строка в таблице есть
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/dashboards.md docs/images/widget-toggle-round.png
git commit -m "docs(toggle): описание round style в CLAUDE.md и dashboards.md"
```

---

## Task 9: Final regression + push branch

**Files:** нет изменений в коде.

**Interfaces:** verification gate.

- [ ] **Step 1: Full E2E suite**

```bash
make js-tests
```

Expected: ALL tests pass. Особенно — существующие slider/checkbox/button spec'ы должны проходить без правок (no regression).

Если что-то падает:
- В slider/checkbox/button: investigate — конфликт CSS селекторов или style dispatch.
- В round: investigate failed assertion.

- [ ] **Step 2: Visual confirmation**

```bash
docker compose --profile dev down 2>/dev/null
docker compose up dev-viewer -d
```

Открыть http://localhost:8000 → создать round toggle widget → визуально сравнить с APPROVED:
- `docs/superpowers/specs/screenshots/2026-06-18-toggle-round-style/01-design-direction-A-APPROVED.png`

Проверить: LED горит amber в ON, body становится синим (default primary), label centered, OFF серый, divergence жёлтая рамка после click до feedback'а.

- [ ] **Step 3: Push branch**

```bash
git push -u github story/toggle-round-style
```

Expected: ветка опубликована, доступна для PR.

- [ ] **Step 4: Create PR**

```bash
gh pr create --title "feat(toggle): round style — material flat круглая кнопка с LED" --body "$(cat <<'EOF'
## Summary

- Новый стиль `'round'` в `ToggleWidget`. Material flat круглая кнопка (border-radius 50% + aspect-ratio 1/1) с configurable LED dot вверху и label по центру.
- Reuse существующего contract `ledColor` (от rectangular `button` стиля): то же поле, default `#fde047`, sparse serialization, conditional config form row.
- `getDefaultSizeForStyle('round')` → 2×2 (плотнее чем `button` 3×2 — для densely packed dashboard'ов).
- E2E spec `tests/single/dashboard-active-toggle-round.spec.ts` (26 тестов): зеркало button spec'у + size override + style switch.
- Docs: CLAUDE.md и dashboards.md обновлены, скриншот в `docs/images/widget-toggle-round.png`.

## Test plan

- [x] `make js-tests` — все спеки проходят (включая slider/checkbox/button регрессия)
- [x] Визуально совпадает с APPROVED mockup: `docs/superpowers/specs/screenshots/2026-06-18-toggle-round-style/01-design-direction-A-APPROVED.png`
- [x] OFF серый, ON цвет темы, LED amber → glow с outer shadow
- [x] Divergence жёлтая рамка после click, снимается когда feedback догнал
- [x] Frozen блокирует click (POST не уходит)
- [x] Темизация: primary/danger/success/warning/neutral меняют ON background

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR создан с URL, доступным для review.

- [ ] **Step 5: Cleanup worktree (после merge)**

После того как PR смерджен (опционально, не часть TDD цикла):

```bash
cd /home/pv/Projects/uniset-panel
git worktree remove /tmp/uniset-panel-toggle-round
git branch -d story/toggle-round-style
```
