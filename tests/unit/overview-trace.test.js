import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

class FakeEventSource {
    constructor(url) {
        this.url = url;
        this.closed = false;
        this._listeners = {};
        this.onerror = null;
        FakeEventSource.instances.push(this);
    }
    addEventListener(type, fn) { this._listeners[type] = fn; }
    close() { this.closed = true; }
    _emit(type, data) {
        const fn = this._listeners[type];
        if (fn) fn({ data: JSON.stringify(data) });
    }
    _emitRaw(type, data) {
        const fn = this._listeners[type];
        if (fn) fn({ data: data });
    }
}
FakeEventSource.instances = [];

beforeAll(() => {
    globalThis.EventSource = FakeEventSource;
    globalThis.fetch = vi.fn(async () => ({
        status: 200,
        json: async () => ({ ok: true }),
    }));
    loadSrc('ui/static/js/src/58-overview-trace.js');
});

beforeEach(() => {
    FakeEventSource.instances = [];
    window.UnisetOverview.trace._sources = {};
    globalThis.fetch.mockClear();
});

describe('UnisetOverview.trace.subscribe', () => {
    it('returns a unique token and creates EventSource with correct URL', () => {
        const token = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        expect(typeof token).toBe('string');
        expect(FakeEventSource.instances.length).toBe(1);
        expect(FakeEventSource.instances[0].url).toContain('object=ObjA');
        expect(FakeEventSource.instances[0].url).toContain('server=srv-1');
        expect(FakeEventSource.instances[0].url).toContain('interval=500');
    });

    it('invokes callback when trace batch arrives', () => {
        let received = null;
        window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, (b) => { received = b; });
        FakeEventSource.instances[0]._emit('trace', { batch: [1, 2, 3] });
        expect(received).toEqual({ batch: [1, 2, 3] });
    });

    it('tolerates malformed JSON in batch without throwing', () => {
        let called = false;
        window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => { called = true; });
        expect(() => {
            FakeEventSource.instances[0]._emitRaw('trace', 'not-json{{');
        }).not.toThrow();
        expect(called).toBe(false);
    });

    it('generates distinct tokens for same server+object', () => {
        const t1 = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        const t2 = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        expect(t1).not.toBe(t2);
    });

    it('defaults interval to 500 when not provided', () => {
        window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', null, () => {});
        expect(FakeEventSource.instances[0].url).toContain('interval=500');
    });
});

describe('UnisetOverview.trace.unsubscribe', () => {
    it('closes the EventSource and removes token', () => {
        const token = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        const es = FakeEventSource.instances[0];
        window.UnisetOverview.trace.unsubscribe(token);
        expect(es.closed).toBe(true);
        expect(window.UnisetOverview.trace._sources[token]).toBeUndefined();
    });

    it('noop for unknown token', () => {
        expect(() => window.UnisetOverview.trace.unsubscribe('bogus')).not.toThrow();
    });
});

describe('UnisetOverview.trace.enable/disable', () => {
    it('enable calls POST with size query param', async () => {
        await window.UnisetOverview.trace.enable('srv-1', 'ObjA', 256);
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/enable?size=256'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('enable url contains encoded serverId and object', async () => {
        await window.UnisetOverview.trace.enable('srv 1', 'Obj/A', 128);
        const [url] = fetch.mock.calls[0];
        expect(url).toContain(encodeURIComponent('srv 1'));
        expect(url).toContain(encodeURIComponent('Obj/A'));
    });

    it('disable calls POST to /disable endpoint', async () => {
        await window.UnisetOverview.trace.disable('srv-1', 'ObjA');
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/disable'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('returns {status, body} from enable', async () => {
        const r = await window.UnisetOverview.trace.enable('srv-1', 'ObjA', 100);
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ ok: true });
    });
});

describe('UnisetOverview.trace._closeAll', () => {
    it('closes every active subscription', () => {
        window.UnisetOverview.trace.subscribe('srv-1', 'A', 500, () => {});
        window.UnisetOverview.trace.subscribe('srv-1', 'B', 500, () => {});
        const instances = [...FakeEventSource.instances];
        window.UnisetOverview.trace._closeAll();
        expect(instances[0].closed).toBe(true);
        expect(instances[1].closed).toBe(true);
        expect(Object.keys(window.UnisetOverview.trace._sources).length).toBe(0);
    });
});
