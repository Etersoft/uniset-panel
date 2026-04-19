// tests/unit/helpers/load-src.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

/**
 * Load vanilla-JS source into the current global scope (jsdom window).
 * Uses indirect eval so top-level `function` / `var` declarations become
 * global bindings (what the vanilla-JS src files rely on — they are
 * concatenated into a single app.js in production).
 *
 * @param {string} relPath - path from repo root, e.g. 'ui/static/js/src/58-overview-state.js'
 */
export function loadSrc(relPath) {
    const abs = path.resolve(ROOT, relPath);
    const code = fs.readFileSync(abs, 'utf-8');
    // (0, eval) is "indirect eval" — runs in global scope in sloppy mode.
    (0, eval)(code);
}
