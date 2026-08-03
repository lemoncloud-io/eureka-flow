import { LOCATOR_SYSTEM_PROMPT } from '../agents/locatorAgent';
import { createInMemoryCanvasBinding } from '../canvas/inMemoryCanvasBinding';
import { applyMove, directionToDelta } from '../canvas/moveSemantics';
import { createCatalogLookup } from '../catalog';
import { createNodeMoveToolProvider, createNodeReadToolProvider, renderNodeContext } from '../tools/nodeTools';
import { createToolExecutor } from '../tools/toolExecutor';

import type { AgentConfig } from '../agent';
import type { Chunk, LlmGateway } from './llmGateway';
import type { CanvasBinding, XY } from '../canvas/canvasBinding';
import type { Direction } from '../canvas/moveSemantics';
import type { AgentGrant } from '../permissions';
import type { ToolResult } from '../tools/types';

// No blocks are ever described in these scenarios — every scenario only calls list_nodes and/or
// move_node — so an empty catalog is sufficient for the read provider's describe_node tool.
const emptyCatalog = createCatalogLookup([]);

// This harness verifies the agent's own fixed `grant`, not the user-permission ceiling the
// orchestrator refactor added — so the ceiling here is permissive, matching (never narrower
// than) the agent's own grant below, and never the thing under test.
const VERIFY_USER_PERMISSIONS: AgentGrant = {
    canModifyCanvas: true,
    canEditConfig: true,
    canEditStructure: true,
    canRun: true,
};

/**
 * A tool-*selection* scenario matrix, using only the two tools that actually exist
 * (`list_nodes`, `move_node`) — real `LOCATOR_SYSTEM_PROMPT`/node-context rendering, real
 * `ToolExecutor`, real `CanvasBinding`. This is a broader sibling of the single fixed scenario in
 * `verifyProviderToolCall.ts`; this module is the one to extend as more scenarios are added.
 *
 * Every scenario here is single-turn (gateway → `ToolExecutor`). Multi-step flows (`list_nodes` →
 * `move_node` in one conversation) need a second `gateway.chat()` call with the first turn's tool
 * result fed back in — deliberately not attempted by this matrix, which exercises exactly one
 * call per scenario. See docs/browser-agent/foundations/provider-tool-calling.md §4.
 */

const ERROR_MESSAGE_LIMIT = 200;

export interface SeedNode {
    id: string;
    type: string;
    position: XY;
}

export type LocatorScenarioId =
    | 'list-nodes-read-only'
    | 'move-node-right'
    | 'move-node-left'
    | 'move-node-up'
    | 'move-node-down'
    | 'move-node-absolute'
    | 'selective-multi-node'
    | 'ambiguous-instruction'
    | 'no-tool-refusal'
    | 'no-op-instruction'
    | 'unknown-target';

export interface LocatorScenarioResult {
    scenarioId: LocatorScenarioId;
    pass: boolean;
    /** The structured tool call name, if any; `null` means the model produced no tool call. */
    toolCallName: string | null;
    /** Whether the model's response included any non-empty text, independent of a tool call. */
    textPresent: boolean;
    positionsBefore: Record<string, XY>;
    positionsAfter: Record<string, XY>;
    /**
     * Only set for `unknown-target`: which of the two valid pass paths actually occurred (a
     * text refusal vs. a tool call that `ToolExecutor` correctly rejected as unknown-node) —
     * so a passing result is never ambiguous about what the model actually did.
     */
    path?: 'refusal' | 'executor-error';
    error?: string;
    /**
     * Set only when the failure came from a thrown gateway/provider error (e.g. Gemini "no
     * candidates", an HTTP failure) caught by the try/catch below — never from a normal `check()`
     * scoring path. Lets a real-provider runner (`realLocatorScenarios.spec.ts`) classify this
     * distinctly from an ordinary logical failure; `check()`'s own pass/fail scoring is unchanged
     * either way — this is a reporting-only signal. Never set when `pass` is true.
     */
    providerError?: boolean;
}

