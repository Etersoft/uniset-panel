// Общая функция обновления графиков из SSE batch-события
// items - массив элементов с полями name, value, supplier (опционально)
// prefix - префикс для varName (mb, ext, ws, io)
// options.showSupplier - обновлять ли supplier в легенде
function updateChartsFromBatch(tabKey, items, prefix, timestamp, options = {}) {
    const tabState = state.tabs.get(tabKey);
    if (!tabState) return;
    const ts = timestamp ? new Date(timestamp) : new Date();
    const chartsToUpdate = new Set();
    const displayName = tabState.displayName || '';
    for (const item of items) {
        const varName = `${prefix}:${item.name}`;
        const chartData = tabState.charts.get(varName);
        if (!chartData) continue;
        chartData.chart.data.datasets[0].data.push({ x: ts, y: item.value });
        chartsToUpdate.add(varName);
        // Обновляем значение в легенде
        const safeVarName = varName.replace(/:/g, '-');
        const legendEl = getElementInTab(tabKey, `legend-value-${displayName}-${safeVarName}`);
        if (legendEl) legendEl.textContent = formatValue(item.value);
        // Поставщик (опционально — для IONC, UWSGate)
        if (options.showSupplier) {
            const supplierEl = getElementInTab(tabKey, `legend-supplier-${displayName}-${safeVarName}`);
            if (supplierEl) supplierEl.textContent = item.supplier || '';
        }
    }
    if (chartsToUpdate.size > 0) {
        syncAllChartsTimeRange(tabKey);
        tabState.charts.forEach((chartData) => {
            const data = chartData.chart.data.datasets[0].data;
            while (data.length > MAX_CHART_POINTS) data.shift();
            chartData.chart.update('none');
        });
    }
}

