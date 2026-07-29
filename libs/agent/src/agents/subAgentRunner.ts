import { createInMemorySessionStore } from '../session/session';
import { errorMessage } from '../utils/errors';

import type { CanvasBinding } from '../canvas/canvasBinding';
import type { CatalogLookup } from '../catalog';
import type { AgentRoster } from './roster';
import type { LlmGateway } from '../llm/llmGateway';
import type { AgentGrant } from '../permissions';
import type { SessionState } from '../session/session';

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
    ok: boolean;
    summary: string;
}

export interface SpawnInput {
    children: SpawnChildSpec[];
}
export type SpawnResult = { children: SpawnChildResult[] };

/** Fans out sub-agents over the shared live canvas: spawns each spec as a bounded sub-turn, barrier-joins, returns results in order. */
export interface SubAgentRunner {
    fanOut(specs: SpawnChildSpec[], binding: CanvasBinding, signal?: AbortSignal): Promise<SpawnChildResult[]>;
}

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
    mode?: 'parallel' | 'serial';
    maxIterations?: number;
    /** The current user's flow-role ceiling; forwarded to every child so the executor gates on it (R2). */
    userPermissions: AgentGrant;
}

/** Build a {@link SubAgentRunner}: each child gets its own isolated storage + flowId, its own gateway, and its own fixed grant, with `userPermissions` riding along for the executor to gate on (R2). */
export const createSubAgentRunner = (deps: SubAgentRunnerDeps): SubAgentRunner => {
    const { roster, catalog, gatewayFor, flowId, mode = 'parallel', maxIterations, userPermissions } = deps;

    const runOne = async (
        spec: SpawnChildSpec,
        binding: CanvasBinding,
        signal?: AbortSignal
    ): Promise<SpawnChildResult> => {
        const registration = roster.get(spec.agentType);
        if (!registration) {
            return { ok: false, summary: `no specialist of type "${spec.agentType}" is available` };
        }
        const storage = createInMemorySessionStore();
        const childFlowId = `${flowId}:${spec.agentType}`;
        const child = registration.create({
            gateway: gatewayFor(spec.agentType),
            storage,
            flowId: childFlowId,
            maxIterations,
            binding,
            catalog,
            userPermissions,
        });

        try {
            await child.send(spec.task, { signal });
        } catch (err) {
            return { ok: false, summary: errorMessage(err) };
        }
        const state = storage.load(childFlowId);
        return {
            // ok = the sub-turn completed, not "the edit succeeded"; the orchestrator reads the summary to judge partial/refused.
            ok: state?.phase !== 'error',
            summary: lastAssistantText(state) ?? '(sub-agent returned no summary)',
        };
    };

    return {
        fanOut: async (specs, binding, signal) => {
            if (mode === 'serial') {
                const results: SpawnChildResult[] = [];
                for (const spec of specs) {
                    results.push(await runOne(spec, binding, signal));
                }
                return results;
            }
            // BARRIER fan-out: all children run concurrently, results gathered in original order.
            return Promise.all(specs.map(spec => runOne(spec, binding, signal)));
        },
    };
};