/**
 * An empirically observed, narrowly-defined alternate outcome that real-provider qualification
 * treats as acceptable — NOT a relaxed pass criterion on the scenario itself. `check()` below is
 * unchanged and still scores this outcome `pass: false`; only `realLocatorScenarios.spec.ts`
 * consults `matches()`, and only to accept this *specific, documented* shape of failure. Any
 * other failure — including a superficially similar one — still fails the real-provider run.
 * Offline scoring (`verifyLocatorScenarios.spec.ts`) never sees or uses this; it stays strict.
 */
export interface LocatorScenarioKnownVariance {
    /**
     * Provider-neutral description of the accepted alternate behavior itself — shown in every
     * provider's real-key matrix summary, so it must read correctly for any of them.
     */
    note: string;
    /** Recognizes this specific alternate outcome in a result. */
    matches: (result: LocatorScenarioResult) => boolean;
}

interface ScenarioOutcome {
    toolCall: { id: string; name: string; args: unknown } | null;
    dispatchResult?: ToolResult;
    positionsBefore: Record<string, XY>;
    positionsAfter: Record<string, XY>;
    textPresent: boolean;
}

type ScenarioCheck = (outcome: ScenarioOutcome) => {
    pass: boolean;
    path?: 'refusal' | 'executor-error';
    error?: string;
};

interface ScenarioDefinition {
    id: LocatorScenarioId;
    description: string;
    seedNodes: SeedNode[];
    prompt: string;
    check: ScenarioCheck;
    /** See {@link LocatorScenarioKnownVariance}. Absent means no documented alternate outcome. */
    knownVariance?: LocatorScenarioKnownVariance;
}

const buildConfig = (binding: CanvasBinding): AgentConfig => ({
    id: 'locator-scenario-verify',
    description: 'Moves existing nodes on the canvas.',
    systemPrompt: LOCATOR_SYSTEM_PROMPT,
    grant: { canModifyCanvas: true },
    tools: [createNodeReadToolProvider(binding, emptyCatalog), createNodeMoveToolProvider(binding)],
});

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

const snapshotPositions = (binding: CanvasBinding): Record<string, XY> =>
    Object.fromEntries(binding.readGraph().nodes.map(n => [n.id, { x: n.position.x, y: n.position.y }]));

const positionsEqual = (a: Record<string, XY>, b: Record<string, XY>): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

// --- Scenario 1: list_nodes read-only selection --------------------------------------------
//
// Note: LocatorAgent's real per-turn context (`renderNodeContext`, used below exactly as
// production does) already lists every node before the model is asked anything — the same as
// what `list_nodes` would return. So a correctly-behaving model could legitimately answer this
// prompt from context alone without calling the tool at all. This scenario still asserts
// `list_nodes` is called, but that's a genuine empirical question about
// real model behavior, not a foregone conclusion — a `pass: false` here would mean "answered
// from context instead of calling the tool", not "broken".
const LIST_NODES_READ_ONLY: ScenarioDefinition = {
    id: 'list-nodes-read-only',
    description: 'Prompt asks what nodes are on the canvas; expects a list_nodes call with no mutation.',
    seedNodes: [
        { id: 'text-1', type: 'text-input', position: { x: 100, y: 200 } },
        { id: 'note-1', type: 'note', position: { x: 300, y: 150 } },
    ],
    prompt: 'What nodes are currently on the canvas?',
    check: outcome => {
        if (!outcome.toolCall) {
            return {
                pass: false,
                error: 'model did not call list_nodes (answered from context, or no structured call)',
            };
        }
        if (outcome.toolCall.name !== 'list_nodes') {
            return { pass: false, error: `unexpected tool call: ${outcome.toolCall.name}` };
        }
        if (!outcome.dispatchResult?.ok) {
            return {
                pass: false,
                error:
                    outcome.dispatchResult && !outcome.dispatchResult.ok
                        ? outcome.dispatchResult.error
                        : 'list_nodes dispatch failed',
            };
        }
        if (!positionsEqual(outcome.positionsBefore, outcome.positionsAfter)) {
            return { pass: false, error: 'canvas was mutated by a read-only scenario' };
        }
        return { pass: true };
    },
    // Real-key runs have observed this variance on more than one provider; the note below stays
    // provider-neutral on purpose.
    knownVariance: {
        note:
            'Acceptable alternate outcome: the model answers from the already-provided per-turn ' +
            'node context instead of calling list_nodes — no tool call, with a non-empty text answer.',
        matches: result => result.toolCallName === null && result.textPresent,
    },
};

