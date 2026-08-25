import { CANVAS_MUTATE } from '../trace/events';

import type { CanvasBinding } from './canvasBinding';
import type { Tracer } from '../trace';

/**
 * A per-agent {@link CanvasBinding} decorator over the ONE shared live binding: each mutating method
 * applies on the inner binding, then emits a `canvas.mutate` event attributed to the acting agent.
 * `readGraph` passes straight through (no event). `getTracer` is an accessor so context can advance.
 * The twin of {@link tracingGateway} — same decorate-and-emit shape, over the canvas seam.
 *
 * Safe under concurrent sub-agents because each `inner.*` call is synchronous (JS single-threaded): the
 * mutation and its emit are atomic, and interleaving only occurs at `await` points the correlation IDs span.
 */
export const tracingCanvasBinding = (inner: CanvasBinding, getTracer: () => Tracer): CanvasBinding => ({
    readGraph: () => inner.readGraph(),

    updateNode(id, patch) {
        inner.updateNode(id, patch);
        getTracer().emit({ name: CANVAS_MUTATE, fields: { op: 'updateNode', nodeId: id } });
    },

    addNode(type, position) {
        const created = inner.addNode(type, position);
        getTracer().emit({ name: CANVAS_MUTATE, fields: { op: 'addNode', nodeId: created.id, type } });
        return created;
    },

    deleteNode(id) {
        inner.deleteNode(id);
        getTracer().emit({ name: CANVAS_MUTATE, fields: { op: 'deleteNode', nodeId: id } });
    },

    addEdge(spec) {
        const created = inner.addEdge(spec);
        getTracer().emit({ name: CANVAS_MUTATE, fields: { op: 'addEdge', edgeId: created.id } });
        return created;
    },

    deleteEdge(id) {
        inner.deleteEdge(id);
        getTracer().emit({ name: CANVAS_MUTATE, fields: { op: 'deleteEdge', edgeId: id } });
    },
});
