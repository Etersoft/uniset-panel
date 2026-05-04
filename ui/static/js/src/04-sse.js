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
        // Обрезаем данные только у обновлённых графиков
        chartsToUpdate.forEach(varName => {
            const chartData = tabState.charts.get(varName);
            if (!chartData) return;
            const data = chartData.chart.data.datasets[0].data;
            while (data.length > MAX_CHART_POINTS) data.shift();
        });
        // Пропускаем отрисовку если на паузе (данные уже накоплены выше)
        if (!tabState.chartsPaused) {
            syncAllChartsTimeRange(tabKey);
        }
    }
}

function sanitizeEventSourceUrlForLog(url) {
    return String(url).replace(/([?&]token=)[^&]*/g, '$1[redacted]');
}

// Lookup-таблица обработчиков SSE событий. Каждый handler получает уже
// распарсенный payload (event) и работает с ним. JSON.parse + try/catch +
// console.warn boilerplate унесён в _attachSseHandlers ниже — раньше эти
// 14 строк повторялись на каждый listener, а unified obrabotka позволяет
// единообразно фильтровать debug log / отправлять метрики.
//
// `connected` обработчик НЕ здесь — он делает много setup'а (resubscribe /
// polling fallback / sidebar refresh) и завязан на eventSource lifecycle.
const _sseHandlers = {
    object_data: (event) => {
        const { objectName, serverId, data, timestamp } = event;

        // Обновляем время последнего обновления в индикаторе
        updateSSEStatus('connected', new Date());

        const tabKey = `${serverId}:${objectName}`;
        const tabState = state.tabs.get(tabKey);
        if (!tabState) return;

        // Обновляем рендерер (таблицы, статистика и т.д.)
        if (tabState.renderer) {
            tabState.renderer.update(data);
        }

        // Обновляем графики напрямую из SSE данных (данные копятся всегда, отрисовка — если не на паузе)
        const eventTimestamp = new Date(timestamp);
        tabState.charts.forEach((chartData, varName) => {
            // Пропускаем внешние датчики (ext:) - они обновляются через sensor_data
            if (varName.startsWith('ext:')) return;

            // Извлекаем значение из data в зависимости от типа переменной
            let value = undefined;
            if (varName.startsWith('io.in.')) {
                const ioKey = varName.substring('io.in.'.length);
                if (data.io?.in?.[ioKey]) value = data.io.in[ioKey].value;
            } else if (varName.startsWith('io.out.')) {
                const ioKey = varName.substring('io.out.'.length);
                if (data.io?.out?.[ioKey]) value = data.io.out[ioKey].value;
            }

            if (value !== undefined) {
                chartData.chart.data.datasets[0].data.push({ x: eventTimestamp, y: value });
                if (chartData.chart.data.datasets[0].data.length > MAX_CHART_POINTS) {
                    chartData.chart.data.datasets[0].data.shift();
                }
            }
        });

        // Пропускаем отрисовку если на паузе (данные уже накоплены выше)
        if (tabState.chartsPaused) return;

        syncAllChartsTimeRange(tabKey);

        tabState.charts.forEach((chartData, varName) => {
            if (!varName.startsWith('ext:')) {
                chartData.chart.update('none');
            }
        });
    },

    // Backend отправляет serverId="sm" для SM событий
    sensor_data: (event) => {
        const { objectName, serverId } = event;
        const sensor = event.data;
        const tabKey = serverId
            ? `${serverId}:${objectName}`
            : findTabKeyByDisplayName(objectName); // fallback для legacy
        if (!tabKey) return;
        // Одиночный сенсор — оборачиваем в массив для общего batch-helper'а.
        updateChartsFromBatch(tabKey, [sensor], 'ext', event.timestamp);
    },

    ionc_sensor_batch: (event) => {
        const { objectName, serverId } = event;
        const sensors = event.data;

        // Cache sensor values for dashboard initialization (по sensorKey).
        const now = Date.now();
        for (const sensor of sensors) {
            const key = makeSensorKey(serverId, objectName, sensor.name);
            state.sensorValuesCache.set(key, {
                value: sensor.value,
                error: sensor.error || null,
                timestamp: now
            });
        }

        // Обновляем виджеты на dashboard (с контекстом для построения sensorKey).
        updateDashboardWidgets(sensors, { serverId, objectName, timestamp: event.timestamp || null });

        const tabKey = `${serverId}:${objectName}`;
        const tabState = state.tabs.get(tabKey);
        if (!tabState) return;

        for (const sensor of sensors) {
            if (tabState.renderer?.handleIONCSensorUpdate) {
                tabState.renderer.handleIONCSensorUpdate(sensor);
            }
        }

        updateChartsFromBatch(tabKey, sensors, 'io', event.timestamp, { showSupplier: true });
    },

    modbus_register_batch: (event) => {
        const { objectName, serverId } = event;
        const registers = event.data;

        updateDashboardWidgets(registers, { serverId, objectName, timestamp: event.timestamp || null });

        const tabKey = `${serverId}:${objectName}`;
        const tabState = state.tabs.get(tabKey);
        if (!tabState) return;

        const renderer = tabState.renderer;
        if (!renderer) return;
        const isMaster = renderer.constructor.name === 'ModbusMasterRenderer';
        const isSlave = renderer.constructor.name === 'ModbusSlaveRenderer';
        if (!isMaster && !isSlave) return;

        if (typeof renderer.handleModbusRegisterUpdates === 'function') {
            renderer.handleModbusRegisterUpdates(registers);
        }

        updateChartsFromBatch(tabKey, registers, 'mb', event.timestamp);
    },

    opcua_sensor_batch: (event) => {
        const { objectName, serverId } = event;
        const sensors = event.data;

        updateDashboardWidgets(sensors, { serverId, objectName, timestamp: event.timestamp || null });

        const tabKey = `${serverId}:${objectName}`;
        const tabState = state.tabs.get(tabKey);
        if (!tabState) return;

        const renderer = tabState.renderer;
        const isExchange = renderer && renderer.constructor.name === 'OPCUAExchangeRenderer';
        const isServer   = renderer && renderer.constructor.name === 'OPCUAServerRenderer';
        if (!isExchange && !isServer) return;

        if (typeof renderer.handleOPCUASensorUpdates === 'function') {
            renderer.handleOPCUASensorUpdates(sensors);
        }

        updateChartsFromBatch(tabKey, sensors, 'ext', event.timestamp);
    },

    uwsgate_sensor_batch: (event) => {
        const { objectName, serverId } = event;
        const sensors = event.data;

        updateDashboardWidgets(sensors, { serverId, objectName, timestamp: event.timestamp || null });

        const tabKey = `${serverId}:${objectName}`;
        const tabState = state.tabs.get(tabKey);
        if (!tabState) return;

        const renderer = tabState.renderer;
        if (!renderer || renderer.constructor.name !== 'UWebSocketGateRenderer') return;

        if (typeof renderer.handleSSEUpdate === 'function') {
            renderer.handleSSEUpdate(sensors);
        }

        updateChartsFromBatch(tabKey, sensors, 'ws', event.timestamp, { showSupplier: true });
    },

    server_status: (event) => {
        const serverId = event.serverId;
        const connected = event.data?.connected ?? false;
        debugLog(`SSE: server ${serverId} ${connected ? 'connected' : 'disconnected'}`);
        updateServerStatus(serverId, connected);
    },

    objects_list: (event) => {
        const serverId = event.serverId;
        const objects = event.data?.objects ?? [];
        debugLog(`SSE: server ${serverId} restored connection, objects: ${objects.length}`);
        updateServerStatus(serverId, true);
        refreshObjectsList();
        if (typeof refreshSidebarGroups === 'function') {
            refreshSidebarGroups();
        }
    },

    control_status: async (event) => {
        debugLog('SSE: control status changed:', event.data);
        const status = event.data;
        // Сохраняем isController если мы были контроллером — сервер не знает чей это токен.
        status.isController = state.control.token &&
            status.hasController &&
            state.control.isController;
        try {
            const resp = await fetch('/api/control/status', {
                headers: { 'X-Control-Token': state.control.token || '' }
            });
            const data = await resp.json();
            updateControlStatus(data);
        } catch (err) {
            console.warn('Failed to refresh control status:', err);
            updateControlStatus(status);
        }
    },

    launcher_status: (event) => {
        const tabKey = `launcher:${event.serverId}`;
        const tabState = state.tabs.get(tabKey);
        if (tabState?.renderer?.updateStatus) {
            tabState.renderer.updateStatus(event.data);
        }
        updateLauncherNodeStatus(event.serverId, true);
    },

    launcher_connection: (event) => {
        const connected = event.data?.connected ?? false;
        updateLauncherNodeStatus(event.serverId, connected);
        const tabKey = `launcher:${event.serverId}`;
        const tabState = state.tabs.get(tabKey);
        if (tabState?.renderer?.updateConnectionStatus) {
            tabState.renderer.updateConnectionStatus(connected);
        }
    },

    journal_connection: (event) => {
        const journalId = event.data?.journalId;
        const connected = event.data?.connected ?? false;
        if (journalId && typeof updateJournalConnectionStatus === 'function') {
            updateJournalConnectionStatus(journalId, connected);
        }
    },

    journal_messages: (event) => {
        const data = event.data;
        if (data && journalManager) {
            journalManager.handleSSEMessage(data);
        }
    },
};

