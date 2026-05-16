// ============================================================================
// Sensor key — canonical identity для датчика во frontend.
// Формат: ${serverId}|${objectName}|${sensorName}
// Разделитель `|` (не `:`), чтобы не путать с tabKey (serverId:objectName).
// Используется как ключ в dashboard cache/subscription Map'ах и SSE update routing.
// См. CLAUDE.md "Sensor identity (multi-server)" + spec
// docs/superpowers/specs/2026-04-28-dashboard-multi-server-isolation-design.md
// ============================================================================

function makeSensorKey(serverId, objectName, sensorName) {
    return `${serverId}|${objectName}|${sensorName}`;
}

function parseSensorKey(key) {
    if (typeof key !== 'string') return null;
    const parts = key.split('|');
    if (parts.length !== 3) return null;
    return { serverId: parts[0], objectName: parts[1], sensorName: parts[2] };
}

// Group key — две части (serverId|objectName), без sensorName. Используется
// для batch-операций над датчиками одного объекта (subscribe, fetchSensorValues).
// `objectName` теоретически может содержать `|` — поэтому слайсим по первому
// разделителю, а не split().
function makeGroupKey(serverId, objectName) {
    return `${serverId}|${objectName}`;
}

function parseGroupKey(key) {
    if (typeof key !== 'string') return null;
    const sepIdx = key.indexOf('|');
    if (sepIdx < 0) return null;
    return { serverId: key.slice(0, sepIdx), objectName: key.slice(sepIdx + 1) };
}

// Прикрепляем к globalThis (работает в browser и node test env).
globalThis.makeSensorKey = makeSensorKey;
globalThis.parseSensorKey = parseSensorKey;
globalThis.makeGroupKey = makeGroupKey;
globalThis.parseGroupKey = parseGroupKey;
