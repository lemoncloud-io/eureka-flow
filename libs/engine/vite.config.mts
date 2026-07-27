/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/libs/engine',

    plugins: [nxViteTsPaths()],

    test: {
        globals: true,
        // 'node', not 'jsdom': the engine has to run where there is no DOM, and a spec
        // suite that only ever runs in a browser-shaped environment would never say so.
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: {
            reportsDirectory: '../../coverage/libs/engine',
            provider: 'v8',
        },
    },
});