function initSSE() {
    // Очищаем таймер переподключения (если есть)
    if (state.sse.reconnectTimerId) {
        clearTimeout(state.sse.reconnectTimerId);
        state.sse.reconnectTimerId = null;
    }

    if (state.sse.eventSource) {
        state.sse.eventSource.close();
    }

    // Формируем URL с токеном если есть
    let url = '/api/events';
    if (state.control.token) {
        url += `?token=${encodeURIComponent(state.control.token)}`;
    }
    console.log('SSE: Подключение к', url);

    const eventSource = new EventSource(url);
    state.sse.eventSource = eventSource;

    eventSource.addEventListener('connected', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.sse.connected = true;
            state.sse.reconnectAttempts = 0;
            state.sse.pollInterval = data.data?.pollInterval || 5000;

            // Сохраняем capabilities сервера
            state.capabilities.smEnabled = data.data?.smEnabled || false;
            console.log('SSE: Подключено, poll interval:', state.sse.pollInterval, 'ms, smEnabled:', state.capabilities.smEnabled);

            // Обновляем статус контроля
            if (data.data?.control) {
                updateControlStatus(data.data.control);
                // Если мы контроллер, запускаем ping
                if (state.control.isController) {
                    startControlPing();
                }
            }

            // Обновляем индикатор статуса
            updateSSEStatus('connected', new Date());

            // Обновляем доступность кнопок "Add sensor"
            updateAddSensorButtons();

            // Синхронизируем статусы серверов при переподключении
            // Это важно, т.к. могли пропустить события server_status во время отключения
            refreshObjectsList();

            // Переподписываемся на все SSE обновления (сервер мог потерять состояние подписок)
            setTimeout(resubscribeAll, SSE_RESUBSCRIBE_DELAY);

            // Отключаем polling fallback если был активен
            disablePollingFallback();

            // Запускаем периодическую синхронизацию статуса серверов
            // (ловит пропущенные server_status SSE-события)
            startServerStatusSync();

            // Обновляем статусы в sidebar группах
            if (typeof applySidebarStatuses === 'function') {
                applySidebarStatuses();
            }
        } catch (err) {
            console.warn('SSE: Error парсинга connected:', err);
        }
    });

    eventSource.addEventListener('object_data', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId, data, timestamp } = event;

            // Обновляем время последнего обновления в индикаторе
            updateSSEStatus('connected', new Date());

            // Формируем ключ вкладки: serverId:objectName
            const tabKey = `${serverId}:${objectName}`;

            // Обновляем UI только для открытых вкладок
            const tabState = state.tabs.get(tabKey);
            if (tabState) {
                // Обновляем рендерер (таблицы, статистика и т.д.)
                if (tabState.renderer) {
                    tabState.renderer.update(data);
                }

                // Обновляем графики напрямую из SSE данных (без запроса истории)
                const eventTimestamp = new Date(timestamp);
                tabState.charts.forEach((chartData, varName) => {
                    // Пропускаем внешние датчики (ext:) - они обновляются через sensor_data
                    if (varName.startsWith('ext:')) {
                        return;
                    }

                    // Извлекаем значение из data в зависимости от типа переменной
                    let value = undefined;

                    // Проверяем io.in.* переменные
                    if (varName.startsWith('io.in.')) {
                        const ioKey = varName.substring('io.in.'.length);
                        if (data.io?.in?.[ioKey]) {
                            value = data.io.in[ioKey].value;
                        }
                    }
                    // Проверяем io.out.* переменные
                    else if (varName.startsWith('io.out.')) {
                        const ioKey = varName.substring('io.out.'.length);
                        if (data.io?.out?.[ioKey]) {
                            value = data.io.out[ioKey].value;
                        }
                    }

                    // Если нашли значение - добавляем точку на график
                    if (value !== undefined) {
                        const dataPoint = { x: eventTimestamp, y: value };
                        chartData.chart.data.datasets[0].data.push(dataPoint);

                        // Ограничиваем количество точек
                        if (chartData.chart.data.datasets[0].data.length > MAX_CHART_POINTS) {
                            chartData.chart.data.datasets[0].data.shift();
                        }
                    }
                });

                // Синхронизируем временную шкалу для всех графиков объекта
                syncAllChartsTimeRange(tabKey);

                // Обновляем все графики одним batch update
                tabState.charts.forEach((chartData, varName) => {
                    if (!varName.startsWith('ext:')) {
                        chartData.chart.update('none');
                    }
                });
            }
        } catch (err) {
            console.warn('SSE: Error обработки object_data:', err);
        }
    });

    // Обработка обновлений внешних датчиков из SM (SharedMemory)
    // Backend отправляет serverId="sm" для SM событий
    eventSource.addEventListener('sensor_data', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensor = event.data;

            // Формируем tabKey из serverId и objectName
            const tabKey = serverId
                ? `${serverId}:${objectName}`
                : findTabKeyByDisplayName(objectName); // fallback для legacy
            if (!tabKey) return;

            // Обновляем график (одиночный сенсор — оборачиваем в массив)
            updateChartsFromBatch(tabKey, [sensor], 'ext', event.timestamp);
        } catch (err) {
            console.warn('SSE: Error обработки sensor_data:', err);
        }
    });

    // Обработка батча обновлений IONC датчиков (SharedMemory и подобные)
    eventSource.addEventListener('ionc_sensor_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensors = event.data;

            // Cache sensor values for dashboard initialization
            const now = Date.now();
            for (const sensor of sensors) {
                state.sensorValuesCache.set(sensor.name, {
                    value: sensor.value,
                    error: sensor.error || null,
                    timestamp: now
                });
            }

            // Обновляем виджеты на dashboard
            updateDashboardWidgets(sensors, event.timestamp || null);

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            // Обновляем таблицу датчиков
            for (const sensor of sensors) {
                if (tabState.renderer?.handleIONCSensorUpdate) {
                    tabState.renderer.handleIONCSensorUpdate(sensor);
                }
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, sensors, 'io', event.timestamp, { showSupplier: true });
        } catch (err) {
            console.warn('SSE: Error обработки ionc_sensor_batch:', err);
        }
    });

    // Обработка батча обновлений Modbus регистров (ModbusMaster, ModbusSlave)
    eventSource.addEventListener('modbus_register_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const registers = event.data;

            updateDashboardWidgets(registers, event.timestamp);

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            const renderer = tabState.renderer;
            if (!renderer) return;
            const isMaster = renderer.constructor.name === 'ModbusMasterRenderer';
            const isSlave = renderer.constructor.name === 'ModbusSlaveRenderer';
            if (!isMaster && !isSlave) return;

            // Обновляем таблицу регистров
            if (typeof renderer.handleModbusRegisterUpdates === 'function') {
                renderer.handleModbusRegisterUpdates(registers);
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, registers, 'mb', event.timestamp);
        } catch (err) {
            console.warn('SSE: Error обработки modbus_register_batch:', err);
        }
    });

    // Обработка батча обновлений OPCUA датчиков (OPCUAExchange, OPCUAServer)
    eventSource.addEventListener('opcua_sensor_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensors = event.data;

            updateDashboardWidgets(sensors, event.timestamp);

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            const renderer = tabState.renderer;
            const isExchange = renderer && renderer.constructor.name === 'OPCUAExchangeRenderer';
            const isServer = renderer && renderer.constructor.name === 'OPCUAServerRenderer';
            if (!isExchange && !isServer) return;

            // Обновляем таблицу датчиков
            if (typeof renderer.handleOPCUASensorUpdates === 'function') {
                renderer.handleOPCUASensorUpdates(sensors);
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, sensors, 'ext', event.timestamp);
        } catch (err) {
            console.warn('SSE: Error обработки opcua_sensor_batch:', err);
        }
    });

    // Обработка батча обновлений UWebSocketGate датчиков
    eventSource.addEventListener('uwsgate_sensor_batch', (e) => {
        try {
            const event = JSON.parse(e.data);
            const { objectName, serverId } = event;
            const sensors = event.data;

            updateDashboardWidgets(sensors, event.timestamp);

            const tabKey = `${serverId}:${objectName}`;
            const tabState = state.tabs.get(tabKey);
            if (!tabState) return;

            const renderer = tabState.renderer;
            if (!renderer || renderer.constructor.name !== 'UWebSocketGateRenderer') return;

            // Обновляем таблицу датчиков
            if (typeof renderer.handleSSEUpdate === 'function') {
                renderer.handleSSEUpdate(sensors);
            }

            // Обновляем графики
            updateChartsFromBatch(tabKey, sensors, 'ws', event.timestamp, { showSupplier: true });
        } catch (err) {
            console.warn('SSE: Error обработки uwsgate_sensor_batch:', err);
        }
    });

    // Обработка изменений статуса серверов
    eventSource.addEventListener('server_status', (e) => {
        try {
            const event = JSON.parse(e.data);
            const serverId = event.serverId;
            const connected = event.data?.connected ?? false;
            console.log(`SSE: Сервер ${serverId} ${connected ? 'подключен' : 'отключен'}`);
            updateServerStatus(serverId, connected);
        } catch (err) {
            console.warn('SSE: Error обработки server_status:', err);
        }
    });

    // Обработка обновления списка объектов (при восстановлении связи)
    eventSource.addEventListener('objects_list', (e) => {
        try {
            const event = JSON.parse(e.data);
            const serverId = event.serverId;
            const serverName = event.serverName;
            const objects = event.data?.objects ?? [];
            console.log(`SSE: Сервер ${serverId} восстановил связь, объектов: ${objects.length}`);

            // Обновляем статус сервера
            updateServerStatus(serverId, true);

            // Обновляем список объектов в sidebar
            refreshObjectsList();

            // Обновляем sidebar группы (могли появиться новые объекты)
            if (typeof refreshSidebarGroups === 'function') {
                refreshSidebarGroups();
            }
        } catch (err) {
            console.warn('SSE: Error обработки objects_list:', err);
        }
    });

    // Обработка изменения статуса контроля
    eventSource.addEventListener('control_status', (e) => {
        try {
            const event = JSON.parse(e.data);
            console.log('SSE: Control status changed:', event.data);
            // Обновляем isController на основе нашего токена
            const status = event.data;
            status.isController = state.control.token &&
                status.hasController &&
                state.control.isController; // сохраняем если мы были контроллером

            // Сервер не знает чей это токен, нужно запросить статус
            fetch('/api/control/status', {
                headers: { 'X-Control-Token': state.control.token || '' }
            })
                .then(r => r.json())
                .then(data => {
                    updateControlStatus(data);
                })
                .catch(err => {
                    console.warn('Failed to refresh control status:', err);
                    // Fallback: используем данные из события
                    updateControlStatus(status);
                });
        } catch (err) {
            console.warn('SSE: Error обработки control_status:', err);
        }
    });

    // Обработка статуса Launcher'а
    eventSource.addEventListener('launcher_status', (e) => {
        try {
            const event = JSON.parse(e.data);
            const tabKey = `launcher:${event.serverId}`;
            const tabState = state.tabs.get(tabKey);
            if (tabState?.renderer?.updateStatus) {
                tabState.renderer.updateStatus(event.data);
            }
            // Обновляем индикатор в sidebar
            updateLauncherNodeStatus(event.serverId, true);
        } catch (err) {
            console.warn('SSE: Error обработки launcher_status:', err);
        }
    });

    // Обработка connectivity Launcher'а
    eventSource.addEventListener('launcher_connection', (e) => {
        try {
            const event = JSON.parse(e.data);
            const connected = event.data?.connected ?? false;
            updateLauncherNodeStatus(event.serverId, connected);

            // Обновляем renderer если вкладка открыта
            const tabKey = `launcher:${event.serverId}`;
            const tabState = state.tabs.get(tabKey);
            if (tabState?.renderer?.updateConnectionStatus) {
                tabState.renderer.updateConnectionStatus(connected);
            }
        } catch (err) {
            console.warn('SSE: Error обработки launcher_connection:', err);
        }
    });

    // Обработка изменения connectivity журнала
    eventSource.addEventListener('journal_connection', (e) => {
        try {
            const event = JSON.parse(e.data);
            const journalId = event.data?.journalId;
            const connected = event.data?.connected ?? false;
            if (journalId && typeof updateJournalConnectionStatus === 'function') {
                updateJournalConnectionStatus(journalId, connected);
            }
        } catch (err) {
            console.warn('SSE: Error обработки journal_connection:', err);
        }
    });

    // Обработка сообщений журнала
    eventSource.addEventListener('journal_messages', (e) => {
        try {
            const event = JSON.parse(e.data);
            const data = event.data;
            if (data && journalManager) {
                journalManager.handleSSEMessage(data);
            }
        } catch (err) {
            console.warn('SSE: Error обработки journal_messages:', err);
        }
    });

    eventSource.onerror = (e) => {
        console.warn('SSE: Error соединения');
        state.sse.connected = false;
        stopServerStatusSync();

        // Закрываем EventSource чтобы предотвратить нативный auto-reconnect браузера,
        // который стреляет дополнительными onerror и быстро расходует счётчик попыток
        // (аналогично handleConnectionError в LogViewer)
        if (state.sse.eventSource) {
            state.sse.eventSource.close();
            state.sse.eventSource = null;
        }

        if (state.sse.reconnectAttempts < state.sse.maxReconnectAttempts) {
            state.sse.reconnectAttempts++;
            // Exponential backoff: baseDelay * 2^(attempt-1) с jitter ±10%
            const expDelay = state.sse.baseReconnectDelay * Math.pow(2, state.sse.reconnectAttempts - 1);
            const cappedDelay = Math.min(expDelay, state.sse.maxReconnectDelay);
            const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1); // ±10%
            const delay = Math.round(cappedDelay + jitter);
            console.log(`SSE: Переподключение через ${delay}ms (попытка ${state.sse.reconnectAttempts}/${state.sse.maxReconnectAttempts})`);
            updateSSEStatus('reconnecting');
            state.sse.reconnectTimerId = setTimeout(initSSE, delay);
        } else {
            console.warn('SSE: Превышено количество попыток, переход на polling');
            updateSSEStatus('polling');
            enablePollingFallback();
        }
    };

    eventSource.onopen = () => {
        console.log('SSE: Соединение открыто');
    };
}

