import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureIds, newEdgeId, newNodeId } from '../core/ids';

/**
 * The charset is a server contract, not a style choice — see `core/ids.ts`. These run
 * under `environment: 'node'`, which also proves the generator does not need a browser.
 */
describe('graph ids', () => {
    // Installing a generator is process-wide by design, so a spec that leaves one in place
    // would have the collision test below asserting against a fake.
    afterEach(() => {
        configureIds(null);
        vi.unstubAllGlobals();
    });

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

    /**
     * The platform seam. React Native has no `crypto`, and a browser served over plain http
     * has one without `randomUUID` — on either, everything that mints an id (adding a node,
     * pasting, loading a flow whose edges have no ids) fails until a source is installed.
     */
    describe('on a platform without crypto.randomUUID', () => {
        const absent = [
            ['no crypto at all — React Native', undefined],
            ['crypto without randomUUID — http browser', {}],
        ] as const;

        it.each(absent)('%s: says what to do instead of failing on undefined', (_case, stub) => {
            vi.stubGlobal('crypto', stub);
            expect(() => newNodeId()).toThrow(/configureIds/);
        });

        it.each(absent)('%s: mints again once a source is installed', (_case, stub) => {
            vi.stubGlobal('crypto', stub);
            let n = 0;
            configureIds(() => `0000000000000000000000000000000${n++}`);

            expect(newNodeId()).toBe('n00000000000000000000000000000000');
            expect(newEdgeId()).toBe('e00000000000000000000000000000001');
        });
    });

    /**
     * An injected source is normalized like the platform's, so a host that hands over a
     * dashed UUID cannot change what reaches the server. `-` is the character the DynamoDB
     * key builder rewrites into the port separator, so letting one through would put a node
     * and a port on the same row.
     */
    it('strips dashes from an injected generator too', () => {
        configureIds(() => '018f2b9c-4d3e-7a1b-9c8d-0e1f2a3b4c5d');

        expect(newNodeId()).toBe('n018f2b9c4d3e7a1b9c8d0e1f2a3b4c5d');
        expect(newNodeId()).not.toMatch(/[:\-@#]/);
    });

    it('goes back to the platform source when the installed one is cleared', () => {
        configureIds(() => 'deadbeef');
        expect(newNodeId()).toBe('ndeadbeef');

        configureIds(null);
        expect(newNodeId()).not.toBe('ndeadbeef');
        expect(newNodeId()).toMatch(/^n[0-9a-f]{32}$/);
    });
});
