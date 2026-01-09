/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Custom plugin for env injection
function htmlEnvInjectionPlugin() {
  return {
    name: 'html-env-injection',
    transformIndexHtml(html: string) {
      const envVarsCode = Object.keys(process.env)
        .filter((key) => key.startsWith('VITE_'))
        .map((key) => `window.${key}="${process.env[key]}";`)
        .join('');
      return html.replace(
        '<script type="module"',
        `<script>globalThis.process = { env: { NODE_ENV: "${process.env.NODE_ENV}" } };${envVarsCode}</script>\n<script type="module"`
      );
    },
  };
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [react(), htmlEnvInjectionPlugin()],
  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
