import { createFixtureCatalog } from './fixtures';
import { parseOutcome } from './turnOutcome';
import { createOrchestratorAgent } from '../../agents/orchestratorAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../session/session';

import type { TurnOutcome } from './turnOutcome';
import type { AgentRoster } from '../../agents/roster';
import type { CanvasBinding, Graph } from '../../canvas/canvasBinding';
import type { CatalogLookup } from '../../catalog';
import type { FakeScriptStep } from '../../llm/fakeGateway';
import type { LlmGateway } from '../../llm/llmGateway';
import type { AgentGrant } from '../../permissions';
import type { SessionState } from '../../session/session';

/** Per-agent fake-gateway scripts, keyed by agentType (e.g. `orchestrator`, `locator`, `edge`, `builder`, `single-output-generator`, or a generic block type). */
export type FakeScript = Record<string, FakeScriptStep[]>;

export interface ScenarioInput {
    objective: string;
    initialGraph: Graph;
    /** The current user's permissions — the flow-role ceiling the executor gates every child tool
     *  against. Defaults to full edit; pass `{}` for the viewer permission scenario (R2). */
    userPermissions?: AgentGrant;
    /** Per-agent fake-gateway scripts; OMIT (and pass `makeGateway`) for a real-model run. */
    script?: FakeScript;
    /**
     * Real-model override: build the {@link LlmGateway} for a given agentType. When provided, it replaces
     * the scripted fake gateway for every agent —
     * this is how a live run (e.g. a tool-capable Gemini gateway) drives the whole turn. Returning the
     * same instance for all agents is fine; each `chat()` call is independent.
     */
    makeGateway?: (agentType: string) => LlmGateway;
    /** Dispatch mode for sub-agents — for the serial≡parallel proof (A4). Default parallel. */
    mode?: 'parallel' | 'serial';
    /** Catalog override; defaults to the fixture catalog. */
    catalog?: CatalogLookup;
    /**
     * Specialist roster the orchestrator may `spawn` into. OMIT for the default roster. The eval-benchmark
     * (eval-benchmark.md) is the one caller that sets it — swapping the roster is how it runs the SAME
     * scenario against the two designs (Strategy 1 fan-out vs Strategy 2 builder). A pure passthrough:
     * `createOrchestratorAgent` already accepts a `roster` and falls back to the default when it is absent.
     */
    roster?: AgentRoster;
}

export interface TurnResult {
    /** Parsed from the eval's test-only re-ask (`parseOutcome`); an unparseable reply falls back to `refused`. */
    outcome: TurnOutcome;
    /** Live graph AFTER the turn — the direct-edit oracle (specialists edit the live canvas). */
    graph: Graph;
    /** Did the live graph change this turn (⇔ something landed). */
    committed: boolean;
    /** Test affordance: read the live binding directly. */
    live: CanvasBinding;
}

/** The eval's test-only re-ask: get the just-finished turn's outcome as a parseable JSON object. */
const OUTCOME_REQUEST =
    'The turn is over. Reply with ONLY a JSON object describing its outcome, matching: ' +
    '{ "status": "applied" | "partial" | "refused" | "answered", "summary"?: string, "applied"?: string[], ' +
    '"failed"?: [{ "task": string, "reason": string }], "answer"?: string, "reason"?: string }. ' +
    'Choose the status by what actually happened: ' +
    '"applied" = the user asked for edits and ALL of them landed; ' +
    '"partial" = the user asked for edits and SOME landed while others could not; ' +
    '"answered" = the user only asked a QUESTION (no edit was requested) and you answered it; ' +
    '"refused" = the user asked for an action but NOTHING landed — you could not act (no such node, no capable ' +
    'specialist, an invalid value, a rejected edit, permission denied) or you need a decision from the user ' +
    '(put the reason, and any question, in "reason").';

/** The content of the last assistant message in a session (the orchestrator's reply to parse). */
const lastAssistantText = (state: SessionState | null): string => {
    const msgs = state?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const m = msgs[i];
        if (m.role === 'assistant' && m.content) return m.content;
    }
    return '';
};

/**
 * Run one scenario end-to-end, headless: build the fixture catalog + this-phase roster, clone the
 * initial graph into a live in-memory canvas, and run the orchestrator over that LIVE binding with
 * per-agent gateways — the specialists edit the canvas **directly** (the shared draft + replay is
 * deferred). Returns a {@link TurnResult} the oracle reads. Pass `script` for a deterministic fake run,
 * or `makeGateway` (a tool-capable gateway) to drive a real model live.
 */
export const runScenario = async (input: ScenarioInput): Promise<TurnResult> => {
    const userPermissions = input.userPermissions ?? { canModifyCanvas: true, canEditConfig: true };
    const catalog = input.catalog ?? createFixtureCatalog();
    const flowId = 'scenario';

    // Deep-clone so the live binding and the pre-turn snapshot never share nested objects with the input
    // graph (a shallow spread would leave node `position`/`config` and edge state shared). `structuredClone`
    // copies the whole `{ nodes, edges }` tree; the graph is plain serialisable data, so it never throws.
    const live = createInMemoryCanvasBinding(structuredClone(input.initialGraph));
    const preSnapshot = structuredClone(input.initialGraph);

    const scriptFor = (agentType: string): FakeScriptStep[] => input.script?.[agentType] ?? [];
    // A real gateway (input.makeGateway) drives a live model run; otherwise each agent gets its
    // scripted fake gateway. Same seam for both, so scenarios are identical scripted-vs-live. The
    // orchestrator builds its own roster + sub-agent runner from these.
    const gatewayFor = input.makeGateway ?? ((agentType: string) => createFakeGateway(scriptFor(agentType)));

    const storage = createInMemorySessionStore();
    const orchestrator = createOrchestratorAgent({
        gateway: gatewayFor('orchestrator'),
        gatewayFor,
        storage,
        flowId,
        binding: live,
        catalog,
        userPermissions,
        mode: input.mode,
        roster: input.roster, // undefined ⇒ createDefaultRoster(); the benchmark passes fanout/builder here
    });

    // A turn that threw is recorded by BaseAgent.send as `phase: 'error'` and NOT rethrown; surface it here
    // so a real gateway/loop failure becomes an eval error (with its reason), not a masked `refused`.
    const failIfErrored = (): void => {
        const state = storage.load(flowId);
        if (state?.phase === 'error') {
            throw new Error(state.error ?? `${flowId}: the turn errored`);
        }
    };

    await orchestrator.send(input.objective);
    failIfErrored();

    // The work turn is done; freeze the graph oracle BEFORE the re-ask so the meta-question can't affect it.
    const graph = structuredClone(live.readGraph());
    // Truthful "did anything land": the live graph differs from the pre-turn snapshot.
    const committed = JSON.stringify(graph) !== JSON.stringify(preSnapshot);

    // TEST-ONLY outcome extraction. Production ends the turn with the orchestrator's plain-text message and
    // never produces a structured outcome (the app renders the transcript). The oracle needs one, so re-ask
    // the orchestrator for the turn's outcome as JSON and parse it (`parseOutcome`, refused fallback). This
    // never runs in production — it is the eval harness.
    await orchestrator.send(OUTCOME_REQUEST);
    failIfErrored();
    const outcome = parseOutcome(lastAssistantText(storage.load(flowId)));

    return { outcome, graph, committed, live };
};