// --- Lookup-first target-resolution variance (shared across several scenarios below) ---
//
// Applied to the five move_node scenarios (right/left/up/down/absolute) and to unknown-target —
// NOT to list-nodes-read-only (a different shape: that scenario's own distinct variance is about
// *not* calling list_nodes, the opposite direction) and NOT to no-tool-refusal (delete has no
// node-resolution component at all). Real-key runs have observed this on more than one provider;
// the note below stays provider-neutral on purpose.
const LOOKUP_FIRST_TARGET_RESOLUTION_VARIANCE: LocatorScenarioKnownVariance = {
    note:
        'Acceptable alternate outcome: given a prompt that requires identifying or acting on a ' +
        'specific node, the model calls list_nodes first — a lookup-before-acting strategy — ' +
        "instead of committing directly to the scenario's expected tool, even though the node " +
        'position (or absence) is already in the per-turn context. This matrix is single-turn, ' +
        'so a model that looks up first cannot continue the conversation to actually resolve ' +
        'the target in the same run — this means "the model chose to look up first and stopped ' +
        'there", never a completed move or a completed refusal/executor-error path.',
    matches: result => result.toolCallName === 'list_nodes',
};

const MOVE_NODE_ID = 'text-1';
const MOVE_SEED_POSITION: XY = { x: 200, y: 200 };
const MOVE_AMOUNT = 100;

const makeMoveByScenario = (id: LocatorScenarioId, direction: Direction, prompt: string): ScenarioDefinition => {
    const expectedPosition = applyMove(MOVE_SEED_POSITION, { by: directionToDelta(direction, MOVE_AMOUNT) });
    return {
        id,
        description: `Prompt asks to move the node ${MOVE_AMOUNT}px ${direction}; expects move_node with a relative \`by\` delta.`,
        seedNodes: [{ id: MOVE_NODE_ID, type: 'text-input', position: { ...MOVE_SEED_POSITION } }],
        prompt,
        knownVariance: LOOKUP_FIRST_TARGET_RESOLUTION_VARIANCE,
        check: outcome => {
            if (!outcome.toolCall) {
                return { pass: false, error: 'model did not emit a structured tool call' };
            }
            if (outcome.toolCall.name !== 'move_node') {
                return { pass: false, error: `unexpected tool call: ${outcome.toolCall.name}` };
            }
            if (!outcome.dispatchResult) {
                return { pass: false, error: 'no dispatch result' };
            }
            if (!outcome.dispatchResult.ok) {
                return { pass: false, error: outcome.dispatchResult.error };
            }
            const after = outcome.positionsAfter[MOVE_NODE_ID];
            if (after?.x !== expectedPosition.x || after?.y !== expectedPosition.y) {
                return {
                    pass: false,
                    error: `node moved to (${after?.x},${after?.y}), expected (${expectedPosition.x},${expectedPosition.y})`,
                };
            }
            return { pass: true };
        },
    };
};

const MOVE_NODE_RIGHT = makeMoveByScenario('move-node-right', 'right', 'Move the text input node 100px to the right.');
const MOVE_NODE_LEFT = makeMoveByScenario('move-node-left', 'left', 'Move the text input node 100px to the left.');
const MOVE_NODE_UP = makeMoveByScenario('move-node-up', 'up', 'Move the text input node 100px up.');
const MOVE_NODE_DOWN = makeMoveByScenario('move-node-down', 'down', 'Move the text input node 100px down.');

