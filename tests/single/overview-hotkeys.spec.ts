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

test('pressing ? toggles help overlay', async ({ page }) => {
    await openSystemOverview(page);

    const overlay = page.locator('#overview-help-overlay');
    await expect(overlay).toHaveClass(/hidden/);

    // Press ? to open.
    await page.keyboard.press('?');
    await expect(overlay).not.toHaveClass(/hidden/);

    // Press Escape to close.
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveClass(/hidden/);
});

test('V toggle hides port values', async ({ page }) => {
    await openSystemOverview(page);

    // Initial: body should not have overview-no-values
    const initiallyHasClass = await page.evaluate(() =>
        document.body.classList.contains('overview-no-values')
    );
    expect(initiallyHasClass).toBe(false);

    // Press V — toggles the class on.
    await page.keyboard.press('v');
    const afterToggleOn = await page.evaluate(() =>
        document.body.classList.contains('overview-no-values')
    );
    expect(afterToggleOn).toBe(true);

    // Press V again — toggles back off.
    await page.keyboard.press('v');
    const afterToggleOff = await page.evaluate(() =>
        document.body.classList.contains('overview-no-values')
    );
    expect(afterToggleOff).toBe(false);
});

test('hotkeys ignored when focus is in input', async ({ page }) => {
    await openSystemOverview(page);

    // Baseline: clear any stray class
    await page.evaluate(() => document.body.classList.remove('overview-no-values'));

    // Inject a temporary input and focus it — simulates focus on any form
    // control (e.g. FB-status search from Task 11 when available).
    await page.evaluate(() => {
        const inp = document.createElement('input');
        inp.id = 'temp-test-input';
        inp.type = 'text';
        document.body.appendChild(inp);
    });
    await page.locator('#temp-test-input').focus();

    // Pressing V while focus is in INPUT must NOT toggle the overview class.
    await page.keyboard.press('v');

    const bodyHasClass = await page.evaluate(() =>
        document.body.classList.contains('overview-no-values')
    );
    expect(bodyHasClass).toBe(false);

    // Cleanup
    await page.evaluate(() => {
        const el = document.getElementById('temp-test-input');
        if (el) el.remove();
    });
});
