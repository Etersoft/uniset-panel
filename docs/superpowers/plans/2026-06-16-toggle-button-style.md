# Toggle Button Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить третий стиль `button` в `ToggleWidget` — material flat button с настраиваемым LED-индикатором — поверх существующих `slider` / `checkbox`.

**Architecture:** Расширение `ToggleWidget` (`61-dashboard-active-toggle.js`) тремя новыми render-методами + CSS-секция. Поведение: один `<button>` с `data-state="on|off"` и `::before` LED. Все темы и status-states (disabled/frozen/pending/error/divergence) наследуются от `ActiveDashboardWidget`. Новое — поле `ledColor` (hex) с conditional UI-row.

**Tech Stack:** Vanilla JS modules (concat → `app.js`), CSS-variables (`--awc-bg` / `--awc-fg` / `--awc-led`), Playwright E2E (single docker stack), vitest unit (где уместно).

**Branch:** `story/toggle-button-style` (уже создан, spec залит коммитом 43dada3).

**Spec:** [`docs/superpowers/specs/2026-06-16-toggle-button-style-design.md`](../specs/2026-06-16-toggle-button-style-design.md).

**Reference visual:** [`screenshots/2026-06-16-toggle-button-style/04-led-color-configurable-APPROVED.png`](../specs/screenshots/2026-06-16-toggle-button-style/04-led-color-configurable-APPROVED.png) — итоговый одобренный вариант, с которым сравнивается реализация.

---

## File Structure

| Файл | Что меняется |
|---|---|
| `ui/static/js/src/00-constants.js` | Добавить `TOGGLE_BUTTON_LED_DEFAULT = '#fde047'` рядом с `ACTIVE_WIDGET_CUSTOM_*`. |
| `ui/static/js/src/61-dashboard-active-toggle.js` | `static styles = ['slider', 'checkbox', 'button']`, новые методы `renderButton()`, `renderButtonCommand()`, `renderButtonFeedback()`. Ветка в трёх dispatcher'ах. Extension `getActiveConfigFields` + `parseActiveConfigFields` + `initConfigHandlers` для `ledColor`. Расширение `render()` — set/remove inline `--awc-led`. |
| `ui/static/css/style.css` | Новая секция `/* Toggle button style */` с правилами по селектору `.toggle-widget.toggle-style-button`. |
| `tests/single/dashboard-active-toggle-button.spec.ts` | **Новый** E2E spec. |
| `CLAUDE.md` | Update ToggleWidget section: `static styles`, описание button style + ledColor. |

**Зависимости и порядок:**
- JS-код концатенируется в `app.js` через `make app` — после любого изменения в `src/*.js`.
- CSS примонтирован в docker volume — изменения подхватываются без rebuild.
- E2E тесты гоняются через `make js-tests TEST=single/dashboard-active-toggle-button.spec.ts`.

---

## Task Breakdown

### Task 1: Skeleton — register `button` style + render DOM

**Цель:** При `config.style = 'button'` рисуется DOM-структура `<button>` с `data-state="off"` и текстом label. Никакой логики click/feedback ещё нет — просто статичный render и dispatcher.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js`
- Test: `tests/single/dashboard-active-toggle-button.spec.ts` (создаётся)

- [ ] **Step 1: Создать failing E2E тест**

Создать `tests/single/dashboard-active-toggle-button.spec.ts` со следующим содержимым:

```typescript
import { test, expect } from '@playwright/test';

// E2E для ToggleWidget style='button' — material flat button с LED индикатором.
// Покрывает: render skeleton, click → writeValue, feedback state, divergence,
// CSS visuals, ledColor configuration, label fallback.

test.describe('ToggleWidget — button style', () => {
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

    async function createButtonDashboard(
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
                    style: 'button',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            const dashCfg = {
                meta: { name: 'TEST_TBUTTON', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_TBUTTON', dashCfg);
            w.dashboardManager.loadDashboard('TEST_TBUTTON');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        }, configOverrides);

        await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders button style DOM skeleton', async ({ page }) => {
        await createButtonDashboard(page);
        const root = page.locator('.toggle-widget.toggle-style-button').first();
        await expect(root).toBeVisible();
        const btn = root.locator('[data-test="btn"]');
        await expect(btn).toHaveAttribute('data-state', 'off');
        await expect(btn).toHaveText('PUMP-1');
    });
});
```

- [ ] **Step 2: Запустить тест — ожидать failure ("ToggleWidget unknown style" или таймаут на locator)**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: FAIL — `.toggle-style-button` локатор не находит элемент / таймаут на `[data-test="btn"]`.

- [ ] **Step 3: Добавить `'button'` в `static styles` массив в `ToggleWidget`**

`ui/static/js/src/61-dashboard-active-toggle.js` строка 29 — заменить:

```javascript
    static styles = ['slider', 'checkbox', 'button'];
    static defaultStyle = 'slider';
