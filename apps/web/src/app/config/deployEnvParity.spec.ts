import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A `VITE_*` var that is documented in `apps/web/.env.example` but absent from a deploy workflow's
 * `env:` block builds with an empty value — the feature it gates silently degrades instead of
 * failing. That is exactly how `VITE_TOOL_WS_ENDPOINT` shipped: added to the example by the tool
 * WebSocket commit, never added to CI, so every DEV/PROD build ran the agent's HTTP-only fallback.
 * This guards the parity rather than the one variable.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const WORKFLOWS = ['deploy-dev.yml', 'deploy-prod.yml', 'force-deploy.yml'] as const;

const read = (relative: string): string => readFileSync(resolve(REPO_ROOT, relative), 'utf-8');

/** Keys that are actually set in the example — commented-out lines are opt-in, not required. */
const documentedKeys = (): string[] => [
    ...new Set(
        read('apps/web/.env.example')
            .split('\n')
            .map(line => /^\s*(VITE_[A-Z0-9_]+)\s*=/.exec(line)?.[1])
            .filter((key): key is string => !!key)
    ),
];

describe('deploy env parity', () => {
    it('documents at least the endpoints the app cannot run without', () => {
        expect(documentedKeys()).toEqual(expect.arrayContaining(['VITE_API_URL', 'VITE_TOOL_WS_ENDPOINT']));
    });

    it.each(WORKFLOWS)('%s passes every documented VITE_ var to the build', workflow => {
        const yaml = read(`.github/workflows/${workflow}`);
        const missing = documentedKeys().filter(key => !new RegExp(`^\\s*${key}:`, 'm').test(yaml));
        expect(missing).toEqual([]);
    });
});
