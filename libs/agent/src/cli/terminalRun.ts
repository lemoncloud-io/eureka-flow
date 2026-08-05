import { createObservableSessionStore } from './observableSessionStore';
import { createOrchestratorAgent } from '../agents/orchestratorAgent';
import { emptySession } from '../session/session';

import type { CanvasBinding, Graph } from '../canvas';
import type { CatalogLookup } from '../catalog';
import type { LlmGateway } from '../llm/llmGateway';
import type { AgentGrant } from '../permissions';
import type { SessionState } from '../session/session';

/**
 * The terminal's driver: owns the observable session store + the orchestrator, drives one turn per `submit`,
 * and notifies subscribers on every agent write (that is what lets the renderer redraw mid-turn). Knows
 * nothing about the terminal or ANSI — the renderer subscribes via {@link TerminalRun.onChange}.
 */
export interface TerminalRun {
    /** Drive one turn. Resolves at the turn boundary; never throws (failures land as `phase:'error'`). */
    submit(text: string): Promise<void>;
    /** Cancel the in-flight turn and its spawned children; edits already applied stay. */
    abort(): void;
    /** Re-seed the canvas (via the injected `loadGraph`) and start a fresh session. */
    reset(seed?: Graph): void;
    /** The live canvas graph. */
    getGraph(): Graph;
    /** The latest emitted transcript+phase (null before the first turn / after reset). */
    getState(): SessionState | null;
    /** Subscribe to state changes; the listener also receives the freshly-read graph. Returns an unsubscribe. */
    onChange(listener: (state: SessionState, graph: Graph) => void): () => void;
}

export interface TerminalRunDeps {
    gateway: LlmGateway;
    binding: CanvasBinding;
    catalog: CatalogLookup;
    userPermissions: AgentGrant;
    /**
     * Re-seed the canvas graph on `reset` — the entry passes `engine.loadGraph` (the engine's single ingress).
     * Omit and `reset` only clears the session; the graph is left as-is.
     */
    loadGraph?: (graph: Graph) => void;
    /** Session key; same value all turns = one conversation. Default `terminal`. */
    flowId?: string;
}

export const createTerminalRun = (deps: TerminalRunDeps): TerminalRun => {
    const flowId = deps.flowId ?? 'terminal';
    const listeners = new Set<(state: SessionState, graph: Graph) => void>();
    let latest: SessionState | null = null;

    const notify = (state: SessionState): void => {
        latest = state;
        const graph = deps.binding.readGraph();
        listeners.forEach(listener => listener(state, graph));
    };

    // Rebuilt on reset so a fresh session starts clean; the same binding carries the (re-seeded) canvas.
    const build = (): ReturnType<typeof createOrchestratorAgent> =>
        createOrchestratorAgent({
            gateway: deps.gateway,
            storage: createObservableSessionStore(notify),
            flowId,
            binding: deps.binding,
            catalog: deps.catalog,
            userPermissions: deps.userPermissions,
        });

    let orchestrator = build();

    return {
        submit: text => orchestrator.send(text),
        abort: () => orchestrator.abort(),
        reset: seed => {
            deps.loadGraph?.(seed ?? { nodes: [], edges: [] });
            orchestrator = build();
            latest = null; // no turn yet — but still redraw the cleared state
            const graph = deps.binding.readGraph();
            listeners.forEach(listener => listener(emptySession(flowId), graph));
        },
        getGraph: () => deps.binding.readGraph(),
        getState: () => latest,
        onChange: listener => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};