// --- Scenario 4: move_node with an absolute `to` position -----------------------------------

const ABSOLUTE_TARGET: XY = { x: 400, y: 350 };

const MOVE_NODE_ABSOLUTE: ScenarioDefinition = {
    id: 'move-node-absolute',
    description: 'Prompt asks to move the node to an absolute position; expects move_node with `to`.',
    seedNodes: [{ id: MOVE_NODE_ID, type: 'text-input', position: { x: 100, y: 200 } }],
    prompt: `Move the text input node to position (${ABSOLUTE_TARGET.x}, ${ABSOLUTE_TARGET.y}).`,
    knownVariance: LOOKUP_FIRST_TARGET_RESOLUTION_VARIANCE,
    check: outcome => {
        if (!outcome.toolCall) {
            return { pass: false, error: 'model did not emit a structured tool call' };
        }
        if (outcome.toolCall.name !== 'move_node') {
            return { pass: false, error: `unexpected tool call: ${outcome.toolCall.name}` };
        }
        if (!outcome.dispatchResult) {
            return { pass: false, error: 'no dispatch result' };
        }
        if (!outcome.dispatchResult.ok) {
            return { pass: false, error: outcome.dispatchResult.error };
        }
        const after = outcome.positionsAfter[MOVE_NODE_ID];
        if (after?.x !== ABSOLUTE_TARGET.x || after?.y !== ABSOLUTE_TARGET.y) {
            return {
                pass: false,
                error: `node moved to (${after?.x},${after?.y}), expected (${ABSOLUTE_TARGET.x},${ABSOLUTE_TARGET.y})`,
            };
        }
        return { pass: true };
    },
};

// --- Scenario: selective multi-node — only the named node should move --------------------------
//
// Three nodes of distinct types on the canvas; the prompt names exactly one. A model that moved
// the right node but *also* touched another (or moved the wrong one) fails here even though a
// single-tool-call scenario like MOVE_NODE_RIGHT wouldn't catch that class of mistake.

const SELECTIVE_TEXT_ID = 'text-1';
const SELECTIVE_HTTP_ID = 'http-1';
const SELECTIVE_NOTE_ID = 'note-1';
const SELECTIVE_SEED_POSITION: XY = { x: 300, y: 100 };
const SELECTIVE_MOVE_AMOUNT = 50;
const SELECTIVE_EXPECTED = applyMove(SELECTIVE_SEED_POSITION, { by: directionToDelta('down', SELECTIVE_MOVE_AMOUNT) });

const SELECTIVE_MULTI_NODE: ScenarioDefinition = {
    id: 'selective-multi-node',
    description: 'Prompt targets only one of several nodes by type; the other nodes must stay untouched.',
    seedNodes: [
        { id: SELECTIVE_TEXT_ID, type: 'text-input', position: { x: 100, y: 100 } },
        { id: SELECTIVE_HTTP_ID, type: 'http', position: { ...SELECTIVE_SEED_POSITION } },
        { id: SELECTIVE_NOTE_ID, type: 'note', position: { x: 500, y: 100 } },
    ],
    prompt: `Move only the http node ${SELECTIVE_MOVE_AMOUNT}px down. Leave the other nodes exactly where they are.`,
    knownVariance: LOOKUP_FIRST_TARGET_RESOLUTION_VARIANCE,
    check: outcome => {
        if (!outcome.toolCall) {
            return { pass: false, error: 'model did not emit a structured tool call' };
        }
        if (outcome.toolCall.name !== 'move_node') {
            return { pass: false, error: `unexpected tool call: ${outcome.toolCall.name}` };
        }
        if (!outcome.dispatchResult) {
            return { pass: false, error: 'no dispatch result' };
        }
        if (!outcome.dispatchResult.ok) {
            return { pass: false, error: outcome.dispatchResult.error };
        }
        const after = outcome.positionsAfter[SELECTIVE_HTTP_ID];
        if (after?.x !== SELECTIVE_EXPECTED.x || after?.y !== SELECTIVE_EXPECTED.y) {
            return {
                pass: false,
                error: `http node moved to (${after?.x},${after?.y}), expected (${SELECTIVE_EXPECTED.x},${SELECTIVE_EXPECTED.y})`,
            };
        }
        const textBefore = outcome.positionsBefore[SELECTIVE_TEXT_ID];
        const textAfter = outcome.positionsAfter[SELECTIVE_TEXT_ID];
        const noteBefore = outcome.positionsBefore[SELECTIVE_NOTE_ID];
        const noteAfter = outcome.positionsAfter[SELECTIVE_NOTE_ID];
        if (textAfter?.x !== textBefore?.x || textAfter?.y !== textBefore?.y) {
            return { pass: false, error: 'the untargeted text-input node was also moved' };
        }
        if (noteAfter?.x !== noteBefore?.x || noteAfter?.y !== noteBefore?.y) {
            return { pass: false, error: 'the untargeted note node was also moved' };
        }
        return { pass: true };
    },
};