```

- [ ] **Step 4: Добавить методы `renderButton()`, `renderButtonCommand()`, `renderButtonFeedback()` и dispatch ветки**

В `ui/static/js/src/61-dashboard-active-toggle.js`:

1. В `render()` поменять `if`/`else` на switch-like с тремя ветками:

```javascript
    render() {
        const style = this._currentStyle();
        if (style === 'checkbox') {
            this.renderCheckbox();
        } else if (style === 'button') {
            this.renderButton();
        } else {
            this.renderSlider();
        }
        this._applyColorTheme();
    }
```

2. Аналогично `renderCommand()`:

```javascript
    renderCommand() {
        const style = this._currentStyle();
        if (style === 'checkbox') {
            this.renderCheckboxCommand();
        } else if (style === 'button') {
            this.renderButtonCommand();
        } else {
            this.renderSliderCommand();
        }
    }
```

3. Аналогично `renderFeedback()`:

```javascript
    renderFeedback() {
        const style = this._currentStyle();
        if (style === 'checkbox') {
            this.renderCheckboxFeedback();
        } else if (style === 'button') {
            this.renderButtonFeedback();
        } else {
            this.renderSliderFeedback();
        }
    }
```

4. Добавить методы перед `// === Config form ===` секцией:

```javascript
    // === Button style ===

    renderButton() {
        const label = this._resolveButtonLabel();
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-button';
        this.element.innerHTML = `
            <button class="toggle-btn" data-test="btn" data-state="off" type="button">${escapeHtml(label)}</button>
        `;
        this.container.appendChild(this.element);

        this.renderFeedback();
        this.renderCommand();
    }

    renderButtonCommand() {
        // Заглушка — поведение divergence добавляется в Task 3.
    }

    renderButtonFeedback() {
        // Заглушка — реакция на feedback добавляется в Task 1 step 4 (см. ниже).
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (!btn) return;
        const valueOn = this.config?.valueOn ?? 1;
        btn.dataset.state = (this.feedbackValue === valueOn) ? 'on' : 'off';
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            btn.title = `actual: ${this.feedbackValue}`;
        }
    }

    _resolveButtonLabel() {
        // Fallback chain — добавляется полностью в Task 6. Здесь — упрощённая
        // версия: label или sensor name (никогда пусто). Полный fallback с
        // labelOff/labelOn будет в Task 6.
        return this.config?.label || this.config?.sensor || '—';
    }
```

- [ ] **Step 5: Пересобрать `app.js` и прогнать тест**

```bash
make app
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS — один тест "renders button style DOM skeleton".

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/app.js tests/single/dashboard-active-toggle-button.spec.ts
git commit -m "feat(toggle): добавить style='button' с базовым DOM render

Третий стиль для ToggleWidget — material flat button с LED индикатором.
Этот коммит — skeleton: dispatcher на renderButton/renderButtonCommand/
renderButtonFeedback и базовый DOM с data-state. Логика click / divergence /
LED CSS / ledColor — в следующих коммитах.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Click handler triggers writeValue

**Цель:** Клик по кнопке вызывает `writeValue(next)` с инверсным значением — POST на `/ionc/set` с правильными `sensor_id` и `value`.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js` (`renderButton`)
- Test: `tests/single/dashboard-active-toggle-button.spec.ts`

- [ ] **Step 1: Добавить failing тест в spec файл**

В конец `test.describe` блока добавить (перед закрывающей `}`):

```typescript
    test('click writes valueOn when feedback=valueOff', async ({ page }) => {
        await createButtonDashboard(page);
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
        await createButtonDashboard(page);
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
        expect(body.value).toBe(0);
    });
```

