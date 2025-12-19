const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    // Capture all network requests
    page.on('request', request => {
        if (request.url().includes('control')) {
            console.log('>> REQUEST:', request.method(), request.url());
            const postData = request.postData();
            if (postData) console.log('   Body:', postData);
        }
    });

    page.on('response', async response => {
        if (response.url().includes('control')) {
            console.log('<< RESPONSE:', response.status(), response.url());
            try {
                const body = await response.text();
                console.log('   Body:', body);
            } catch (e) {}
        }
    });

    // Capture console messages
    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    // Capture page errors
    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Check initial state
    const initialState = await page.evaluate(() => window.state?.control);
    console.log('\nInitial state.control:', JSON.stringify(initialState, null, 2));

    // Click Take button
    console.log('\n=== Clicking Take button ===');
    const takeBtn = page.locator('#control-status .control-status-btn');
    await takeBtn.click();
    await page.waitForTimeout(500);

    // Check dialog is visible
    const dialogOverlay = page.locator('#control-dialog-overlay');
    const isVisible = await dialogOverlay.evaluate(el => el.classList.contains('visible'));
    console.log('Dialog visible:', isVisible);

    // Enter token
    console.log('\n=== Entering token ===');
    const input = page.locator('#control-token-input');
    await input.fill('admin123');

    // Check token value
    const tokenValue = await input.inputValue();
    console.log('Token input value:', tokenValue);

    // Click Take Control button
    console.log('\n=== Clicking Take Control button ===');
    const submitBtn = page.locator('.control-btn-primary');
    const btnText = await submitBtn.textContent();
    console.log('Button text:', btnText);

    // Check if button is clickable
    const isDisabled = await submitBtn.isDisabled();
    console.log('Button disabled:', isDisabled);

    await submitBtn.click();
    console.log('Button clicked!');

    // Wait for response
    await page.waitForTimeout(2000);

    // Check final state
    const finalState = await page.evaluate(() => window.state?.control);
    console.log('\nFinal state.control:', JSON.stringify(finalState, null, 2));

    // Check for error message
    const errorEl = page.locator('#control-error');
    const errorText = await errorEl.textContent();
    if (errorText) {
        console.log('Error message:', errorText);
    }

    // Check dialog still visible
    const stillVisible = await dialogOverlay.evaluate(el => el.classList.contains('visible'));
    console.log('Dialog still visible:', stillVisible);

    console.log('\nKeeping browser open for 15 seconds...');
    await page.waitForTimeout(15000);
    await browser.close();
})();