// --- Scenario: ambiguous instruction — more than one node matches -----------------------------
//
// LOCATOR_SYSTEM_PROMPT: "If MORE THAN ONE node matches, do not guess — ask which one." Two nodes
// share the same type and neither is named, so no single node can be resolved from the prompt.

const AMBIGUOUS_ID_A = 'text-a';
const AMBIGUOUS_ID_B = 'text-b';

const AMBIGUOUS_INSTRUCTION: ScenarioDefinition = {
    id: 'ambiguous-instruction',
    description: 'Two nodes match the same type; expects a clarifying question, not a guessed move.',
    seedNodes: [
        { id: AMBIGUOUS_ID_A, type: 'text-input', position: { x: 100, y: 100 } },
        { id: AMBIGUOUS_ID_B, type: 'text-input', position: { x: 300, y: 100 } },
    ],
    prompt: 'Move the text input node 50px to the right.',
    knownVariance: LOOKUP_FIRST_TARGET_RESOLUTION_VARIANCE,
    check: outcome => {
        if (outcome.toolCall) {
            return {
                pass: false,
                error: `unexpected tool call: ${outcome.toolCall.name} (expected a clarifying question — two nodes match)`,
            };
        }
        if (!outcome.textPresent) {
            return { pass: false, error: 'model produced neither a tool call nor a text response' };
        }
        if (!positionsEqual(outcome.positionsBefore, outcome.positionsAfter)) {
            return { pass: false, error: 'canvas was mutated despite the target being ambiguous' };
        }
        return { pass: true };
    },
};

// --- Scenario 5: no-tool / refusal ------------------------------------------------------------
//
// LOCATOR_SYSTEM_PROMPT explicitly instructs: "If the user asks for anything other than moving a
// node, briefly say you can only move nodes." `delete` has no matching tool at all.

const NO_TOOL_REFUSAL: ScenarioDefinition = {
    id: 'no-tool-refusal',
    description: 'Prompt asks for an unsupported action (delete); expects no tool call and a text refusal.',
    seedNodes: [{ id: MOVE_NODE_ID, type: 'text-input', position: { x: 100, y: 200 } }],
    prompt: 'Delete the text input node.',
    check: outcome => {
        if (outcome.toolCall) {
            return {
                pass: false,
                error: `unexpected tool call: ${outcome.toolCall.name} (expected a text refusal, no tool call)`,
            };
        }
        if (!outcome.textPresent) {
            return { pass: false, error: 'model produced neither a tool call nor any text response' };
        }
        if (!positionsEqual(outcome.positionsBefore, outcome.positionsAfter)) {
            return { pass: false, error: 'canvas was mutated despite no tool call being recorded' };
        }
        return { pass: true };
    },
};

// --- Scenario: no-op instruction ---------------------------------------------------------------
//
// Distinct from NO_TOOL_REFUSAL: the user isn't asking for an unsupported action, just confirming
// the current state / asking for nothing to change. No target-resolution is involved either, so
// (unlike the move/ambiguous/unknown-target scenarios) there is no lookup-first variance here.

