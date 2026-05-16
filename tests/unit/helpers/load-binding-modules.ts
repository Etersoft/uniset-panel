// Shared loader for sensor-binding / IONC-registry unit tests.
// Both ionc-registry.test.ts и sensor-binding-combo.test.ts (и другие специфичные
// для combo'а) подгружают одинаковый набор JS source'ов в jsdom через new Function.
// При изменении порядка / списка модулей правится одно место.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../../ui/static/js/src');

// Минимальный набор для combo + sensor-autocomplete + binding helpers.
// Если тест требует дополнительных модулей — передавай через extra (не редактируй default).
const BINDING_MODULES = [
    '00-constants.js',
    '00-state.js',
    '06-utils.js',
    '41-sensor-autocomplete.js',
    '60-widget-sensor-binding.js',
];

export function loadBindingModules(extra: string[] = []) {
    const sources = [...BINDING_MODULES, ...extra]
        .map(name => readFileSync(resolve(SRC_DIR, name), 'utf8'))
        .join('\n');
    new Function(sources)();
}
