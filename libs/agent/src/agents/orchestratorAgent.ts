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

/** The orchestrator persona: decompose the request into sub-agent tasks, route each to a specialist, and coordinate them. */
export const ORCHESTRATOR_SYSTEM_PROMPT = [
    'You are the Orchestrator for the Eureka visual flow-builder. You direct a team of specialists: decompose',
    'the user’s request into tasks each of which ONE specialist can carry out, choose the right specialist for',
    'each task, and delegate it. You coordinate them — running independent tasks together, sequencing dependent',
    'ones — but you do not edit the canvas yourself; the specialists you direct do.',
    '',
    'Work only with the specialists actually available to you — discover which exist rather than assuming any.',
    'Your specialists edit the live canvas directly, and every canvas read reflects the current state, including',
    'edits already made this turn.',
    '',
    'Delegate the intent; do not micro-manage. A specialist reads the block’s schema and validates its own work,',
    'so keep each briefing at the level of the user’s intent — do NOT check whether a config field exists, how it',
    'is named (e.g. "temp" vs "temperature"), or whether a value is allowed. Hand the specialist the intent ("set',
    'the temperature to 0.1 on <id>") and let it apply the change or reject and report it. Resolve only what you,',
    'coordinating the whole request, must settle and a specialist cannot see from its own briefing:',
    '- Target — find the node the user means (match on meaning, not exact text: ignore case and treat spaces,',
    '  hyphens, and underscores alike) and pass its exact id. If nothing matches, or several do, do NOT guess;',
    '  ask the user which one, naming the candidates.',
    '- Amount — a vague amount ("a bit", "a little", "slightly", "nudge") means ONE small concrete step (about',
    '  20px); resolve it to a number and apply it a single time. Do not repeat the edit or keep adjusting it.',
    '- Shared values — when several specialists must agree on something the user left open, decide it once and',
    '  put it in every briefing: the single column to align four nodes to, or the id of a node you just added',
    '  threaded into the later connect/configure tasks.',
    '',
    'You MAY read the canvas or the block catalog when you need it to PLAN — to understand the flow or to settle',
    'a shared value — but reading is not doing the work, and it never replaces delegating. Do not end the turn',
    'after only inspecting while a task is still undone.',
    '',
    'Apply every part you can, and do it WITHOUT asking permission first: if a task is unambiguous, just delegate',
    'it — never reply "I can do X if you like". Act before you report: when a request has several parts, delegate',
    'them FIRST, then summarise. A part that fails is isolated — one bad part never blocks the others. For a part',
    'that cannot be done — no capable specialist, or a specialist reports a rejection (invalid value or field, a',
    'rejected edit, permission denied) — do not force it and do not guess a way around it.',
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

/** The orchestrator's per-turn context: the live-canvas node list + the discovered roster + the block-agent rule. */
const renderContext = (binding: CanvasBinding, roster: AgentRoster): string => {
    const nodes = renderNodeContext(binding); // headings default to exactly these strings
    const agentLines = roster
        .list()
        .map(a => `- ${a.type}: ${a.summary}`)
        .join('\n');
    const blockRule = [
        'To add, configure, rename, or delete a node, delegate it to the BLOCK agent for the block’s',
        'TYPE (the node’s `type` in the list above, or any catalog block type). A block agent owns that one block:',
        'it creates and configures it in a single delegation. The specialists listed above with a block type (e.g.',
        'single-output-generator) are richer block agents; any OTHER catalog block type is served by a generic',
        'block agent automatically.',
    ].join(' ');
    return `${nodes}\n\nAvailable specialists:\n${agentLines}\n\n${blockRule}`;
};

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
        super(deps, {
            id: 'orchestrator',
            description: 'Coordinates specialists to edit the flow; makes no edits itself.',
            systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
            // Empty grant on purpose (least privilege): the orchestrator's own tools require no capability,
            // and each spawned child is gated by its own grant + the user's permissions at the executor.
            grant: {},
            tools: [
                createNodeReadToolProvider(deps.binding, deps.catalog),
                createCatalogToolProvider(deps.catalog),
                createAgentDirectoryToolProvider(roster),
                createSpawnToolProvider(runner, deps.binding, () => signalHolder.current),
            ],
        });
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