const NO_OP_INSTRUCTION: ScenarioDefinition = {
    id: 'no-op-instruction',
    description: 'Prompt explicitly asks for no changes; expects no tool call and positions unchanged.',
    seedNodes: [{ id: MOVE_NODE_ID, type: 'text-input', position: { x: 100, y: 200 } }],
    prompt: 'The layout looks good as-is — just confirm, please, without moving anything.',
    check: outcome => {
        if (outcome.toolCall) {
            return {
                pass: false,
                error: `unexpected tool call: ${outcome.toolCall.name} (expected no tool call for a no-op instruction)`,
            };
        }
        if (!outcome.textPresent) {
            return { pass: false, error: 'model produced neither a tool call nor any text response' };
        }
        if (!positionsEqual(outcome.positionsBefore, outcome.positionsAfter)) {
            return { pass: false, error: 'canvas was mutated despite an explicit no-op instruction' };
        }
        return { pass: true };
    },
};

// --- Scenario 6: unknown target -----------------------------------------------------------
//
// Two valid pass paths, per spec: (a) the model refuses / says it can't find the node — no tool
// call; or (b) the model emits move_node with a guessed id and the real ToolExecutor rejects it
// with the "no node with id ... exists" error. Both are recorded distinctly via `path`. Anything
// else — including a `move_node` call that *succeeds* against a real node the user didn't name —
// is a genuine failure (the model moved the wrong thing).

const UNKNOWN_NODE_ERROR_PATTERN = /no node with id/;

const UNKNOWN_TARGET: ScenarioDefinition = {
    id: 'unknown-target',
    description:
        'Prompt asks to move a node that does not exist; passes on either a text refusal or a move_node call ' +
        'that ToolExecutor correctly rejects as unknown-node.',
    seedNodes: [{ id: MOVE_NODE_ID, type: 'text-input', position: { x: 100, y: 200 } }],
    prompt: 'Move the node called "Header" 100px to the right.',
    knownVariance: LOOKUP_FIRST_TARGET_RESOLUTION_VARIANCE,
    check: outcome => {
        if (!outcome.toolCall) {
            if (!outcome.textPresent) {
                return { pass: false, error: 'model produced neither a tool call nor a text response' };
            }
            return { pass: true, path: 'refusal' };
        }
        if (outcome.toolCall.name !== 'move_node') {
            return { pass: false, error: `unexpected tool call: ${outcome.toolCall.name}` };
        }
        if (!outcome.dispatchResult) {
            return { pass: false, error: 'no dispatch result' };
        }
        if (outcome.dispatchResult.ok) {
            return { pass: false, error: 'model moved a real node instead of failing on the unknown target' };
        }
        if (!UNKNOWN_NODE_ERROR_PATTERN.test(outcome.dispatchResult.error)) {
            return { pass: false, error: `unexpected executor error: ${outcome.dispatchResult.error}` };
        }
        return { pass: true, path: 'executor-error' };
    },
};

const SCENARIOS: readonly ScenarioDefinition[] = [
    LIST_NODES_READ_ONLY,
    MOVE_NODE_RIGHT,
    MOVE_NODE_LEFT,
    MOVE_NODE_UP,
    MOVE_NODE_DOWN,
    MOVE_NODE_ABSOLUTE,
    SELECTIVE_MULTI_NODE,
    AMBIGUOUS_INSTRUCTION,
    NO_TOOL_REFUSAL,
    NO_OP_INSTRUCTION,
    UNKNOWN_TARGET,
];

/**
 * Lightweight catalog for display/matrix purposes — no scoring logic. `knownVariance`, where
 * present, is descriptive metadata only (see {@link LocatorScenarioKnownVariance}); it does not
 * change what `check()` scores as a pass, only what the real-provider runner treats as an
 * already-characterized, acceptable deviation versus a novel failure.
 */
