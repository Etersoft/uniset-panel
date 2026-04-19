const { chromium } = require('@playwright/test');

/**
 * Test value flash animation - checks that values blink with opacity when updated
 */

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    console.log('=== Value Flash Animation Test ===\n');

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // 1. Check CSS animation definition
    console.log('--- Checking CSS Animation Definition ---');
    const animationCSS = await page.evaluate(() => {
        const styleSheets = document.styleSheets;
        for (const sheet of styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (rule.name === 'value-flash') {
                        return rule.cssText;
                    }
                }
            } catch (e) {}
        }
        return null;
    });

    if (animationCSS) {
        console.log('value-flash animation:');
        console.log(animationCSS);

        const hasOpacity = animationCSS.includes('opacity');
        const hasBackground = animationCSS.includes('background');

        if (hasOpacity && !hasBackground) {
            console.log('\n✓ Animation uses OPACITY (correct)');
        } else if (hasBackground) {
            console.log('\n✗ Animation uses BACKGROUND (wrong!)');
        }
    } else {
        console.log('✗ value-flash animation NOT FOUND');
    }

    // 2. Check CSS classes that use the animation
    console.log('\n--- Checking CSS Classes ---');
    const classes = await page.evaluate(() => {
        const result = {};
        const classesToCheck = ['.value-changed', '.value-updated', '.ionc-value-updated'];

        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (rule.selectorText && classesToCheck.some(c => rule.selectorText.includes(c))) {
                        result[rule.selectorText] = rule.style.animation || rule.style.cssText;
                    }
                }
            } catch (e) {}
        }
        return result;
    });

    for (const [selector, style] of Object.entries(classes)) {
        console.log(`${selector}: ${style}`);
    }

    // 3. Expand server group and open SharedMemory
    console.log('\n--- Opening SharedMemory ---');

    // Click on server group to expand
    const serverGroup = page.locator('.server-group-header').first();
    if (await serverGroup.count() > 0) {
        await serverGroup.click();
        await page.waitForTimeout(500);
    }

    // Find and click SharedMemory
    const smObject = page.locator('.object-item', { hasText: 'SharedMemory' }).first();
    if (await smObject.count() > 0) {
        await smObject.click();
        await page.waitForTimeout(2000);
        console.log('✓ SharedMemory tab opened');

        // 4. Check for sensor values in the table
        const sensorValues = await page.locator('.ionc-value').count();
        console.log(`Found ${sensorValues} sensor values`);

        if (sensorValues > 0) {
            // 5. Watch for animation class being applied
            console.log('\n--- Watching for value updates (10 seconds) ---');

            let animationDetected = false;
            const startTime = Date.now();

            while (Date.now() - startTime < 10000) {
                // Check for any animated values
                const animated = await page.locator('.ionc-value-updated').count();
                if (animated > 0) {
                    animationDetected = true;
                    console.log(`✓ Animation detected! ${animated} values updating`);

                    // Check the actual animation being applied
                    const animStyle = await page.locator('.ionc-value-updated').first().evaluate(el => {
                        const style = getComputedStyle(el);
                        return {
                            animation: style.animation,
                            opacity: style.opacity
                        };
                    });
                    console.log('  Animation style:', animStyle.animation);
                    break;
                }
                await page.waitForTimeout(500);
            }

            if (!animationDetected) {
                console.log('No animation detected in 10 seconds');
                console.log('(This may be normal if mock values are not changing)');
            }
        }
    } else {
        console.log('SharedMemory not found in sidebar');
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    if (animationCSS && animationCSS.includes('opacity') && !animationCSS.includes('background')) {
        console.log('✓ CSS animation correctly uses OPACITY instead of background');
        console.log('✓ Eye-friendly blinking implemented');
    } else {
        console.log('✗ CSS animation needs fixing');
    }

    console.log('\n--- Keeping browser open for 20s to observe ---');
    await page.waitForTimeout(20000);

    await browser.close();
    console.log('\nTest complete.');
})();
