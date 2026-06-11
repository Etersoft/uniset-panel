import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, beforeEach } from 'vitest';

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

beforeEach(() => loadBaseClass());

// Minimal subclass для тестов: skip ctor side-effects.
function makeTestable(config: any, supports = true) {
    class W extends globalThis.ActiveDashboardWidget {
        static supportsColorTheme = supports;
        constructor(c: any) {
            super('test-id', c, document.createElement('div'));
        }
    }
    return new W(config);
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
