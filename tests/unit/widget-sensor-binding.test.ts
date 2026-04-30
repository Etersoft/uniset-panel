import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

declare const parseSensorBindingFields: any;
declare const renderSensorBindingFields: any;

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
