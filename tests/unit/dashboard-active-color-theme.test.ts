import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadBaseClass() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const utils     = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const base      = readFileSync(resolve(SRC_DIR, '60-dashboard-base.js'), 'utf8');
    // Binding helpers нужны для super.getConfigForm / parseConfigForm reuse.
    const binding   = readFileSync(resolve(SRC_DIR, '60-widget-sensor-binding.js'), 'utf8');
    const activeBase = readFileSync(resolve(SRC_DIR, '61-dashboard-active-base.js'), 'utf8');
    new Function(`
        ${constants}
        ${utils}
        ${binding}
        ${base}
        ${activeBase}
        globalThis.ActiveDashboardWidget = ActiveDashboardWidget;
        globalThis.ACTIVE_WIDGET_THEME_NAMES = ACTIVE_WIDGET_THEME_NAMES;
        globalThis.ACTIVE_WIDGET_CUSTOM_BG_DEFAULT = ACTIVE_WIDGET_CUSTOM_BG_DEFAULT;
        globalThis.ACTIVE_WIDGET_CUSTOM_FG_DEFAULT = ACTIVE_WIDGET_CUSTOM_FG_DEFAULT;
        globalThis.HEX_COLOR_REGEX = HEX_COLOR_REGEX;
    `)();
}

declare global {
    var ActiveDashboardWidget: any;
    var ACTIVE_WIDGET_THEME_NAMES: string[];
    var ACTIVE_WIDGET_CUSTOM_BG_DEFAULT: string;
    var ACTIVE_WIDGET_CUSTOM_FG_DEFAULT: string;
    var HEX_COLOR_REGEX: RegExp;
}

// Load once at module level so describe-block class declarations
// (which run at collection time, before beforeEach) can extend the base class.
loadBaseClass();

const widgets: any[] = [];
beforeEach(() => {
    widgets.length = 0;
    loadBaseClass();
});
afterEach(() => {
    while (widgets.length) widgets.pop()?.destroy?.();
});

// Minimal subclass для тестов: skip ctor side-effects.
function makeTestable(config: any, supports = true) {
    class W extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = supports;
        constructor(c: any) {
            super('test-id', c, document.createElement('div'));
        }
    }
    const w = new W(config);
    widgets.push(w);
    return w;
}

