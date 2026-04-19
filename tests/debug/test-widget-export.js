const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('=== Widget Export Test ===\n');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Capture downloaded file
    let downloadedContent = null;
    page.on('download', async download => {
        const filePath = await download.path();
        downloadedContent = fs.readFileSync(filePath, 'utf8');
        console.log('Downloaded file captured');
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Load System Overview
    await page.click('.dashboards-list li:has-text("System Overview")');
    await page.waitForTimeout(2000);

    // Get initial widget state
    const initialState = await page.evaluate(() => {
        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        const chartWidget = dashboard?.widgets?.find(w => w.type === 'chart');
        return chartWidget ? {
            id: chartWidget.id,
            position: JSON.parse(JSON.stringify(chartWidget.position)),
            type: chartWidget.type
        } : null;
    });
    console.log('Initial chart widget state:', JSON.stringify(initialState, null, 2));

    // Enable edit mode
    await page.click('#dashboard-edit-btn');
    await page.waitForTimeout(500);

    // Find chart widget and resize it
    const chartWidget = await page.locator('.dashboard-widget[data-type="chart"]').first();
    const resizeHandle = await chartWidget.locator('.widget-resize-handle');
    
    await resizeHandle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const handleBox = await resizeHandle.boundingBox();
    console.log('\nResize handle position:', handleBox);

    if (handleBox) {
        // Resize: drag handle 50px right and 30px down
        console.log('Performing resize...');
        await page.mouse.move(handleBox.x + 8, handleBox.y + 8);
        await page.waitForTimeout(100);
        await page.mouse.down();
        await page.mouse.move(handleBox.x + 58, handleBox.y + 38, { steps: 10 });
        await page.waitForTimeout(100);
        await page.mouse.up();
        await page.waitForTimeout(500);
    }

    // Get state after resize
    const afterResize = await page.evaluate(() => {
        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        const chartWidget = dashboard?.widgets?.find(w => w.type === 'chart');
        return chartWidget ? {
            id: chartWidget.id,
            position: JSON.parse(JSON.stringify(chartWidget.position))
        } : null;
    });
    console.log('\nAfter resize:', JSON.stringify(afterResize, null, 2));

    // Now test Shift+drag for freePosition
    console.log('\nTesting freePosition (Shift+drag)...');
    
    // Find a gauge widget for freePosition test
    const gaugeWidget = await page.locator('.dashboard-widget[data-type="gauge"]').first();
    const gaugeHeader = await gaugeWidget.locator('.widget-header');
    const gaugeBox = await gaugeWidget.boundingBox();
    
    if (gaugeBox) {
        console.log('Gauge widget position:', gaugeBox);
        
        // Shift+drag to set freePosition
        await page.mouse.move(gaugeBox.x + 50, gaugeBox.y + 15);
        await page.waitForTimeout(100);
        await page.keyboard.down('Shift');
        await page.mouse.down();
        await page.mouse.move(gaugeBox.x + 100, gaugeBox.y + 50, { steps: 10 });
        await page.waitForTimeout(100);
        await page.mouse.up();
        await page.keyboard.up('Shift');
        await page.waitForTimeout(500);
    }

    // Get state after freePosition
    const afterFreePos = await page.evaluate(() => {
        const dashboard = dashboardState.dashboards.get(dashboardState.currentDashboard);
        const gaugeWidget = dashboard?.widgets?.find(w => w.type === 'gauge');
        return gaugeWidget ? {
            id: gaugeWidget.id,
            position: JSON.parse(JSON.stringify(gaugeWidget.position))
        } : null;
    });
    console.log('\nAfter freePosition:', JSON.stringify(afterFreePos, null, 2));

    // Check if freePosition has width/height
    if (afterFreePos?.position?.freePosition) {
        const fp = afterFreePos.position.freePosition;
        console.log('\n=== freePosition validation ===');
        console.log('left:', fp.left, typeof fp.left === 'number' ? '✓' : '✗');
        console.log('top:', fp.top, typeof fp.top === 'number' ? '✓' : '✗');
        console.log('width:', fp.width, typeof fp.width === 'number' ? '✓' : '✗');
        console.log('height:', fp.height, typeof fp.height === 'number' ? '✓' : '✗');
    }

    // Export dashboard
    console.log('\nExporting dashboard...');
    
    // Setup download listener
    const downloadPromise = page.waitForEvent('download');
    await page.click('#dashboard-export-btn');
    
    try {
        const download = await downloadPromise;
        const filePath = await download.path();
        downloadedContent = fs.readFileSync(filePath, 'utf8');
        
        const exported = JSON.parse(downloadedContent);
        console.log('\n=== Exported Dashboard ===');
        console.log('Name:', exported.meta?.name);
        console.log('Widgets count:', exported.widgets?.length);
        
        // Find widget with freePosition in export
        const exportedWithFreePos = exported.widgets?.find(w => w.position?.freePosition);
        if (exportedWithFreePos) {
            console.log('\n=== Exported freePosition widget ===');
            console.log('ID:', exportedWithFreePos.id);
            console.log('freePosition:', JSON.stringify(exportedWithFreePos.position.freePosition, null, 2));
            
            const fp = exportedWithFreePos.position.freePosition;
            const hasAll = fp.left !== undefined && fp.top !== undefined && 
                          fp.width !== undefined && fp.height !== undefined;
            console.log('\nAll properties present:', hasAll ? '✓ PASS' : '✗ FAIL');
        } else {
            console.log('\nNo widget with freePosition in export');
        }
    } catch (err) {
        console.log('Export error:', err.message);
    }

    console.log('\n=== Test Complete ===');
    await page.waitForTimeout(5000);
    await browser.close();
})();