// Включить polling как fallback при недоступности SSE
function enablePollingFallback() {
    console.log('Polling: Включение fallback режима');

    // Периодически обновляем sidebar (статусы серверов и список объектов)
    state.sse.sidebarPollInterval = setInterval(() => {
        refreshObjectsList();
    }, state.sse.pollInterval * 6); // Реже чем данные объектов

    state.tabs.forEach((tabState, tabKey) => {
        // Включаем polling для данных объекта
        if (!tabState.updateInterval) {
            tabState.updateInterval = setInterval(
                () => loadObjectData(tabKey),
                state.sse.pollInterval
            );
            console.log('Polling: Включен для', tabState.displayName, '(tab:', tabKey, ')');
        }

        // Включаем polling для графиков
        const displayName = tabState.displayName;
        tabState.charts.forEach((chartData, varName) => {
            if (!chartData.updateInterval) {
                chartData.updateInterval = setInterval(async () => {
                    await updateChart(displayName, varName, chartData.chart);
                }, state.sse.pollInterval);
            }
        });
    });

    // Запускаем периодическую проверку доступности SSE
    startSSERecoveryProbe();
}

// Отключить polling fallback (при восстановлении SSE)
function disablePollingFallback() {
    console.log('Polling: Отключение fallback режима');

    // Останавливаем polling sidebar
    if (state.sse.sidebarPollInterval) {
        clearInterval(state.sse.sidebarPollInterval);
        state.sse.sidebarPollInterval = null;
    }

    // Останавливаем recovery probe
    if (state.sse.recoveryProbeInterval) {
        clearInterval(state.sse.recoveryProbeInterval);
        state.sse.recoveryProbeInterval = null;
    }

    // Очищаем таймер переподключения
    if (state.sse.reconnectTimerId) {
        clearTimeout(state.sse.reconnectTimerId);
        state.sse.reconnectTimerId = null;
    }

    // Останавливаем polling для всех вкладок
    state.tabs.forEach((tabState, tabKey) => {
        if (tabState.updateInterval) {
            clearInterval(tabState.updateInterval);
            tabState.updateInterval = null;
        }
        tabState.charts.forEach((chartData) => {
            if (chartData.updateInterval) {
                clearInterval(chartData.updateInterval);
                chartData.updateInterval = null;
            }
        });
    });
}

