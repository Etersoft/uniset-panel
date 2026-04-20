import { test, expect } from '@playwright/test';

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

test.describe('UObject Detail Panel', () => {
    test('double-click CustomEvent opens detail panel', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        expect(serverId).toBeTruthy();

        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);

        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);

        const panels = page.locator('.detail-panel');
        await expect(panels).toHaveCount(1, { timeout: 5000 });
    });

    test('Variables tab renders 4 sections from mock snapshot', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);

        const snapshotResponse = page.waitForResponse(
            r => r.url().includes('/snapshot'), { timeout: 5000 });
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);
        await snapshotResponse;
        await page.waitForTimeout(200);

        const panel = page.locator('.detail-panel').last();
        await expect(panel.locator('section[data-section="inputs"]')).toBeVisible();
        await expect(panel.locator('section[data-section="outputs"]')).toBeVisible();
        await expect(panel.locator('section[data-section="locals"]')).toBeVisible();
    });

    test('Variables row click adds to Trends tab', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);

        const snapshotResponse = page.waitForResponse(
            r => r.url().includes('/snapshot'), { timeout: 5000 });
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);
        await snapshotResponse;
        await page.waitForTimeout(200);

        const panel = page.locator('.detail-panel').last();
        const inputRow = panel.locator('section[data-section="inputs"] tr[data-var]').first();
        // Click the chart-toggle label (SVG icon) to add the variable to Trends.
        await inputRow.locator('.chart-toggle-label').click();

        await panel.locator('[data-inner="trends"]').click();
        await expect(panel.locator('.trend-row').first()).toBeVisible({ timeout: 3000 });
    });

    test('Message Log tab shows records after Enable toggle', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);
        await page.waitForTimeout(300);

        const panel = page.locator('.detail-panel').last();
        await panel.locator('[data-inner="messagelog"]').click();
        await panel.locator('.log-enable-toggle').click();

        await expect(panel.locator('.log-row').first()).toBeVisible({ timeout: 3000 });
    });

    test('Schema-closed cleanup closes all detail panels', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);
        await page.waitForTimeout(300);
        await expect(page.locator('.detail-panel')).toHaveCount(1);

        await page.evaluate((sid) => {
            document.dispatchEvent(new CustomEvent('uniset:schema-closed', {
                detail: { serverId: sid }
            }));
        }, serverId);
        await expect(page.locator('.detail-panel')).toHaveCount(0, { timeout: 2000 });
    });
});
