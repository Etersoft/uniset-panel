/**
 * Create screenshots for documentation
 * - Each widget type
 * - Config dialogs for each widget type
 */

const { chromium } = require('@playwright/test');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';
const DOCS_IMAGES = '/home/pv/Projects/uniset-panel/docs/images';

(async () => {
    console.log('=== Widget Screenshots for Documentation ===\n');
    console.log(`URL: ${BASE_URL}`);
    console.log(`Output: ${DOCS_IMAGES}\n`);

    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        await page.goto(BASE_URL);
        await page.waitForTimeout(2000);

        // Switch to Dashboard view
        console.log('1. Switching to Dashboard view...');
        await page.click('text=Dashboard');
        await page.waitForTimeout(1000);

        // Select Diesel Generator dashboard
        console.log('2. Selecting Diesel Generator dashboard...');
        await page.click('text=Diesel Generator');
        await page.waitForTimeout(2000);

        // Screenshot: Full dashboard
        await page.screenshot({ path: path.join(DOCS_IMAGES, 'dashboard-full.png'), fullPage: false });
        console.log('  Saved: dashboard-full.png');

        // === Widget Screenshots ===
        console.log('\n3. Taking widget screenshots...\n');

        // Helper function to screenshot a widget by selector
        async function screenshotWidget(selector, filename, description, opts = {}) {
            const element = page.locator(selector).first();
            if (await element.count() > 0) {
                const box = await element.boundingBox();
                if (box) {
                    const padding = opts.padding || 10;
                    const maxWidth = opts.maxWidth || 500;
                    const maxHeight = opts.maxHeight || 400;
                    await page.screenshot({
                        path: path.join(DOCS_IMAGES, filename),
                        clip: {
                            x: Math.max(0, box.x - padding),
                            y: Math.max(0, box.y - padding),
                            width: Math.min(box.width + padding * 2, maxWidth),
                            height: Math.min(box.height + padding * 2, maxHeight)
                        }
                    });
                    console.log(`  ${description}: ${filename}`);
                    return true;
                }
            }
            console.log(`  SKIP: ${description} not found`);
            return false;
        }

        // Find parent dashboard-widget for inner element
        async function screenshotWidgetByInner(innerSelector, filename, description, opts = {}) {
            const inner = page.locator(innerSelector).first();
            if (await inner.count() > 0) {
                // Get parent .dashboard-widget
                const widget = await inner.evaluate(el => {
                    const parent = el.closest('.dashboard-widget');
                    if (parent) {
                        const rect = parent.getBoundingClientRect();
                        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    }
                    return null;
                });
                if (widget) {
                    const padding = opts.padding || 5;
                    await page.screenshot({
                        path: path.join(DOCS_IMAGES, filename),
                        clip: {
                            x: Math.max(0, widget.x - padding),
                            y: Math.max(0, widget.y - padding),
                            width: widget.width + padding * 2,
                            height: widget.height + padding * 2
                        }
                    });
                    console.log(`  ${description}: ${filename}`);
                    return true;
                }
            }
            console.log(`  SKIP: ${description} not found`);
            return false;
        }

        // Gauge - Speedometer (RPM)
        await screenshotWidgetByInner('.gauge-speedometer', 'widget-gauge-speedometer.png', 'Gauge (Speedometer)');

        // Gauge - Dual (Power)
        await screenshotWidgetByInner('.gauge-dual', 'widget-gauge-dual.png', 'Gauge (Dual)');

        // Gauge - Arc270 (Temperature)
        await screenshotWidgetByInner('.gauge-arc270', 'widget-gauge-arc270.png', 'Gauge (Arc270)');

        // Gauge - Semicircle (Oil Pressure)
        await screenshotWidgetByInner('.gauge-semicircle', 'widget-gauge-semicircle.png', 'Gauge (Semicircle)');

        // Level - Vertical (find one with vertical container)
        const levelV = await page.evaluate(() => {
            const containers = document.querySelectorAll('.level-container');
            for (const c of containers) {
                if (c.classList.contains('vertical') || c.querySelector('.level-bar-vertical')) {
                    const widget = c.closest('.dashboard-widget');
                    if (widget) {
                        const rect = widget.getBoundingClientRect();
                        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    }
                }
            }
            // Try by widget title
            const widgets = document.querySelectorAll('.dashboard-widget');
            for (const w of widgets) {
                const title = w.querySelector('.widget-title-label');
                if (title && (title.textContent === 'Fuel' || title.textContent === 'Air')) {
                    const rect = w.getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }
            }
            return null;
        });
        if (levelV) {
            await page.screenshot({
                path: path.join(DOCS_IMAGES, 'widget-level-vertical.png'),
                clip: { x: levelV.x - 5, y: levelV.y - 5, width: levelV.width + 10, height: levelV.height + 10 }
            });
            console.log('  Level (Vertical): widget-level-vertical.png');
        } else {
            console.log('  SKIP: Level (Vertical) not found');
        }

        // Level - Horizontal (find Load widget)
        const levelH = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.dashboard-widget');
            for (const w of widgets) {
                const title = w.querySelector('.widget-title-label');
                if (title && title.textContent === 'Load') {
                    const rect = w.getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }
            }
            return null;
        });
        if (levelH) {
            await page.screenshot({
                path: path.join(DOCS_IMAGES, 'widget-level-horizontal.png'),
                clip: { x: levelH.x - 5, y: levelH.y - 5, width: levelH.width + 10, height: levelH.height + 10 }
            });
            console.log('  Level (Horizontal): widget-level-horizontal.png');
        } else {
            console.log('  SKIP: Level (Horizontal) not found');
        }

        // Digital
        await screenshotWidgetByInner('.digital-display', 'widget-digital.png', 'Digital');

        // StatusBar
        await screenshotWidgetByInner('.statusbar-widget', 'widget-statusbar.png', 'StatusBar');

        // Label (find nameplate style)
        const labelWidget = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.widget-content.label-widget');
            for (const w of widgets) {
                const text = w.querySelector('.label-text');
                if (text && text.classList.contains('nameplate')) {
                    const widget = w.closest('.dashboard-widget');
                    if (widget) {
                        const rect = widget.getBoundingClientRect();
                        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    }
                }
            }
            // Fallback - any label
            const first = document.querySelector('.widget-content.label-widget');
            if (first) {
                const widget = first.closest('.dashboard-widget');
                if (widget) {
                    const rect = widget.getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }
            }
            return null;
        });
        if (labelWidget) {
            await page.screenshot({
                path: path.join(DOCS_IMAGES, 'widget-label.png'),
                clip: { x: labelWidget.x - 5, y: labelWidget.y - 5, width: Math.min(labelWidget.width + 10, 400), height: labelWidget.height + 10 }
            });
            console.log('  Label: widget-label.png');
        }

        // Divider - take both horizontal and vertical
        const dividers = await page.evaluate(() => {
            const result = { horizontal: null, vertical: null };
            const widgets = document.querySelectorAll('.widget-content.divider-widget');
            for (const w of widgets) {
                const line = w.querySelector('.divider-line');
                if (line) {
                    const widget = w.closest('.dashboard-widget');
                    if (widget) {
                        const rect = widget.getBoundingClientRect();
                        if (line.classList.contains('horizontal') && !result.horizontal) {
                            result.horizontal = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                        }
                        if (line.classList.contains('vertical') && !result.vertical) {
                            result.vertical = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                        }
                    }
                }
            }
            return result;
        });
        if (dividers.horizontal) {
            await page.screenshot({
                path: path.join(DOCS_IMAGES, 'widget-divider-horizontal.png'),
                clip: { x: dividers.horizontal.x, y: dividers.horizontal.y - 3, width: Math.min(dividers.horizontal.width, 400), height: dividers.horizontal.height + 6 }
            });
            console.log('  Divider (Horizontal): widget-divider-horizontal.png');
        }
        if (dividers.vertical) {
            await page.screenshot({
                path: path.join(DOCS_IMAGES, 'widget-divider-vertical.png'),
                clip: { x: dividers.vertical.x - 3, y: dividers.vertical.y, width: dividers.vertical.width + 6, height: Math.min(dividers.vertical.height, 200) }
            });
            console.log('  Divider (Vertical): widget-divider-vertical.png');
        }

        // Chart (uses .chart-widget-content on widget-content) - scroll into view first
        const chartEl = page.locator('.chart-widget-content').first();
        if (await chartEl.count() > 0) {
            await chartEl.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await screenshotWidgetByInner('.chart-widget-content', 'widget-chart.png', 'Chart', { maxWidth: 800, maxHeight: 400 });
            // Scroll back to top
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(300);
        }

        // === Config Dialog Screenshots ===
        console.log('\n4. Taking config dialog screenshots...\n');

        // Enter edit mode
        await page.click('#dashboard-edit-btn');
        await page.waitForTimeout(500);

        // Helper to open config and screenshot dialog
        async function screenshotConfig(innerSelector, filename, description) {
            const inner = page.locator(innerSelector).first();
            if (await inner.count() > 0) {
                // Find parent widget and its config button
                const configBtn = await inner.evaluate(el => {
                    const widget = el.closest('.dashboard-widget');
                    if (widget) {
                        const btn = widget.querySelector('.widget-action-btn.config');
                        if (btn) {
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                });

                if (configBtn) {
                    await page.waitForTimeout(500);

                    // Screenshot the dialog
                    const dialog = page.locator('.ionc-dialog-overlay');
                    if (await dialog.count() > 0) {
                        const dialogBox = await dialog.locator('.ionc-dialog').boundingBox();
                        if (dialogBox) {
                            await page.screenshot({
                                path: path.join(DOCS_IMAGES, filename),
                                clip: {
                                    x: dialogBox.x - 5,
                                    y: dialogBox.y - 5,
                                    width: dialogBox.width + 10,
                                    height: Math.min(dialogBox.height + 10, 600)
                                }
                            });
                            console.log(`  ${description}: ${filename}`);
                        }

                        // Close dialog with Escape
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(300);
                        return true;
                    }
                }
            }
            console.log(`  SKIP: ${description} config not found`);
            return false;
        }

        // Gauge config (speedometer)
        await screenshotConfig('.gauge-speedometer', 'config-gauge.png', 'Gauge config');

        // Level config (vertical - Fuel)
        const levelConfigBtn = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.dashboard-widget');
            for (const w of widgets) {
                const title = w.querySelector('.widget-title-label');
                if (title && title.textContent === 'Fuel') {
                    const btn = w.querySelector('.widget-action-btn.config');
                    if (btn) {
                        btn.click();
                        return true;
                    }
                }
            }
            return false;
        });
        if (levelConfigBtn) {
            await page.waitForTimeout(500);
            const dialogBox = await page.locator('.ionc-dialog').boundingBox();
            if (dialogBox) {
                await page.screenshot({
                    path: path.join(DOCS_IMAGES, 'config-level.png'),
                    clip: { x: dialogBox.x - 5, y: dialogBox.y - 5, width: dialogBox.width + 10, height: Math.min(dialogBox.height + 10, 600) }
                });
                console.log('  Level config: config-level.png');
            }
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        }

        // Digital config
        await screenshotConfig('.digital-display', 'config-digital.png', 'Digital config');

        // LED config - need to add LED widget first or use statusbar item
        // Skip for now

        // StatusBar config
        await screenshotConfig('.statusbar-widget', 'config-statusbar.png', 'StatusBar config');

        // Label config (nameplate)
        const labelConfigBtn = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.widget-content.label-widget');
            for (const w of widgets) {
                const text = w.querySelector('.label-text.nameplate');
                if (text) {
                    const widget = w.closest('.dashboard-widget');
                    if (widget) {
                        const btn = widget.querySelector('.widget-action-btn.config');
                        if (btn) {
                            btn.click();
                            return true;
                        }
                    }
                }
            }
            return false;
        });
        if (labelConfigBtn) {
            await page.waitForTimeout(500);
            const dialogBox = await page.locator('.ionc-dialog').boundingBox();
            if (dialogBox) {
                await page.screenshot({
                    path: path.join(DOCS_IMAGES, 'config-label.png'),
                    clip: { x: dialogBox.x - 5, y: dialogBox.y - 5, width: dialogBox.width + 10, height: Math.min(dialogBox.height + 10, 600) }
                });
                console.log('  Label config: config-label.png');
            }
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        }

        // Divider config
        await screenshotConfig('.divider-widget', 'config-divider.png', 'Divider config');

        // Chart config
        await screenshotConfig('.chart-widget-content', 'config-chart.png', 'Chart config');

        // === Add Widget dialog ===
        console.log('\n5. Widget picker screenshot...');
        await page.click('button:has-text("Add Widget")');
        await page.waitForTimeout(500);

        const picker = page.locator('.widget-picker');
        if (await picker.count() > 0) {
            await picker.screenshot({ path: path.join(DOCS_IMAGES, 'widget-picker.png') });
            console.log('  Widget picker: widget-picker.png');
        }

        // Close picker
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Exit edit mode
        await page.click('#dashboard-edit-btn');

        console.log('\n=== Screenshots Complete ===');
        console.log(`\nAll images saved to: ${DOCS_IMAGES}`);

        await page.waitForTimeout(3000);

    } catch (error) {
        console.error('Error:', error);
        await page.screenshot({ path: 'debug/screenshot-error.png' });
    } finally {
        await browser.close();
    }
})();
