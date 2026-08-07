import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { build } from 'esbuild';

/**
 * Bundle the terminal entry to a runnable Node ESM file. Two things the esbuild CLI can't express force the
 * JS API:
 *   1. `.md?raw` — the skills load playbooks via Vite's `?raw` import; inline them as text here.
 *   2. tsconfig `paths` — `@flows/engine` / `@flows/flows` resolve to source only through tsconfig.base.json.
 */
const mdRaw = {
    name: 'md-raw',
    setup(b) {
        b.onResolve({ filter: /\.md\?raw$/ }, args => ({
            path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
            namespace: 'md-raw',
        }));
        b.onLoad({ filter: /.*/, namespace: 'md-raw' }, async args => ({
            contents: await readFile(args.path, 'utf8'),
            loader: 'text',
        }));
    },
};

await build({
    entryPoints: ['libs/agent/src/cli/terminal.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: 'dist/agent-cli/terminal.mjs',
    tsconfig: 'tsconfig.base.json', // resolves @flows/engine, @flows/flows via `paths`
    plugins: [mdRaw],
    logLevel: 'info',
});
