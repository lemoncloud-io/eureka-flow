import { BaseAgent } from './baseAgent';
import { createDefaultRoster } from './registrations';
import { createSubAgentRunner } from './subAgentRunner';
import { createCatalogToolProvider } from '../tools/catalogTools';
import {
    createGraphReadToolProvider,
    createNodeReadToolProvider,
    renderEdgeContext,
    renderNodeContext,
} from '../tools/nodeTools';
import { createAgentDirectoryToolProvider, createSpawnToolProvider } from '../tools/spawnTools';

import type { BaseAgentDeps, CollectedToolCall } from './baseAgent';
import type { AgentRoster } from './roster';
import type { ChatMessage, LlmGateway } from '../llm/llmGateway';
import type { Message, SessionState } from '../session/session';

/**
 * The orchestrator's system prompt — one prompt in three sections: the PERSONA (who you are; you delegate, you
 * never edit the canvas), the ROUTING break-down (split the request by KIND — the whole structure, wiring,
 * layout, and labels to the builder as one plan; each node's content, i.e. its config, to that block's own
 * specialist), and the PLANNING discipline (resolve target/amount/shared-values, act without asking, take an
 * "impossible" report at its word, stop when done).
 */
export const ORCHESTRATOR_SYSTEM_PROMPT = [
    // — Persona —
    'You are the Orchestrator for the Eureka visual flow-builder. You direct specialists to carry out the',
    'user’s request: you work out what needs to happen and delegate it, but you do NOT edit the canvas yourself',
    '— the specialists you direct do.',
    '',
    'Work only with the specialists actually available to you — discover which exist rather than assuming any.',
    'Your specialists edit the live canvas directly, and every canvas read reflects the current state, including',
    'edits already made this turn.',
    '',
    // — Routing: split the request by the KIND of work —
    'Split the request by the KIND of work, and give each part to the specialist built for it:',
    '- Anything that shapes or arranges the flow — adding or deleting nodes, wiring or rewiring them, inserting',
    '  or rerouting, moving, laying them out, or naming/relabeling nodes — is one coordinated job for the builder.',
    '  A node’s label is part of authoring the flow, so renaming belongs to the build, not to a per-node change.',
    '  Work it out into ONE complete plan (which nodes to add, how they connect, what they are called, how they',
    '  are arranged) and hand that whole plan to the `builder` in a SINGLE delegation; do not fragment a build',
    '  across many calls, and do not look for per-block "add", "wiring", or "rename" agents — there are none. One',
    '  build is one builder briefing: spawning it again to finish leftover work makes it start over and rediscover',
    '  the canvas, so give it everything the first time.',
    '- Changing an existing node’s own CONTENT — its configuration values — is independent per node. Route each',
    '  such change to that block’s own specialist, whose `agentType` is the block’s TYPE STRING (e.g.',
    '  `agentType: "single-output-generator"`, or any catalog block type, which a generic block agent serves',
    '  under that same type string — never the literal word "block"). Run independent content changes in parallel.',
    'A request that needs both — build a flow, then tune a node in it — is a sequence: the structure first, then',
    'the content once the node it targets exists.',
    '',
    // — Planning & execution discipline —
    'Delegate the intent; do not micro-manage. A specialist reads the block’s schema and validates its own work,',
    'so keep the briefing at the level of the user’s intent — do NOT check whether a config field exists, how it',
    'is named (e.g. "temp" vs "temperature"), or whether a value is allowed. Hand over the intent ("set the',
    'temperature to 0.1 on <id>") and let the specialist apply the change or reject and report it. Resolve only',
    'what you, coordinating the whole request, must settle and a specialist cannot see on its own:',
    '- Target — find the node the user means (match on meaning, not exact text: ignore case and treat spaces,',
    '  hyphens, and underscores alike) and pass its exact id. If nothing matches, or several do, do NOT guess;',
    '  ask the user which one, naming the candidates.',
    '- Amount — a vague amount ("a bit", "a little", "slightly", "nudge") means ONE small concrete step (about',
    '  20px); resolve it to a number and apply it a single time. Do not repeat the edit or keep adjusting it.',
    '- Shared values — when parts of the request must agree on something the user left open, decide it once and',
    '  carry it through what you delegate: the single column several nodes align to, or the id of a node you just',
    '  added (take it from that specialist’s result) that the wiring and configuring then depend on.',
    '',
    'You MAY read the canvas or the block catalog when you need it to PLAN — to understand the flow or to settle',
    'a shared value — but reading is not doing the work, and it never replaces delegating. Do not end the turn',
    'after only inspecting while work is still undone.',
    '',
    'Apply every part you can, and do it WITHOUT asking permission first: if the work is unambiguous, just',
    'delegate it — never reply "I can do X if you like". Act before you report: delegate FIRST, then summarise. A',
    'part that fails is isolated — one bad part never blocks the others. Deliver the change; you never need the',
    'user’s permission to edit the canvas. A specialist completes what it can — clearing any solvable obstacle in',
    'its way, such as freeing an already-occupied input to make a connection — so just delegate the intent and',
    'let it land. Only a GENUINELY impossible part is a dead-end: an invalid value or field, a connection that',
    'would create a cycle, no such node, no capable specialist, or permission denied. Take the specialist’s',
    'report of one at its word — say so and move on; never force it, fake it, or ask the user to choose unless',
    'the request is truly ambiguous.',
    '',
    'Once everything you can do is done, stop: make no further tool calls, and never repeat or keep adjusting an',
    'edit that already succeeded.',
].join('\n');

