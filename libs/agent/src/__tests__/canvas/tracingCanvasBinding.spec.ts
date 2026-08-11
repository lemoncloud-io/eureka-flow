import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { tracingCanvasBinding } from '../../canvas/tracingCanvasBinding';
import { createTracer, memorySink } from '../../trace';

describe('tracingCanvasBinding', () => {
    it('emits canvas.mutate on addNode with the created id, and passes the id through', () => {
        const sink = memorySink();
        const binding = tracingCanvasBinding(createInMemoryCanvasBinding(), () => createTracer(sink, () => 0));

        const { id } = binding.addNode('http_request', { x: 10, y: 20 });

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].name).toBe('canvas.mutate');
        expect(sink.records[0].fields).toMatchObject({ op: 'addNode', nodeId: id, type: 'http_request' });
    });

    it('emits one canvas.mutate per mutating call, none for readGraph', () => {
        const sink = memorySink();
        const binding = tracingCanvasBinding(createInMemoryCanvasBinding(), () => createTracer(sink, () => 0));

        const { id } = binding.addNode('http_request', { x: 0, y: 0 });
        binding.updateNode(id, { label: 'Fetch' });
        binding.readGraph();
        binding.deleteNode(id);

        expect(sink.records.map(r => r.fields.op)).toEqual(['addNode', 'updateNode', 'deleteNode']);
    });
});
