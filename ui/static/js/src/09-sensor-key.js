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

// Прикрепляем к globalThis (работает в browser и node test env).
globalThis.makeSensorKey = makeSensorKey;
globalThis.parseSensorKey = parseSensorKey;