describe('_applyColorTheme — base class theme application', () => {
    it('no-op when supportsColorTheme=false (default)', () => {
        const w = makeTestable({ colorTheme: 'danger' }, false);
        w._applyColorTheme();
        expect(w.container.className).not.toMatch(/awc-theme-/);
        expect(w.container.dataset.colorTheme).toBeUndefined();
    });

    it('adds awc-theme-<name> class for preset', () => {
        const w = makeTestable({ colorTheme: 'danger' });
        w._applyColorTheme();
        expect(w.container.classList.contains('awc-theme-danger')).toBe(true);
        expect(w.container.dataset.colorTheme).toBe('danger');
    });

    it('switches class on preset → preset transition', () => {
        const w = makeTestable({ colorTheme: 'danger' });
        w._applyColorTheme();
        w.config.colorTheme = 'success';
        w._applyColorTheme();
        expect(w.container.classList.contains('awc-theme-danger')).toBe(false);
        expect(w.container.classList.contains('awc-theme-success')).toBe(true);
        expect(w.container.dataset.colorTheme).toBe('success');
    });

    it('custom: applies inline vars + awc-theme-custom class', () => {
        const w = makeTestable({ colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' });
        w._applyColorTheme();
        expect(w.container.classList.contains('awc-theme-custom')).toBe(true);
        expect(w.container.style.getPropertyValue('--awc-bg')).toBe('#ff6600');
        expect(w.container.style.getPropertyValue('--awc-fg')).toBe('#000000');
        expect(w.container.dataset.colorTheme).toBe('custom');
    });

    it('custom → preset cleanup: inline vars removed, custom class removed', () => {
        const w = makeTestable({ colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' });
        w._applyColorTheme();
        w.config = { colorTheme: 'danger' };
        w._applyColorTheme();
        expect(w.container.style.getPropertyValue('--awc-bg')).toBe('');
        expect(w.container.style.getPropertyValue('--awc-fg')).toBe('');
        expect(w.container.classList.contains('awc-theme-custom')).toBe(false);
        expect(w.container.classList.contains('awc-theme-danger')).toBe(true);
    });

    it('preset → default cleanup: класс убран, vars не вмешиваются', () => {
        const w = makeTestable({ colorTheme: 'danger' });
        w._applyColorTheme();
        w.config = { colorTheme: 'default' };
        w._applyColorTheme();
        expect(w.container.className).not.toMatch(/awc-theme-/);
        expect(w.container.dataset.colorTheme).toBeUndefined();
    });

    it('corrupted theme value → no class, no data attribute', () => {
        const w = makeTestable({ colorTheme: 'hacked' });
        w._applyColorTheme();
        expect(w.container.className).not.toMatch(/awc-theme-/);
        expect(w.container.dataset.colorTheme).toBeUndefined();
    });

    it('custom without customBg/Fg → uses defaults', () => {
        const w = makeTestable({ colorTheme: 'custom' });
        w._applyColorTheme();
        expect(w.container.style.getPropertyValue('--awc-bg')).toBe(ACTIVE_WIDGET_CUSTOM_BG_DEFAULT);
        expect(w.container.style.getPropertyValue('--awc-fg')).toBe(ACTIVE_WIDGET_CUSTOM_FG_DEFAULT);
    });
});

describe('getConfigForm — theme block rendering', () => {
    class Supports extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = true;
    }
    class NoSupport extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = false;
    }

    it('renders theme select with 7 options when supportsColorTheme=true', () => {
        const html = Supports.getConfigForm({});
        const div = document.createElement('div');
        div.innerHTML = html;
        const sel = div.querySelector('[name="colorTheme"]') as HTMLSelectElement;
        expect(sel).toBeTruthy();
        expect(sel.querySelectorAll('option')).toHaveLength(7);
    });

    it('omits theme select when supportsColorTheme=false', () => {
        const html = NoSupport.getConfigForm({});
        const div = document.createElement('div');
        div.innerHTML = html;
        expect(div.querySelector('[name="colorTheme"]')).toBeNull();
        expect(div.querySelector('[name="customBg"]')).toBeNull();
    });

    it('theme select appears AFTER style select AND BEFORE requireConfirmation', () => {
        class Styled extends globalThis.ActiveDashboardWidget {
            static supportsColorTheme = true;
            static styles = ['flat', 'mushroom']; // > 1 → style select рендерится
        }
        const html = Styled.getConfigForm({});
        const div = document.createElement('div');
        div.innerHTML = html;
        const styleSel = div.querySelector('[name="style"]') as HTMLElement;
        const themeSel = div.querySelector('[name="colorTheme"]') as HTMLElement;
        const reqCb   = div.querySelector('[name="requireConfirmation"]') as HTMLElement;
        expect(styleSel && themeSel && reqCb).toBeTruthy();
        // compareDocumentPosition: returns DOCUMENT_POSITION_FOLLOWING (4) если B следует за A.
        expect(styleSel.compareDocumentPosition(themeSel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(themeSel.compareDocumentPosition(reqCb)   & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('pre-selects current colorTheme on reopen', () => {
        const html = Supports.getConfigForm({ colorTheme: 'warning' });
        const div = document.createElement('div');
        div.innerHTML = html;
        const sel = div.querySelector('[name="colorTheme"]') as HTMLSelectElement;
        expect(sel.value).toBe('warning');
    });

    it('custom row уже видима при reopen с colorTheme=custom', () => {
        const html = Supports.getConfigForm({ colorTheme: 'custom', customBg: '#abc123', customFg: '#222222' });
        const div = document.createElement('div');
        div.innerHTML = html;
        const row = div.querySelector('[data-color-custom-row]') as HTMLElement;
        expect(row).toBeTruthy();
        const bg = div.querySelector('[name="customBg"]') as HTMLInputElement;
        const fg = div.querySelector('[name="customFg"]') as HTMLInputElement;
        expect(bg.value).toBe('#abc123');
        expect(fg.value).toBe('#222222');
    });
});

describe('parseConfigForm — theme normalization', () => {
    class Supports extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = true;
    }
    class NoSupport extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = false;
    }

    function buildForm(html: string) {
        const f = document.createElement('form');
        f.innerHTML = html;
        return f;
    }

    function baseHtml(extra = '') {
        // Минимум что должен распарсить super-parse: sensor binding + label + requireConfirmation.
        return `
            <input type="text" name="sensor" value="X" />
            <input type="hidden" name="sensorId" value="42" />
            <input type="text" name="objectName" value="SharedMemory" />
            <input type="text" name="serverId" value="srv1" />
            <input type="text" name="label" value="" />
            <input type="checkbox" name="requireConfirmation" />
            ${extra}
        `;
    }

    it('default → выпускается из result (sparse)', () => {
        const f = buildForm(baseHtml(`<select name="colorTheme"><option value="default" selected /></select>`));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBeUndefined();
        expect(out.customBg).toBeUndefined();
        expect(out.customFg).toBeUndefined();
    });

    it('preset value preserved', () => {
        const f = buildForm(baseHtml(`<select name="colorTheme"><option value="danger" selected /></select>`));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBe('danger');
    });

    it('corrupted value → normalized to default → выпускается', () => {
        const f = buildForm(baseHtml(`<select name="colorTheme"><option value="hacked" selected /></select>`));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBeUndefined();
    });

    it('custom с валидными hex', () => {
        const f = buildForm(baseHtml(`
            <select name="colorTheme"><option value="custom" selected /></select>
            <input type="text" name="customBg" value="#abcdef" />
            <input type="text" name="customFg" value="#000000" />
        `));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBe('custom');
        expect(out.customBg).toBe('#abcdef');
        expect(out.customFg).toBe('#000000');
    });

    it('custom с невалидным customBg → дефолт', () => {
        const f = buildForm(baseHtml(`
            <select name="colorTheme"><option value="custom" selected /></select>
            <input type="text" name="customBg" value="red" />
            <input type="text" name="customFg" value="" />
        `));
        const out = Supports.parseConfigForm(f);
        expect(out.colorTheme).toBe('custom');
        expect(out.customBg).toBe(ACTIVE_WIDGET_CUSTOM_BG_DEFAULT);
        expect(out.customFg).toBe(ACTIVE_WIDGET_CUSTOM_FG_DEFAULT);
    });

    it('supportsColorTheme=false — все theme поля игнорируются', () => {
        const f = buildForm(baseHtml(`
            <select name="colorTheme"><option value="danger" selected /></select>
            <input type="text" name="customBg" value="#abcdef" />
        `));
        const out = NoSupport.parseConfigForm(f);
        expect(out.colorTheme).toBeUndefined();
        expect(out.customBg).toBeUndefined();
    });

    it('preserves base fields (sensor binding, label, requireConfirmation)', () => {
        const f = buildForm(baseHtml());
        const out = Supports.parseConfigForm(f);
        expect(out.sensor).toBe('X');
        expect(out.sensorId).toBe(42);
        expect(out.objectName).toBe('SharedMemory');
        expect(out.serverId).toBe('srv1');
        expect(out.label).toBe('');
        expect(out.requireConfirmation).toBe(false);
    });
});
