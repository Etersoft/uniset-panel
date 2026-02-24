// ============================================================================
// Конец LogViewer
// ============================================================================

// Цвета для графиков
const chartColors = [
    '#3274d9', '#73bf69', '#ff9830', '#f2495c',
    '#b877d9', '#5794f2', '#fade2a', '#ff6eb4'
];
let colorIndex = 0;

function getNextColor() {
    const color = chartColors[colorIndex % chartColors.length];
    colorIndex++;
    return color;
}

// API вызовы
async function fetchServers() {
    const response = await fetch('/api/servers');
    if (!response.ok) return null;
    return response.json();
}

async function fetchObjects() {
    // Загружаем список серверов
    const serversData = await fetchServers();
    if (!serversData || !serversData.servers) {
        throw new Error('Failed to load server list');
    }

    // Сохраняем кешированные объекты перед очисткой
    const cachedObjectsMap = new Map();
    state.servers.forEach((server, serverId) => {
        if (server.cachedObjects && server.cachedObjects.length > 0) {
            cachedObjectsMap.set(serverId, server.cachedObjects);
        }
    });

    state.servers.clear();
    // Сортируем серверы по полю order (backend задаёт порядок)
    const sortedServers = [...serversData.servers].sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedServers.forEach(server => {
        state.servers.set(server.id, {
            id: server.id,
            url: server.url,
            name: server.name || server.url,
            connected: server.connected,
            order: server.order || 0,
            cachedObjects: cachedObjectsMap.get(server.id) || [] // восстанавливаем кеш
        });
    });

    // Отображаем секцию серверов в sidebar
    renderServersSection();

    // Загружаем объекты со всех серверов
    const response = await fetch('/api/all-objects');
    if (!response.ok) throw new Error('Failed to load objects list');
    return response.json();
}

// Обновить список объектов (вызывается при восстановлении связи с сервером)
// Защита от конкурентных вызовов: повторный вызов во время выполнения запланирует ещё одно обновление
let _refreshObjectsInProgress = false;
let _refreshObjectsPending = false;

async function refreshObjectsList() {
    if (_refreshObjectsInProgress) {
        _refreshObjectsPending = true;
        return;
    }
    _refreshObjectsInProgress = true;
    try {
        const data = await fetchObjects();
        renderObjectsList(data);
        console.log('Список объектов обновлён');
    } catch (err) {
        console.error('Error обновления списка объектов:', err);
    } finally {
        _refreshObjectsInProgress = false;
        if (_refreshObjectsPending) {
            _refreshObjectsPending = false;
            refreshObjectsList();
        }
    }
}

async function fetchObjectData(name, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(name)}`;
    if (serverId) {
        url += `?server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load object data');
    return response.json();
}

async function watchObject(name, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(name)}/watch`;
    if (serverId) {
        url += `?server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to start watching');
    return response.json();
}

async function unwatchObject(name, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(name)}/watch`;
    if (serverId) {
        url += `?server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to stop watching');
    return response.json();
}

async function fetchVariableHistory(objectName, variableName, count = 100, serverId = null) {
    let url = `/api/objects/${encodeURIComponent(objectName)}/variables/${encodeURIComponent(variableName)}/history?count=${count}`;
    if (serverId) {
        url += `&server=${encodeURIComponent(serverId)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load history');
    return response.json();
}

async function fetchSensors(serverId) {
    const param = serverId ? `?server=${encodeURIComponent(serverId)}` : '';
    const response = await fetch(`/api/sensors${param}`);
    if (!response.ok) return { sensors: [], count: 0 };
    return response.json();
}

async function fetchSMSensors() {
    const response = await fetch('/api/sm/sensors');
    if (!response.ok) return { sensors: [], count: 0 };
    return response.json();
}

// Loading конфигурации сенсоров (per-server, вызывается после заполнения state.servers)
async function loadSensorsConfig() {
    try {
        let totalLoaded = 0;

        // Загружаем сенсоры для каждого известного сервера
        for (const [serverId] of state.servers) {
            const data = await fetchSensors(serverId);
            if (data.sensors && data.sensors.length > 0) {
                data.sensors.forEach(sensor => {
                    if (!state.sensorsByName.has(sensor.name)) {
                        state.sensors.set(sensor.id, sensor);
                        state.sensorsByName.set(sensor.name, sensor);
                        totalLoaded++;
                    }
                });
            }
        }

        // Если ничего не загрузилось, пробуем SharedMemory как fallback
        if (totalLoaded === 0) {
            console.log('Конфиг датчиков пуст, загружаю из SharedMemory...');
            const data = await fetchSMSensors();
            if (data.sensors) {
                data.sensors.forEach(sensor => {
                    state.sensors.set(sensor.id, sensor);
                    state.sensorsByName.set(sensor.name, sensor);
                });
            }
        }

        console.log(`Загружено ${state.sensors.size} сенсоров`);
    } catch (err) {
        console.error('Error загрузки конфигурации сенсоров:', err);
    }
}

// Получить информацию о сенсоре по ID или имени
function getSensorInfo(idOrName) {
    if (typeof idOrName === 'number') {
        return state.sensors.get(idOrName);
    }
    return state.sensorsByName.get(idOrName);
}

// Проверить, является ли сигнал дискретным
function isDiscreteSignal(sensor) {
    if (!sensor) return false;
    return sensor.isDiscrete === true || sensor.iotype === 'DI' || sensor.iotype === 'DO';
}

