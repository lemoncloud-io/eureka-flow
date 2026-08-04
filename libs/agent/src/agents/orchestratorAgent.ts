import { BaseAgent } from './baseAgent';
import { createDefaultRoster } from './registrations';
import { createSubAgentRunner } from './subAgentRunner';
import { createCatalogToolProvider } from '../tools/catalogTools';
import { createNodeReadToolProvider, renderNodeContext } from '../tools/nodeTools';
import { createAgentDirectoryToolProvider, createSpawnToolProvider } from '../tools/spawnTools';

import type { BaseAgentDeps, CollectedToolCall } from './baseAgent';
import type { AgentRoster } from './roster';
import type { CanvasBinding } from '../canvas/canvasBinding';
import type { ChatMessage, LlmGateway } from '../llm/llmGateway';
import type { Message, SessionState } from '../session/session';

/**
 * Shared orchestrator framing — everything both strategies carry EXCEPT how the work is broken down. The intro
 * (who you are, read the live canvas) and the planning tail (resolve target/amount/shared-values, read to plan,
 * act without asking, take an "impossible" report at its word, stop when done) are identical across strategies;
 * only the middle "how to break the work down" clause differs. So the two exported prompts below compose
 * intro + their own break-down clause + tail — the shared guidance lives once, and tuning it moves both.
 */
const ORCHESTRATOR_INTRO = [
    'You are the Orchestrator for the Eureka visual flow-builder. You direct specialists to carry out the',
    'user’s request: you work out what needs to happen and delegate it, but you do NOT edit the canvas yourself',
    '— the specialists you direct do.',
    '',
    'Work only with the specialists actually available to you — discover which exist rather than assuming any.',
    'Your specialists edit the live canvas directly, and every canvas read reflects the current state, including',
    'edits already made this turn.',
].join('\n');

