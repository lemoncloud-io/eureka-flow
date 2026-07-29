import type { FlowEngine, PortRow } from '@flows/engine';
import type { WorkflowState } from '@lemoncloud/eureka-flows-api';

/**
 * What the mobile editor has in hand when it loads: a server response, a draft it recovered,
 * or a flow it switched to. Only the first carries port rows.
 */
interface LoadableFlow extends Partial<WorkflowState> {
    /** Flows saved before the field was renamed still call their edges this. */
    connections?: WorkflowState['edges'];
    ports?: PortRow[];
}

/**
 * The mobile editor's one way into the graph.
 *
 * It exists because the port rows are easy to drop: they arrive *alongside* the nodes rather
 * than inside them (`libs/engine/src/core/ingress.ts`), and the store's `loadWorkflow` — what
 * every mobile load used to call — has no parameter to receive them. A flow opened that way
 * knew its shape but nothing its last run produced, so the step previews were blank until
 * something ran.
 *
 * Rows the server left `undefined` are dropped rather than passed as empty: `undefined` is it
 * declining to answer, `null` is it saying the port is empty, and only the second is news.
 */
export const loadFlowIntoEngine = (engine: FlowEngine, state: LoadableFlow): void =>
    engine.loadGraph(
        { nodes: state.nodes ?? [], edges: state.edges ?? state.connections ?? [] },
        { ports: (state.ports ?? []).filter(port => port.data !== undefined) }
    );
