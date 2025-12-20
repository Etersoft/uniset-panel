const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    console.log('=== Тест Recording с Linear генератором ===\n');

    // Перехват запросов к recording API
    page.on('request', request => {
        if (request.url().includes('recording') || request.url().includes('export')) {
            console.log('>> REQUEST:', request.method(), request.url());
        }
    });

    page.on('response', async response => {
        if (response.url().includes('recording') || response.url().includes('export')) {
            const status = response.status();
            console.log('<< RESPONSE:', status, response.url());
            if (status === 200 && response.url().includes('status')) {
                try {
                    const body = await response.json();
                    console.log('   Body:', JSON.stringify(body));
                } catch (e) {}
            }
        }
    });

    // 1. Открываем страницу
    console.log('1. Открываем страницу...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // 2. Проверяем что recording UI видим
    console.log('\n2. Проверяем Recording UI...');
    const recordingStatus = page.locator('#recording-status');
    const isVisible = await recordingStatus.isVisible();
    console.log('   Recording UI видим:', isVisible);

    if (!isVisible) {
        console.log('   ОШИБКА: Recording UI не отображается!');
        await browser.close();
        return;
    }

    // 3. Проверяем начальный статус
    console.log('\n3. Проверяем начальный статус...');
    const initialStatus = await page.evaluate(async () => {
        const response = await fetch('/api/recording/status');
        return response.json();
    });
    console.log('   Статус:', JSON.stringify(initialStatus));
    console.log('   isRecording:', initialStatus.isRecording);
    console.log('   recordCount:', initialStatus.recordCount);

    // 4. Ищем IONC объект (IONotifyController) для генератора
    console.log('\n4. Ищем IONC объект для генератора...');

    // Получаем список всех объектов (grouped API)
    const allObjectsData = await page.evaluate(async () => {
        const response = await fetch('/api/all-objects');
        const data = await response.json();
        return data;
    });

    const allServers = allObjectsData.objects || [];
    console.log('   Доступные серверы:', allServers.length);

    // Ищем IONotifyController1 или SharedMemory на любом сервере
    let targetServer = null;
    let targetObject = null;
    let objectType = null;

    for (const server of allServers) {
        console.log(`   Сервер ${server.serverId}: ${server.objects?.length || 0} объектов, connected=${server.connected}`);
        if (!server.connected) continue;

        const objects = server.objects || [];

        // Приоритет 1: IONotifyController1
        const ionc = objects.find(o => o.includes('IONotifyController') && !o.includes('Activator'));
        if (ionc) {
            targetServer = server;
            targetObject = ionc;
            objectType = 'ionc';
            break;
        }

        // Приоритет 2: SharedMemory
        const sm = objects.find(o => o === 'SharedMemory');
        if (sm && !targetObject) {
            targetServer = server;
            targetObject = sm;
            objectType = 'sm';
        }
    }

    if (!targetObject) {
        console.log('   ОШИБКА: Не найден IONC объект для теста!');
        console.log('   Доступные объекты:', JSON.stringify(allServers, null, 2));
        await browser.close();
        return;
    }

    console.log(`   Выбран объект: ${targetObject} (тип: ${objectType}) на сервере ${targetServer.serverId}`);

    // 5. Открываем объект
    console.log('\n5. Открываем объект...');
    const objectLink = page.locator(`.server-group-objects li:has-text("${targetObject}")`).first();
    await objectLink.click();
    await page.waitForTimeout(3000);

    // 6. Подписываемся на IONC датчики
    console.log('\n6. Подписываемся на IONC датчики...');

    // Получаем serverId из вкладки
    const tabPanel = page.locator('.tab-panel').first();
    const tabKey = await tabPanel.getAttribute('data-name');
    const serverId = tabKey ? tabKey.split(':')[0] : null;
    console.log('   Server ID:', serverId);

    // Получаем список датчиков
    const sensorsResp = await page.evaluate(async (params) => {
        const resp = await fetch(`/api/objects/${params.objectName}/ionc/sensors?server=${params.serverId}&limit=20`);
        if (!resp.ok) return { error: resp.status };
        return resp.json();
    }, { objectName: targetObject, serverId });

    let sensorIds = [];
    let selectedSensor = null;

    if (sensorsResp.sensors && sensorsResp.sensors.length > 0) {
        // Выбираем первые 5 датчиков, которые не readonly
        const editableSensors = sensorsResp.sensors.filter(s => !s.readonly).slice(0, 5);
        sensorIds = editableSensors.map(s => s.id);
        selectedSensor = editableSensors[0];

        console.log('   Найдено датчиков:', sensorsResp.sensors.length);
        console.log('   Датчики для подписки:', sensorIds);
        console.log('   Датчик для генератора:', selectedSensor ? selectedSensor.name : 'нет');

        // Подписываемся на датчики
        const subResult = await page.evaluate(async (params) => {
            const resp = await fetch(`/api/objects/${params.objectName}/ionc/subscribe?server=${params.serverId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_ids: params.sensorIds })
            });
            return { ok: resp.ok, status: resp.status };
        }, { objectName: targetObject, serverId, sensorIds });

        console.log('   Подписка:', subResult.ok ? 'OK' : `Ошибка ${subResult.status}`);
    } else {
        console.log('   Нет датчиков для подписки');
    }

    await page.waitForTimeout(1000);

    // 7. Запускаем запись
    console.log('\n7. Запускаем запись...');
    const recordBtn = page.locator('#recording-toggle-btn');
    const btnText = await recordBtn.textContent();
    console.log('   Кнопка:', btnText);

    if (btnText === 'Record') {
        await recordBtn.click();
        await page.waitForTimeout(1500); // Даём время на ForceEmitAll
        console.log('   Запись запущена');
    } else {
        console.log('   Запись уже активна');
    }

    // 8. Проверяем начальные записи (от ForceEmitAll)
    console.log('\n8. Проверяем начальные записи (от ForceEmitAll)...');
    const afterStartStatus = await page.evaluate(async () => {
        const response = await fetch('/api/recording/status');
        return response.json();
    });
    console.log('   isRecording:', afterStartStatus.isRecording);
    console.log('   recordCount:', afterStartStatus.recordCount);

    if (afterStartStatus.recordCount > 0) {
        console.log('   ✓ Начальные значения сохранены (ForceEmitAll работает)!');
    } else {
        console.log('   ○ Начальных записей нет (возможно нет подписок)');
    }

    // 9. Получаем control access и запускаем linear генератор
    if (selectedSensor) {
        console.log('\n9. Получаем control access и запускаем linear генератор...');

        // Запрашиваем control access с токеном
        const controlResult = await page.evaluate(async () => {
            const resp = await fetch('/api/control/take', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: 'admin123' })  // from docker-compose
            });
            return { ok: resp.ok, status: resp.status };
        });
        console.log('   Control access:', controlResult.ok ? 'OK' : `Ошибка ${controlResult.status}`);

        console.log(`   Датчик: ${selectedSensor.name} (ID: ${selectedSensor.id})`);
        console.log(`   Текущее значение: ${selectedSensor.value}`);

        // Запускаем генератор через API setValue (симуляция linear генератора)
        const min = 0;
        const max = 100;
        const step = 10;
        const pause = 500; // ms
        const totalSteps = Math.ceil((max - min) / step);

        console.log(`   Параметры: min=${min}, max=${max}, step=${step}, pause=${pause}ms`);
        console.log(`   Будет сгенерировано ${totalSteps} значений`);

        // Генерируем несколько значений
        const controlToken = 'admin123';
        for (let i = 0; i <= totalSteps; i++) {
            const value = min + (i * step);
            const actualValue = Math.min(value, max);

            const setResult = await page.evaluate(async (params) => {
                const resp = await fetch(`/api/objects/${params.objectName}/ionc/set?server=${params.serverId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Control-Token': params.token
                    },
                    body: JSON.stringify({ sensor_id: params.sensorId, value: params.value })
                });
                return { ok: resp.ok, status: resp.status };
            }, { objectName: targetObject, serverId, sensorId: selectedSensor.id, value: actualValue, token: controlToken });

            if (setResult.ok) {
                console.log(`   Установлено значение: ${actualValue}`);
            } else {
                console.log(`   Ошибка установки значения: ${setResult.status}`);
                break;
            }

            await page.waitForTimeout(pause);
        }

        // Освобождаем control
        await page.evaluate(async () => {
            await fetch('/api/control/release', { method: 'POST' });
        });
    } else {
        console.log('\n9. Пропускаем генератор (нет доступного датчика)...');
        console.log('   Ждём 5 секунд для накопления данных...');
        await page.waitForTimeout(5000);
    }

    // 10. Проверяем количество записей
    console.log('\n10. Проверяем количество записей...');
    const afterGenStatus = await page.evaluate(async () => {
        const response = await fetch('/api/recording/status');
        return response.json();
    });
    console.log('   recordCount:', afterGenStatus.recordCount);
    console.log('   sizeBytes:', afterGenStatus.sizeBytes);

    if (afterGenStatus.recordCount > afterStartStatus.recordCount) {
        console.log('   ✓ Генератор работает - записи появляются!');
    } else if (afterGenStatus.recordCount > 0) {
        console.log('   ○ Записи есть, но генератор не добавил новых');
    } else {
        console.log('   ✗ Записей нет');
    }

    // 11. Тестируем экспорт JSON
    console.log('\n11. Тестируем экспорт JSON...');
    const jsonExport = await page.evaluate(async () => {
        const response = await fetch('/api/export/json');
        return response.json();
    });
    console.log('   Экспортировано записей:', jsonExport.count);
    if (jsonExport.records && jsonExport.records.length > 0) {
        console.log('   Пример записи:', JSON.stringify(jsonExport.records[0]));
        // Показываем уникальные переменные
        const uniqueVars = [...new Set(jsonExport.records.map(r => r.variable_name))];
        console.log('   Уникальные переменные:', uniqueVars.slice(0, 5).join(', '));
    }

    // 12. Тестируем экспорт CSV
    console.log('\n12. Тестируем экспорт CSV...');
    const csvExport = await page.evaluate(async () => {
        const response = await fetch('/api/export/csv');
        const text = await response.text();
        const lines = text.split('\n');
        return {
            totalLines: lines.length,
            header: lines[0],
            firstData: lines[1] || 'нет данных'
        };
    });
    console.log('   Всего строк:', csvExport.totalLines);
    console.log('   Заголовок:', csvExport.header);
    console.log('   Первая строка:', csvExport.firstData.substring(0, 100));

    // 13. Останавливаем запись
    console.log('\n13. Останавливаем запись...');
    const stopBtn = page.locator('#recording-toggle-btn');
    await stopBtn.click();
    await page.waitForTimeout(1000);

    const finalStatus = await page.evaluate(async () => {
        const response = await fetch('/api/recording/status');
        return response.json();
    });
    console.log('   isRecording:', finalStatus.isRecording);
    console.log('   Финальное количество записей:', finalStatus.recordCount);

    // 14. Тестируем скачивание SQLite
    console.log('\n14. Тестируем экспорт SQLite...');
    const dbResponse = await page.evaluate(async () => {
        const response = await fetch('/api/export/database');
        return {
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length')
        };
    });
    console.log('   Response OK:', dbResponse.ok);
    console.log('   Content-Type:', dbResponse.contentType);
    console.log('   Content-Length:', dbResponse.contentLength, 'bytes');

    // 15. Итоги
    console.log('\n=== Итоги теста ===');
    console.log('✓ Recording UI отображается');
    console.log(afterStartStatus.isRecording ? '✓ Запись запускается' : '✗ Запись не запустилась');
    console.log(afterStartStatus.recordCount > 0 ? '✓ ForceEmitAll работает (начальные значения)' : '○ Нет начальных записей');
    console.log(afterGenStatus.recordCount > afterStartStatus.recordCount ? '✓ Генератор создаёт записи' : '○ Генератор не создал записей');
    console.log(jsonExport.count >= 0 ? '✓ JSON экспорт работает' : '✗ JSON экспорт не работает');
    console.log(csvExport.totalLines > 1 ? '✓ CSV экспорт работает' : '○ CSV экспорт пустой');
    console.log(!finalStatus.isRecording ? '✓ Запись останавливается' : '✗ Запись не остановилась');
    console.log(`\nВсего записей: ${finalStatus.recordCount}`);

    console.log('\nТест завершён. Закрытие через 5 секунд...');
    await page.waitForTimeout(5000);
    await browser.close();
})();
