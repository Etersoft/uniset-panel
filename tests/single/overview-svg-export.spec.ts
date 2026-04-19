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

test('SVG export produces valid svg blob', async ({ page }) => {
    await openSystemOverview(page);

    const serverId = await page.evaluate(() =>
        Object.keys((window as any).overviewInstances)[0]
    );
    expect(serverId).toBeTruthy();

    // Capture the SVG text passed to Blob by intercepting the Blob constructor.
    const svgContent = await page.evaluate(sid => {
        let captured: string | null = null;
        const w = window as any;
        const origBlob = w.Blob;
        w.Blob = function(parts: any[], opts: any) {
            captured = parts[0];
            return new origBlob(parts, opts);
        };
        w.exportOverviewSVG(w.overviewInstances[sid]);
        w.Blob = origBlob;
        return captured;
    }, serverId);

    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('</svg>');
});

test('View dropdown opens and toggles values via checkbox', async ({ page }) => {
    await openSystemOverview(page);

    const serverId = await page.evaluate(() =>
        Object.keys((window as any).overviewInstances)[0]
    );
    expect(serverId).toBeTruthy();

    const btn = page.locator(`#overview-view-btn-${serverId}`);
    const menu = page.locator(`#overview-view-menu-${serverId}`);

    await expect(menu).toBeHidden();
    await btn.click();
    await expect(menu).toBeVisible();

    const valuesCheckbox = menu.locator('[data-toggle="values"]');
    const wasChecked = await valuesCheckbox.isChecked();
    await valuesCheckbox.click();
    const nowChecked = await valuesCheckbox.isChecked();
    expect(nowChecked).toBe(!wasChecked);

    // Body class reflects the toggle. toggleOverviewValues adds
    // `overview-no-values` when values=false. If the checkbox was checked
    // before (values=true), after click values=false => noValues=true.
    const bodyHasClass = await page.evaluate(() =>
        document.body.classList.contains('overview-no-values'));
    expect(bodyHasClass).toBe(wasChecked);
});
