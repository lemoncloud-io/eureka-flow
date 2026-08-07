import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';

import type { Graph } from '../../canvas/canvasBinding';

const seed = (): Graph => ({ nodes: [{ id: 'n1', type: 'gen', position: { x: 0, y: 0 } }], edges: [] });

/**
 * The reference binding must behave like the engine binding on the corners a tool never reaches, or a spec
 * written against it would pass while the real (engine) binding fails. These pin the two the engine binding
 * added: an unknown id fails loudly, and an empty patch is a no-op.
 */
describe('createInMemoryCanvasBinding — mirrors the engine binding', () => {
    it('throws on an unknown id rather than silently doing nothing', () => {
        const binding = createInMemoryCanvasBinding(seed());
        expect(() => binding.updateNode('missing', { label: 'X' })).toThrow(/missing/);
        // The graph is untouched — nothing half-applied.
        expect(binding.readGraph().nodes.map(n => n.id)).toEqual(['n1']);
    });

    it('treats an empty patch as a no-op, even for an unknown id (no change, so no id check)', () => {
        const binding = createInMemoryCanvasBinding(seed());
        expect(() => binding.updateNode('missing', {})).not.toThrow();
        expect(binding.readGraph().nodes).toEqual(seed().nodes);
    });
});
