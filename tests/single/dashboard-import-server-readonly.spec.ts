import { test, expect, Page } from '@playwright/test';

// E2E: server dashboards защищены от replace через import dialog.
//
// Сценарии:
// 1. Active dashboard серверный → radio "Replace" disabled + visual hint
// 2. Active dashboard пользовательский → radio "Replace" enabled
// 3. confirmImport guard: даже если форсить mode='replace' через DevTools,
//    alert + abort (серверный dashboard не перетёрт)

async function setupBaseEnv(page: Page) {
    await page.goto('/');
    // Изоляция: чистим user dashboards (серверные приходят отдельно через _server: true).
    await page.evaluate(() => {
        localStorage.removeItem('user-dashboards');
        localStorage.removeItem('last-dashboard');
        Object.keys(localStorage).filter(k => k.startsWith('dashboard:')).forEach(k => localStorage.removeItem(k));
    });
    await page.reload();
    await page.waitForFunction(() => {
        const w = window as any;
        return typeof w.dashboardState !== 'undefined'
            && typeof w.dashboardManager !== 'undefined';
    });
    // Переключаемся в Dashboard view
    await expect(page.locator('#view-dashboard-btn')).toBeVisible({ timeout: 10000 });
    await page.locator('#view-dashboard-btn').click();
    await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });
}

async function injectServerDashboard(page: Page, name: string, widgets: any[] = []) {
    // Имитируем серверный dashboard (флаг _server: true как у loadServerDashboards),
    // делаем его current прямым set'ом — обходим async loadDashboard, который
    // в server-case пытается fetch'ить /api/dashboards/{name} (нет mock'а).
    // Параллельно синхронизируем UI: action bar, Fork кнопка, dirty badge —
    // то что обычно делает loadDashboard.
    await page.evaluate(({ n, ws }) => {
        const w = window as any;
        const cfg = { meta: { name: n }, widgets: ws, _server: true, _loaded: true, _dirty: false };
        w.dashboardState.dashboards.set(n, cfg);
        w.dashboardState.currentDashboard = n;
        document.getElementById('dashboard-actions')?.classList.remove('hidden');
        document.getElementById('dashboard-fork-btn')?.classList.remove('hidden');
        document.getElementById('dashboard-delete-btn')?.classList.add('hidden');
        w.dashboardManager._updateServerDashboardDirtyIndicator();
    }, { n: name, ws: widgets });
}

async function injectUserDashboard(page: Page, name: string) {
    await page.evaluate((n) => {
        const w = window as any;
        const cfg = { meta: { name: n }, widgets: [] };
        w.dashboardState.dashboards.set(n, cfg);
        w.dashboardState.currentDashboard = n;
        document.getElementById('dashboard-actions')?.classList.remove('hidden');
        document.getElementById('dashboard-fork-btn')?.classList.add('hidden');
        document.getElementById('dashboard-delete-btn')?.classList.remove('hidden');
        w.dashboardManager._updateServerDashboardDirtyIndicator();
    }, name);
}

test.describe('Dashboard import — server dashboards read-only', () => {

    test('replace radio disabled когда active dashboard серверный', async ({ page }) => {
        await setupBaseEnv(page);
        await injectServerDashboard(page, 'SRV_TEST_DASH');

        // Открываем Import dialog
        await page.locator('#dashboard-import-btn').click();
        await expect(page.locator('#dashboard-import-overlay')).toBeVisible({ timeout: 5000 });

        const replaceRadio = page.locator('[name="import-mode"][value="replace"]');
        const newRadio = page.locator('[name="import-mode"][value="new"]');

        await expect(replaceRadio).toBeDisabled();
        await expect(newRadio).toBeChecked();

        // Hint текст содержит "server dashboard"
        const replaceLabel = page.locator('.import-option').filter({ has: replaceRadio });
        await expect(replaceLabel).toHaveClass(/import-option-disabled/);
        await expect(replaceLabel.locator('span')).toContainText(/server dashboard/i);
    });

    test('replace radio enabled когда active dashboard пользовательский', async ({ page }) => {
        await setupBaseEnv(page);
        await injectUserDashboard(page, 'USR_TEST_DASH');

        await page.locator('#dashboard-import-btn').click();
        await expect(page.locator('#dashboard-import-overlay')).toBeVisible({ timeout: 5000 });

        const replaceRadio = page.locator('[name="import-mode"][value="replace"]');
        await expect(replaceRadio).toBeEnabled();

        const replaceLabel = page.locator('.import-option').filter({ has: replaceRadio });
        await expect(replaceLabel).not.toHaveClass(/import-option-disabled/);
    });

    test('confirmImport guard блокирует replace серверного dashboard при DevTools обходе', async ({ page }) => {
        await setupBaseEnv(page);
        await injectServerDashboard(page, 'SRV_GUARD_DASH');

        await page.locator('#dashboard-import-btn').click();
        await expect(page.locator('#dashboard-import-overlay')).toBeVisible({ timeout: 5000 });

        // Перехватываем alert чтобы проверить что guard сработал
        const dialogs: string[] = [];
        page.on('dialog', async (d) => {
            dialogs.push(d.message());
            await d.dismiss();
        });

        // Симулируем DevTools обход: enable radio + force-flip group (programmatic
        // checked НЕ снимает mutex с siblings — выставляем вручную) + положим
        // pendingImport и дёрнем confirmImport напрямую.
        await page.evaluate(() => {
            const w = window as any;
            const replace = document.querySelector('[name="import-mode"][value="replace"]') as HTMLInputElement;
            const newRadio = document.querySelector('[name="import-mode"][value="new"]') as HTMLInputElement;
            replace.disabled = false;
            newRadio.checked = false;
            replace.checked = true;
            w.dashboardState.pendingImport = { meta: { name: 'evil' }, widgets: [] };
            w.dashboardManager.confirmImport();
        });

        // Alert "Cannot replace server dashboards" появился
        await expect.poll(() => dialogs).toContainEqual(expect.stringMatching(/cannot replace server dashboards/i));

        // Серверный dashboard НЕ перетёрт — _server флаг сохранён, widgets пустой
        const stillServer = await page.evaluate(() => {
            const w = window as any;
            const cfg = w.dashboardState.dashboards.get('SRV_GUARD_DASH');
            return { hasServerFlag: !!cfg?._server, widgetsCount: cfg?.widgets?.length };
        });
        expect(stillServer.hasServerFlag).toBe(true);
        expect(stillServer.widgetsCount).toBe(0);
    });
});

