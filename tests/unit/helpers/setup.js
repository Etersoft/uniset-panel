// tests/unit/helpers/setup.js
//
// Vitest (1.6) + Node 24 + jsdom interop fix.
//
// Node 24 exposes a built-in `localStorage` getter on `globalThis` that
// throws unless `--localstorage-file` is provided. Vitest's jsdom env
// copies window properties onto the global scope, but its filter skips
// any key that already exists on `globalThis` AND is not in its hard-coded
// KEYS list (see node_modules/vitest/dist/vendor/index.*.js). `localStorage`
// is not in that list, so Node's broken built-in wins and jsdom's working
// `Storage` instance never reaches the test scope.
//
// We fix it here by re-installing the jsdom Storage objects ourselves.
// Kept in a setup file (not the test itself) so every unit test inherits it.

const win = globalThis.jsdom && globalThis.jsdom.window;

if (win) {
    for (const key of ['localStorage', 'sessionStorage']) {
        const storage = win[key];
        if (!storage || typeof storage.setItem !== 'function') continue;
        Object.defineProperty(globalThis, key, {
            value: storage,
            writable: true,
            configurable: true,
            enumerable: true,
        });
    }
}
