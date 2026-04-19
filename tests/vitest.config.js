// tests/vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        // jsdom defaults to `about:blank` (opaque origin), which disables
        // localStorage / sessionStorage. Provide a real URL so Storage works.
        environmentOptions: {
            jsdom: {
                url: 'http://localhost/',
            },
        },
        // Works around a Vitest 1.x + Node 24 incompatibility around
        // globalThis.localStorage. See unit/helpers/setup.js for details.
        setupFiles: ['./unit/helpers/setup.js'],
        include: ['unit/**/*.test.js'],
        globals: true, // describe/it/expect without import
        reporters: ['default'],
    },
});
