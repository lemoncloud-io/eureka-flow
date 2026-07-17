import { describe, expect, it } from 'vitest';

import { newEdgeId, newNodeId } from '@flows/flows';

describe('graphId', () => {
    const generators = [
        ['newNodeId', newNodeId, 'n'],
        ['newEdgeId', newEdgeId, 'e'],
    ] as const;

    it.each(generators)('%s uses only characters the server treats as inert', (_name, generate) => {
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
        expect(generate()).not.toMatch(/^[0-9]/);
    });

    it.each(generators)('%s prefixes with %s', (_name, generate, prefix) => {
        expect(generate().startsWith(prefix)).toBe(true);
    });

    it.each(generators)('%s does not collide with the retired temp-id prefixes', (_name, generate) => {
        const id = generate();
        for (const retired of ['temp_', 'edge_', 'node_']) {
            expect(id.startsWith(retired)).toBe(false);
        }
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
