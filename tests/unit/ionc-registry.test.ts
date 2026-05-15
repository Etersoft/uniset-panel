import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const stateSrc = readFileSync(resolve(SRC_DIR, '00-state.js'), 'utf8');
    const utils = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const ac = readFileSync(resolve(SRC_DIR, '41-sensor-autocomplete.js'), 'utf8');
    const binding = readFileSync(resolve(SRC_DIR, '60-widget-sensor-binding.js'), 'utf8');
    new Function(`${constants}\n${stateSrc}\n${utils}\n${ac}\n${binding}`)();
}

describe('ensureIONCRegistry', () => {
    beforeEach(() => {
        loadModule();
        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = 0;
        reg.isFetching = false;
        reg.fetchPromise = null;
        reg.servers.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('cache miss → fetches and populates servers Map', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                type: 'IONotifyController',
                servers: [
                    { serverId: 's1', serverName: 'Server1', connected: true, objects: ['SharedMemory'] },
                ],
            }),
        })));

        const reg = await (globalThis as any).ensureIONCRegistry();
        expect(reg.servers.size).toBe(1);
        expect(reg.servers.get('s1')).toEqual({
            serverName: 'Server1', connected: true, objects: ['SharedMemory'],
        });
        expect(reg.fetchedAt).toBeGreaterThan(0);
    });

    it('cache hit (within TTL, non-empty) → no fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now();
        reg.servers.set('s1', { serverName: 'S1', connected: true, objects: ['X'] });

        await (globalThis as any).ensureIONCRegistry();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cache expired → re-fetches', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true, json: async () => ({ type: 'IONotifyController', servers: [] }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now() - (6 * 60 * 1000);
        reg.servers.set('stale', { serverName: 'Stale', connected: true, objects: [] });

        await (globalThis as any).ensureIONCRegistry();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('force=true → re-fetches even if fresh', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true, json: async () => ({ type: 'IONotifyController', servers: [] }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now();
        reg.servers.set('s1', { serverName: 'S1', connected: true, objects: ['X'] });

        await (globalThis as any).ensureIONCRegistry({ force: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('concurrent calls share fetchPromise (single fetch)', async () => {
        let resolveFetch: any;
        const fetchMock = vi.fn(() => new Promise((res) => {
            resolveFetch = () => res({
                ok: true,
                json: async () => ({ type: 'IONotifyController', servers: [] }),
            } as any);
        }));
        vi.stubGlobal('fetch', fetchMock);

        const p1 = (globalThis as any).ensureIONCRegistry();
        const p2 = (globalThis as any).ensureIONCRegistry();
        resolveFetch();
        await Promise.all([p1, p2]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('5xx → fetchedAt unchanged, throws (caller catches)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

        const reg = (globalThis as any).state.ioncRegistry;
        const before = reg.fetchedAt;
        await expect((globalThis as any).ensureIONCRegistry()).rejects.toThrow();
        expect(reg.fetchedAt).toBe(before);
        expect(reg.fetchPromise).toBeNull();
    });
});

describe('getIONCEntries', () => {
    beforeEach(() => {
        loadModule();
        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now();
        reg.servers.clear();
        reg.servers.set('s1', { serverName: 'Server1', connected: true,  objects: ['SharedMemory', 'IMIT.MBI'] });
        reg.servers.set('s2', { serverName: 'Server2', connected: false, objects: ['SharedMemory'] });
        reg.servers.set('s3', { serverName: '',         connected: true,  objects: ['Obj'] });
    });

    it('flattens entries with displayString = `${objectName} @ ${serverName||serverId}`', () => {
        const entries = (globalThis as any).getIONCEntries();
        const map = new Map(entries.map((e: any) => [e.displayString, e]));
        expect(map.get('SharedMemory @ Server1')?.serverId).toBe('s1');
        expect(map.get('IMIT.MBI @ Server1')?.objectName).toBe('IMIT.MBI');
        expect(map.get('SharedMemory @ Server2')?.connected).toBe(false);
        expect(map.get('Obj @ s3')?.serverId).toBe('s3');
    });

    it('sorts: online first (alphabetical), then offline', () => {
        const entries = (globalThis as any).getIONCEntries();
        const onlineCount = entries.filter((e: any) => e.connected).length;
        const offlineCount = entries.filter((e: any) => !e.connected).length;
        expect(onlineCount).toBe(3);
        expect(offlineCount).toBe(1);
        for (let i = 0; i < onlineCount; i++) expect(entries[i].connected).toBe(true);
        for (let i = onlineCount; i < entries.length; i++) expect(entries[i].connected).toBe(false);
    });
});
