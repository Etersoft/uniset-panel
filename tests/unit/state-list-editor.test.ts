import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadUtils() {
    const constants = readFileSync(resolve(SRC, '00-constants.js'), 'utf8');
    const utils = readFileSync(resolve(SRC, '06-utils.js'), 'utf8');
    new Function(`${constants}\n${utils}`)();
}

describe('renderStateListEditor', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadUtils();
    });

    it('renders header + add button + zero rows for empty list', () => {
        const form = document.getElementById('form')!;
        form.innerHTML = (globalThis as any).renderStateListEditor([]);
        expect(form.querySelector('.state-list-editor')).toBeTruthy();
        expect(form.querySelector('.state-list-add-btn')).toBeTruthy();
        expect(form.querySelectorAll('.state-list-row').length).toBe(0);
    });

    it('renders one row per state with section-move-btn reorder', () => {
        const form = document.getElementById('form')!;
        form.innerHTML = (globalThis as any).renderStateListEditor([
            { from: 0, to: 0, text: 'OFF', fg: '#fff', bg: '#6b7280' },
            { from: 1, to: 1, text: 'RUN', fg: '#fff', bg: '#22c55e' },
        ]);
        const rows = form.querySelectorAll('.state-list-row');
        expect(rows.length).toBe(2);
        // each row has up/down buttons in section-reorder-buttons
        const firstRow = rows[0];
        expect(firstRow.querySelector('.section-move-btn[data-move="up"]')).toBeTruthy();
        expect(firstRow.querySelector('.section-move-btn[data-move="down"]')).toBeTruthy();
        // up disabled on first row, down disabled on last
        expect(firstRow.querySelector<HTMLButtonElement>('.section-move-btn[data-move="up"]')!.disabled).toBe(true);
        expect(rows[1].querySelector<HTMLButtonElement>('.section-move-btn[data-move="down"]')!.disabled).toBe(true);
    });

    it('renders open from/to placeholders', () => {
        const form = document.getElementById('form')!;
        form.innerHTML = (globalThis as any).renderStateListEditor([
            { to: 0, text: 'LOW' },        // open from
            { from: 100, text: 'OVER' },   // open to
        ]);
        const inputs = form.querySelectorAll<HTMLInputElement>('.state-list-row input[name^="state-from-"], .state-list-row input[name^="state-to-"]');
        // first row: from empty (placeholder), to=0
        expect((inputs[0] as HTMLInputElement).value).toBe('');
        expect((inputs[1] as HTMLInputElement).value).toBe('0');
    });
});

describe('parseStateList', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadUtils();
    });

    it('round-trip: render then parse returns same shape', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const input = [
            { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280' },
            { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e' },
        ];
        form.innerHTML = (globalThis as any).renderStateListEditor(input);
        const out = (globalThis as any).parseStateList(form);
        expect(out.length).toBe(2);
        expect(out[0].text).toBe('OFF');
        expect(out[0].from).toBe(0);
        expect(out[0].to).toBe(0);
        expect(out[1].text).toBe('RUN');
    });

    it('parses open from/to (empty inputs) as undefined', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        form.innerHTML = (globalThis as any).renderStateListEditor([
            { to: 0, text: 'LOW' },
            { from: 100, text: 'OVER' },
        ]);
        const out = (globalThis as any).parseStateList(form);
        expect(out[0].from).toBeUndefined();
        expect(out[0].to).toBe(0);
        expect(out[1].from).toBe(100);
        expect(out[1].to).toBeUndefined();
    });
});

describe('setupStateListHandlers', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadUtils();
        // findStateOverlaps used by overlap warning — need to load state-label module
        // state-label extends DashboardWidget, so load base + label together in one scope
        const baseSrc = require('fs').readFileSync(
            require('path').resolve(__dirname, '../../ui/static/js/src/60-dashboard-base.js'),
            'utf8',
        );
        const labelSrc = require('fs').readFileSync(
            require('path').resolve(__dirname, '../../ui/static/js/src/61-dashboard-widget-state-label.js'),
            'utf8',
        );
        new Function(`${baseSrc}\n${labelSrc}`)();
    });

    function mount(states: any[]) {
        const form = document.getElementById('form')! as HTMLFormElement;
        form.innerHTML = (globalThis as any).renderStateListEditor(states);
        (globalThis as any).setupStateListHandlers(form);
        return form;
    }

    it('Add button appends new row', () => {
        const form = mount([{ from: 0, to: 0, text: 'OFF' }]);
        (form.querySelector('.state-list-add-btn') as HTMLButtonElement).click();
        expect(form.querySelectorAll('.state-list-row').length).toBe(2);
    });

    it('Remove button removes row', () => {
        const form = mount([
            { from: 0, to: 0, text: 'OFF' },
            { from: 1, to: 1, text: 'RUN' },
        ]);
        (form.querySelector('.state-list-row[data-idx="0"] .state-list-remove') as HTMLButtonElement).click();
        const rows = form.querySelectorAll('.state-list-row');
        expect(rows.length).toBe(1);
        expect((rows[0].querySelector('.state-list-text') as HTMLInputElement).value).toBe('RUN');
    });

    it('Move down swaps rows', () => {
        const form = mount([
            { from: 0, to: 0, text: 'OFF' },
            { from: 1, to: 1, text: 'RUN' },
        ]);
        (form.querySelector('.state-list-row[data-idx="0"] .section-move-btn[data-move="down"]') as HTMLButtonElement).click();
        const rows = form.querySelectorAll('.state-list-row');
        expect((rows[0].querySelector('.state-list-text') as HTMLInputElement).value).toBe('RUN');
        expect((rows[1].querySelector('.state-list-text') as HTMLInputElement).value).toBe('OFF');
    });

    it('Move up button disabled on first, down on last', () => {
        const form = mount([
            { from: 0, to: 0, text: 'A' },
            { from: 1, to: 1, text: 'B' },
        ]);
        const rows = form.querySelectorAll('.state-list-row');
        expect((rows[0].querySelector('.section-move-btn[data-move="up"]') as HTMLButtonElement).disabled).toBe(true);
        expect((rows[rows.length - 1].querySelector('.section-move-btn[data-move="down"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('Overlap warning shown when ranges overlap', () => {
        const form = mount([
            { from: 0, to: 100, text: 'WIDE' },
            { from: 50, to: 50, text: 'NARROW' },  // shadowed by WIDE
        ]);
        const rows = form.querySelectorAll('.state-list-row');
        // second row should have .has-overlap class
        expect(rows[1].classList.contains('has-overlap')).toBe(true);
        // warning element rendered
        expect(form.querySelector('.state-list-overlap-warn')).toBeTruthy();
    });

    it('Blink popover toggles', () => {
        const form = mount([{ from: 1, to: 1, text: 'A' }]);
        (form.querySelector('.state-list-blink-btn') as HTMLButtonElement).click();
        expect(form.querySelector('.state-list-blink-popover')).toBeTruthy();
    });
});
