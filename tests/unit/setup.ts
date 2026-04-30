import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadSource(filename: string) {
    const src = readFileSync(resolve(SRC_DIR, filename), 'utf8');
    new Function(src)();
}

loadSource('06-utils.js');
loadSource('09-sensor-key.js');
loadSource('60-widget-sensor-binding.js');
