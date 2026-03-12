/// <reference types='vitest' />
import { resolve } from 'path';

import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import svgr from 'vite-plugin-svgr';

import webPkg from './package.json';

const removeVitePrefix = (envVar: string) => envVar.replace('VITE_', '');

const htmlEnvInjectionPlugin = (env: Record<string, string>) => {
    return {
        name: 'html-env-injection',
        transformIndexHtml: {
            order: 'pre' as const,
            handler(html: string) {
                const envVars = Object.entries(env)
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
                .join('\n            ')}
        })();
    </script>`;

                return html.replace(/(<body[^>]*>)/i, `${envScript}\n$1`);
            },
        },
    };
};

export default defineConfig(({ mode }) => {
    // Backup VITE_ vars from process.env (set by GitHub Actions or CI environment)
    const processEnvViteVars: Record<string, string> = {};
    Object.keys(process.env)
        .filter(key => key.startsWith('VITE_'))
        .forEach(key => {
            processEnvViteVars[key] = process.env[key] as string;
        });

    // Load env from .env files (e.g., .env.dev, .env.prod)
    const fileEnv = loadEnv(mode, import.meta.dirname, '');

    // Merge: process.env (CI) < fileEnv (local files)
    // Local .env files take precedence over CI environment variables
    const env = { ...processEnvViteVars, ...fileEnv };

    return {
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

        plugins: [htmlEnvInjectionPlugin(env), svgr(), react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

        build: {
            sourcemap: env.VITE_ENV !== 'PROD',
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
    };
});
