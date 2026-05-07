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
        await expect(page.locator('[data-test="track-wrap"]').first()).toBeVisible();
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

    test('AC-10: initial state shows no-data dim before SSE arrives', async ({ page }) => {
        // Use a sensorId that doesn't exist in mock — no SSE will populate it
        await page.evaluate(() => {
            const w: any = window;
            const widgetCfg = {
                id: 'sp-1',
                type: 'setpoint',
                config: { sensor: 'TEST_NO_SENSOR', sensorId: 999999, objectName: 'SharedMemory',
                          style: 'slider', min: 0, max: 100, step: 1 },
                position: { col: 0, row: 0, width: 12, height: 5 },
            };
            w.dashboardState.dashboards.set('TEST_SP', { meta: { name: 'TEST_SP' }, widgets: [widgetCfg] });
            w.dashboardManager.loadDashboard('TEST_SP');
            w.switchView('dashboard');
        });
        await page.locator('.setpoint-widget').first().waitFor({ state: 'visible' });
        // Check immediately — before SSE can populate (sensor 999999 doesn't exist in mock)
        const valueText = await page.locator('[data-test="value"]').first().textContent();
        expect(valueText?.trim()).toBe('--');
        // The .setpoint-slider-no-data class should be on the widget root
        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveClass(/setpoint-slider-no-data/);
    });

    test('AC-4: handle tracks feedback when idle (commandValue=null)', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });

        // Simulate SSE update: fb=75 arrives, commandValue is still null (idle)
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.update(75);
            }
        });
        // Wait for CSS transition (left 80ms ease-out) to settle
        await page.waitForTimeout(200);

        const valueText = await page.locator('[data-test="value"]').first().textContent();
        expect(valueText?.trim()).toBe('75');

        // Handle position: left ~ 75% of track width
        // After transition, use getBoundingClientRect via evaluate for accuracy
        const pct = await page.evaluate(() => {
            const handle = document.querySelector('[data-test="handle"]') as HTMLElement;
            const trackWrap = document.querySelector('[data-test="track-wrap"]') as HTMLElement;
            const handleBCR = handle.getBoundingClientRect();
            const trackBCR = trackWrap.getBoundingClientRect();
            // Handle center = left + width/2; transform:translateX(-50%) is baked into BCR
            const handleCenterX = handleBCR.left + handleBCR.width / 2;
            return (handleCenterX - trackBCR.left) / trackBCR.width;
        });
        expect(pct).toBeGreaterThan(0.7);
        expect(pct).toBeLessThan(0.8);
    });

    test('AC-5: auto-snap dirty->idle when feedback catches up to command', async ({ page }) => {
        // step:5 → tolerance=2.5
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 5 });

        // Give initial feedback so handle is not in no-data state
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.update(30);
            }
        });

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');
        // Click at 50% → commandValue ~50
        await trackWrap.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
        await page.waitForTimeout(100);

        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveClass(/dirty/);

        // Simulate SSE: feedback arrives at 50 (within step/2=2.5 of commandValue ~50)
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.update(50);
            }
        });
        await expect(widget).not.toHaveClass(/dirty/);
    });

    test('AC-6: dirty stays when feedback drifts away from command', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });

        // Give initial feedback
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.update(30);
            }
        });

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');
        // Click at 50% → commandValue ~50
        await trackWrap.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
        await page.waitForTimeout(100);

        // Simulate SSE: feedback arrives at 20 — far from cmd=50, should stay dirty
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.update(20);
            }
        });

        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveClass(/dirty/);
        // fb-marker should be visible (dirty state)
        const fbMarker = page.locator('[data-test="fb-marker"]').first();
        await expect(fbMarker).toBeVisible();
    });

    test('AC-1: click on track jumps handle and sends POST', async ({ page }) => {
        const requests: Array<{ url: string; body: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) {
                requests.push({ url: req.url(), body: req.postData() || '' });
            }
        });
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('track-wrap has no box');
        // Click at 50% horizontally
        await trackWrap.click({ position: { x: box.width * 0.5, y: box.height / 2 } });

        await page.waitForTimeout(300);
        expect(requests.length).toBeGreaterThanOrEqual(1);
        const last = requests[requests.length - 1];
        // value is in POST body JSON, should be ~50 (within step rounding)
        const body = JSON.parse(last.body);
        expect(body.value).toBeGreaterThanOrEqual(48);
        expect(body.value).toBeLessThanOrEqual(52);
    });

    test('AC-2: drag sends exactly one POST on release', async ({ page }) => {
        const requests: Array<{ url: string; body: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) {
                requests.push({ url: req.url(), body: req.postData() || '' });
            }
        });
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('track-wrap has no box');

        const startX = box.x + box.width * 0.2;
        const midX = box.x + box.width * 0.5;
        const endX = box.x + box.width * 0.8;
        const y = box.y + box.height / 2;

        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(midX, y, { steps: 5 });
        await page.mouse.move(endX, y, { steps: 5 });
        // Mid-drag: NO POST yet
        expect(requests.filter(r => r.url.includes('/ionc/set'))).toHaveLength(0);
        await page.mouse.up();
        await page.waitForTimeout(300);
        // After release: exactly one POST with the final position value
        expect(requests.length).toBe(1);
        const body = JSON.parse(requests[0].body);
        expect(body.value).toBeGreaterThanOrEqual(75);
        expect(body.value).toBeLessThanOrEqual(85);
    });

    test('AC-3: handle does not move during drag despite incoming SSE', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        await page.waitForTimeout(500);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');

        // Start a drag at 30%
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);

        // Inject a feedback update via direct widget.update() — same entry point as real SSE
        await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                w.update(80);
            }
        });
        await page.waitForTimeout(500); // wait long enough that any rerender would have happened

        // Handle should still be near 30% (because of drag), NOT 80%
        const handle = page.locator('[data-test="handle"]').first();
        const handleBox = await handle.boundingBox();
        if (!handleBox) throw new Error('no handle box');
        const handleCenterX = handleBox.x + handleBox.width / 2;
        const pct = (handleCenterX - box.x) / box.width;
        expect(pct).toBeGreaterThan(0.25);
        expect(pct).toBeLessThan(0.35);

        await page.mouse.up();
    });

    test('AC-7: dblclick on value, type, Enter -> POST', async ({ page }) => {
        const requests: Array<{ url: string; body: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) {
                requests.push({ url: req.url(), body: req.postData() || '' });
            }
        });
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        await page.waitForTimeout(500);

        const valueSpan = page.locator('[data-test="value"]').first();
        await valueSpan.dblclick();
        const inlineInput = page.locator('[data-test="inline-input"]').first();
        await inlineInput.waitFor({ state: 'visible', timeout: 2000 });
        await inlineInput.fill('42');
        await inlineInput.press('Enter');
        await page.waitForTimeout(300);
        expect(requests.length).toBeGreaterThanOrEqual(1);
        const last = requests[requests.length - 1];
        const body = JSON.parse(last.body);
        expect(body.value).toBe(42);
    });

    test('AC-8: frozen sensor blocks click and drag', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        await page.waitForTimeout(300);

        // Force frozen state via direct call — matches existing frozen test pattern
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('sp-1').update(50, null, { frozen: true });
        });
        await page.waitForTimeout(200);

        const container = page.locator('.dashboard-widget[data-widget-id="sp-1"]').first();
        await expect(container).toHaveAttribute('data-frozen', 'true');

        const requests: Array<{ url: string; body: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) {
                requests.push({ url: req.url(), body: req.postData() || '' });
            }
        });

        // Use dispatchEvent directly — Playwright's physical click refuses to land on
        // an element covered by the active-disabled overlay (pointer-events blocker).
        // We want to verify the widget's own handler ignores the event, not that
        // Playwright can't click through CSS.
        await page.evaluate(() => {
            const trackWrap = document.querySelector('[data-test="track-wrap"]') as HTMLElement;
            const rect = trackWrap.getBoundingClientRect();
            const x = rect.left + rect.width * 0.7;
            const y = rect.top + rect.height / 2;
            trackWrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
            trackWrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
            trackWrap.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        });
        await page.waitForTimeout(500);
        expect(requests).toHaveLength(0);
    });

    test('AC-9: no control token blocks click and drag', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        await page.waitForTimeout(300);

        // Revoke control AFTER widget created — matches toggle spec pattern
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.token = null;
            w.state.control.isController = false;
            w.state.control.hasController = false;
            document.dispatchEvent(new CustomEvent('controlStatusChanged', { detail: { ...w.state.control } }));
        });
        await page.waitForTimeout(200);

        const container = page.locator('.dashboard-widget[data-widget-id="sp-1"]').first();
        await expect(container).toHaveAttribute('data-control-blocked', 'true');

        const requests: Array<{ url: string; body: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) {
                requests.push({ url: req.url(), body: req.postData() || '' });
            }
        });

        // Use dispatchEvent directly for the same reason as AC-8: Playwright's
        // physical click refuses to land on an element covered by the overlay.
        await page.evaluate(() => {
            const trackWrap = document.querySelector('[data-test="track-wrap"]') as HTMLElement;
            const rect = trackWrap.getBoundingClientRect();
            const x = rect.left + rect.width * 0.7;
            const y = rect.top + rect.height / 2;
            trackWrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
            trackWrap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
            trackWrap.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        });
        await page.waitForTimeout(500);
        expect(requests).toHaveLength(0);
    });

    test('AC-11: color zones render with correct positions and colors', async ({ page }) => {
        await createSetpointDashboard(page, {
            style: 'slider',
            min: 0, max: 100, step: 1,
            zones: [
                { from: 0,  to: 40,  color: '#10b981' },
                { from: 40, to: 75,  color: '#fbbf24' },
                { from: 75, to: 100, color: '#ef4444' },
            ],
        });
        await page.waitForTimeout(500);

        const zoneEls = page.locator('.setpoint-slider-zone');
        await expect(zoneEls).toHaveCount(3);

        const first = await zoneEls.nth(0).evaluate(el => ({
            bg: el.style.background || el.style.backgroundColor,
            left: el.style.left,
            right: el.style.right,
        }));
        // Background may be normalized to rgb() or kept as #hex; accept both
        expect(first.bg.toLowerCase()).toMatch(/16, 185, 129|10b981/);
        expect(first.left).toBe('0%');
        expect(first.right).toBe('60%');

        const third = await zoneEls.nth(2).evaluate(el => ({
            bg: el.style.background || el.style.backgroundColor,
            left: el.style.left,
            right: el.style.right,
        }));
        expect(third.bg.toLowerCase()).toMatch(/239, 68, 68|ef4444/);
        expect(third.left).toBe('75%');
        expect(third.right).toBe('0%');
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

    test('AC-12: vertical orientation - drag from top to bottom decreases value', async ({ page }) => {
        const requests: Array<{ url: string; body: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) {
                requests.push({ url: req.url(), body: req.postData() || '' });
            }
        });
        await createSetpointDashboard(page, {
            style: 'slider',
            orientation: 'vertical',
            min: 0, max: 100, step: 1,
        });
        await page.waitForTimeout(500);

        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveClass(/setpoint-slider-vertical/);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');

        // Top of track = max (100), bottom = min (0). Start near top, release near bottom.
        const startY = box.y + box.height * 0.1;
        const endY = box.y + box.height * 0.9;
        const x = box.x + box.width / 2;

        await page.mouse.move(x, startY);
        await page.mouse.down();
        await page.mouse.move(x, endY, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(300);

        expect(requests.length).toBe(1);
        const body = JSON.parse(requests[0].body);
        // End at 90% from top = 10% from bottom = ~10 in [0,100]
        expect(body.value).toBeGreaterThanOrEqual(0);
        expect(body.value).toBeLessThanOrEqual(15);
    });

    test('default size for slider horizontal: 6x4', async ({ page }) => {
        // Use a special path that triggers the default-size logic in dashboard-manager.
        // We can't use createSetpointDashboard directly because it sets explicit position;
        // instead emulate the openWidgetEditor / save path that uses default size.
        await page.evaluate(() => {
            const w: any = window;
            const WidgetClass = w.SetpointWidget;
            const config = { style: 'slider', orientation: 'horizontal' };
            const size = WidgetClass.getDefaultSizeForStyle('slider', config);
            (window as any).__testSize = size;
        });
        const size = await page.evaluate(() => (window as any).__testSize);
        expect(size).toEqual({ width: 6, height: 4 });
    });

    test('default size for slider vertical: 4x6', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const WidgetClass = w.SetpointWidget;
            const config = { style: 'slider', orientation: 'vertical' };
            const size = WidgetClass.getDefaultSizeForStyle('slider', config);
            (window as any).__testSize = size;
        });
        const size = await page.evaluate(() => (window as any).__testSize);
        expect(size).toEqual({ width: 4, height: 6 });
    });

    test('default size for non-slider styles is null (uses static defaultSize)', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const WidgetClass = w.SetpointWidget;
            (window as any).__testSizeInput = WidgetClass.getDefaultSizeForStyle('input', {});
            (window as any).__testSizeStepper = WidgetClass.getDefaultSizeForStyle('stepper', {});
        });
        const sizeInput = await page.evaluate(() => (window as any).__testSizeInput);
        const sizeStepper = await page.evaluate(() => (window as any).__testSizeStepper);
        expect(sizeInput).toBeNull();
        expect(sizeStepper).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Config form conditional field visibility (AC-13)
