import { describe, it, expect } from 'vitest';

declare const _migrateBindingPure: any;

// Helper: build sensorRegistry в виде Map<key, {id, name}>.
const reg = (entries: Array<[string, string, string, number]>) => {
    const m = new Map();
    for (const [serverId, objectName, name, id] of entries) {
        m.set(`${serverId}|${objectName}|${name}`, { id, name });
    }
    return m;
};

describe('_migrateBindingPure', () => {
    it('fills missing serverId/objectName/sensorId from registry', () => {
        const cfg: any = { sensor: 'AI_Temp_S' };
        const r = reg([['srv-A', 'SharedMemory', 'AI_Temp_S', 1042]]);
        const filled = _migrateBindingPure(cfg, r);
        expect(filled).toBeGreaterThan(0);
        expect(cfg).toMatchObject({ sensor: 'AI_Temp_S', serverId: 'srv-A', objectName: 'SharedMemory', sensorId: 1042 });
    });

    it('no-op when full triplet already present', () => {
        const cfg: any = { sensor: 'X', serverId: 'a', objectName: 'b', sensorId: 7 };
        const r = reg([['z', 'q', 'X', 99]]);
        expect(_migrateBindingPure(cfg, r)).toBe(0);
        expect(cfg).toEqual({ sensor: 'X', serverId: 'a', objectName: 'b', sensorId: 7 });
    });

    it('migrates chart legacy `name` field (P1.2)', () => {
        // Legacy chart sensors хранят имя в .name, не .sensor —
        // см. config/dashboards/system-overview.json.
        const cfg: any = { zones: [{ sensors: [{ name: 'AI70_S' }, { name: 'Sensor99_S' }] }] };
        const r = reg([
            ['srv-1', 'SharedMemory', 'AI70_S', 70],
            ['srv-1', 'SharedMemory', 'Sensor99_S', 99],
        ]);
        const n = _migrateBindingPure(cfg, r);
        expect(n).toBeGreaterThan(0);
        expect(cfg.zones[0].sensors[0]).toMatchObject({
            name: 'AI70_S', sensor: 'AI70_S',
            serverId: 'srv-1', objectName: 'SharedMemory', sensorId: 70,
        });
        expect(cfg.zones[0].sensors[1]).toMatchObject({
            name: 'Sensor99_S', sensor: 'Sensor99_S', sensorId: 99,
        });
    });

    it('empty registry → no mutation', () => {
        const cfg: any = { sensor: 'X' };
        const r = new Map();
        expect(_migrateBindingPure(cfg, r)).toBe(0);
        expect(cfg).toEqual({ sensor: 'X' });
    });

    it('handles items[] (multi-sensor)', () => {
        const cfg: any = { items: [{ sensor: 'A' }, { sensor: 'B', serverId: 'pre-set' }] };
        const r = reg([
            ['srv-1', 'SM', 'A', 10],
            ['srv-2', 'DI', 'B', 20],
        ]);
        const n = _migrateBindingPure(cfg, r);
        expect(n).toBeGreaterThan(0);
        expect(cfg.items[0]).toMatchObject({ sensor: 'A', serverId: 'srv-1', objectName: 'SM', sensorId: 10 });
        // Pre-set serverId сохраняется даже если registry даёт другой.
        expect(cfg.items[1].serverId).toBe('pre-set');
    });

    it('handles chart zones[].sensors[]', () => {
        const cfg: any = { zones: [{ sensors: [{ sensor: 'X' }, { sensor: 'Y' }] }] };
        const r = reg([
            ['srv-a', 'SM', 'X', 1],
            ['srv-b', 'SM', 'Y', 2],
        ]);
        _migrateBindingPure(cfg, r);
        expect(cfg.zones[0].sensors[0]).toMatchObject({ sensor: 'X', serverId: 'srv-a', objectName: 'SM', sensorId: 1 });
        expect(cfg.zones[0].sensors[1].sensorId).toBe(2);
    });

    it('handles sensor2 (gauge dual / setpoint feedback)', () => {
        const cfg: any = { sensor: 'X', serverId: 'srv-a', objectName: 'SM', sensorId: 1, sensor2: 'Y' };
        const r = reg([['srv-a', 'SM', 'Y', 99]]);
        _migrateBindingPure(cfg, r);
        expect(cfg.sensorId2).toBe(99);
        // serverId2/objectName2 не выставляются если sensor2 в том же object — fallback в manager.
    });
});
