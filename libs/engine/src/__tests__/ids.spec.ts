import { describe, expect, it } from 'vitest';

import { newEdgeId, newNodeId } from '../core/ids';

/**
 * The charset is a server contract, not a style choice — see `core/ids.ts`. These run
 * under `environment: 'node'`, which also proves the generator does not need a browser.
 */
describe('graph ids', () => {
    const generators = [
        ['newNodeId', newNodeId, 'n'],
        ['newEdgeId', newEdgeId, 'e'],
    ] as const;

    it.each(generators)('%s emits a prefix followed by hex only', (_name, generate) => {
        for (let i = 0; i < 200; i++) {
            expect(generate()).toMatch(/^[a-z][0-9a-f]+$/);
        }
    });

    it.each(generators)('%s never emits a character the server parses on', (_name, generate) => {
        // ':' port ref, '-' collides with ':' in the DB key, '@' run ref, '#' delete marker
        for (let i = 0; i < 200; i++) {
            expect(generate()).not.toMatch(/[:\-@#]/);
        }
    });

    it.each(generators)('%s never looks like a server sequence id', (_name, generate) => {
        for (let i = 0; i < 200; i++) {
            expect(generate()).not.toMatch(/^[0-9]/);
        }
    });

    it.each(generators)('%s prefixes with %s', (_name, generate, prefix) => {
        expect(generate().startsWith(prefix)).toBe(true);
    });

    it('does not collide across generators or calls', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 2000; i++) {
            ids.add(newNodeId());
            ids.add(newEdgeId());
        }
        expect(ids.size).toBe(4000);
    });
});
