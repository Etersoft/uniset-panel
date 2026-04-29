// ============================================================================
// Конец LogViewer
// ============================================================================

// Цвета для графиков
const CHART_COLORS = [
    '#3274d9', '#73bf69', '#ff9830', '#f2495c',
    '#b877d9', '#5794f2', '#fade2a', '#ff6eb4'
];
let colorIndex = 0;

function getNextColor() {
    const color = CHART_COLORS[colorIndex % CHART_COLORS.length];
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
                    // sensor.supplier — owning object (типично "SharedMemory");
                    // если backend не вернул — fallback. Это не идеально для
                    // cross-object одинаковых имён, но лучшее, что есть из
                    // /api/sensors response сейчас.
                    const objectName = sensor.supplier || 'SharedMemory';
                    const key = makeSensorKey(serverId, objectName, sensor.name);
                    state.sensorsByKey.set(key, sensor);
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
                    // SM events идут с serverId='sm' (см. SM_SERVER_ID).
                    const key = makeSensorKey(SM_SERVER_ID, 'SharedMemory', sensor.name);
                    state.sensorsByKey.set(key, sensor);
                });
            }
        }

        console.log(`Загружено ${state.sensors.size} сенсоров`);
    } catch (err) {
        console.error('Error загрузки конфигурации сенсоров:', err);
    }
}

// Получить информацию о сенсоре по ID или имени.
// На multi-server панели возвращает первый встретившийся sensor с этим именем
// (см. комментарий к state.sensorsByName). Для multi-server-точного lookup
// используй getSensorInfoByKey(serverId, objectName, sensorName).
function getSensorInfo(idOrName) {
    if (typeof idOrName === 'number') {
        return state.sensors.get(idOrName);
    }
    return state.sensorsByName.get(idOrName);
}

// Multi-server-aware lookup. Принимает либо готовый sensorKey, либо
// (serverId, objectName, sensorName). Если такого ключа нет — fallback на
// short-name lookup, чтобы данные старых одно-серверных setup'ов не
// «терялись» (не критично, потому что там single-server и конфликта нет).
function getSensorInfoByKey(serverIdOrKey, objectName, sensorName) {
    const key = sensorName === undefined
        ? serverIdOrKey
        : makeSensorKey(serverIdOrKey, objectName, sensorName);
    const found = state.sensorsByKey.get(key);
    if (found) return found;
    // Fallback by short name. parseSensorKey работает только если key — наш
    // строковый формат; если caller передал что-то другое, просто skip.
    const parsed = typeof key === 'string' ? parseSensorKey(key) : null;
    return parsed ? state.sensorsByName.get(parsed.sensorName) : undefined;
}

if (typeof globalThis !== 'undefined') {
    globalThis.getSensorInfoByKey = getSensorInfoByKey;
}

// Проверить, является ли сигнал дискретным
function isDiscreteSignal(sensor) {
    if (!sensor) return false;
    return sensor.isDiscrete === true || sensor.iotype === 'DI' || sensor.iotype === 'DO';
}