/** The planning + execution discipline shared by both strategies (target/amount/shared-values · act · stop). */
const ORCHESTRATOR_PLANNING = [
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

/**
 * Strategy 1 — FAN-OUT. The orchestrator directs many narrow specialists, so it DECOMPOSES the request into the
 * smallest per-specialist tasks and coordinates them — independent ones together, dependent ones in sequence.
 * This is the shipped default's prompt too: the mixed roster is not builder-exclusive (see {@link orchestratorPromptFor}).
 */
export const ORCHESTRATOR_SYSTEM_PROMPT = [
    ORCHESTRATOR_INTRO,
    [
        'Break the request down into the smallest self-contained tasks — each one a single specialist can carry',
        'out on its own block — then choose the right specialist for each and delegate it. Coordinate them: run',
        'independent tasks together, and sequence a task after the one it depends on. Favor several small, precise',
        'delegations over one broad one; each specialist owns only its own block, so the finer you decompose, the',
        'cleaner each hand-off.',
    ].join('\n'),
    ORCHESTRATOR_PLANNING,
].join('\n\n');

/**
 * Strategy 2 — BUILDER. The orchestrator directs a SINGLE composition specialist (the Builder) that realizes a
 * whole plan in one pass, so it does NOT decompose: it works the request out into one complete, self-contained
 * plan and hands that to the Builder in a single delegation. Shown only to a builder-exclusive roster.
 */
export const BUILDER_ORCHESTRATOR_SYSTEM_PROMPT = [
    ORCHESTRATOR_INTRO,
    [
        'You direct a single specialist — the Builder — which realizes an entire plan on the canvas in one pass,',
        'so do NOT split the request into many small delegations. Work the request out into ONE complete,',
        'self-contained plan — which nodes to add and how each is configured, how they wire together, and how',
        'they lay out — and hand that whole plan to the Builder in a single delegation. Plan at the level of what',
        'to build; the Builder maps it onto the schema, wires it, lays it out, and validates its own work. One',
        'request is one Builder briefing: spawning it again to finish leftover work makes it start over and',
        'rediscover the canvas, so give it everything the first time.',
    ].join('\n'),
    ORCHESTRATOR_PLANNING,
].join('\n\n');

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
 * The generic-block routing rule — today's paragraph, verbatim. Shown to every roster that carries a block
 * specialist (fan-out AND the shipped default), so production routing is unchanged (see {@link routingRuleFor}).
 */
export const BLOCK_RULE = [
    'To add, configure, rename, or delete a node, spawn a block specialist whose `agentType` is the block’s',
    'own TYPE STRING — e.g. `agentType: "input-text"`, `agentType: "output-preview"`,',
    '`agentType: "single-output-generator"` (the node’s `type` from the list above, or any catalog block',
    'type). Do NOT use the literal word "block" as the agentType — there is no agent called "block"; the',
    'agentType is always the concrete block type. Each block type has its own agent: the ones listed above',
    'are richer block agents, and any other catalog block type is served by a generic block agent',
    'automatically under that same type string. A block agent owns its one block: it creates, configures,',
    'renames, or deletes it in a single delegation.',
].join(' ');

/**
 * The builder-exclusive routing rule — shown only to a builder-only roster. It removes the misleading
 * generic-block invitation and states the MECHANICS: every node & wiring job goes to the one builder. The
 * "work it out into one complete plan, don't fragment" STRATEGY lives in the base prompt
 * ({@link BUILDER_ORCHESTRATOR_SYSTEM_PROMPT}), so it is stated once, not duplicated here.
 */
export const BUILDER_RULE =
    'All node and wiring work - add, configure, rename, delete, connect, rewire, insert, or build - goes to the ' +
    'builder; there are no per-block agents. Route the whole request to it in a single delegation.';

/** True when the roster is builder-exclusive: at least one card, and every card a builder. */
const isBuilderExclusive = (roster: AgentRoster): boolean => {
    const cards = roster.list();
    return cards.length > 0 && cards.every(c => c.type === 'builder');
};

/**
 * Choose the orchestrator's routing rule from the roster it already holds. A builder-exclusive roster gets
 * {@link BUILDER_RULE}; every other roster — fan-out and the shipped default, both carrying non-builder
 * specialists — keeps {@link BLOCK_RULE} verbatim, so production routing is unchanged. The gate is
 * builder-EXCLUSIVE, never merely "a builder is present".
 */
export const routingRuleFor = (roster: AgentRoster): string => (isBuilderExclusive(roster) ? BUILDER_RULE : BLOCK_RULE);

/**
 * Choose the orchestrator's BASE system prompt from that same builder-exclusive gate: a builder-only roster gets
 * {@link BUILDER_ORCHESTRATOR_SYSTEM_PROMPT} (plan the whole flow, hand it to the one Builder), every other roster
 * gets {@link ORCHESTRATOR_SYSTEM_PROMPT} (decompose into small per-specialist tasks). So each benchmark strategy
 * briefs with its own mental model, and the shipped default (a mixed roster) keeps the fan-out prompt unchanged.
 */
export const orchestratorPromptFor = (roster: AgentRoster): string =>
    isBuilderExclusive(roster) ? BUILDER_ORCHESTRATOR_SYSTEM_PROMPT : ORCHESTRATOR_SYSTEM_PROMPT;

/** The orchestrator's per-turn context: the live-canvas node list + the discovered roster + the routing rule. */
export const renderContext = (binding: CanvasBinding, roster: AgentRoster): string => {
    const nodes = renderNodeContext(binding); // headings default to exactly these strings
    const agentLines = roster
        .list()
        .map(a => `- ${a.type}: ${a.summary}`)
        .join('\n');
    return `${nodes}\n\nAvailable specialists:\n${agentLines}\n\n${routingRuleFor(roster)}`;
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
        // is passed deps.maxIterations, undefined by default → each child uses its own: builder 20, others 8).
        super(
            { ...deps, maxIterations: deps.maxIterations ?? ORCHESTRATOR_MAX_ITERATIONS },
            {
                id: 'orchestrator',
                description: 'Coordinates specialists to edit the flow; makes no edits itself.',
                systemPrompt: orchestratorPromptFor(roster),
                // Empty grant on purpose (least privilege): the orchestrator's own tools require no capability,
                // and each spawned child is gated by its own grant + the user's permissions at the executor.
                grant: {},
                tools: [
                    createNodeReadToolProvider(deps.binding, deps.catalog),
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
        return [{ role: 'system', content: renderContext(this.binding, this.roster) }];
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
