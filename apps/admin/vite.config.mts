/// <reference types='vitest' />
import { resolve } from 'path';

import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import svgr from 'vite-plugin-svgr';

import adminPkg from './package.json';

export default defineConfig(() => ({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/admin',

    define: {
        __APP_VERSION__: JSON.stringify(adminPkg.version),
        // Shim Node globals for browser deps pulled in via @flows/web-core (lemon-web-core references `process`/`global`)
        'process.env': {},
        global: 'window',
    },

    resolve: {
        alias: {
            '@flows/web-core': resolve(import.meta.dirname, '../../libs/web-core/src/index.ts'),
            '@flows/flows': resolve(import.meta.dirname, '../../libs/flows/src/index.ts'),
            '@flows/shared': resolve(import.meta.dirname, '../../libs/shared/src/index.ts'),
            '@flows/theme': resolve(import.meta.dirname, '../../libs/theme/src/index.ts'),
            '@flows/ui-kit': resolve(import.meta.dirname, '../../libs/ui-kit/src/index.ts'),
            '@flows/lib/utils': resolve(import.meta.dirname, '../../libs/ui-kit/src/utils/index.ts'),
        },
    },

    server: {
        port: 3001,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
    },

    preview: {
        port: 3001,
        host: 'localhost',
    },

    plugins: [svgr(), react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

    build: {
        outDir: '../../dist/apps/admin',
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            transformMixedEsModules: true,
        },
    },

    css: {
        modules: {
            localsConvention: 'camelCase',
        },
    },

    test: {
        globals: true,
        cache: {
            dir: '../../node_modules/.vitest',
        },
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        reporters: ['default'],
        coverage: {
            reportsDirectory: '../../coverage/apps/admin',
            provider: 'v8',
        },
    },
}));
