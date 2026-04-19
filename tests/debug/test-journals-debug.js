const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('Loading page...');
  await page.goto('http://localhost:8000');
  await page.waitForTimeout(2000);

  // Get the journals section HTML
  const journalsSectionHTML = await page.evaluate(() => {
    const section = document.getElementById('journals-section');
    return section ? section.outerHTML : 'NOT FOUND';
  });
  console.log('\n=== Journals Section HTML ===\n');
  console.log(journalsSectionHTML);

  // Get computed styles for the collapse icon
  const iconStyles = await page.evaluate(() => {
    const header = document.getElementById('journals-section-header');
    if (!header) return 'Header not found';

    const icon = header.querySelector('.collapse-icon');
    if (!icon) return 'Icon not found';

    const styles = window.getComputedStyle(icon);
    return {
      width: styles.width,
      height: styles.height,
      display: styles.display
    };
  });
  console.log('\n=== Collapse Icon Computed Styles ===');
  console.log(iconStyles);

  // Get computed styles for the title
  const titleStyles = await page.evaluate(() => {
    const title = document.querySelector('.journals-section-title');
    if (!title) return 'Title not found';

    const styles = window.getComputedStyle(title);
    return {
      textTransform: styles.textTransform,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      content: title.textContent
    };
  });
  console.log('\n=== Title Computed Styles ===');
  console.log(titleStyles);

  // Compare with servers section
  const serversIconStyles = await page.evaluate(() => {
    const header = document.getElementById('servers-section-header');
    if (!header) return 'Header not found';

    const icon = header.querySelector('.collapse-icon');
    if (!icon) return 'Icon not found';

    const styles = window.getComputedStyle(icon);
    return {
      width: styles.width,
      height: styles.height,
      display: styles.display
    };
  });
  console.log('\n=== Servers Collapse Icon Styles (for comparison) ===');
  console.log(serversIconStyles);

  await page.waitForTimeout(30000);
  await browser.close();
})();
