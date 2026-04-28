import { describe, it, expect } from 'vitest';

declare const makeSensorKey: (serverId: string, objectName: string, sensorName: string) => string;
declare const parseSensorKey: (key: string) => { serverId: string; objectName: string; sensorName: string } | null;

describe('makeSensorKey / parseSensorKey', () => {
    it('round-trip with normal values', () => {
        const key = makeSensorKey('srv1', 'SharedMemory', 'Temp');
        expect(key).toBe('srv1|SharedMemory|Temp');
        expect(parseSensorKey(key)).toEqual({
            serverId: 'srv1', objectName: 'SharedMemory', sensorName: 'Temp'
        });
    });

    it('preserves empty serverId (edge)', () => {
        const key = makeSensorKey('', 'SharedMemory', 'Temp');
        expect(parseSensorKey(key)).toEqual({
            serverId: '', objectName: 'SharedMemory', sensorName: 'Temp'
        });
    });

    it('returns null for malformed key', () => {
        expect(parseSensorKey('foo')).toBeNull();
        expect(parseSensorKey('foo|bar')).toBeNull();
        expect(parseSensorKey('foo|bar|baz|extra')).toBeNull();
    });

    it('returns null for non-string', () => {
        expect(parseSensorKey(null as any)).toBeNull();
        expect(parseSensorKey(undefined as any)).toBeNull();
        expect(parseSensorKey(123 as any)).toBeNull();
    });

    it('keys with same triplet are equal as strings (Map key semantics)', () => {
        expect(makeSensorKey('a', 'b', 'c')).toBe(makeSensorKey('a', 'b', 'c'));
    });
});