// Подписаться на все события из _sseHandlers с единым try/catch + JSON.parse boilerplate'ом.
function _attachSseHandlers(eventSource) {
    for (const [evtName, handler] of Object.entries(_sseHandlers)) {
        eventSource.addEventListener(evtName, async (e) => {
            let payload;
            try {
                payload = JSON.parse(e.data);
            } catch (err) {
                console.warn(`SSE: failed to parse ${evtName} payload:`, err);
                return;
            }
            try {
                await handler(payload);
            } catch (err) {
                console.warn(`SSE: error handling ${evtName}:`, err);
            }
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
    debugLog('SSE: Подключение к', sanitizeEventSourceUrlForLog(url));

    const eventSource = new EventSource(url);
    state.sse.eventSource = eventSource;

    eventSource.addEventListener('connected', (e) => {
        try {
            const data = JSON.parse(e.data);
            state.sse.connected = true;
            state.sse.reconnectAttempts = 0;
            state.sse.pollInterval = data.data?.pollInterval || SSE_DEFAULT_POLL_INTERVAL;

            // Сохраняем capabilities сервера
            state.capabilities.smEnabled = data.data?.smEnabled || false;
            debugLog('SSE: Подключено, poll interval:', state.sse.pollInterval, 'ms, smEnabled:', state.capabilities.smEnabled);

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
            console.warn('SSE: error handling connected:', err);
        }
    });

    // Все остальные SSE события — единый attach через _sseHandlers lookup.
    _attachSseHandlers(eventSource);

    eventSource.onerror = (e) => {
        console.warn('SSE: connection error');
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
            // Exponential backoff: baseDelay * 2^(attempt-1) с jitter ±SSE_RECONNECT_JITTER_RATIO
            const expDelay = state.sse.baseReconnectDelay * Math.pow(2, state.sse.reconnectAttempts - 1);
            const cappedDelay = Math.min(expDelay, state.sse.maxReconnectDelay);
            const jitter = cappedDelay * SSE_RECONNECT_JITTER_RATIO * (Math.random() * 2 - 1);
            const delay = Math.round(cappedDelay + jitter);
            debugLog(`SSE: Переподключение через ${delay}ms (попытка ${state.sse.reconnectAttempts}/${state.sse.maxReconnectAttempts})`);
            updateSSEStatus('reconnecting');
            state.sse.reconnectTimerId = setTimeout(initSSE, delay);
        } else {
            console.warn('SSE: Превышено количество попыток, переход на polling');
            updateSSEStatus('polling');
            enablePollingFallback();
        }
    };

    eventSource.onopen = () => {
        debugLog('SSE: Соединение открыто');
    };
}

// Включить polling как fallback при недоступности SSE
function enablePollingFallback() {
    debugLog('Polling: Включение fallback режима');

    // Периодически обновляем sidebar (статусы серверов и список объектов).
    // Реже чем данные объектов — это служебная синхронизация sidebar UI.
    state.sse.sidebarPollInterval = setInterval(() => {
        refreshObjectsList();
    }, state.sse.pollInterval * SSE_SIDEBAR_POLL_MULTIPLIER);

    state.tabs.forEach((tabState, tabKey) => {
        // Включаем polling для данных объекта
        if (!tabState.updateInterval) {
            tabState.updateInterval = setInterval(
                () => loadObjectData(tabKey),
                state.sse.pollInterval
            );
            debugLog('Polling: Включен для', tabState.displayName, '(tab:', tabKey, ')');
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
    debugLog('Polling: Отключение fallback режима');

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

    debugLog('SSE: Запуск recovery probe каждые', SSE_RECOVERY_PROBE_INTERVAL, 'ms');

    state.sse.recoveryProbeInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/version', { method: 'HEAD' });
            if (response.ok) {
                debugLog('SSE: Сервер доступен, восстанавливаем SSE');
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
        // Все три запроса (серверы / launcher'ы / журналы) независимы — гоним
        // параллельно через Promise.allSettled, фоновая ошибка одного не должна
        // мешать остальным.
        await Promise.allSettled([
            (async () => {
                const resp = await fetchServers();
                if (resp?.servers) {
                    resp.servers.forEach(s => updateServerStatus(s.id, s.connected));
                }
            })(),
            (async () => {
                const lr = await fetch('/api/launchers');
                if (!lr.ok) return;
                const data = await lr.json();
                (data?.launchers || []).forEach(l => updateLauncherNodeStatus(l.id, l.connected));
            })(),
            (async () => {
                const jr = await fetch('/api/journals');
                if (!jr.ok) return;
                const data = await jr.json();
                if (typeof updateJournalConnectionStatus === 'function') {
                    (data || []).forEach(j => updateJournalConnectionStatus(j.id, j.connected));
                }
            })(),
        ]);
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
    debugLog('SSE: Переподписка всех вкладок после переподключения');
    state.tabs.forEach((tabState, tabKey) => {
        const renderer = tabState.renderer;
        if (renderer?.resubscribeIfNeeded) {
            renderer.resubscribeIfNeeded();
        }
    });
}

// Обновление графиков при возврате на вкладку браузера
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        state.tabs.forEach((tabState, tabKey) => {
            if (tabState.charts && tabState.charts.size > 0) {
                tabState.charts.forEach((chartData, varName) => {
                    if (chartData.chart) {
                        try {
                            syncAllChartsTimeRange(tabKey);
                            chartData.chart.update();
                        } catch (err) {
                            console.warn('Chart visibility update error:', varName, err);
                        }
                    }
                });
            }
        });
    }
});
