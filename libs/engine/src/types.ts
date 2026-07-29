import type { BlockDefinition, DataPacket, EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

// ============================================================================
// Node Execution State (state field - replacing status)
// ============================================================================

/**
 * NodeState - execution state of a node (frontend subset of NodeStatusType)
 *
 * Values:
 * - IDLE: Initial state, no execution started
 * - READY: All inputs ready, waiting for execution
 * - RUNNING: Currently executing
 * - COMPLETED: Execution finished successfully
 * - ERROR: Execution failed
 *
 * @note API package's NodeStatusType also includes WAITING and SKIPPED.
 * Frontend uses this narrower type for UI state management.
 */
export type NodeState = 'IDLE' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ERROR';

const NODE_STATES: ReadonlySet<string> = new Set<NodeState>(['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR']);

/** Type guard: narrows NodeStatusType (or any string) to frontend NodeState */
export const isNodeState = (value: string): value is NodeState => NODE_STATES.has(value);

// ============================================================================
// Block Definition Extension (isFrontend support)
// ============================================================================

/**
 * BlockStereo - stereotype of block for categorization (frontend subset)
 *
 * NOTE: API package's BlockStereo includes additional values ('' | '#' | '#alias').
 * Frontend uses this narrower type for UI block categorization in the Sidebar.
 */
export type BlockStereo = 'input' | 'process' | 'output';

/**
 * BlockDefinitionWithFrontend - extends BlockDefinition with isFrontend flag
 *
 * This type extends the API package's BlockDefinition to include the `isFrontend`
 * flag from the server response. When the API package is updated, this can be removed.
 *
 * @see /blocks/0/list API response
 *
 * Execution logic:
 * - `isFrontend: true` → Execute on client (use `execute` function)
 * - `isFrontend: false` → Execute on server (call POST /nodes/:id/run)
 * - `isFrontend: undefined` → Fallback to legacy BACKEND_PROCESSOR_TYPES check
 */
export interface BlockDefinitionWithFrontend extends BlockDefinition {
    /**
     * Indicates whether this block should be executed on the frontend (client-side)
     * or requires backend processing (server-side).
     *
     * - `true`: Client-side execution using the `execute` function
     * - `false`: Server-side execution via POST /nodes/:id/run API
     * - `undefined`: Use legacy fallback (BACKEND_PROCESSOR_TYPES check)
     */
    isFrontend?: boolean;

    /**
     * Block stereotype for categorization (input, process, output)
     * Used by Sidebar for grouping blocks
     */
    stereo?: BlockStereo;

    /**
     * Indicates whether this block can be executed (shows run button)
     * - `true` or `undefined`: Run button is visible (default behavior)
     * - `false`: Run button is hidden
     */
    isRunnable?: boolean;

    /**
     * The function that runs when the block triggers (client-side only)
     * This is attached by the frontend when `isFrontend: true`
     */
    execute?: (
        inputs: Record<string, DataPacket>,
        config: Record<string, unknown>,
        onProgress?: (progress: number) => void
    ) => Promise<Record<string, DataPacket>>;
}

/**
 * `state` as the server actually sends it.
 *
 * `@lemoncloud/eureka-flows-api` still describes only the deprecated `status`, so every
 * reader of the field that replaced it has had to cast — the execution reducer casts the
 * patches it writes, and the layout code casts to read them back. Declaring it once keeps
 * the two in agreement instead of each guessing separately.
 *
 * Remove when the API package ships the field.
 */
/**
 * A node as the graph holds it.
 *
 * `NodeData.id` is optional on the wire — `''` is how the server is told to create one —
 * but nothing inside the document is reachable without an id: it is how nodes are
 * selected, connected and addressed. The client mints ids before a node enters the graph
 * (invariant 6: client ids are canonical), and `loadGraph` fills in any that are missing,
 * so the guarantee holds by construction rather than by hope.
 */
export type GraphNode = NodeData & { id: string };

/**
 * An edge as the graph holds it.
 *
 * Same reasoning as `GraphNode`: an edge with no id cannot be selected or deleted, and
 * `connect` mints one. `loadGraph` fills in any that are missing.
 */
export type GraphEdge = EdgeData & { id: string };

declare module '@lemoncloud/eureka-flows-api' {
    interface NodeData {
        /** IDLE → READY → RUNNING → COMPLETED/ERROR. Preferred over `status`. */
        state?: NodeState;
    }
}
