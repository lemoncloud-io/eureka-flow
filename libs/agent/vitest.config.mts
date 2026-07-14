import { defineConfig } from 'vitest/config';

export default defineConfig({
    root: import.meta.dirname,
    test: {
        // The environment layer is environment-agnostic by design; tests inject fakes
        // (memory storage, fake web storage), so plain node is enough — no jsdom.
        environment: 'node',
        include: ['src/**/*.{test,spec}.ts'],
        reporters: ['default'],
    },
});
