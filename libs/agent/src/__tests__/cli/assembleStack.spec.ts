import { describe, expect, it, vi } from 'vitest';

import { assembleStack } from '../../cli/assembleStack';

import type { HttpPort } from '@flows/engine';

describe('assembleStack (offline — real engine + stub blocks)', () => {
    it('loads the stub block registry into a catalog the agent can search', async () => {
        const { catalog } = await assembleStack({ connected: false });

        // Empty query returns the whole catalog — the four fixture-vertical blocks.
        expect(
            catalog
                .search('')
                .map(b => b.type)
                .sort()
        ).toEqual(['buffer', 'input-text', 'output-preview', 'single-output-generator']);
        expect(catalog.has('input-text')).toBe(true);
        // A capability query narrows; the generator's select field surfaces as an enum.
        const generator = catalog.schema('single-output-generator');
        expect(generator?.outputs.map(o => o.portId)).toEqual(['out', 'err']);
        expect((generator?.config.properties?.model as { enum?: string[] })?.enum).toContain('gemini-2.5-flash');
    });

    it('starts with an empty canvas and edits go through the REAL engine binding', async () => {
        const { binding } = await assembleStack({ connected: false });
        expect(binding.readGraph()).toEqual({ nodes: [], edges: [] });

        const { id: inputId } = binding.addNode('input-text', { x: 0, y: 0 });
        const { id: previewId } = binding.addNode('output-preview', { x: 300, y: 0 });
        const graph = binding.readGraph();
        expect(graph.nodes).toHaveLength(2);
        // The engine mints the id and seeds the node from the registry (config is an object, not undefined).
        const input = graph.nodes.find(n => n.id === inputId);
        expect(input?.type).toBe('input-text');
        expect(typeof input?.config).toBe('object');

        // A valid wire (text out → text in) is accepted by the engine.
        binding.addEdge({ sourceNodeId: inputId, sourcePortId: 'out', targetNodeId: previewId, targetPortId: 'in' });
        expect(binding.readGraph().edges).toHaveLength(1);
    });

    it('refuses connected mode without a baseUrl', async () => {
        await expect(assembleStack({ connected: true })).rejects.toThrow('baseUrl');
    });

    it('applies the injected wrapHttp decorator to the port (the seam the wire log rides in terminal.ts)', async () => {
        const wrapHttp = vi.fn((port: HttpPort) => port);
        await assembleStack({ connected: false, wrapHttp });
        expect(wrapHttp).toHaveBeenCalledTimes(1);
    });
});