- [ ] **Step 2: Прогнать тест — ожидать failure (нет click handler'а)**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts -- --grep "click writes"
```
Expected: FAIL — `waitForRequest` таймаут, POST не приходит.

- [ ] **Step 3: Добавить click handler в `renderButton()`**

В `ui/static/js/src/61-dashboard-active-toggle.js`, в методе `renderButton()`, после `this.container.appendChild(this.element);` и перед `this.renderFeedback();`:

```javascript
        const btnEl = this.element.querySelector('[data-test="btn"]');
        btnEl.addEventListener('click', () => this.onClick());
```

Метод `onClick()` уже существует в классе и универсален (см. строки 103-112 текущего файла) — он читает `valueOff`/`valueOn` и `commandValue`/`feedbackValue` без привязки к стилю.

- [ ] **Step 4: Пересобрать и прогнать**

```bash
make app
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS — все три теста.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/app.js tests/single/dashboard-active-toggle-button.spec.ts
git commit -m "feat(toggle): click handler для button style — writeValue по clicker

POST на /ionc/set с инверсным valueOn/valueOff. Использует существующий
onClick() метод базового slider/checkbox flow без дублирования.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Divergence (command ≠ feedback) → жёлтая рамка

**Цель:** Когда пользователь кликнул, но feedback ещё не догнал — на корневом `.toggle-widget.toggle-style-button` появляется класс `.diverge`. CSS для рамки добавляется в Task 4.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js` (`renderButtonCommand`)
- Test: `tests/single/dashboard-active-toggle-button.spec.ts`

- [ ] **Step 1: Добавить failing тест**

В конец describe-блока:

```typescript
    test('shows .diverge class when command ≠ feedback', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        // Click → commandValue=1, feedbackValue остаётся 0.
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const root = page.locator('.toggle-widget.toggle-style-button').first();
        await expect(root).toHaveClass(/diverge/);
    });

    test('.diverge class removed when feedback catches up', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // Имитация прихода feedback'а = command'у.
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });

        const root = page.locator('.toggle-widget.toggle-style-button').first();
        await expect(root).not.toHaveClass(/diverge/);
    });
```

- [ ] **Step 2: Прогнать тесты — ожидать failure (`renderButtonCommand` пуст)**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts -- --grep "diverge"
```
Expected: FAIL — `.diverge` класс не появляется.

- [ ] **Step 3: Реализовать `renderButtonCommand()`**

В `ui/static/js/src/61-dashboard-active-toggle.js`, заменить заглушку:

```javascript
    renderButtonCommand() {
        // diverge применяется к корневому .toggle-widget (рамка вокруг кнопки
        // лучше читается чем border-color на самой кнопке — конфликт с темами).
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);
    }
```

- [ ] **Step 4: Прогнать тесты**

```bash
make app
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS — все divergence тесты.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/app.js tests/single/dashboard-active-toggle-button.spec.ts
git commit -m "feat(toggle): divergence class для button style

Когда commandValue ≠ feedbackValue — корневой .toggle-widget получает класс
.diverge. CSS-правило для жёлтой рамки добавляется в следующем коммите.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: CSS visuals — OFF/ON + LED pseudo-element + темы + status states

**Цель:** Полная стилизация button — OFF (нейтральный gray), ON (`var(--awc-bg)`), LED `::before` (default amber `#fde047` через `var(--awc-led)`), divergence (yellow border), темы работают через существующие `.awc-theme-*` правила.

**Files:**
- Modify: `ui/static/css/style.css` (новая секция)
- Test: `tests/single/dashboard-active-toggle-button.spec.ts`

- [ ] **Step 1: Добавить failing тесты на CSS**

В конец describe-блока:

```typescript
    test('OFF state has neutral gray background', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        const bg = await btn.evaluate(el => getComputedStyle(el).backgroundColor);
        // #374151 → rgb(55, 65, 81)
        expect(bg).toMatch(/rgb\(\s*55,\s*65,\s*81\s*\)/);
    });

    test('ON state uses theme color (default = primary blue)', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        const bg = await btn.evaluate(el => getComputedStyle(el).backgroundColor);
        // default --awc-bg fallback = #3b82f6 → rgb(59, 130, 246)
        expect(bg).toMatch(/rgb\(\s*59,\s*130,\s*246\s*\)/);
    });

    test('theme=danger ON background = red', async ({ page }) => {
        await createButtonDashboard(page, { colorTheme: 'danger' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        const bg = await btn.evaluate(el => getComputedStyle(el).backgroundColor);
        // danger #ef4444 → rgb(239, 68, 68)
        expect(bg).toMatch(/rgb\(\s*239,\s*68,\s*68\s*\)/);
    });

    test('divergence applies yellow box-shadow', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const root = page.locator('.toggle-widget.toggle-style-button').first();
        const shadow = await root.evaluate(el => getComputedStyle(el).boxShadow);
        // Yellow ≈ #fbbf24 → rgb(251, 191, 36). Проверяем что в box-shadow есть.
        expect(shadow).toMatch(/251,\s*191,\s*36/);
    });
```

- [ ] **Step 2: Прогнать тесты — ожидать failure (нет CSS — все цвета дефолтные)**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts -- --grep "background|box-shadow"
```
Expected: FAIL — `backgroundColor` не совпадает (default browser styles), divergence shadow пустой.

- [ ] **Step 3: Добавить CSS секцию в `ui/static/css/style.css`**

Найти конец секции `/* === Toggle widget (checkbox style) === */` (через `grep -n "Toggle widget" style.css`). Добавить ПОСЛЕ неё:

```css
/* === Toggle widget (button style) === */

