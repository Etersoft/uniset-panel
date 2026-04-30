import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

declare const parseSensorBindingFields: any;
declare const renderSensorBindingFields: any;
declare const renderSensorItemRow: any;
declare const parseSensorItemList: any;

beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
});

describe('parseSensorBindingFields', () => {
    it('extracts triplet with empty prefix', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="serverId"><option value="srv-A" selected></option></select>
            <select name="objectName"><option value="SharedMemory" selected></option></select>
            <input name="sensor" value="AI_Temp_S">
            <input type="hidden" name="sensorId" value="1042">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: '' });
        expect(out).toEqual({ serverId: 'srv-A', objectName: 'SharedMemory', sensor: 'AI_Temp_S', sensorId: 1042 });
    });

    it('handles prefix sensor2-', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="sensor2-serverId"><option value="srv-B" selected></option></select>
            <select name="sensor2-objectName"><option value="DI" selected></option></select>
            <input name="sensor2-sensor" value="Door_Open">
            <input type="hidden" name="sensor2-sensorId" value="504">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: 'sensor2-' });
        expect(out).toEqual({ serverId: 'srv-B', objectName: 'DI', sensor: 'Door_Open', sensorId: 504 });
    });

    it('returns null for sensorId when hidden empty', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="serverId"><option value="srv-A" selected></option></select>
            <select name="objectName"><option value="SM" selected></option></select>
            <input name="sensor" value="x">
            <input type="hidden" name="sensorId" value="">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: '' });
        expect(out.sensorId).toBeNull();
    });

    it('preserves sensorId=0 (falsy-zero не теряется)', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <select name="serverId"><option value="srv-A" selected></option></select>
            <select name="objectName"><option value="SM" selected></option></select>
            <input name="sensor" value="zero">
            <input type="hidden" name="sensorId" value="0">
        `;
        const out = parseSensorBindingFields(form, { fieldPrefix: '' });
        expect(out.sensorId).toBe(0);
    });
});

describe('parseSensorItemList', () => {
    it('extracts items[] with full triplets', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="sensor-item" data-idx="0">
                <select name="item-0-serverId"><option value="srv-A" selected></option></select>
                <select name="item-0-objectName"><option value="SM" selected></option></select>
                <input name="item-0-sensor" value="Pump1">
                <input type="hidden" name="item-0-sensorId" value="2001">
                <input name="item-0-label" value="Pump 1">
            </div>
            <div class="sensor-item" data-idx="1">
                <select name="item-1-serverId"><option value="srv-B" selected></option></select>
                <select name="item-1-objectName"><option value="DI" selected></option></select>
                <input name="item-1-sensor" value="Door">
                <input type="hidden" name="item-1-sensorId" value="504">
                <input name="item-1-label" value="Door">
            </div>
        `;
        const items = parseSensorItemList(form, {
            rowClass: 'sensor-item',
            parseExtraFields: (el: HTMLElement, idx: number) => ({
                label: form.querySelector(`[name="item-${idx}-label"]`)?.getAttribute('value') || ''
            }),
        });
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ serverId: 'srv-A', objectName: 'SM', sensor: 'Pump1', sensorId: 2001, label: 'Pump 1' });
        expect(items[1]).toMatchObject({ serverId: 'srv-B', objectName: 'DI', sensor: 'Door', sensorId: 504, label: 'Door' });
    });

    it('returns empty array when no rows', () => {
        const form = document.createElement('form');
        form.innerHTML = `<div></div>`;
        expect(parseSensorItemList(form, { rowClass: 'sensor-item', parseExtraFields: () => ({}) })).toEqual([]);
    });

    it('skips rows with malformed data-idx', () => {
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="sensor-item" data-idx="0">
                <select name="item-0-serverId"><option value="srv-A" selected></option></select>
                <select name="item-0-objectName"><option value="SM" selected></option></select>
                <input name="item-0-sensor" value="OK">
                <input type="hidden" name="item-0-sensorId" value="1">
            </div>
            <div class="sensor-item" data-idx="abc">
                <input name="bogus" value="ignore">
            </div>
        `;
        const items = parseSensorItemList(form, {
            rowClass: 'sensor-item',
            parseExtraFields: () => ({}),
        });
        expect(items).toHaveLength(1);
        expect(items[0].sensor).toBe('OK');
    });
});

describe('renderSensorItemRow', () => {
    it('uses item-{idx}- prefix in field names', () => {
        const html = renderSensorItemRow({
            idx: 5,
            item: { serverId: 'srv-A', objectName: 'SM', sensor: 'X', sensorId: 99 },
            extraFieldsHtml: '<input name="item-5-label" value="">',
            rowClass: 'sensor-item',
            removable: true,
        });
        expect(html).toContain('name="item-5-serverId"');
        expect(html).toContain('name="item-5-objectName"');
        expect(html).toContain('name="item-5-sensor"');
        expect(html).toContain('name="item-5-sensorId"');
        expect(html).toContain('data-idx="5"');
        expect(html).toContain('class="sensor-item"');
    });
});
