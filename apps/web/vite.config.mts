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
    // Detect explicit deploy context (CI secrets or local deploy script)
    const isExplicitDeploy = process.env.CI === 'true' || process.env.DEPLOY_ENV != null;

    // Capture VITE_ vars from process.env before loadEnv
    // - In CI: these are GitHub Actions secrets (authoritative)
    // - In local deploy: these are sourced from .env.{env} by deploy script
    // - In local dev: these are Nx auto-loaded from .env (not useful for mode override)
    const processViteVars: Record<string, string> = {};
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('VITE_')) {
            processViteVars[key] = process.env[key] as string;
            delete process.env[key];
        }
    }

    // Load env from .env files (e.g., .env.dev, .env.prod)
    // With VITE_ cleared from process.env, loadEnv correctly
    // prioritizes .env.[mode] over .env
    const fileEnv = loadEnv(mode, import.meta.dirname, '');

    // Restore process.env
    for (const [key, value] of Object.entries(processViteVars)) {
        process.env[key] = value;
    }

    // In explicit deploy (CI or local deploy script): process.env overrides .env files
    // In local dev: .env files are the source of truth
    const env = isExplicitDeploy ? { ...fileEnv, ...processViteVars } : fileEnv;

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
