import { test, expect } from '@playwright/test';

// Helper: open System Overview tab from sidebar for the first server.
// Must be called after any `page.addInitScript` setup but before first navigation
// (the helper performs `page.goto('/')`).
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

test.describe('Overview CustomEvents', () => {

    test.beforeEach(async ({ page }) => {
        // Attach event listeners BEFORE any navigation/open so we don't miss
        // schema-opened which fires synchronously after overview init.
        await page.addInitScript(() => {
            (window as any)._collectedEvents = [];
            (window as any)._openedEvents = [];
            document.addEventListener('uniset:node-clicked', (e: Event) => {
                (window as any)._collectedEvents.push((e as CustomEvent).detail);
            });
            document.addEventListener('uniset:schema-opened', (e: Event) => {
                (window as any)._openedEvents.push((e as CustomEvent).detail);
            });
        });
    });

    test('node click emits uniset:node-clicked', async ({ page }) => {
        await openSystemOverview(page);

        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]
        );
        expect(serverId).toBeTruthy();

        await page.evaluate(sid => {
            const inst = (window as any).overviewInstances[sid];
            // nodeMap is a Map<name, LGraphNode> — iterate directly.
            const firstNode = inst.nodeMap.values().next().value;
            if (inst.canvas.onNodeSelected) {
                inst.canvas.onNodeSelected(firstNode);
            }
        }, serverId);

        const events = await page.evaluate(() => (window as any)._collectedEvents);
        expect(events.length).toBe(1);
        expect(events[0].serverId).toBe(serverId);
        expect(events[0].objectName).toBeTruthy();
        expect(events[0].element).toBeNull();
    });

    test('schema-opened fires when overview opens', async ({ page }) => {
        await openSystemOverview(page);

        await page.waitForFunction(() => (window as any)._openedEvents.length > 0, { timeout: 5000 });

        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]
        );
        const events = await page.evaluate(() => (window as any)._openedEvents);
        expect(events[0].serverId).toBe(serverId);
        expect(events[0].objectNames.length).toBeGreaterThan(0);
    });

});