// Uses the widget picker flow (same pattern as dashboard-widget-settings.spec.ts)
// ---------------------------------------------------------------------------

async function setupDashboardEnvForAC13(page) {
    await page.route('**/api/control/status', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ enabled: true, isController: true, hasController: true, timeoutSec: 60 })
        });
    });
    await page.route('**/api/objects?server=mock-srv&type=IONotifyController', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ objects: [{ name: 'SharedMemory' }] })
        });
    });
    await page.route('**/api/objects/SharedMemory/ionc/sensors**', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ sensors: [{ id: 100, name: 'TEMP', type: 'AO', value: 0 }] })
        });
    });

    await page.goto('/');
    await page.waitForFunction(() => {
        const w = window as any;
        return typeof w.dashboardState !== 'undefined'
            && typeof w.dashboardManager !== 'undefined'
            && typeof w.SetpointWidget !== 'undefined';
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
        for (const [, srv] of (w.state?.servers || new Map())) {
            if (srv.connected) return true;
        }
        return false;
    }, { timeout: 15000 });
    await page.evaluate(() => {
        const w = window as any;
        w.state.servers.clear();
        w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        localStorage.removeItem('user-dashboards');
        Object.keys(localStorage).filter(k => k.startsWith('dashboard:')).forEach(k => localStorage.removeItem(k));
    });
}