.toggle-widget.toggle-style-button {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    box-sizing: border-box;
}

.toggle-widget.toggle-style-button .toggle-btn {
    width: 100%;
    height: 100%;
    min-height: 36px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.3px;
    cursor: pointer;
    transition: all 150ms ease;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 14px;
    color: #d1d5db;
    background: #374151;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08),
                0 2px 4px rgba(0, 0, 0, 0.4);
}

/* LED pseudo-element — основной индикатор состояния */
.toggle-widget.toggle-style-button .toggle-btn::before {
    content: "";
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: all 150ms ease;
    background: #1f2937;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}

/* ON state: цвет фона из темы + LED горит */
.toggle-widget.toggle-style-button .toggle-btn[data-state="on"] {
    background: var(--awc-bg, #3b82f6);
    color: var(--awc-fg, #ffffff);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.35),
                0 0 12px color-mix(in srgb, var(--awc-bg, #3b82f6) 50%, transparent);
}

.toggle-widget.toggle-style-button .toggle-btn[data-state="on"]::before {
    background: var(--awc-led, #fde047);
    box-shadow: 0 0 8px var(--awc-led, #fde047),
                0 0 14px color-mix(in srgb, var(--awc-led, #fde047) 70%, transparent);
}

/* Divergence: жёлтая рамка вокруг кнопки */
.toggle-widget.toggle-style-button.diverge {
    box-shadow: 0 0 0 2px #fbbf24, 0 0 10px rgba(251, 191, 36, 0.5);
    border-radius: 10px;
}
```

- [ ] **Step 4: Прогнать тесты**

CSS подхватывается без `make app` (volume mount). Если dev-viewer запущен — может потребоваться `docker compose restart dev-viewer`. E2E идёт через свежий контейнер — рестарт не нужен.

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS — все CSS-проверки.

- [ ] **Step 5: Commit**

```bash
git add ui/static/css/style.css tests/single/dashboard-active-toggle-button.spec.ts
git commit -m "feat(toggle): CSS для button style — OFF/ON визуал + LED + темы

Material flat button: нейтральный gray OFF, цвет темы ON через var(--awc-bg).
LED через ::before pseudo-element с var(--awc-led, #fde047) дефолтом.
Divergence — жёлтая рамка box-shadow на корневом .toggle-widget.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: ledColor — parser + inline CSS var

**Цель:** `parseActiveConfigFields` парсит поле `ledColor` (sparse — default не пишется), `render()` ставит/убирает inline `--awc-led` на `this.container`.

**Files:**
- Modify: `ui/static/js/src/00-constants.js` (new constant)
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js`
- Test: `tests/single/dashboard-active-toggle-button.spec.ts`

- [ ] **Step 1: Добавить failing тесты**

В конец describe-блока:

```typescript
    test('ledColor inline CSS var applied to container', async ({ page }) => {
        await createButtonDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-button')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('#22c55e');
    });

    test('no ledColor in config = no inline CSS var (uses default)', async ({ page }) => {
        await createButtonDashboard(page);
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-button')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');

        // А computed LED цвет всё равно из CSS-дефолта.
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = container.locator('[data-test="btn"]');
        const ledBg = await btn.evaluate(el => {
            const before = getComputedStyle(el, '::before');
            return before.getPropertyValue('background-color');
        });
        // #fde047 → rgb(253, 224, 71)
        expect(ledBg).toMatch(/rgb\(\s*253,\s*224,\s*71\s*\)/);
    });

    test('switching style away from button removes --awc-led', async ({ page }) => {
        await createButtonDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-widget')
        }).first();

        await page.evaluate(() => {
            const w = window as any;
            const widget = w.dashboardState.widgets.get('tb-1');
            widget.config = { ...widget.config, style: 'slider' };
            widget.container.className = `dashboard-widget widget-3x2 transparent`;
            widget.container.querySelector('.widget-title-label')?.remove();
            widget.container.querySelector('.widget-content')?.remove();
            const dash = w.dashboardState.dashboards.get('TEST_TBUTTON');
            w.dashboardManager.renderWidgetContent(widget, dash.widgets[0]);
        });

        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');
    });
```

- [ ] **Step 2: Прогнать — ожидать failure**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts -- --grep "ledColor|inline CSS var|switching style"
```
Expected: FAIL — `--awc-led` не выставляется (нет логики).

- [ ] **Step 3: Добавить константу в `ui/static/js/src/00-constants.js`**

После строки 296 (`const ACTIVE_WIDGET_CUSTOM_FG_DEFAULT = '#ffffff';`) добавить:

```javascript
// Default LED color для ToggleWidget style='button' — amber, SCADA convention.
const TOGGLE_BUTTON_LED_DEFAULT = '#fde047';
```

- [ ] **Step 4: Расширить `render()` и `parseActiveConfigFields` в `61-dashboard-active-toggle.js`**

1. Заменить `render()` — добавить set/remove `--awc-led`:

```javascript
    render() {
        const style = this._currentStyle();
        if (style === 'button') {
            const ledColor = this.config?.ledColor || TOGGLE_BUTTON_LED_DEFAULT;
            // Inline ставим ТОЛЬКО если оператор задал не-дефолт.
            // Если ledColor === дефолту — fallback в CSS (var(--awc-led, #fde047)).
            if (this.config?.ledColor && this.config.ledColor !== TOGGLE_BUTTON_LED_DEFAULT) {
                this.container.style.setProperty('--awc-led', ledColor);
            } else {
                this.container.style.removeProperty('--awc-led');
            }
        } else {
            this.container.style.removeProperty('--awc-led');
        }
        if (style === 'checkbox') {
            this.renderCheckbox();
        } else if (style === 'button') {
            this.renderButton();
        } else {
            this.renderSlider();
        }
        this._applyColorTheme();
    }
```

2. Расширить `parseActiveConfigFields(form)` — добавить ledColor (sparse):

```javascript
    static parseActiveConfigFields(form) {
        const valueOff = Number(form.querySelector('[name="valueOff"]')?.value ?? 0);
        let valueOn = Number(form.querySelector('[name="valueOn"]')?.value ?? 1);
        if (valueOn === valueOff) {
            valueOn = valueOff + 1;
        }
        const out = {
            valueOff,
            valueOn,
            labelOff: form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:  form.querySelector('[name="labelOn"]')?.value || '',
        };

        // ledColor: только при style='button' и только если не-дефолт.
        const style = form.querySelector('[name="style"]')?.value || ToggleWidget.defaultStyle;
        if (style === 'button') {
            const raw = (form.querySelector('[name="ledColor"]')?.value || '').toLowerCase();
            if (HEX_COLOR_REGEX.test(raw) && raw !== TOGGLE_BUTTON_LED_DEFAULT) {
                out.ledColor = raw;
            }
        }
        return out;
    }
```

- [ ] **Step 5: Прогнать**

```bash
make app
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS — все ledColor тесты + style-switch reset.

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/00-constants.js ui/static/js/src/61-dashboard-active-toggle.js ui/static/app.js tests/single/dashboard-active-toggle-button.spec.ts
git commit -m "feat(toggle): ledColor — inline CSS var + sparse parsing

Поле ledColor (hex) применяется через inline style.setProperty('--awc-led')
на container. CSS читает var с дефолтом #fde047 (amber). Sparse: дефолт
не пишется в JSON конфига. При переключении стиля на slider/checkbox
inline var снимается.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: getActiveConfigFields renders LED color picker + conditional visibility

**Цель:** Config form содержит color picker `name=ledColor`. По умолчанию скрыт (не button style), показывается при `style=button`. `initConfigHandlers` toggles visibility при смене style select.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js` (`getActiveConfigFields` + добавить `initConfigHandlers`)
- Test: `tests/single/dashboard-active-toggle-button.spec.ts`

- [ ] **Step 1: Добавить failing тесты**

В конец describe-блока:

```typescript
    test('config form contains ledColor color picker when style=button', async ({ page }) => {
        await createButtonDashboard(page);
        // Open widget config dialog programmatically.
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });
        const ledInput = page.locator('#widget-config-content [name="ledColor"]');
        await expect(ledInput).toBeVisible();
        await expect(ledInput).toHaveValue('#fde047');
    });

    test('ledColor row hidden when style=slider, shown when style=button', async ({ page }) => {
        await createButtonDashboard(page, { style: 'slider' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });

        // Slider: row hidden
        const ledRow = page.locator('#widget-config-content [data-button-style-row]');
        await expect(ledRow).toBeHidden();

        // Switch style to button
        await page.locator('#widget-config-content [name="style"]').selectOption('button');
        await expect(ledRow).toBeVisible();

        // Switch back
        await page.locator('#widget-config-content [name="style"]').selectOption('slider');
        await expect(ledRow).toBeHidden();
    });
```

- [ ] **Step 2: Прогнать — ожидать failure**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts -- --grep "ledColor row|color picker"
```
Expected: FAIL — `[name="ledColor"]` не существует в форме.

- [ ] **Step 3: Расширить `getActiveConfigFields` — добавить LED color picker row**

В `ui/static/js/src/61-dashboard-active-toggle.js` заменить `static getActiveConfigFields(config = {}) { ... }` так чтобы вернуть существующий HTML + новую строку для LED color:

```javascript
    static getActiveConfigFields(config = {}) {
        const ledColor = config.ledColor || TOGGLE_BUTTON_LED_DEFAULT;
        const isButtonStyle = (config.style || ToggleWidget.defaultStyle) === 'button';
        const ledRowStyle = isButtonStyle ? '' : 'display: none;';
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>valueOff</label>
                    <input type="number" class="widget-input" name="valueOff"
                           value="${config.valueOff ?? 0}" data-test="cfg-valueOff">
                </div>
                <div class="widget-config-field">
                    <label>valueOn</label>
                    <input type="number" class="widget-input" name="valueOn"
                           value="${config.valueOn ?? 1}" data-test="cfg-valueOn">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>labelOff</label>
                    <input type="text" class="widget-input" name="labelOff"
                           value="${escapeAttr(config.labelOff || '')}" placeholder="OFF" data-test="cfg-labelOff">
                </div>
                <div class="widget-config-field">
                    <label>labelOn</label>
                    <input type="text" class="widget-input" name="labelOn"
                           value="${escapeAttr(config.labelOn || '')}" placeholder="ON" data-test="cfg-labelOn">
                </div>
            </div>
            <div class="widget-config-row" data-button-style-row style="${ledRowStyle}">
                <div class="widget-config-field">
                    <label>LED color (button style only)</label>
                    <input type="color" class="widget-input" name="ledColor"
                           value="${ledColor}" data-test="cfg-ledColor">
                </div>
            </div>
        `;
    }
```

- [ ] **Step 4: Добавить `initConfigHandlers` override**

В конец класса `ToggleWidget` (перед `}` закрывающим class) добавить:

```javascript
    static initConfigHandlers(form, config) {
        super.initConfigHandlers(form, config);
        if (form.dataset.toggleButtonStyleHandlersWired === '1') return;
        form.dataset.toggleButtonStyleHandlersWired = '1';

        const styleSelect = form.querySelector('[name="style"]');
        const ledRow = form.querySelector('[data-button-style-row]');
        if (!styleSelect || !ledRow) return;

        styleSelect.addEventListener('change', () => {
            ledRow.style.display = styleSelect.value === 'button' ? '' : 'none';
        });
    }
```

- [ ] **Step 5: Прогнать**

```bash
make app
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/app.js tests/single/dashboard-active-toggle-button.spec.ts
git commit -m "feat(toggle): config form для ledColor — color picker с conditional visibility

В widget config диалоге появляется LED color picker, видимый только при
style='button'. Переключение style select синхронно скрывает/показывает
row. Idempotent через form.dataset.toggleButtonStyleHandlersWired.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Label fallback chain

**Цель:** Заменить `_resolveButtonLabel()` на полный fallback: `config.label` → `_currentLabel()` (labelOff/labelOn) → `'—'`. Никогда не показывает пустую кнопку. Текст обновляется в `renderButtonFeedback` когда меняется feedback.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js`
- Test: `tests/single/dashboard-active-toggle-button.spec.ts`

- [ ] **Step 1: Добавить failing тесты**

В конец describe-блока:

```typescript
    test('empty label + value=valueOff → button text = labelOff', async ({ page }) => {
        await createButtonDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('STOP');
    });

    test('empty label + value=valueOn → button text = labelOn', async ({ page }) => {
        await createButtonDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('START');
    });

    test('config.label override beats labelOff/labelOn', async ({ page }) => {
        await createButtonDashboard(page, { label: 'PUMP-1', labelOff: 'STOP', labelOn: 'START' });
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
        await createButtonDashboard(page, { label: '', labelOff: '', labelOn: '' });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('—');
    });
```

- [ ] **Step 2: Прогнать — ожидать failure (текущий `_resolveButtonLabel` fallback на sensor name, не labelOff/On)**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts -- --grep "label"
```
Expected: FAIL — текст не совпадает с labelOff/labelOn.

- [ ] **Step 3: Заменить `_resolveButtonLabel` и обновить `renderButtonFeedback`**

В `ui/static/js/src/61-dashboard-active-toggle.js`:

1. Заменить `_resolveButtonLabel()`:

```javascript
    _resolveButtonLabel() {
        // Fallback chain:
        // 1) config.label если непустой
        // 2) labelOn/labelOff по текущему value (как в slider style)
        // 3) '—' — никогда полностью пустая кликабельная зона
        if (this.config?.label) return this.config.label;
        const labelOff = this.config?.labelOff || '';
        const labelOn = this.config?.labelOn || '';
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        const stateLabel = current === valueOn ? labelOn : labelOff;
        return stateLabel || '—';
    }
```

2. Обновить `renderButtonFeedback` чтобы перерисовывать label когда меняется feedback (нужно когда fallback идёт через `labelOn`/`labelOff`):

```javascript
    renderButtonFeedback() {
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (!btn) return;
        const valueOn = this.config?.valueOn ?? 1;
        btn.dataset.state = (this.feedbackValue === valueOn) ? 'on' : 'off';
        // Перерисовать label — fallback chain зависит от feedbackValue
        btn.textContent = this._resolveButtonLabel();
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            btn.title = `actual: ${this.feedbackValue}`;
        }
    }
```

3. Обновить `renderButtonCommand` — тоже обновлять label (когда командное значение опережает feedback):

```javascript
    renderButtonCommand() {
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);

        // Когда оператор кликнул — label должен сразу показать новое состояние
        // (commandValue опережает feedbackValue).
        const btn = root.querySelector('[data-test="btn"]');
        if (btn) btn.textContent = this._resolveButtonLabel();
    }
```

- [ ] **Step 4: Прогнать**

```bash
make app
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS — все label fallback тесты.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/app.js tests/single/dashboard-active-toggle-button.spec.ts
git commit -m "feat(toggle): label fallback chain для button style

Приоритет: config.label > labelOn/labelOff (по value) > '—'. Никогда не
рендерим пустую кликабельную зону. Label перерисовывается в renderButtonCommand
и renderButtonFeedback при изменении value.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: CLAUDE.md — обновить ToggleWidget секцию

**Цель:** Документация отражает новый стиль и `ledColor` поле.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Найти секцию ToggleWidget**

```bash
grep -n "ToggleWidget" CLAUDE.md | head -5
```

Ожидаемый блок: "**ToggleWidget (`61-dashboard-active-toggle.js`):** двух-состояный переключатель..."

- [ ] **Step 2: Заменить параграф ToggleWidget**

Найти строку начинающуюся с `**ToggleWidget (\`61-dashboard-active-toggle.js\`):**`. Заменить весь параграф до следующего widget'а (`**PushButtonWidget`) на:

```markdown
**ToggleWidget (`61-dashboard-active-toggle.js`):** двух-состояный переключатель для DI/DO/AI/AO датчиков.
Конфиг: `serverId`/`objectName`/`sensor`/`sensorId` (от base), `valueOff`/`valueOn` (любые числа),
`labelOff`/`labelOn` (текстовые подписи), `style` (default `'slider'` — список из `static styles`),
`ledColor` (hex string, только для `style='button'`, default `#fde047`).

**Поддерживаемые стили** через `static styles = ['slider', 'checkbox', 'button']`:
- **`slider`** (default, defaultSize 3×2): слитая композиция — цвет track = feedback,
  позиция handle = command, жёлтая граница на `.toggle-track` при divergence.
  Layout column: name (top) + track + state-text (bottom).
- **`checkbox`** (defaultSize 2×1 рекомендован): material flat 24×24 + label справа.
  ✓ при ON, dashed «?» при unknown, жёлтая граница на корневом `.toggle-widget` при divergence.
  Click anywhere on widget triggers writeValue. Layout row: `[checkbox] name`.
- **`button`** (defaultSize 3×2): material flat button с LED индикатором.
  OFF — нейтральный gray. ON — `var(--awc-bg)` (цвет темы) + inset shadow + outer glow +
  горящий LED `::before` (default amber `#fde047`, настраивается через `config.ledColor`).
  Divergence — жёлтая outer рамка на корневом `.toggle-widget`. Label из chain:
  `config.label` → `labelOn`/`labelOff` по value → `'—'`.

`render()` диспатчит на `renderSlider()` / `renderCheckbox()` / `renderButton()` по `config.style`.
Аналогично `renderCommand()` / `renderFeedback()`. Корневой div получает класс
`toggle-style-{slider|checkbox|button}`.

Серый «unknown» при `feedback ≠ valueOn ≠ valueOff` (типично для AI/AO) — фактическое
число в `title` tooltip всех стилей (для button — на самом `<button>` элементе).

**ledColor:** для `style='button'` config form содержит color picker (показывается
conditionally — только при `style='button'`). Sparse — дефолт `#fde047` не пишется
в JSON dashboard'а. Применяется через inline `style.setProperty('--awc-led')` на
container; CSS использует `var(--awc-led, #fde047)`. При переключении стиля на
slider/checkbox inline var снимается.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(toggle): описание button style + ledColor в CLAUDE.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Final verification — full button spec + sibling toggle regression

**Цель:** Убедиться что новый стиль не сломал существующие slider/checkbox и что весь дополненный spec проходит.

**Files:** нет (только прогон тестов)

- [ ] **Step 1: Полный прогон нового spec'а**

```bash
make js-tests TEST=single/dashboard-active-toggle-button.spec.ts
```
Expected: PASS — все ~17 тестов.

- [ ] **Step 2: Regression — sibling toggle spec**

```bash
make js-tests TEST=single/dashboard-active-toggle.spec.ts
```
Expected: PASS — нет регрессий в slider/checkbox.

- [ ] **Step 3: Visual cross-check vs approved mockup**

Открыть `docs/superpowers/specs/screenshots/2026-06-16-toggle-button-style/04-led-color-configurable-APPROVED.png` рядом с running dashboard (для дев-сервера: `docker compose up dev-viewer -d --build`, dashboard файл `examples/dashboards/toggle-button-themes-demo.json` — НЕ создаётся в этом плане, можно сделать после merge). Сравнить: OFF / ON / разные ledColor / themes — визуально совпадают.

Если расхождения существенные — RED FLAG: создать regression task и доработать. Если расхождения косметические (несколько px shadow) — OK.

- [ ] **Step 4: Final generic suite (optional, для confidence перед PR)**

Только если запас времени:
```bash
make js-tests
```

Если идёт долго — пропустить, доверять targeted прогонам выше.

---

## Self-Review

**1. Spec coverage:**
- Skeleton (раздел "Архитектура" из spec'а) → Task 1.
- LED цвет, configurable (раздел "LED цвет") → Tasks 5-6.
- CSS variables + темы (раздел "CSS variables") → Task 4.
- Status states (disabled/frozen/pending/error/divergence) → divergence в Task 3+4; остальные **наследуются от base без правок** (см. CLAUDE.md `_updateInteractivityClass`, `_setWriteState`, `_applyFeedbackMeta`). Spec прямо говорит "уже работают, не трогаем". E2E их повторно не покрывает в новом spec'е — они покрыты в существующих active widget specs.
- Label fallback → Task 7.
- DOM-структура (раздел "DOM-структура") → Task 1 (skeleton).
- Размер 3×2 → уже совпадает с current `defaultSize`, не нужно менять.
- Конфиг (раздел "Конфиг") — новое поле `ledColor` → Tasks 5-6; никаких других новых полей.
- Testing (раздел) → новый E2E spec постепенно наполняется в Tasks 1-7; sibling regression в Task 9.
- Implementation footprint → ровно совпадает с File Structure плана.

Gap: spec упоминает unit (vitest) "если получится изолировать тестируемую функцию". В плане unit'ов нет — `_resolveButtonLabel` зависит от `this.config`/`commandValue`/`feedbackValue` и тесно связан с classом. Изолированная функция дала бы тривиальный тест без ROI. Покрыто 4 label-related E2E тестами в Task 7 — достаточно.

**2. Placeholder scan:**
- "TBD/TODO/implement later" — нет.
- "Add appropriate error handling" — нет (нет внешних source'ов; новая логика тривиальна).
- "Write tests for the above" без кода — нет; везде полные test bodies.
- "Similar to Task N" — нет, код повторён.
- Все методы (`renderButton`, `renderButtonCommand`, `renderButtonFeedback`, `_resolveButtonLabel`) определены в Task 1 и переопределяются с полным кодом в последующих task'ах (Task 7 показывает финальное состояние).

**3. Type consistency:**
- Метод `_resolveButtonLabel()` — одно имя везде.
- `data-test="btn"` — единое имя везде (Tasks 1-7).
- Класс `.toggle-style-button` — единое имя (везде).
- `data-button-style-row` — атрибут для conditional row, единое имя (Tasks 6).
- `TOGGLE_BUTTON_LED_DEFAULT` — константа, единое имя (Tasks 5-6).
- `HEX_COLOR_REGEX` — переиспользуется (Task 5), уже в `00-constants.js`.
- `--awc-led` — CSS var, единое имя (Task 4 CSS, Task 5 JS).
- `form.dataset.toggleButtonStyleHandlersWired` — единое имя (Task 6).

---

## Execution Notes

- Each task ends with a commit. Если subagent fails mid-task — fresh subagent на следующий запуск увидит чистое state и продолжит с того же step'а через test failure ↔ implementation cycle.
- `make app` обязателен после ЛЮБОЙ правки в `ui/static/js/src/*.js`. Без него старый `app.js` отдаётся через docker volume и тесты ломаются непредсказуемо.
- `make js-tests` поднимает docker stack за ~30-60s + npm install ~60s. При targeted прогоне через `TEST=...` это всё равно одна итерация. Избегать full `make js-tests` до финального Task 9 step 4.
- Если CSS-тест на background-color falls — проверить что dev-viewer не закэширован: `docker compose restart dev-viewer`. E2E идёт через свежий контейнер `viewer` (не dev-viewer), но volume mount тот же.
