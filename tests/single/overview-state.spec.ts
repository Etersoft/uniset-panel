import { test, expect } from '@playwright/test';

// Helper: open System Overview tab from sidebar for the first server.
async function openSystemOverview(page) {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const overviewItem = page.locator('.sidebar-group-item[data-type="overview"]').first();
    await expect(overviewItem).toBeVisible({ timeout: 10000 });

    const overviewResponse = page.waitForResponse(
        resp => resp.url().includes('/api/servers/') && resp.url().includes('/overview'),
        { timeout: 15000 }
    );

    await overviewItem.click();
    await overviewResponse;
    await page.waitForTimeout(1000);
}

test('overview state persists across reload', async ({ page }) => {
    await openSystemOverview(page);

    const serverId = await page.evaluate(() =>
        Object.keys((window as any).overviewInstances)[0]
    );
    expect(serverId).toBeTruthy();

    await page.evaluate(sid => {
        const state = (window as any).overviewInstances[sid].state;
        state.zoom = 1.5;
        state.searchQuery = 'test';
        (window as any).saveOverviewState(sid, state);
    }, serverId);

    await page.evaluate(() => new Promise(r => setTimeout(r, 400))); // wait debounce

    // Reload re-opens via sidebar click. Server gets the same UUID on fresh
    // backend connection, and localStorage key survives.
    await openSystemOverview(page);

    const serverIdAfter = await page.evaluate(() =>
        Object.keys((window as any).overviewInstances)[0]
    );
    // serverId is expected to match (same mock backend)
    expect(serverIdAfter).toBe(serverId);

    const restored = await page.evaluate(sid => {
        return (window as any).overviewInstances[sid].state;
    }, serverId);
    expect(restored.zoom).toBe(1.5);
    expect(restored.searchQuery).toBe('test');
});

test('overview state survives localStorage quota failure', async ({ page }) => {
    await page.goto('/');
    // Wait a beat so overview bundle loads.
    await page.waitForFunction(
        () => typeof (window as any).saveOverviewState === 'function' &&
              typeof (window as any).overviewStateDefault === 'function',
        { timeout: 10000 }
    );

    await page.evaluate(() => {
        const orig = localStorage.setItem;
        localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
        (window as any)._origSetItem = orig;
    });
    await page.evaluate(() => {
        (window as any).saveOverviewState('srv-test', { zoom: 2 });
    });
    await page.evaluate(() => { localStorage.setItem = (window as any)._origSetItem; });

    const defaults = await page.evaluate(() => (window as any).overviewStateDefault());
    expect(defaults).toBeDefined();
    expect(defaults.zoom).toBe(1);
});