async function createEmptyDashboardInEditModeForAC13(page, name: string) {
    await page.evaluate((n) => {
        const w = window as any;
        const dashCfg = { meta: { name: n }, widgets: [] };
        w.dashboardState.dashboards.set(n, dashCfg);
        w.dashboardManager.loadDashboard(n);
        if (typeof w.switchView === 'function') w.switchView('dashboard');
        w.dashboardState.editMode = true;
        document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
    }, name);
}

async function openSetpointConfigViaPicker(page) {
    await page.locator('#dashboard-add-widget-btn').click();
    await page.locator('#widget-picker-overlay').waitFor({ state: 'visible' });
    await page.locator('.widget-picker-item[data-type="setpoint"]').click();
    const cfg = page.locator('#widget-config-overlay');
    await cfg.waitFor({ state: 'visible' });
    return cfg;
}

test.describe('SetpointWidget — AC-13: config form conditional field visibility', () => {
    test.beforeEach(async ({ page }) => {
        await setupDashboardEnvForAC13(page);
    });

    test('AC-13: slider style shows orientation+zones, hides applyMode; others show applyMode', async ({ page }) => {
        await createEmptyDashboardInEditModeForAC13(page, 'AC13_DASH');
        const cfg = await openSetpointConfigViaPicker(page);

        const styleSel = cfg.locator('[name="style"]');
        await expect(styleSel).toBeVisible({ timeout: 3000 });

        const applyRow  = cfg.locator('[data-row="applyMode"]');
        const orientRow = cfg.locator('[data-row="orientation"]');
        const zonesRow  = cfg.locator('[data-row="zones"]');

        // Default style is 'input' — applyMode visible, orientation/zones hidden
        await expect(applyRow).toBeVisible();
        await expect(orientRow).toBeHidden();
        await expect(zonesRow).toBeHidden();

        // Switch to slider
        await styleSel.selectOption('slider');
        await expect(applyRow).toBeHidden();
        await expect(orientRow).toBeVisible();
        await expect(zonesRow).toBeVisible();

        // Switch back to stepper
        await styleSel.selectOption('stepper');
        await expect(applyRow).toBeVisible();
        await expect(orientRow).toBeHidden();
        await expect(zonesRow).toBeHidden();
    });
});
