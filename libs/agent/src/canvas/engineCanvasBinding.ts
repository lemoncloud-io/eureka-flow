import type { CanvasBinding, EdgeSpec, NodePatch, XY } from './canvasBinding';
import type { FlowEngine } from '@flows/engine';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** The history label an agent edit is checkpointed under, by what the patch touches. */
const labelFor = (patch: NodePatch): string => {
    if (patch.position) return 'agent:move';
    if (patch.config) return 'agent:config';
    return 'agent:rename';
};

/**
 * {@link CanvasBinding} over the engine that owns the graph — one binding for the desktop
 * editor, the mobile editor, the tutorial and a headless Node run.
 *
 * No permission check here: `ToolExecutor` already gates each tool on the capability it
 * requires, and a coarser gate could only fail silently. See `design/canvas-binding.md`.
 */
export const createEngineCanvasBinding = (engine: FlowEngine): CanvasBinding => {
    const nodeById = (id: string): NodeData | undefined => engine.getGraph().nodes.find(n => n.id === id);

    return {
        // The engine, not `useCanvasStore` — that projection pauses mid-drag, leaving it both
        // behind on committed edits and ahead on uncommitted preview coordinates.
        readGraph: () => {
            const { nodes, edges } = engine.getGraph();
            return { nodes, edges };
        },

        updateNode: (id, patch) => {
            const updates: Partial<NodeData> = {};
            if (patch.label !== undefined) {
                // '' clears the override → the node falls back to its definition label.
                updates.customLabel = patch.label || undefined;
            }
            if (patch.position) {
                // Replace position whole — never a partial axis.
                updates.position = { x: patch.position.x, y: patch.position.y };
            }
            if (patch.config) {
                // `ops.updateNode` replaces `config` wholesale, so this merge is what keeps the
                // keys the patch omits.
                updates.config = { ...(nodeById(id)?.config ?? {}), ...patch.config };
            }

            // One call, one transaction, so one undo takes it back — like a user drag, and it
            // travels in the next save. Not `applyRuntime`: that skips history, for run state.
            // A missing id throws NODE_NOT_FOUND, which the executor turns into a tool error.
            engine.transact(labelFor(patch), ops => ops.updateNode(id, updates));
        },

        // Structural writes each take one transaction, so one undo takes them back. Validation
        // happened in the tool; these are mechanical. The block registry seeds defaults on the
        // engine side, so no config is passed here — `ops.addNode` fills it in.
        addNode: (type: string, position: XY): { id: string } => {
            let id = '';
            engine.transact('agent:add-node', ops => {
                id = ops.addNode({ type, position: { x: position.x, y: position.y } });
            });
            return { id };
        },

        // The incident edges go with the node — `ops.removeNodes` cascades.
        deleteNode: (id: string) => {
            engine.transact('agent:delete-node', ops => ops.removeNodes([id]));
        },

        // Append only: the edge tool has already validated the target input is free, so `ops.connect`
        // never has an existing edge to displace here. A refused connect (cycle/incompatible ports)
        // throws an EngineError, which the executor turns into a tool error.
        addEdge: (spec: EdgeSpec): { id: string } => {
            let id = '';
            engine.transact('agent:add-edge', ops => {
                id = ops.connect(spec);
            });
            return { id };
        },

        deleteEdge: (id: string) => {
            engine.transact('agent:delete-edge', ops => ops.disconnect([id]));
        },
    };
};
