import { test, expect } from '@playwright/test';

test.describe('SetpointWidget — fourth active widget', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.route('**/ionc/set**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({ json: { status: 'ok' } });
            } else {
                await route.continue();
            }
        });

        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).SetpointWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.enabled = true;
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.token = 'admin';
        });
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    async function createSetpointDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'sp-1',
                type: 'setpoint',
                config: {
                    sensor: 'TEST_TEMP',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'input',
                    applyMode: 'manual',
                    min: 0,
                    max: 100,
                    step: 1,
                    unit: '',
                    label: 'TEMP',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 12, height: 5 },
            };
            const dashCfg = { meta: { name: 'TEST_SP' }, widgets: [widgetCfg] };
            w.dashboardState.dashboards.set('TEST_SP', dashCfg);
            w.dashboardManager.loadDashboard('TEST_SP');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('.setpoint-widget').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders style "input" (default)', async ({ page }) => {
        await createSetpointDashboard(page);
        await expect(page.locator('.setpoint-style-input').first()).toBeVisible();
        await expect(page.locator('[data-test="value-input"]').first()).toBeVisible();
    });

    test('renders style "slider"', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider' });
        await expect(page.locator('.setpoint-style-slider').first()).toBeVisible();
        await expect(page.locator('[data-test="slider"]').first()).toBeVisible();
        await expect(page.locator('[data-test="value"]').first()).toBeVisible();
    });

    test('renders style "stepper"', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'stepper' });
        await expect(page.locator('.setpoint-style-stepper').first()).toBeVisible();
        await expect(page.locator('[data-test="step-down"]').first()).toBeVisible();
        await expect(page.locator('[data-test="step-up"]').first()).toBeVisible();
    });

    test('manual apply: input change → dirty → Apply click → POST', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value }); } catch {}
            }
        });

        await createSetpointDashboard(page, { applyMode: 'manual' });
        // Type a value
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '42';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        // dirty class on widget root
        await expect(page.locator('.setpoint-widget').first()).toHaveClass(/dirty/);

        // Click Apply
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="apply-btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(42);
    });

    test('auto apply: input change → wait 500ms → POST', async ({ page }) => {
        const posts: { value: number; time: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value, time: Date.now() }); } catch {}
            }
        });

        await createSetpointDashboard(page, { applyMode: 'auto' });
        const tStart = Date.now();
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '55';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(800);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(55);
        // Debounced — at least 400ms after input
        expect(posts[0].time - tStart).toBeGreaterThanOrEqual(400);
    });

    test('inline edit (stepper): double-click value → input → Enter → POST', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value }); } catch {}
            }
        });

        await createSetpointDashboard(page, { style: 'stepper' });
        // Double-click on stepper value
        await page.evaluate(() => {
            const span = document.querySelector('[data-test="value"]') as HTMLElement;
            span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        });
        // Inline input appears
        await expect(page.locator('[data-test="inline-input"]').first()).toBeVisible({ timeout: 2000 });

        // Type value + Enter
        await page.evaluate(() => {
            const inp = document.querySelector('[data-test="inline-input"]') as HTMLInputElement;
            inp.value = '37';
            inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        await page.waitForTimeout(300);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(37);
    });

    test('validation clamp: value > max → POSTs max', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value }); } catch {}
            }
        });

        await createSetpointDashboard(page, { applyMode: 'manual', min: 0, max: 50 });
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '999';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = document.querySelector('[data-test="apply-btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(50);  // clamped to max
    });

    test('custom unit displayed', async ({ page }) => {
        await createSetpointDashboard(page, { unit: '°C' });
        // Unit appears in feedback row and inline next to input
        const unitElements = page.locator('.setpoint-unit');
        await expect(unitElements.first()).toBeVisible();
        await expect(unitElements.first()).toHaveText('°C');
    });

    test('edit mode: input change does not auto-write', async ({ page }) => {
        await createSetpointDashboard(page, { applyMode: 'auto' });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });

        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '77';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(800);
        expect(requestSent).toBe(false);
    });

    test('Enter preserves typed value (no rollback to feedback)', async ({ page }) => {
        await createSetpointDashboard(page, { applyMode: 'manual' });

        // Set initial feedback to 22
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 22; w.renderFeedback();
            }
        });

        // Type 42 + Enter
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.focus();
            input.value = '42';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        await page.waitForTimeout(200);

        // Simulate stale feedback re-arriving (e.g. SSE tick with old value)
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 22; w.renderFeedback();
            }
        });

        // Input should STILL be 42, not rolled back to 22
        const val = await page.evaluate(() =>
            (document.querySelector('[data-test="value-input"]') as HTMLInputElement).value);
        expect(val).toBe('42');
    });

    test('Esc resyncs input to feedback', async ({ page }) => {
        await createSetpointDashboard(page);

        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 22; w.renderFeedback();
            }
        });

        // Type 99 (don't apply)
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.focus();
            input.value = '99';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Esc — should reset to feedback
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        await page.waitForTimeout(100);

        const val = await page.evaluate(() =>
            (document.querySelector('[data-test="value-input"]') as HTMLInputElement).value);
        expect(val).toBe('22');
    });

    test('keydown filter: letters blocked', async ({ page }) => {
        await createSetpointDashboard(page);
        const blocked = await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
            input.dispatchEvent(ev);
            return ev.defaultPrevented;
        });
        expect(blocked).toBe(true);
    });

    test('keydown filter: digits allowed', async ({ page }) => {
        await createSetpointDashboard(page);
        const allowed = await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            const ev = new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true });
            input.dispatchEvent(ev);
            return !ev.defaultPrevented;
        });
        expect(allowed).toBe(true);
    });

    test('stepper +/- updates display immediately (without SSE feedback)', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'stepper' });

        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 4; w.renderFeedback();
            }
        });

        // Click + once — display should jump from 4 to 5 immediately,
        // not wait for SSE feedback round-trip.
        await page.evaluate(() => {
            const plus = document.querySelector('[data-test="step-up"]') as HTMLElement;
            plus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            plus.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        const val = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(val).toBe('5');
    });

    test('stepper +/- does not steal focus (no focus blink)', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'stepper' });

        const focusInfo = await page.evaluate(() => {
            const plus = document.querySelector('[data-test="step-up"]') as HTMLElement;
            plus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            plus.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return {
                activeTag: document.activeElement?.tagName,
                isButton: document.activeElement?.tagName === 'BUTTON',
            };
        });

        expect(focusInfo.isButton).toBe(false);
    });

    test('input has anti-autofill attributes (no save-password popup)', async ({ page }) => {
        await createSetpointDashboard(page);

        const attrs = await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            return {
                autocomplete: input.getAttribute('autocomplete'),
                dataFormType: input.getAttribute('data-form-type'),
                dataLpignore: input.getAttribute('data-lpignore'),
                inputmode: input.getAttribute('inputmode'),
            };
        });

        expect(attrs.autocomplete).toBe('off');
        expect(attrs.dataFormType).toBe('other');
        expect(attrs.dataLpignore).toBe('true');
        expect(attrs.inputmode).toBe('decimal');
    });

    test('input click selects current value (replace-on-type)', async ({ page }) => {
        await createSetpointDashboard(page);

        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 42; w.renderFeedback();
            }
        });

        const selectionLength = await page.evaluate(() => new Promise(resolve => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.focus();
            // The select() runs in setTimeout(0) — wait one tick.
            setTimeout(() => {
                const len = (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
                resolve(len);
            }, 50);
        }));

        expect(selectionLength).toBe(2);  // "42" — 2 chars selected
    });

    test('label is rendered when configured', async ({ page }) => {
        await createSetpointDashboard(page, { label: 'TEMP TARGET' });
        await expect(page.locator('[data-test="label"]').first()).toBeVisible();
        await expect(page.locator('[data-test="label"]').first()).toHaveText('TEMP TARGET');
    });

    test('feedback row has no "feedback:" prefix', async ({ page }) => {
        await createSetpointDashboard(page);
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 42; w.renderFeedback();
            }
        });
        const fbText = await page.evaluate(() =>
            document.querySelector('[data-test="feedback"]')?.textContent);
        expect(fbText).not.toContain('feedback');
        expect(fbText).toContain('42');
    });

    test('typing matching feedback value does NOT auto-snap dirty (no "auto-apply" without Enter)', async ({ page }) => {
        await createSetpointDashboard(page, { applyMode: 'manual' });
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 22; w.renderFeedback();
            }
        });

        // Сначала очистим input чтобы напечатать 22 заново
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.value = '22';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // commandValue = 22, feedbackValue = 22 — раньше auto-snap clear'ил dirty
        // во время typing (без Enter). Теперь dirty должна остаться.
        const state = await page.evaluate(() => {
            const widget = document.querySelector('.setpoint-widget')!;
            const apply = widget.querySelector('[data-test="apply-btn"]') as HTMLElement;
            return {
                dirty: widget.classList.contains('dirty'),
                applyVisible: getComputedStyle(apply).display !== 'none',
            };
        });
        expect(state.dirty).toBe(true);
        expect(state.applyVisible).toBe(true);
    });

    test('SSE feedback matching command DOES auto-snap dirty (post-apply confirmation)', async ({ page }) => {
        await createSetpointDashboard(page, { applyMode: 'manual' });
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 22; w.renderFeedback();
            }
        });

        // Set command = 42, dirty
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.focus();
            input.value = '42';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Simulate SSE feedback arriving with command's value (server confirmed write)
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.update(42);
            }
        });

        const dirtyAfter = await page.evaluate(() =>
            document.querySelector('.setpoint-widget')?.classList.contains('dirty'));
        expect(dirtyAfter).toBe(false);
    });

    test('stepper has NO cancel button (auto-apply on click — нет смысла)', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'stepper' });
        const cancelExists = await page.evaluate(() =>
            !!document.querySelector('[data-test="cancel-btn"]'));
        expect(cancelExists).toBe(false);
    });

    test('stepper Esc (через widget keydown) возвращает к feedback', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'stepper' });
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 4; w.renderFeedback();
            }
        });

        // Click + several times → command goes up to e.g. 7
        await page.evaluate(() => {
            const plus = document.querySelector('[data-test="step-up"]') as HTMLElement;
            for (let i = 0; i < 3; i++) {
                plus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                plus.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
        });

        let valueShown = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(valueShown).toBe('7');

        // Esc на widget container — _cancel revert
        await page.evaluate(() => {
            const widget = document.querySelector('.setpoint-widget') as HTMLElement;
            widget.focus();
            widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        });

        valueShown = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(valueShown).toBe('4');
    });

    test('Esc on widget element cancels pending command (works for any style)', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'stepper' });
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.feedbackValue = 4; w.renderFeedback();
            }
        });

        // Build up commandValue via stepper +
        await page.evaluate(() => {
            const plus = document.querySelector('[data-test="step-up"]') as HTMLElement;
            for (let i = 0; i < 3; i++) {
                plus.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
        });

        // Dispatch Esc on widget element
        await page.evaluate(() => {
            const el = document.querySelector('.setpoint-widget') as HTMLElement;
            el.focus();
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        });

        const valueShown = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(valueShown).toBe('4');
    });

    // Frozen sensor: input/Apply disabled, ❄ marker. Feedback продолжает
    // отображаться (текущее frozen value). Apply click не отправляет POST.
    test('frozen sensor: input disabled, ❄ marker, no POST on Apply', async ({ page }) => {
        await createSetpointDashboard(page, { applyMode: 'manual' });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('sp-1').update(50, null, { frozen: true });
        });

        const container = page.locator('.dashboard-widget[data-widget-id="sp-1"]').first();
        await expect(container).toHaveAttribute('data-frozen', 'true');
        await expect(container).toHaveClass(/active-disabled/);
        await expect(container).toHaveAttribute('title', /frozen/i);

        // Native disabled на input.
        const input = page.locator('[data-test="value-input"]').first();
        await expect(input).toBeDisabled();

        // Frozen НЕ должен ломать rendering: input.value (initial sync) и
        // feedback-value-span отражают присланное value=50.
        await expect(input).toHaveValue('50');
        await expect(page.locator('[data-test="feedback-value"]').first()).toHaveText('50');

        // Последующие SSE-update'ы пока sensor frozen ДОЛЖНЫ продолжать
        // менять отображение — главное требование: оператор видит как «висит»
        // значение, а не stale 50 после повторного freeze-broadcast'а.
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('sp-1').update(75, null, { frozen: true });
        });
        await expect(input).toHaveValue('75');
        await expect(page.locator('[data-test="feedback-value"]').first()).toHaveText('75');
        await expect(container).toHaveAttribute('data-frozen', 'true');

        // Попытка Apply: посчитаем POST'ы. Sentinel timeout 300ms — confirm что
        // ничего не уехало даже после потенциального async.
        let posted = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') posted = true;
        });
        await page.evaluate(() => {
            const apply = document.querySelector('[data-test="apply-btn"]') as HTMLElement | null;
            apply?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);
        expect(posted).toBe(false);
    });
});