// Периодическая проверка доступности сервера для восстановления SSE
function startSSERecoveryProbe() {
    if (state.sse.recoveryProbeInterval) return;

    console.log('SSE: Запуск recovery probe каждые', SSE_RECOVERY_PROBE_INTERVAL, 'ms');

    state.sse.recoveryProbeInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/version', { method: 'HEAD' });
            if (response.ok) {
                console.log('SSE: Сервер доступен, восстанавливаем SSE');
                disablePollingFallback();
                state.sse.reconnectAttempts = 0;
                initSSE();
            }
        } catch (err) {
            // Сервер всё ещё недоступен
        }
    }, SSE_RECOVERY_PROBE_INTERVAL);
}

// Периодическая синхронизация статуса серверов, launcher'ов и журналов (каждые 30с)
function startServerStatusSync() {
    stopServerStatusSync();
    state.sse.statusSyncInterval = setInterval(async () => {
        // Серверы
        try {
            const resp = await fetchServers();
            if (resp?.servers) {
                resp.servers.forEach(s => updateServerStatus(s.id, s.connected));
            }
        } catch (err) { /* фоновая синхронизация */ }

        // Launcher'ы
        try {
            const lr = await fetch('/api/launchers');
            if (lr.ok) {
                const data = await lr.json();
                (data?.launchers || []).forEach(l => updateLauncherNodeStatus(l.id, l.connected));
            }
        } catch (err) { /* фоновая синхронизация */ }

        // Журналы
        try {
            const jr = await fetch('/api/journals');
            if (jr.ok) {
                const data = await jr.json();
                if (typeof updateJournalConnectionStatus === 'function') {
                    (data || []).forEach(j => updateJournalConnectionStatus(j.id, j.connected));
                }
            }
        } catch (err) { /* фоновая синхронизация */ }
    }, SSE_RECOVERY_PROBE_INTERVAL);
}

function stopServerStatusSync() {
    if (state.sse.statusSyncInterval) {
        clearInterval(state.sse.statusSyncInterval);
        state.sse.statusSyncInterval = null;
    }
}

// Переподписка всех открытых вкладок после восстановления SSE
function resubscribeAll() {
    console.log('SSE: Переподписка всех вкладок после переподключения');
    state.tabs.forEach((tabState, tabKey) => {
        const renderer = tabState.renderer;
        if (renderer?.resubscribeIfNeeded) {
            renderer.resubscribeIfNeeded();
        }
    });
}

// Close SSE соединение
function closeSSE() {
    stopServerStatusSync();
    if (state.sse.eventSource) {
        state.sse.eventSource.close();
        state.sse.eventSource = null;
        state.sse.connected = false;
    }
}