/** Orchestrator deps: the shared {@link BaseAgentDeps} plus an optional roster, per-child gateway, and dispatch mode. */
export interface OrchestratorAgentDeps extends BaseAgentDeps {
    /** The specialist registry; defaults to {@link createDefaultRoster}. */
    roster?: AgentRoster;
    /** Per-child gateway; defaults to the orchestrator's own gateway (fine for a stateless real model). */
    gatewayFor?: (agentType: string) => LlmGateway;
    /** Sub-agent dispatch — parallel barrier fan-out (default) or serial. */
    mode?: 'parallel' | 'serial';
}

/**
 * The roster block for the orchestrator's head context: the specialists currently on offer (the dynamic list
 * the prompt's routing refers to). Static across a turn — no live canvas, so it stays a cacheable prefix.
 */
export const renderRoster = (roster: AgentRoster): string => {
    const agentLines = roster
        .list()
        .map(a => `- ${a.type}: ${a.summary}`)
        .join('\n');
    return `Available specialists:\n${agentLines}`;
};

/**
 * The orchestrator's think/act budget. It DELEGATES (each spawn is one iteration) and also reads to plan, so a
 * multi-step job — a refactor like disconnect → add → connect → connect, or a branching build — can need more
 * than the default budget of 8 (observed: it brushed the cap on a reroute-and-insert). A larger cap keeps
 * complex coordination reliable. Hardcoded for now; an explicit deps.maxIterations still overrides it.
 */
export const ORCHESTRATOR_MAX_ITERATIONS = 16;

/**
 * The main agent: a `BaseAgent` subclass with no write tools of its own, wiring read + catalog + list_agents
 * + spawn. Overrides `runToolCalls` (concurrent dispatch) and `buildContextMessages` (seed nodes + roster).
 */
export class OrchestratorAgent extends BaseAgent {
    private readonly roster: AgentRoster;
    /** Holds the current turn's abort signal so spawned children inherit it (set in {@link onTurnSignal}). */
    private readonly signalHolder: { current?: AbortSignal };

    constructor(deps: OrchestratorAgentDeps) {
        const roster = deps.roster ?? createDefaultRoster();
        const runner = createSubAgentRunner({
            roster,
            catalog: deps.catalog,
            flowId: deps.flowId,
            mode: deps.mode,
            maxIterations: deps.maxIterations,
            gatewayFor: deps.gatewayFor ?? (() => deps.gateway),
            userPermissions: deps.userPermissions,
        });
        const signalHolder: { current?: AbortSignal } = {};
        // The orchestrator coordinates multi-step jobs, so it defaults to a larger budget than a narrow
        // specialist; an explicit deps.maxIterations still wins. Children keep their OWN caps (the runner above
        // is passed deps.maxIterations, undefined by default → each child uses its own: builder 30, others 8).
        super(
            { ...deps, maxIterations: deps.maxIterations ?? ORCHESTRATOR_MAX_ITERATIONS },
            {
                id: 'orchestrator',
                description: 'Coordinates specialists to edit the flow; makes no edits itself.',
                systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
                // Empty grant on purpose (least privilege): the orchestrator's own tools require no capability,
                // and each spawned child is gated by its own grant + the user's permissions at the executor.
                grant: {},
                tools: [
                    createNodeReadToolProvider(deps.binding, deps.catalog),
                    createGraphReadToolProvider(deps.binding),
                    createCatalogToolProvider(deps.catalog),
                    createAgentDirectoryToolProvider(roster),
                    createSpawnToolProvider(runner, deps.binding, () => signalHolder.current),
                ],
            }
        );
        this.roster = roster;
        this.signalHolder = signalHolder;
    }

    protected override buildContextMessages(): ChatMessage[] {
        return [{ role: 'system', content: renderRoster(this.roster) }];
    }

    /**
     * Seed the starting canvas into the orchestrator's first user message (Approach 3); it pulls fresh state via
     * get_graph as spawned children mutate the canvas, rather than re-reading an injected copy each turn.
     */
    protected override initialUserPreamble(): string {
        return `${renderNodeContext(this.binding)}\n\n${renderEdgeContext(this.binding)}`;
    }

    /** Forward this turn's abort signal so spawned children cancel when the orchestrator aborts. */
    protected override onTurnSignal(signal: AbortSignal): void {
        this.signalHolder.current = signal;
    }

    protected override async runToolCalls(
        calls: CollectedToolCall[],
        assistantMsg: Message,
        state: SessionState
    ): Promise<void> {
        // Run the batch concurrently, then record results in original call order for a deterministic transcript.
        const results = await Promise.all(calls.map(tc => this.dispatchCall(tc)));
        calls.forEach((tc, i) => this.recordToolResult(tc, results[i], assistantMsg, state));
    }
}

/** Create the orchestrator; `send(text)` runs the whole coordinate/delegate turn against the live canvas. */
export const createOrchestratorAgent = (deps: OrchestratorAgentDeps): OrchestratorAgent => new OrchestratorAgent(deps);
