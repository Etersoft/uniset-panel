const { chromium } = require('@playwright/test');

(async () => {
    console.log('=== Multi-browser control test ===\n');

    // Browser 1: Take control
    console.log('--- Browser 1: Taking control ---');
    const browser1 = await chromium.launch({ headless: true });
    const page1 = await browser1.newPage();
    await page1.goto('http://localhost:8000');
    await page1.waitForTimeout(2000);

    // Take control in browser 1
    const takeBtn1 = page1.locator('#control-status .control-status-btn');
    await takeBtn1.click();
    await page1.waitForTimeout(300);
    await page1.locator('#control-token-input').fill('admin123');
    await page1.locator('.control-btn-primary').click();
    await page1.waitForTimeout(2000);

    let state1 = await page1.evaluate(() => window.state?.control);
    console.log('Browser 1 state:', JSON.stringify({ isController: state1.isController, hasController: state1.hasController }));

    if (!state1.isController) {
        console.error('FAIL: Browser 1 should be controller');
        await browser1.close();
        process.exit(1);
    }
    console.log('PASS: Browser 1 is controller\n');

    // Browser 2: Should be able to take control with same token
    console.log('--- Browser 2: Taking control with same token ---');
    const browser2 = await chromium.launch({ headless: true });
    const page2 = await browser2.newPage();
    await page2.goto('http://localhost:8000');
    await page2.waitForTimeout(2000);

    // Check initial state - should show hasController=true, isController=false
    let state2 = await page2.evaluate(() => window.state?.control);
    console.log('Browser 2 initial state:', JSON.stringify({ isController: state2.isController, hasController: state2.hasController }));

    if (state2.isController) {
        console.error('FAIL: Browser 2 should NOT be controller initially');
        await browser1.close();
        await browser2.close();
        process.exit(1);
    }
    console.log('PASS: Browser 2 is NOT controller initially');

    // Take control in browser 2
    const takeBtn2 = page2.locator('#control-status .control-status-btn');
    await takeBtn2.click();
    await page2.waitForTimeout(300);
    await page2.locator('#control-token-input').fill('admin123');
    await page2.locator('.control-btn-primary').click();
    await page2.waitForTimeout(2000);

    state2 = await page2.evaluate(() => window.state?.control);
    console.log('Browser 2 after take:', JSON.stringify({ isController: state2.isController, hasController: state2.hasController }));

    if (!state2.isController) {
        console.error('FAIL: Browser 2 should be controller after taking control');
        await browser1.close();
        await browser2.close();
        process.exit(1);
    }
    console.log('PASS: Browser 2 is controller after taking control\n');

    // Check browser 1 - should still think it's controller (same token)
    await page1.waitForTimeout(1000);
    state1 = await page1.evaluate(() => window.state?.control);
    console.log('Browser 1 after B2 took control:', JSON.stringify({ isController: state1.isController, hasController: state1.hasController }));
    // Note: Both browsers with same token will think they are controllers
    console.log('INFO: Browser 1 still thinks it is controller (same token)\n');

    // Browser 3: Should NOT have control by default (no token)
    console.log('--- Browser 3: Should be read-only by default ---');
    const browser3 = await chromium.launch({ headless: true });
    const page3 = await browser3.newPage();
    await page3.goto('http://localhost:8000');
    await page3.waitForTimeout(2000);

    let state3 = await page3.evaluate(() => window.state?.control);
    console.log('Browser 3 state:', JSON.stringify({ isController: state3.isController, hasController: state3.hasController }));

    if (state3.isController) {
        console.error('FAIL: Browser 3 should NOT be controller');
        await browser1.close();
        await browser2.close();
        await browser3.close();
        process.exit(1);
    }

    if (!state3.hasController) {
        console.error('FAIL: Browser 3 should see hasController=true');
        await browser1.close();
        await browser2.close();
        await browser3.close();
        process.exit(1);
    }
    console.log('PASS: Browser 3 is NOT controller and sees hasController=true');

    // Check UI shows read-only
    const statusClass3 = await page3.evaluate(() => {
        const el = document.getElementById('control-status');
        return el ? Array.from(el.classList) : [];
    });
    console.log('Browser 3 status classes:', statusClass3);

    if (!statusClass3.includes('control-status-readonly')) {
        console.error('FAIL: Browser 3 should show readonly status');
        await browser1.close();
        await browser2.close();
        await browser3.close();
        process.exit(1);
    }
    console.log('PASS: Browser 3 shows readonly status\n');

    // Cleanup
    await browser1.close();
    await browser2.close();
    await browser3.close();

    console.log('=== All tests passed! ===');
})();
