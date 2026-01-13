/// <reference types='vitest' />
import { resolve } from 'path';

import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import svgr from 'vite-plugin-svgr';

import webPkg from './package.json';

const removeVitePrefix = (envVar: string) => envVar.replace('VITE_', '');

const htmlEnvInjectionPlugin = () => {
    return {
        name: 'html-env-injection',
        transformIndexHtml(html: string) {
            const envVars = Object.entries(process.env)
                .filter(([key]) => key.startsWith('VITE_'))
                .reduce(
                    (acc, [key, value]) => {
                        acc[removeVitePrefix(key)] = value || '';
                        return acc;
                    },
                    {} as Record<string, string>
                );

            const envScript = `
                <script>
                    (function() {
                        ${Object.entries(envVars)
                            .map(([key, value]) => `window.${key}="${value}";`)
                            .join('\n')}
                    })();
                </script>
            `;

            return html.replace(/<body>/, `${envScript}\n<body>`);
        },
    };
};

export default defineConfig({
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/apps/web',

    base: process.env.VITE_BASE_PATH || '/',

    define: {
        'process.env': {},
        'process.env.I18N_VERSION': JSON.stringify(Date.now().toString()),
        __APP_VERSION__: JSON.stringify(webPkg.version),
        ...(process.env.NODE_ENV === 'development'
            ? {
                  global: 'window',
                  'process.env.I18N_VERSION': JSON.stringify('dev'),
              }
            : {}),
    },

    resolve: {
        alias: {
            '@flows/web-core': resolve(import.meta.dirname, '../../libs/web-core/src/index.ts'),
            '@flows/flows': resolve(import.meta.dirname, '../../libs/flows/src/index.ts'),
            '@flows/shared': resolve(import.meta.dirname, '../../libs/shared/src/index.ts'),
            '@flows/theme': resolve(import.meta.dirname, '../../libs/theme/src/index.ts'),
            '@flows/ui-kit': resolve(import.meta.dirname, '../../libs/ui-kit/src/index.ts'),
            '@flows/lib/utils': resolve(import.meta.dirname, '../../libs/ui-kit/src/utils/index.ts'),
            ...(process.env.NODE_ENV !== 'development'
                ? {
                      './runtimeConfig': './runtimeConfig.browser',
                  }
                : {}),
        },
    },

    server: {
        port: 3000,
        host: 'localhost',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
    },

    preview: {
        port: 3000,
        host: 'localhost',
    },

    plugins: [htmlEnvInjectionPlugin(), svgr(), react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

    build: {
        sourcemap: process.env.VITE_ENV !== 'PROD',
        minify: 'terser',
        outDir: '../../dist/apps/web',
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            include: [/node_modules/],
            extensions: ['.js', '.cjs'],
            strictRequires: true,
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
            reportsDirectory: '../../coverage/apps/web',
            provider: 'v8',
        },
    },
});
