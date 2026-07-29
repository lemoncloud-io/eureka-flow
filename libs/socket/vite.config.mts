/// <reference types='vitest' />
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/libs/socket',

    plugins: [nxViteTsPaths()],

    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: {
            reportsDirectory: '../../coverage/libs/socket',
            provider: 'v8',
        },
    },
});
