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

test('minimap renders and click pans canvas', async ({ page }) => {
    await openSystemOverview(page);

    const serverId = await page.evaluate(() =>
        Object.keys((window as any).overviewInstances)[0]
    );
    expect(serverId).toBeTruthy();

    // Default is minimap=false -> hidden. Toggle on to make it visible.
    await page.evaluate(sid => {
        const inst = (window as any).overviewInstances[sid];
        (window as any).toggleOverviewMinimap(inst);
    }, serverId);

    const minimap = page.locator('.overview-minimap');
    await expect(minimap).toBeVisible();

    // Allow a rAF frame so drawOverviewMinimap writes scale/offX/offY.
    await page.waitForFunction(sid => {
        const inst = (window as any).overviewInstances[sid];
        return inst && inst.minimap && typeof inst.minimap.scale === 'number';
    }, serverId, { timeout: 2000 });

    const initialOffset = await page.evaluate(sid => {
        const ds = (window as any).overviewInstances[sid].canvas.ds;
        return [ds.offset[0], ds.offset[1]];
    }, serverId);

    // Click in upper-left quadrant of the minimap — this should shift offset.
    await minimap.click({ position: { x: 20, y: 20 } });

    const newOffset = await page.evaluate(sid => {
        const ds = (window as any).overviewInstances[sid].canvas.ds;
        return [ds.offset[0], ds.offset[1]];
    }, serverId);

    // Offset must change (at least one coordinate).
    const changed = newOffset[0] !== initialOffset[0] || newOffset[1] !== initialOffset[1];
    expect(changed).toBe(true);
});
