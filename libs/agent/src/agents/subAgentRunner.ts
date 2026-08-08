import { createBlockAgent } from './blockAgent';
import { tracingCanvasBinding } from '../canvas/tracingCanvasBinding';
import { createInMemorySessionStore } from '../session/session';
import { AGENT_RETURN, AGENT_SPAWN, NoopTracer } from '../trace';
import { errorMessage } from '../utils/errors';

import type { AgentRegistration, AgentRoster } from './roster';
import type { CanvasBinding } from '../canvas/canvasBinding';
import type { CatalogLookup } from '../catalog';
import type { LlmGateway } from '../llm/llmGateway';
import type { AgentGrant } from '../permissions';
import type { SessionState } from '../session/session';
import type { Tracer } from '../trace';

/** A concrete, self-contained task handed to a specialist (no transcript inheritance). */
export interface SpawnChildSpec {
    /** COMPLETE, self-contained instruction (concrete node id + concrete values). Can't ask the user. */
    task: string;
    /** Roster key → persona + tool provider. */
    agentType: string;
    // No `grant`: a child is bounded by its specialist's fixed grant + the user-permission ceiling at the executor.
}

/** What a child reports back — its final summary + whether the sub-turn ran to completion. */
export interface SpawnChildResult {
    /** The sub-turn RAN TO COMPLETION (phase !== 'error') — NOT that the edit succeeded. Read `summary` to judge success/partial/refused. */
    completed: boolean;
    summary: string;
}

export interface SpawnInput {
    children: SpawnChildSpec[];
}
export type SpawnResult = { children: SpawnChildResult[] };

/** Fans out sub-agents over the shared live canvas: spawns each spec as a bounded sub-turn, barrier-joins, returns results in order. */
export interface SubAgentRunner {
    fanOut(
        specs: SpawnChildSpec[],
        binding: CanvasBinding,
        signal?: AbortSignal,
        parentTracer?: Tracer
    ): Promise<SpawnChildResult[]>;
}

/**
 * Resolve an `agentType` the roster does not explicitly carry to a GENERIC block agent, if the type is a real
 * catalog block. This is the hybrid roster's fallback: named specialists (the builder, the generator) are
 * explicit registrations; every other catalog block type gets a `BlockAgent(type)` synthesized on the fly.
 * Returns `undefined` for a non-block type, so the runner's "no specialist" failure path is unchanged.
 */
const genericBlockRegistration = (type: string, catalog: CatalogLookup): AgentRegistration | undefined => {
    if (!catalog.has(type)) {
        return undefined;
    }
    const label = catalog.schema(type)?.label ?? type;
    return {
        type,
        summary: `block agent for ${label}: configure a ${type} node`,
        create: deps => createBlockAgent({ ...deps, blockType: type }),
    };
};

/** The last pure-text assistant message — a child's summary back to the orchestrator. */
const lastAssistantText = (state: SessionState | null): string | undefined => {
    if (!state) {
        return undefined;
    }
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
        const msg = state.messages[i];
        if (msg.role === 'assistant' && msg.content && !msg.toolCalls?.length) {
            return msg.content;
        }
    }
    return undefined;
};

export interface SubAgentRunnerDeps {
    roster: AgentRoster;
    catalog: CatalogLookup;
    /** One gateway per child, keyed by agentType. */
    gatewayFor: (agentType: string) => LlmGateway;
    flowId: string;
    /** Dispatch mode: parallel barrier fan-out (default) or serial. */
    dispatchMode?: 'parallel' | 'serial';
    maxIterations?: number;
    /** The current user's flow-role ceiling; forwarded to every child so the executor gates on it (R2). */
    userPermissions: AgentGrant;
    /** Run-monotonic instance-id source for `gen_ai.agent.id` (e.g. builder#3); default a private counter. */
    nextSpawnId?: () => number;
}

/** Build a {@link SubAgentRunner}: each child gets its own isolated storage + flowId, its own gateway, and its own fixed grant, with `userPermissions` riding along for the executor to gate on (R2). */
export const createSubAgentRunner = (deps: SubAgentRunnerDeps): SubAgentRunner => {
    const { roster, catalog, gatewayFor, flowId, dispatchMode = 'parallel', maxIterations, userPermissions } = deps;
    let spawnSeq = 0;
    const nextSpawnId = deps.nextSpawnId ?? (() => (spawnSeq += 1));

    const runOne = async (
        spec: SpawnChildSpec,
        binding: CanvasBinding,
        signal: AbortSignal | undefined,
        parentTracer: Tracer
    ): Promise<SpawnChildResult> => {
        // A named registration wins; otherwise fall back to a generic block agent when the agentType is a
        // real catalog block type.
        const registration = roster.get(spec.agentType) ?? genericBlockRegistration(spec.agentType, catalog);
        if (!registration) {
            return { completed: false, summary: `no specialist of type "${spec.agentType}" is available` };
        }

        // Bind the child's identity: a run-monotonic instance id, and a flowPath that nests under the parent —
        // so two same-type children never collide, in one batch or across steps.
        const agentId = `${spec.agentType}#${nextSpawnId()}`;
        const childFlowId = `${flowId}:${agentId}`;
        const childTracer = parentTracer.child({
            'gen_ai.agent.name': spec.agentType,
            'gen_ai.agent.id': agentId,
            flowPath: childFlowId,
        });
        parentTracer.emit({ name: AGENT_SPAWN, level: 'info', fields: { agentType: spec.agentType, task: spec.task } });

        const storage = createInMemorySessionStore();
        const child = registration.create({
            gateway: gatewayFor(spec.agentType),
            storage,
            flowId: childFlowId,
            maxIterations,
            // Wrap the shared binding so the child's canvas edits emit canvas.mutate attributed to it.
            binding: tracingCanvasBinding(binding, () => childTracer),
            catalog,
            userPermissions,
            tracer: childTracer,
        });

        const result = await runChild(child, spec, storage, childFlowId, signal);
        parentTracer.emit({ name: AGENT_RETURN, level: 'info', fields: { agentType: spec.agentType, ...result } });
        return result;
    };

    const runChild = async (
        child: ReturnType<AgentRegistration['create']>,
        spec: SpawnChildSpec,
        storage: ReturnType<typeof createInMemorySessionStore>,
        childFlowId: string,
        signal?: AbortSignal
    ): Promise<SpawnChildResult> => {
        try {
            await child.send(spec.task, { signal });
        } catch (err) {
            return { completed: false, summary: errorMessage(err) };
        }
        const state = storage.load(childFlowId);
        return {
            completed: state?.phase !== 'error',
            summary: lastAssistantText(state) ?? '(sub-agent returned no summary)',
        };
    };

    return {
        fanOut: async (specs, binding, signal, parentTracer = NoopTracer) => {
            if (dispatchMode === 'serial') {
                const results: SpawnChildResult[] = [];
                for (const spec of specs) {
                    results.push(await runOne(spec, binding, signal, parentTracer));
                }
                return results;
            }
            // BARRIER fan-out: all children run concurrently, results gathered in original order.
            return Promise.all(specs.map(spec => runOne(spec, binding, signal, parentTracer)));
        },
    };
};