export const LOCATOR_SCENARIOS: ReadonlyArray<{
    id: LocatorScenarioId;
    description: string;
    knownVariance?: LocatorScenarioKnownVariance;
}> = SCENARIOS.map(s => ({
    id: s.id,
    description: s.description,
    ...(s.knownVariance ? { knownVariance: s.knownVariance } : {}),
}));

const findScenario = (scenarioId: LocatorScenarioId): ScenarioDefinition => {
    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) {
        throw new Error(`unknown locator scenario id: ${scenarioId}`);
    }
    return scenario;
};

/**
 * Run one scenario against any {@link LlmGateway} — real provider or fake/scripted. Pure
 * result-returning (no test-runner assertions), so it runs identically from offline spec tests
 * and env-gated real-key specs; the exact shape a future multi-provider/multi-model harness would
 * loop over (`for (provider) for (scenario) runLocatorScenario(...)`).
 */
export const runLocatorScenario = async (
    gateway: LlmGateway,
    scenarioId: LocatorScenarioId
): Promise<LocatorScenarioResult> => {
    const scenario = findScenario(scenarioId);
    const binding = createInMemoryCanvasBinding({
        nodes: scenario.seedNodes.map(n => ({ id: n.id, type: n.type, position: { ...n.position } })),
        edges: [],
    });
    const executor = createToolExecutor();
    const config = buildConfig(binding);
    const positionsBefore = snapshotPositions(binding);

    try {
        const chunks = await drain(
            gateway.chat({
                messages: [
                    { role: 'system', content: config.systemPrompt },
                    { role: 'system', content: renderNodeContext(binding) },
                    { role: 'user', content: scenario.prompt },
                ],
                tools: await executor.listTools(config),
            })
        );

        const toolCallChunk = chunks.find(c => c.toolCall)?.toolCall ?? null;
        const textPresent = chunks.some(c => typeof c.text === 'string' && c.text.length > 0);

        let toolCall: { id: string; name: string; args: unknown } | null = null;
        let dispatchResult: ToolResult | undefined;

        if (toolCallChunk) {
            let args: unknown;
            try {
                args = JSON.parse(toolCallChunk.argsDelta);
            } catch {
                return {
                    scenarioId,
                    pass: false,
                    toolCallName: toolCallChunk.name,
                    textPresent,
                    positionsBefore,
                    positionsAfter: positionsBefore,
                    error: 'tool call arguments were not valid JSON',
                };
            }
            toolCall = { id: toolCallChunk.id, name: toolCallChunk.name, args };
            dispatchResult = await executor.dispatch(config, toolCall, VERIFY_USER_PERMISSIONS);
        }

        const positionsAfter = snapshotPositions(binding);
        const { pass, path, error } = scenario.check({
            toolCall,
            dispatchResult,
            positionsBefore,
            positionsAfter,
            textPresent,
        });

        return {
            scenarioId,
            pass,
            toolCallName: toolCall?.name ?? null,
            textPresent,
            positionsBefore,
            positionsAfter,
            ...(path ? { path } : {}),
            ...(error ? { error } : {}),
        };
    } catch (err) {
        // Everything in the try block above is a real thrown error escaping gateway.chat() itself
        // (a provider/gateway failure — Gemini "no candidates", an HTTP failure, etc.), never a
        // normal check()-scored outcome — those all return above without reaching this catch.
        const message = err instanceof Error ? err.message : String(err);
        return {
            scenarioId,
            pass: false,
            toolCallName: null,
            textPresent: false,
            positionsBefore,
            positionsAfter: positionsBefore,
            error: message.slice(0, ERROR_MESSAGE_LIMIT),
            providerError: true,
        };
    }
};

/** Run every scenario, in order, against one gateway. Sequential — real provider APIs, not parallelized. */
export const runAllLocatorScenarios = async (gateway: LlmGateway): Promise<LocatorScenarioResult[]> => {
    const results: LocatorScenarioResult[] = [];
    for (const scenario of SCENARIOS) {
        results.push(await runLocatorScenario(gateway, scenario.id));
    }
    return results;
};
