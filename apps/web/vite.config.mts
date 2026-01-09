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
    root: __dirname,
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
            '@eureka/web-core': resolve(__dirname, '../../libs/web-core/src/index.ts'),
            '@eureka/flows': resolve(__dirname, '../../libs/flows/src/index.ts'),
            '@eureka/shared': resolve(__dirname, '../../libs/shared/src/index.ts'),
            '@eureka/theme': resolve(__dirname, '../../libs/theme/src/index.ts'),
            '@eureka/ui-kit': resolve(__dirname, '../../libs/ui-kit/src/index.ts'),
            '@eureka/lib/utils': resolve(__dirname, '../../libs/ui-kit/src/utils/index.ts'),
            ...(process.env.NODE_ENV !== 'development'
                ? {
                      './runtimeConfig': './runtimeConfig.browser', // fix production build
                  }
                : {}),
        },
    },

    server: {
        port: 3000,
        host: '0.0.0.0',
        fs: {
            allow: [searchForWorkspaceRoot(process.cwd())],
        },
    },

    preview: {
        port: 4300,
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
