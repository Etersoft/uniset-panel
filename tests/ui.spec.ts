import { test, expect } from '@playwright/test';

test.describe('UniSet2 Viewer UI', () => {

  test('should load main page with title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('UniSet2 Viewer');
    await expect(page.locator('h1')).toHaveText('UniSet2 Viewer');
  });

  test('should display objects list (not empty)', async ({ page }) => {
    await page.goto('/');

    // Ждём загрузки списка объектов (не должен быть пустым)
    await expect(page.locator('#objects-list li')).not.toHaveCount(0, { timeout: 10000 });

    // Должно быть минимум 2 объекта
    await expect(page.locator('#objects-list li')).toHaveCount(2, { timeout: 5000 });

    // Проверяем что TestProc в списке
    await expect(page.locator('#objects-list')).toContainText('TestProc');
  });

  test('should show placeholder when no object selected', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.placeholder')).toBeVisible();
    // Плейсхолдер на русском
    await expect(page.locator('.placeholder')).toContainText('Выберите объект');
  });

  test('should open object tab on click', async ({ page }) => {
    await page.goto('/');

    // Ждём загрузки списка
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Кликаем на TestProc
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Проверяем что открылась вкладка
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toBeVisible();
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toHaveClass(/active/);

    // Проверяем что placeholder исчез
    await expect(page.locator('.placeholder')).not.toBeVisible();
  });

  test('should display variables table', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём загрузки переменных (в collapsible секции)
    await page.waitForSelector('[data-section^="variables-"] tbody tr', { timeout: 10000 });

    // Проверяем наличие таблицы настроек (раздел переименован в Настройки)
    await expect(page.locator('[data-section^="variables-"] .collapsible-title')).toContainText('Настройки');
    await expect(page.locator('[data-section^="variables-"] tbody tr')).not.toHaveCount(0);
  });

  test('should display inputs and outputs sections', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём загрузки данных (в collapsible секциях внутри io-grid)
    await page.waitForSelector('.io-grid .collapsible-section', { timeout: 10000 });

    // Проверяем секции Входы и Выходы
    await expect(page.locator('.io-grid .collapsible-title', { hasText: 'Входы' })).toBeVisible();
    await expect(page.locator('.io-grid .collapsible-title', { hasText: 'Выходы' })).toBeVisible();
  });

  test('should close tab on close button click', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём появления вкладки
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toBeVisible();

    // Закрываем вкладку
    await page.locator('.tab-btn .close').click();

    // Проверяем что вкладка закрылась
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).not.toBeVisible();
    await expect(page.locator('.placeholder')).toBeVisible();
  });

  test('should refresh objects list on button click', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    const initialCount = await page.locator('#objects-list li').count();

    // Кликаем Refresh
    await page.locator('#refresh-objects').click();

    // После рефреша количество объектов должно остаться тем же
    await expect(page.locator('#objects-list li')).toHaveCount(initialCount);
  });

  test('should enable chart for IO variable', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём загрузки IO (в collapsible секции внутри io-grid)
    await page.waitForSelector('.io-grid .collapsible-section tbody tr', { timeout: 10000 });

    // Находим первый чекбокс в секции Входы (inputs) и кликаем на лейбл
    const firstToggleLabel = page.locator('.io-grid .collapsible-section').first().locator('tbody tr:first-child .chart-toggle-label');
    await firstToggleLabel.click();

    // Проверяем что появился график
    await expect(page.locator('.chart-panel')).toBeVisible({ timeout: 5000 });
  });

  test('should switch between multiple tabs', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Открываем TestProc
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toHaveClass(/active/);

    // Открываем UniSetActivator
    const activator = page.locator('#objects-list li', { hasText: 'UniSetActivator' });
    if (await activator.isVisible()) {
      await activator.click();

      // Проверяем что появилась вторая вкладка
      await expect(page.locator('.tab-btn')).toHaveCount(2);
      await expect(page.locator('.tab-btn', { hasText: 'UniSetActivator' })).toHaveClass(/active/);

      // Переключаемся обратно на TestProc
      await page.locator('.tab-btn', { hasText: 'TestProc' }).click();
      await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toHaveClass(/active/);
    }
  });

  test('should have time range selector', async ({ page }) => {
    await page.goto('/');

    // Проверяем наличие селектора временного диапазона
    await expect(page.locator('.time-range-selector')).toBeVisible();
    await expect(page.locator('.time-range-btn[data-range="300"]')).toBeVisible();
    await expect(page.locator('.time-range-btn[data-range="900"]')).toBeVisible();
    await expect(page.locator('.time-range-btn[data-range="3600"]')).toBeVisible();

    // По умолчанию активен 15m (900 секунд)
    await expect(page.locator('.time-range-btn[data-range="900"]')).toHaveClass(/active/);
  });

  test('should change time range on click', async ({ page }) => {
    await page.goto('/');

    // Кликаем на 5m (300 секунд)
    await page.locator('.time-range-btn[data-range="300"]').click();
    await expect(page.locator('.time-range-btn[data-range="300"]')).toHaveClass(/active/);
    await expect(page.locator('.time-range-btn[data-range="900"]')).not.toHaveClass(/active/);

    // Кликаем на 1h (3600 секунд)
    await page.locator('.time-range-btn[data-range="3600"]').click();
    await expect(page.locator('.time-range-btn[data-range="3600"]')).toHaveClass(/active/);
    await expect(page.locator('.time-range-btn[data-range="300"]')).not.toHaveClass(/active/);
  });

  test('should show fallback renderer for unsupported object types', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // UniSetActivator имеет тип который не поддерживается явно (не UniSetManager/UniSetObject)
    const activator = page.locator('#objects-list li', { hasText: 'UniSetActivator' });
    if (await activator.isVisible()) {
      await activator.click();

      // Ждём открытия вкладки
      await expect(page.locator('.tab-btn', { hasText: 'UniSetActivator' })).toBeVisible();
      await expect(page.locator('.tab-btn', { hasText: 'UniSetActivator' })).toHaveClass(/active/);

      // Проверяем что отображается fallback warning
      await expect(page.locator('.fallback-warning')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.fallback-message')).toContainText('не поддерживается');

      // Проверяем что есть сырой JSON
      await expect(page.locator('.fallback-json')).toBeVisible();

      // Проверяем что JSON содержит данные об объекте
      const jsonContent = await page.locator('.fallback-json').textContent();
      expect(jsonContent).toContain('object');
    }
  });

  test('should display object type badge in fallback renderer', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    const activator = page.locator('#objects-list li', { hasText: 'UniSetActivator' });
    if (await activator.isVisible()) {
      await activator.click();

      // Ждём загрузки fallback контента
      await expect(page.locator('.fallback-warning')).toBeVisible({ timeout: 10000 });

      // Ждём пока тип объекта появится в сообщении (заполняется при update после SSE/polling)
      await expect(page.locator('.fallback-type')).toContainText('UniSetActivator', { timeout: 10000 });
    }
  });

  // === LogViewer тесты ===

  test('should display LogViewer section for objects with LogServer', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём загрузки данных объекта
    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем секцию Логи
    await expect(page.locator('.logviewer-section')).toBeVisible();
    await expect(page.locator('.logviewer-title')).toContainText('Логи');
  });

  test('should have log level dropdown with pills', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем кнопку выбора уровня логов
    const levelBtn = page.locator('.log-level-btn');
    await expect(levelBtn).toBeVisible();
    await expect(levelBtn).toContainText('Уровни');

    // Открываем dropdown
    await levelBtn.click();

    // Проверяем что dropdown открылся
    const dropdown = page.locator('.log-level-dropdown');
    await expect(dropdown).toHaveClass(/open/);

    // Проверяем наличие pills для уровней
    await expect(page.locator('.log-level-pill[data-level="CRIT"]')).toBeVisible();
    await expect(page.locator('.log-level-pill[data-level="WARN"]')).toBeVisible();
    await expect(page.locator('.log-level-pill[data-level="INFO"]')).toBeVisible();
    await expect(page.locator('.log-level-pill[data-level="DEBUG"]')).toBeVisible();
    await expect(page.locator('.log-level-pill[data-level="ANY"]')).toBeVisible();

    // Проверяем пресеты
    await expect(page.locator('.log-preset-btn[data-preset="errors"]')).toBeVisible();
    await expect(page.locator('.log-preset-btn[data-preset="all"]')).toBeVisible();

    // Закрываем dropdown кликом вне
    await page.locator('.logviewer-title').click();
    await expect(dropdown).not.toHaveClass(/open/);
  });

  test('should show connect button in LogViewer', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем кнопку подключения
    const connectBtn = page.locator('.log-connect-btn');
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toContainText('Подключить');
  });

  test('should show placeholder before connecting', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем placeholder
    const placeholder = page.locator('.log-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('Подключить');
  });

  test('should toggle LogViewer section collapse', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    const section = page.locator('.logviewer-section');
    const content = page.locator('.logviewer-content');

    // Секция должна быть развёрнута по умолчанию
    await expect(content).toBeVisible();

    // Кликаем на заголовок (на title, не на controls) для сворачивания
    await page.locator('.logviewer-title').click();
    await expect(section).toHaveClass(/collapsed/);

    // Кликаем снова для разворачивания
    await page.locator('.logviewer-title').click();
    await expect(section).not.toHaveClass(/collapsed/);
  });

  test('should have resize handle in LogViewer', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем наличие resize handle
    await expect(page.locator('.logviewer-resize-handle')).toBeVisible();
  });

  test('should show Stop button during reconnection on connection failure', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Нажимаем кнопку подключения
    const connectBtn = page.locator('.log-connect-btn');
    await expect(connectBtn).toContainText('Подключить');
    await connectBtn.click();

    // После нажатия кнопка должна показать "Остановить" (сначала при connecting, потом при reconnecting)
    // Ждём пока кнопка изменится на "Остановить"
    await expect(connectBtn).toContainText('Остановить', { timeout: 5000 });

    // Проверяем что статус показывает переподключение или подключение
    // Статус текст находится в span внутри .logviewer-status (второй span после точки)
    const statusText = page.locator('.logviewer-status span:nth-child(2)');
    // Статус может быть "Подключение..." или "Переподключение..."
    await expect(statusText).toHaveText(/Подключение|Переподключение/, { timeout: 5000 });

    // Кликаем остановить чтобы отключиться
    await connectBtn.click();

    // После остановки кнопка должна вернуться к "Подключить"
    await expect(connectBtn).toContainText('Подключить', { timeout: 5000 });
    await expect(statusText).toHaveText('Отключено', { timeout: 5000 });
  });

  // === Новые тесты на функциональность LogViewer ===

  test('should toggle level pills in dropdown', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Открываем dropdown
    await page.locator('.log-level-btn').click();
    await expect(page.locator('.log-level-dropdown')).toHaveClass(/open/);

    // Кликаем на pill CRIT
    const critPill = page.locator('.log-level-pill[data-level="CRIT"]');
    await critPill.click();
    await expect(critPill).toHaveClass(/active/);

    // Кликаем на pill WARN
    const warnPill = page.locator('.log-level-pill[data-level="WARN"]');
    await warnPill.click();
    await expect(warnPill).toHaveClass(/active/);

    // Проверяем что кнопка показывает количество выбранных
    await expect(page.locator('.log-level-btn')).toContainText('(2)');

    // Снимаем выбор с CRIT
    await critPill.click();
    await expect(critPill).not.toHaveClass(/active/);
    await expect(page.locator('.log-level-btn')).toContainText('(1)');
  });

  test('should apply level presets', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Открываем dropdown
    await page.locator('.log-level-btn').click();

    // Применяем пресет "Ошибки" (CRIT + WARN)
    await page.locator('.log-preset-btn[data-preset="errors"]').click();
    await expect(page.locator('.log-level-pill[data-level="CRIT"]')).toHaveClass(/active/);
    await expect(page.locator('.log-level-pill[data-level="WARN"]')).toHaveClass(/active/);
    await expect(page.locator('.log-level-pill[data-level="INFO"]')).not.toHaveClass(/active/);

    // Применяем пресет "Всё"
    await page.locator('.log-preset-btn[data-preset="all"]').click();
    await expect(page.locator('.log-level-pill[data-level="ANY"]')).toHaveClass(/active/);
    await expect(page.locator('.log-level-btn')).toContainText('Все');

    // Сброс
    await page.locator('.log-preset-btn[data-preset="reset"]').click();
    await expect(page.locator('.log-level-pill[data-level="ANY"]')).not.toHaveClass(/active/);
    await expect(page.locator('.log-level-btn')).toContainText('Уровни ▼');
  });

  test('should have filter options (Regex, Case, Only)', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем наличие input фильтра
    const filterInput = page.locator('.log-filter-input');
    await expect(filterInput).toBeVisible();

    // Проверяем наличие чекбоксов
    await expect(page.locator('.log-filter-option').filter({ hasText: 'Regex' })).toBeVisible();
    await expect(page.locator('.log-filter-option').filter({ hasText: 'Case' })).toBeVisible();
    await expect(page.locator('.log-filter-option').filter({ hasText: 'Только' })).toBeVisible();

    // По умолчанию Regex включен
    const regexCheckbox = page.locator('input[id*="log-filter-regex"]');
    await expect(regexCheckbox).toBeChecked();

    // Case и Only выключены по умолчанию
    const caseCheckbox = page.locator('input[id*="log-filter-case"]');
    await expect(caseCheckbox).not.toBeChecked();

    const onlyCheckbox = page.locator('input[id*="log-filter-only"]');
    await expect(onlyCheckbox).not.toBeChecked();
  });

  test('should have buffer size selector', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем наличие селектора размера буфера
    const bufferSelect = page.locator('.log-buffer-select');
    await expect(bufferSelect).toBeVisible();

    // По умолчанию 2000
    await expect(bufferSelect).toHaveValue('2000');

    // Проверяем наличие опций
    const options = bufferSelect.locator('option');
    await expect(options).toHaveCount(5); // 500, 1000, 2000, 5000, 10000

    // Меняем на 5000
    await bufferSelect.selectOption('5000');
    await expect(bufferSelect).toHaveValue('5000');
  });

  test('should have download button', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем наличие кнопки скачивания
    const downloadBtn = page.locator('.log-download-btn');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toHaveText('⬇');
  });

  test('should have stats display', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Проверяем наличие элемента статистики (span может быть пустым изначально)
    const stats = page.locator('.log-stats');
    await expect(stats).toHaveCount(1);

    // Stats обновляется при добавлении строк - проверяем структуру
    // Элемент существует, текст появится при получении логов
    const statsId = await stats.getAttribute('id');
    expect(statsId).toContain('log-stats-TestProc');
  });

  test('should show match count when filtering', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    await page.waitForSelector('.logviewer-section', { timeout: 10000 });

    // Вводим текст в фильтр
    const filterInput = page.locator('.log-filter-input');
    await filterInput.fill('test');

    // Проверяем что счётчик совпадений появился (может быть 0 совп. т.к. логов нет)
    const matchCount = page.locator('.log-match-count');
    await expect(matchCount).toHaveText('0 совп.', { timeout: 2000 });

    // Очищаем фильтр
    await filterInput.fill('');

    // Счётчик должен исчезнуть
    await expect(matchCount).toHaveText('');
  });

});
