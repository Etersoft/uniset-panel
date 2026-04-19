const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER:', msg.text()));

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForSelector('.objects-list', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.waitForFunction(() => dashboardState?.dashboards?.size > 0, { timeout: 5000 });

    await page.evaluate(() => {
        dashboardManager.loadDashboard('System Overview');
        dashboardManager.switchView('dashboard');
    });
    await page.waitForTimeout(1000);

    // Check if there are any event listeners on the header
    const listenerInfo = await page.evaluate(() => {
        const widget = document.querySelector('.dashboard-widget');
        const header = widget?.querySelector('.widget-header');

        if (!header) return { error: 'No header found' };

        // Try to manually dispatch mousedown event
        console.log('Dispatching manual mousedown event...');
        const event = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: 100,
            clientY: 100
        });
        header.dispatchEvent(event);

        return {
            headerExists: !!header,
            headerClassName: header.className,
            widgetClassName: widget.className
        };
    });
    console.log('Listener info:', listenerInfo);

    await page.waitForTimeout(2000);
    await browser.close();
})();
