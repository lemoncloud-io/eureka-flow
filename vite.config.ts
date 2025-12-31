import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const removeVitePrefix = (envVar: string) => envVar.replace('VITE_', '');

const htmlEnvInjectionPlugin = (env: Record<string, string>) => {
  return {
    name: 'html-env-injection',
    transformIndexHtml: {
      transform(html: string) {
        const envVars = Object.entries(env)
            .filter(([key]) => key.startsWith('VITE_'))
            .reduce((acc, [key, value]) => {
              acc[removeVitePrefix(key)] = value || '';
              return acc;
            }, {} as Record<string, string>);

        const envScript = `<script>
    (function() {
      ${Object.entries(envVars)
          .map(([key, value]) => `window.${key}="${value}";`)
          .join('\n')}
    })();
  </script>`;

        return html.replace(/<head>/, `<head>\n${envScript}`);
      },
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [htmlEnvInjectionPlugin(env), react()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, './src/shared')
      }
    }
  };
});