test.describe('Dashboard fork & dirty indicator', () => {

    test('Fork кнопка видна для серверного, скрыта для пользовательского', async ({ page }) => {
        await setupBaseEnv(page);
        const forkBtn = page.locator('#dashboard-fork-btn');

        await injectServerDashboard(page, 'SRV_FORK_VIS');
        await expect(forkBtn).toBeVisible();

        await injectUserDashboard(page, 'USR_FORK_VIS');
        await expect(forkBtn).toBeHidden();
    });

    test('Fork создаёт user copy с widgets, original серверный не тронут', async ({ page }) => {
        await setupBaseEnv(page);

        const widgets = [
            { id: 'w1', type: 'state-label', x: 0, y: 0, w: 3, h: 2, config: {} },
            { id: 'w2', type: 'gauge',       x: 3, y: 0, w: 3, h: 3, config: {} },
        ];
        await injectServerDashboard(page, 'SRV_FORK_SRC', widgets);

        // Open fork dialog
        await page.locator('#dashboard-fork-btn').click();
        await expect(page.locator('#dashboard-name-overlay')).toBeVisible({ timeout: 5000 });

        const input = page.locator('#dashboard-name-input');
        // Должно быть pre-filled '<name> (copy)'
        await expect(input).toHaveValue('SRV_FORK_SRC (copy)');
        await input.fill('My Fork');
        await page.locator('#dashboard-name-confirm').click();

        await expect(page.locator('#dashboard-name-overlay')).toBeHidden();

        const state = await page.evaluate(() => {
            const w = window as any;
            const src = w.dashboardState.dashboards.get('SRV_FORK_SRC');
            const fork = w.dashboardState.dashboards.get('My Fork');
            return {
                srcIsServer:        !!src?._server,
                srcWidgetsCount:    src?.widgets?.length,
                forkExists:         !!fork,
                forkIsServer:       !!fork?._server,
                forkWidgetsCount:   fork?.widgets?.length,
                forkForkedFrom:     fork?.meta?.forkedFrom,
                current:            w.dashboardState.currentDashboard,
            };
        });

        expect(state.srcIsServer).toBe(true);
        expect(state.srcWidgetsCount).toBe(2);
        expect(state.forkExists).toBe(true);
        expect(state.forkIsServer).toBe(false);
        expect(state.forkWidgetsCount).toBe(2);
        expect(state.forkForkedFrom).toBe('SRV_FORK_SRC');
        expect(state.current).toBe('My Fork');
    });

    test('Dirty badge: скрыт после load, появляется после saveDashboard серверного', async ({ page }) => {
        await setupBaseEnv(page);
        await injectServerDashboard(page, 'SRV_DIRTY');

        const badge = page.locator('#dashboard-dirty-badge');
        await expect(badge).toBeHidden();

        // Симулируем мутацию: серверный config меняется → saveDashboard
        // (любой widget add/move/resize в UI ходит через saveDashboard).
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.saveDashboard('SRV_DIRTY');
        });

        await expect(badge).toBeVisible();
        // Tooltip даёт подсказку про потерю при reload
        await expect(badge).toHaveAttribute('title', /lost on reload/i);
    });

    test('Dirty badge: НЕ появляется для пользовательского dashboard (он персистится)', async ({ page }) => {
        await setupBaseEnv(page);
        await injectUserDashboard(page, 'USR_NO_DIRTY');

        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.saveDashboard('USR_NO_DIRTY');
        });

        const badge = page.locator('#dashboard-dirty-badge');
        await expect(badge).toBeHidden();
    });
});
