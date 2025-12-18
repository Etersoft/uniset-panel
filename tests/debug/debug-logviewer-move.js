// Debug script: проверка перемещения секции LogViewer
const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

(async () => {
    console.log('=== Debug: LogViewer Section Move ===\n');

    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    console.log(`Opening ${BASE_URL}...`);
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);

    // Открываем MBSlave1
    console.log('\nOpening MBSlave1...');
    const mbSlaveNode = await page.locator('text=MBSlave1').first();
    if (await mbSlaveNode.isVisible()) {
        await mbSlaveNode.click();
        await page.waitForTimeout(2000);
    }

    // Проверяем порядок секций до перемещения
    console.log('\n=== Sections order BEFORE move ===');
    let sections = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        if (!panel) return [];
        const secs = panel.querySelectorAll('.reorderable-section[data-section-id]');
        return Array.from(secs).map((s, i) => `${i}: ${s.dataset.sectionId}`);
    });
    console.log(sections.join('\n'));

    // Пробуем переместить LogViewer вверх
    console.log('\n=== Clicking LogViewer move-up button ===');
    const result = await page.evaluate(() => {
        // Находим tabKey
        const panel = document.querySelector('.tab-panel.active');
        if (!panel) return 'No active panel';
        const tabKey = panel.dataset.name;
        console.log('tabKey:', tabKey);

        // Пробуем вызвать moveSectionUp
        if (typeof window.moveSectionUp === 'function') {
            console.log('Calling moveSectionUp:', tabKey, 'logviewer');
            window.moveSectionUp(tabKey, 'logviewer');
            return 'moveSectionUp called';
        } else {
            return 'moveSectionUp not found';
        }
    });
    console.log('Result:', result);
    await page.waitForTimeout(500);

    // Проверяем порядок секций после перемещения
    console.log('\n=== Sections order AFTER move ===');
    sections = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        if (!panel) return [];
        const secs = panel.querySelectorAll('.reorderable-section[data-section-id]');
        return Array.from(secs).map((s, i) => `${i}: ${s.dataset.sectionId}`);
    });
    console.log(sections.join('\n'));

    // Пробуем ещё раз вверх
    console.log('\n=== Moving LogViewer up again ===');
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        if (panel) {
            window.moveSectionUp(panel.dataset.name, 'logviewer');
        }
    });
    await page.waitForTimeout(500);

    sections = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        if (!panel) return [];
        const secs = panel.querySelectorAll('.reorderable-section[data-section-id]');
        return Array.from(secs).map((s, i) => `${i}: ${s.dataset.sectionId}`);
    });
    console.log(sections.join('\n'));

    console.log('\nDone! Browser stays open for 20 seconds...');
    await page.waitForTimeout(20000);

    await browser.close();
})();
