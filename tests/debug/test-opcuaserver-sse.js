/**
 * Debug script for testing OPCUAServer SSE updates
 *
 * Usage:
 *   cd tests
 *   node debug/test-opcuaserver-sse.js
 */
const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

(async () => {
    console.log('Starting OPCUAServer SSE debug test...');
    console.log(`Using BASE_URL: ${BASE_URL}`);

    const browser = await chromium.launch({
        headless: false,
        slowMo: 300
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Track all requests/responses related to OPCUA
    page.on('request', request => {
        if (request.url().includes('opcua')) {
            console.log('>> REQUEST:', request.method(), request.url());
            const postData = request.postData();
            if (postData) {
                console.log('   POST data:', postData);
            }
        }
    });

    page.on('response', async response => {
        if (response.url().includes('opcua')) {
            console.log('<< RESPONSE:', response.status(), response.url());
            try {
                const body = await response.text();
                console.log('   Body:', body.substring(0, 500));
            } catch (e) {
                // Ignore errors for streaming responses
            }
        }
    });

    // Track SSE events
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE') || text.includes('OPCUA') || text.includes('opcua')) {
            console.log('BROWSER:', text);
        }
    });

    try {
        // Navigate to main page
        console.log('\n1. Loading main page...');
        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');

        // Wait for objects to load
        await page.waitForTimeout(2000);

        // Find and click OPCUAServer1
        console.log('\n2. Looking for OPCUAServer1...');

        // Find server 9494 (where OPCUAServer1 is)
        const serverLocator = page.locator('text=9494');
        if (await serverLocator.count() > 0) {
            console.log('   Found server 9494, expanding...');
            await serverLocator.first().click();
            await page.waitForTimeout(1000);
        }

        // Click on OPCUAServer1
        const objectLocator = page.locator('text=OPCUAServer1');
        if (await objectLocator.count() > 0) {
            console.log('   Found OPCUAServer1, clicking...');
            await objectLocator.first().click();
            await page.waitForTimeout(3000);
        } else {
            console.log('   ERROR: OPCUAServer1 not found');
            console.log('   Available objects:');
            const objects = await page.$$eval('.object-item', items =>
                items.map(i => i.textContent?.trim())
            );
            console.log('   ', objects);
        }

        // Check subscriptions in the console
        console.log('\n3. Checking subscription status...');
        const subscriptions = await page.evaluate(async () => {
            // Get server ID for port 9494
            const servers = await fetch('/api/servers').then(r => r.json());
            const server = servers.servers?.find(s => s.url.includes('9494'));
            if (!server) return { error: 'Server 9494 not found' };

            const subs = await fetch(`/api/objects/OPCUAServer1/opcua/subscriptions?server=${server.id}`)
                .then(r => r.json());
            return subs;
        });
        console.log('   Subscriptions:', JSON.stringify(subscriptions));

        // Wait and monitor SSE events
        console.log('\n4. Monitoring SSE events for 30 seconds...');
        console.log('   (Values are static in test env, so no events expected unless values change)');

        // Set up SSE event counter
        await page.evaluate(() => {
            window.sseEventCount = 0;
            const originalHandleOPCUA = window.state?.activeRenderer?.handleOPCUASensorUpdates;
            if (originalHandleOPCUA) {
                window.state.activeRenderer.handleOPCUASensorUpdates = function(sensors) {
                    window.sseEventCount++;
                    console.log('OPCUA SSE event received:', JSON.stringify(sensors));
                    return originalHandleOPCUA.call(this, sensors);
                };
            }
        });

        await page.waitForTimeout(30000);

        const eventCount = await page.evaluate(() => window.sseEventCount || 0);
        console.log(`\n5. Total SSE events received: ${eventCount}`);

        // Keep browser open
        console.log('\n6. Browser will stay open for inspection...');
        console.log('   Press Ctrl+C to close');
        await page.waitForTimeout(300000);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
})();
