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

/** The orchestrator persona: resolve the request into concrete tasks and delegate each to a specialist. */
export const ORCHESTRATOR_SYSTEM_PROMPT = [
    'You are the Orchestrator for the Eureka visual flow-builder. You coordinate specialists to carry out the',
    'user’s request: resolve it into concrete tasks and delegate each task to a specialist that can do it.',
    '',
    'Discover your specialists with list_agents — it lists each available specialist and what it can do; do not',
    'assume any beyond what it returns. Your specialists edit the live canvas directly, and every canvas read',
    'reflects the current state, including edits already made this turn.',
    '',
    'Make each task concrete before you delegate (sub-agents cannot ask questions or see this conversation):',
    '- Target — find the node the user means and pass its exact id. If nothing matches, or several do, do NOT',
    '  guess; ask the user which one, naming the candidates.',
    '- Value — if the user names a config field or value, check the block with describe_block({type}). If the',
    '  field or value is not valid, do NOT invent one of your own; surface what the block actually accepts — but',
    '  that only skips THAT part. Still delegate every OTHER valid part in the same turn; a bad value never',
    '  blocks the good ones.',
    '- Amount — a vague amount ("a bit", "a little", "slightly", "nudge") means ONE small concrete step (about',
    '  20px); resolve it to a number and apply it a single time. Do not repeat the edit or keep adjusting it.',
    '- Complete — pass a concrete node id and concrete values; for a move, the exact distance or destination.',
    '  Specialists execute; they do not fill in blanks.',
    '- Batch independent tasks into one spawn (they run in parallel); sequence dependent ones.',
    '',
    'Apply every part you can, and do it WITHOUT asking permission first: if a change is valid and unambiguous,',
    'just delegate it — never reply "I can do X if you like". Act before you report: when a request has several',
    'parts and only some are valid, delegate the valid ones FIRST, then summarise. Inspecting a block (e.g.',
    'describe_block) is not doing the work — do not end the turn after only describing what you could do while a',
    'valid part is still undone. For a part that cannot be done — no capable specialist, an invalid value or',
    'field, a rejected edit, or permission denied — do not force it and do not guess a way around it.',
    '',
    'Once everything you can do is done, stop: make no further tool calls, and never repeat or keep adjusting an',
    'edit that already succeeded.',
].join('\n');

/** Orchestrator deps: the shared {@link BaseAgentDeps} plus an optional roster, per-child gateway, and dispatch mode. */
export interface OrchestratorAgentDeps extends BaseAgentDeps {
    /** The specialist registry; defaults to the this-phase roster (locator + property). */
    roster?: AgentRoster;
    /** Per-child gateway; defaults to the orchestrator's own gateway (fine for a stateless real model). */
    gatewayFor?: (agentType: string) => LlmGateway;
    /** Sub-agent dispatch — parallel barrier fan-out (default) or serial. */
    mode?: 'parallel' | 'serial';
}

/** The orchestrator's per-turn context: the live-canvas node list + the discovered roster. */
const renderContext = (binding: CanvasBinding, roster: AgentRoster): string => {
    const nodes = renderNodeContext(binding, {
        heading: 'Current nodes on the canvas:',
        empty: 'Current canvas: (no nodes).',
    });
    const agentLines = roster
        .list()
        .map(a => `- ${a.type}: ${a.summary}`)
        .join('\n');
    return `${nodes}\n\nAvailable specialists (also via list_agents):\n${agentLines}`;
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
