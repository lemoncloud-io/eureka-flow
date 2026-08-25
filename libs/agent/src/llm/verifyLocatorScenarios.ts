import { createInMemoryCanvasBinding } from '../canvas/inMemoryCanvasBinding';
import { applyMove, directionToDelta } from '../canvas/moveSemantics';
import { createCatalogLookup } from '../catalog';
import { LIST_NODES, MOVE_NODE, renderNodeContext } from '../tools/nodeTools';
import { createToolExecutor } from '../tools/toolExecutor';
import { toolset } from '../tools/toolset';

import type { AgentConfig } from '../agent';
import type { ChatMessage, Chunk, LlmGateway } from './llmGateway';
import type { CanvasBinding, XY } from '../canvas/canvasBinding';
import type { Direction } from '../canvas/moveSemantics';
import type { AgentGrant } from '../permissions';
import type { ToolCall, ToolExecutor, ToolResult } from '../tools/types';

// No blocks are ever described in these scenarios — every scenario only calls list_nodes and/or
// move_node, neither of which reads the catalog — so an empty one merely satisfies `toolset`'s
// `CanvasToolDeps` shape.
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
 * (`list_nodes`, `move_node`) — this module's own `LOCATOR_SYSTEM_PROMPT` (see below) plus real
 * node-context rendering, real `ToolExecutor`, real `CanvasBinding`. This is a broader sibling of
 * the single fixed scenario in `verifyProviderToolCall.ts`; this module is the one to extend as
 * more scenarios are added.
 *
 * Every scenario here is single-turn (gateway → `ToolExecutor`). Multi-step flows (`list_nodes` →
 * `move_node` in one conversation) need a second `gateway.chat()` call with the first turn's tool
 * result fed back in — deliberately not attempted by this matrix, which exercises exactly one
 * call per scenario.
 */

const ERROR_MESSAGE_LIMIT = 200;

export interface SeedNode {
    id: string;
    type: string;
    position: XY;
    /** Optional visible label (`NodeLocation.label`/`NodeData.customLabel`) — absent for every
     * existing single-turn scenario (none of them need one); used by multi-turn-only scenarios
     * that identify a target by name rather than by an id the prompt could reveal. Passed through
     * only by {@link runMultiTurnLocatorScenario}'s own binding construction — `runLocatorScenario`
     * (single-turn) is unchanged and never reads this field, so adding it here has no effect on any
     * existing scenario's behavior. */
    label?: string;
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
    /** Whether the tool call's `argsDelta` parsed as valid JSON — absent when no tool call was
     * made at all (the question doesn't arise), `false` only for an actual parse failure. */
    argsValid?: boolean;
    /** Whether `ToolExecutor.dispatch` reported success — absent when no dispatch was attempted
     * (no tool call, or args invalid before dispatch was ever reached). */
    dispatchOk?: boolean;
    /**
     * Set only when the failure came from a thrown gateway/provider error (e.g. Gemini "no
     * candidates", an HTTP failure) caught by the try/catch below — never from a normal `check()`
     * scoring path. Lets a real-provider runner (`realLocatorScenarios.spec.ts`) classify this
     * distinctly from an ordinary logical failure; `check()`'s own pass/fail scoring is unchanged
     * either way — this is a reporting-only signal. Never set when `pass` is true.
     */
    providerError?: boolean;
    /**
     * Every tool call the model emitted this turn, in order — not just the one `check()` scored
     * (see `pickPrimaryToolCall`). Present whenever at least one tool call was made; absent (never
     * an empty array) when the model made none. Exists so a batched turn's full attempt list is
     * always visible in scoring output, never silently collapsed to a single call.
     */
    toolCalls?: { name: string; argsValid: boolean; dispatchOk?: boolean }[];
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
    /** The primary call for single-call-oriented scoring — see `pickPrimaryToolCall`. Every
     * existing `check()` below reads only this (and `dispatchResult`), so their logic is correct
     * unchanged for the common 0-or-1-call case; `toolCalls` below is the full record. */
    toolCall: { id: string; name: string; args: unknown } | null;
    dispatchResult?: ToolResult;
    /** Every tool call dispatched this turn, in order — always includes `toolCall` above when it
     * is non-null. `positionsAfter` already reflects every one of these being dispatched, so a
     * scenario like `selective-multi-node` correctly fails via its existing position checks alone
     * when a second, unscored call also mutated the canvas. */
    toolCalls: readonly DispatchedToolCall[];
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

/**
 * Same shape as {@link ScenarioDefinition} minus `knownVariance` (multi-turn-only scenarios never
 * need one — `runMultiTurnLocatorScenario` doesn't read `knownVariance` for ANY scenario, single-
 * turn or not) and with an `id` scoped to {@link MultiTurnOnlyScenarioId} instead of
 * `LocatorScenarioId`. Kept as its own type — rather than widening `ScenarioDefinition.id` itself —
 * specifically so `SCENARIOS`/`LOCATOR_SCENARIOS` (the single-turn catalog) keep inferring exactly
 * `LocatorScenarioId` as before, with zero type-level ripple onto the single-turn benchmark.
 *
 * `hideInitialNodeContext` is required (not optional) so every new multi-turn-only scenario has to
 * make this choice explicitly rather than silently inheriting the single-turn default. `true` means
 * `runMultiTurnLocatorScenario` omits the per-turn `renderNodeContext` system message from the
 * FIRST request only (every request after a tool call still reflects live canvas state through the
 * real tool-result message, never through this system message) — the only way a scenario can make
 * `list_nodes` the sole source of node ids instead of a redundant confirmation of ids already
 * visible in the first request. `ScenarioDefinition` (single-turn catalog) has no such field at
 * all, so every existing single-turn scenario run through `runMultiTurnLocatorScenario` keeps
 * getting the node-context message on turn 1 exactly as before — this field only exists on, and
 * only ever gates behavior for, the `MultiTurnOnlyScenarioDefinition` union member.
 */
interface MultiTurnOnlyScenarioDefinition {
    id: MultiTurnOnlyScenarioId;
    description: string;
    seedNodes: SeedNode[];
    prompt: string;
    check: ScenarioCheck;
    hideInitialNodeContext: boolean;
}

/**
 * The retired `LocatorAgent`'s persona (see `agents/registrations.ts`: the structural-agents
 * refactor folded node-moving into the `builder`, which carries a much broader plan-executing
 * prompt and toolset). This benchmark deliberately keeps its own copy, byte-identical to the
 * original, rather than substituting `BUILDER_SYSTEM_PROMPT`: the scenario matrix below (e.g.
 * `NO_TOOL_REFUSAL`'s "delete has no matching tool") depends on a narrow persona restricted to
 * exactly `list_nodes`/`move_node` — the builder's full editing toolset would change what several
 * scenarios are actually testing, not just how they're phrased.
 */
const LOCATOR_SYSTEM_PROMPT = [
    'You are the Locator agent for a visual flow editor. Your ONLY job is to relocate existing nodes — change',
    'their position, nothing else. If asked for anything else (adding, deleting, renaming, connecting, or',
    'reconfiguring a node), briefly say you can only move nodes.',
    '',
    'How to work:',
    '- Move a node only by the exact amount, or to the exact destination, you were given. Never invent a distance',
    '  or target: if the task gives no clear amount or destination, move nothing and report what you need.',
    '- Identify the node the task means from the ones you can see, matching against each node’s label and type.',
    '  Match on meaning, not exact text: ignore case, and treat spaces, hyphens, and underscores as',
    '  interchangeable (so "text input" matches a `text-input` type). If none matches, move nothing and say you',
    '  could not find it (you may list what you can see). If more than one matches, do not guess — ask which one,',
    '  listing the candidates.',
    '- Move one node at a time; for several, move each in turn.',
    '- After moving, briefly confirm what you moved and its new position.',
].join('\n');

const buildConfig = (binding: CanvasBinding): AgentConfig => ({
    id: 'locator-scenario-verify',
    description: 'Moves existing nodes on the canvas.',
    systemPrompt: LOCATOR_SYSTEM_PROMPT,
    grant: { canModifyCanvas: true },
    tools: [toolset({ binding, catalog: emptyCatalog }, [LIST_NODES, MOVE_NODE])],
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

/**
 * Accumulates every tool-call chunk emitted during one turn, in first-seen order, merging any
 * `argsDelta` fragments that share an id — mirrors `BaseAgent.collect()`'s accumulation
 * (`agents/baseAgent.ts`) exactly, but operates on an already-drained `Chunk[]` rather than a
 * live stream, since every caller here already calls `drain()` first.
 *
 * Never just the first chunk with a `toolCall`: a provider gateway emits one `Chunk` per distinct
 * tool call, so a single turn can legitimately contain more than one (e.g. a batched
 * `list_nodes` + `move_node` response) — taking only the first silently drops every call after it.
 */
export const collectToolCallChunks = (
    chunks: readonly Chunk[]
): { id: string; name: string; argsDelta: string; thoughtSignature?: string }[] => {
    const order: string[] = [];
    const acc = new Map<string, { name: string; argsDelta: string; thoughtSignature?: string }>();
    for (const chunk of chunks) {
        if (!chunk.toolCall) continue;
        const { id, name, argsDelta, thoughtSignature } = chunk.toolCall;
        const existing = acc.get(id);
        if (existing) {
            existing.argsDelta += argsDelta;
            existing.thoughtSignature ??= thoughtSignature;
        } else {
            order.push(id);
            acc.set(id, { name, argsDelta, thoughtSignature });
        }
    }
    return order.map(id => {
        const entry = acc.get(id) as { name: string; argsDelta: string; thoughtSignature?: string };
        return { id, ...entry };
    });
};

/** One tool call attempted during a turn, after argument parsing and (if valid) dispatch. Never
 * silently dropped: a call whose `argsDelta` fails to parse as JSON is still recorded here, with
 * `argsValid: false` and a synthetic failed `dispatchResult` — it is never sent to the executor
 * (there is nothing valid to dispatch), but it remains visible to every consumer of this array. */
export interface DispatchedToolCall {
    id: string;
    name: string;
    args: unknown;
    /** The exact raw JSON string this call was made with — needed to replay the call verbatim
     * into a multi-turn transcript, since the parsed `args` may reorder object keys on re-stringify. */
    argsDelta: string;
    argsValid: boolean;
    dispatchResult: ToolResult;
    thoughtSignature?: string;
}

/**
 * Dispatches every tool call emitted during one turn, in order, through the real `ToolExecutor` —
 * never just the first. Returns one {@link DispatchedToolCall} per call, in the same order the
 * model emitted them, so ordering is preserved and every attempt (successful, rejected, or
 * malformed) is visible to the caller rather than only the first being scored.
 */
export const dispatchAllToolCalls = async (
    chunks: readonly Chunk[],
    executor: ToolExecutor,
    config: AgentConfig,
    userPermissions: AgentGrant
): Promise<DispatchedToolCall[]> => {
    const calls = collectToolCallChunks(chunks);
    const dispatched: DispatchedToolCall[] = [];
    for (const call of calls) {
        let args: unknown;
        try {
            args = JSON.parse(call.argsDelta);
        } catch {
            dispatched.push({
                id: call.id,
                name: call.name,
                args: undefined,
                argsDelta: call.argsDelta,
                argsValid: false,
                dispatchResult: { toolCallId: call.id, ok: false, error: 'tool call arguments were not valid JSON' },
                ...(call.thoughtSignature !== undefined ? { thoughtSignature: call.thoughtSignature } : {}),
            });
            continue;
        }
        const toolCall: ToolCall = { id: call.id, name: call.name, args };
        const dispatchResult = await executor.dispatch(config, toolCall, userPermissions);
        dispatched.push({
            id: call.id,
            name: call.name,
            args,
            argsDelta: call.argsDelta,
            argsValid: true,
            dispatchResult,
            ...(call.thoughtSignature !== undefined ? { thoughtSignature: call.thoughtSignature } : {}),
        });
    }
    return dispatched;
};

/**
 * Picks the single call most relevant to this module's single-call-oriented `check()` scoring: the
 * first non-`list_nodes` call (a benign, non-mutating lookup should never be mistaken for the
 * scenario's real action, and must not cause a batched `list_nodes` + real-action turn to be
 * incorrectly rejected on the lookup's name alone), or the first call at all when every call was
 * `list_nodes` or there is exactly one call. Returns `null` only when `calls` is empty — this keeps
 * every existing `check()` function's single-call logic correct unchanged when a turn has 0 or 1
 * calls, which is still the overwhelming majority of real turns.
 */
export const pickPrimaryToolCall = (calls: readonly DispatchedToolCall[]): DispatchedToolCall | null =>
    calls.find(c => c.name !== 'list_nodes') ?? calls[0] ?? null;

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

        const textPresent = chunks.some(c => typeof c.text === 'string' && c.text.length > 0);

        // Dispatch EVERY tool call the model emitted this turn, in order — never just the first.
        // `positionsAfter` below reflects the cumulative effect of all of them, so a scenario like
        // `selective-multi-node` correctly fails if a second, unscored call also mutated the canvas.
        const dispatched = await dispatchAllToolCalls(chunks, executor, config, VERIFY_USER_PERMISSIONS);
        const primary = pickPrimaryToolCall(dispatched);
        // Non-null whenever a call was made at all, even with invalid JSON args — its identity
        // (name) still matters to check()'s "unexpected tool call" branches, and a synthetic
        // dispatchResult below carries the specific "not valid JSON" message through the SAME
        // `!dispatchResult.ok` branch every check() already has, rather than a generic "no tool
        // call" message that would misreport what actually happened.
        const toolCall = primary ? { id: primary.id, name: primary.name, args: primary.args } : null;
        const dispatchResult = primary?.dispatchResult;

        const positionsAfter = snapshotPositions(binding);
        const { pass, path, error } = scenario.check({
            toolCall,
            dispatchResult,
            toolCalls: dispatched,
            positionsBefore,
            positionsAfter,
            textPresent,
        });

        return {
            scenarioId,
            pass,
            toolCallName: primary?.name ?? null,
            textPresent,
            positionsBefore,
            positionsAfter,
            ...(path ? { path } : {}),
            ...(error ? { error } : {}),
            ...(primary ? { argsValid: primary.argsValid } : {}),
            // `dispatchOk` reflects a REAL `ToolExecutor.dispatch` attempt only — never derived
            // from the synthetic dispatchResult invalid-JSON args produce internally above, so it
            // stays absent (not `false`) exactly when no dispatch was actually attempted.
            ...(primary?.argsValid ? { dispatchOk: dispatchResult?.ok } : {}),
            ...(dispatched.length > 0
                ? {
                      toolCalls: dispatched.map(d => ({
                          name: d.name,
                          argsValid: d.argsValid,
                          ...(d.argsValid ? { dispatchOk: d.dispatchResult.ok } : {}),
                      })),
                  }
                : {}),
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

// =============================================================================================
// Multi-turn runner
//
// `runLocatorScenario` above is deliberately single-turn (one `gateway.chat()` call). This section
// adds a second, independent entry point that allows up to `maxTurns` model turns, feeding a real
// tool-result back into the transcript between turns — so a model that looks up first (`list_nodes`)
// can still complete the task on a later turn instead of only being scored as a documented
// "known-variance" allowance. It reuses this module's existing scenario catalog, `buildConfig`,
// `snapshotPositions`, `drain`, and each scenario's own `check()` — none of that is duplicated.
// `runLocatorScenario`/`runAllLocatorScenarios` and `realLocatorScenarios.spec.ts` are untouched by
// this section; the single-turn matrix and its knownVariance classification remain exactly as before.
// =============================================================================================

/**
 * Scenario ids that exist ONLY for {@link runMultiTurnLocatorScenario} — never added to `SCENARIOS`/
 * `LOCATOR_SCENARIOS` (the single-turn catalog), so the single-turn benchmark's scenario count,
 * report tables, and `knownVariance` behavior are completely unaffected by anything added here.
 * `findScenario` (used only by `runLocatorScenario`/`runAllLocatorScenarios`) never looks these up;
 * only {@link findAnyScenario} (used only by the multi-turn runner) does.
 */
export type MultiTurnOnlyScenarioId = 'move-named-node-without-id';

const MOVE_NAMED_NODE_TARGET_ID = 'node-a17';
const MOVE_NAMED_NODE_DISTRACTOR_1_ID = 'node-b42';
const MOVE_NAMED_NODE_DISTRACTOR_2_ID = 'node-c88';
const MOVE_NAMED_NODE_SEED_POSITION: XY = { x: 200, y: 300 };
const MOVE_NAMED_NODE_AMOUNT = 100;
const MOVE_NAMED_NODE_EXPECTED = applyMove(MOVE_NAMED_NODE_SEED_POSITION, {
    by: directionToDelta('right', MOVE_NAMED_NODE_AMOUNT),
});

/**
 * Multi-turn-only: names the target by its visible label ("Login button"), never by its opaque
 * node id (`node-a17` — not `login-button`), so the id genuinely cannot be inferred from the user
 * instruction alone. Two labeled distractor nodes (a same-type "Sign up" button and a differently-
 * typed "Email" field) are seeded alongside it, so a model that moves the wrong node — or the right
 * node type but wrong instance — fails the strict check below, not just a scenario with nothing
 * else on the canvas to confuse it.
 *
 * `hideInitialNodeContext: true` makes `list_nodes` GENUINELY required, not merely available: the
 * first request contains only the system prompt and the user's label-only instruction — no
 * `renderNodeContext` system message, so no node id (target or distractor) is visible anywhere
 * before a `list_nodes` call. Ids become known only via the real tool-result message
 * `runMultiTurnLocatorScenario` appends after dispatch. (An earlier version of this scenario left
 * the per-turn context in on turn 1, which — exactly like every other scenario in this file —
 * defeated the "requires a lookup" premise: a model could read `node-a17` straight out of that
 * context and call `move_node` directly. That's still fine for every *other* scenario here, whose
 * whole point is "resolve however you like" — it was wrong specifically for the one scenario whose
 * entire purpose is exercising the lookup-first round trip.) A model that still guesses a
 * plausible-looking id without calling `list_nodes` first can only pass by getting catastrophically
 * lucky (a random id colliding with the real one) — not a real risk in practice, and every other
 * outcome for that path fails the dispatch or the strict position check below.
 */
const MOVE_NAMED_NODE_WITHOUT_ID: MultiTurnOnlyScenarioDefinition = {
    id: 'move-named-node-without-id',
    description:
        'Multi-turn-only: the prompt names the target by its visible label ("Login button"), never its ' +
        'opaque node id, AND the first request omits the per-turn node-context message entirely — so ' +
        'list_nodes is the only way to discover any node id before calling move_node with a relative ' +
        '`by` delta. Only the named node may move; two labeled/typed distractor nodes must stay exactly ' +
        'where they started.',
    hideInitialNodeContext: true,
    seedNodes: [
        {
            id: MOVE_NAMED_NODE_TARGET_ID,
            type: 'button',
            label: 'Login',
            position: { ...MOVE_NAMED_NODE_SEED_POSITION },
        },
        { id: MOVE_NAMED_NODE_DISTRACTOR_1_ID, type: 'button', label: 'Sign up', position: { x: 500, y: 300 } },
        { id: MOVE_NAMED_NODE_DISTRACTOR_2_ID, type: 'text-input', label: 'Email', position: { x: 200, y: 500 } },
    ],
    prompt: 'Move the Login button 100 pixels to the right.',
    check: outcome => {
        if (!outcome.toolCall) {
            // Covers both a plain refusal AND a "which node do you mean?" clarifying question —
            // this scenario's target is never ambiguous (only one node is labeled "Login"), so
            // neither a refusal nor a text-only answer is ever correct here, regardless of content.
            return { pass: false, error: 'model did not emit a structured tool call' };
        }
        if (outcome.toolCall.name !== 'move_node') {
            // Covers a bare `list_nodes` call that never proceeds to `move_node` on this same
            // check() invocation — the runner's own `isContinuableLookup` is what decides whether
            // that earns another turn; this check() only ever sees it as "not yet a pass".
            return { pass: false, error: `unexpected tool call: ${outcome.toolCall.name}` };
        }
        if (!outcome.dispatchResult) {
            return { pass: false, error: 'no dispatch result' };
        }
        if (!outcome.dispatchResult.ok) {
            // A guessed/nonexistent id (e.g. the literal string "login-button") fails here with
            // ToolExecutor's own "no node with id ... exists" error — never silently treated as a
            // pass, and never given another turn (isContinuableLookup only re-tries `list_nodes`).
            return { pass: false, error: outcome.dispatchResult.error };
        }
        const after = outcome.positionsAfter[MOVE_NAMED_NODE_TARGET_ID];
        if (after?.x !== MOVE_NAMED_NODE_EXPECTED.x || after?.y !== MOVE_NAMED_NODE_EXPECTED.y) {
            // Covers moving a real-but-wrong node (e.g. the "Sign up" distractor by mistake): the
            // dispatch succeeds, but the named target itself never reaches the expected position.
            return {
                pass: false,
                error:
                    `named node moved to (${after?.x},${after?.y}), expected ` +
                    `(${MOVE_NAMED_NODE_EXPECTED.x},${MOVE_NAMED_NODE_EXPECTED.y})`,
            };
        }
        for (const distractorId of [MOVE_NAMED_NODE_DISTRACTOR_1_ID, MOVE_NAMED_NODE_DISTRACTOR_2_ID]) {
            const before = outcome.positionsBefore[distractorId];
            const distractorAfter = outcome.positionsAfter[distractorId];
            if (distractorAfter?.x !== before?.x || distractorAfter?.y !== before?.y) {
                return { pass: false, error: `distractor node ${distractorId} was also moved` };
            }
        }
        return { pass: true };
    },
};

/** Every scenario that exists only for the multi-turn runner — currently just the one above. Kept
 * as its own array, deliberately never merged into or appended onto `SCENARIOS`. */
const MULTI_TURN_ONLY_SCENARIOS: readonly MultiTurnOnlyScenarioDefinition[] = [MOVE_NAMED_NODE_WITHOUT_ID];

/** Exported so callers outside this module (e.g. `realMultiTurnLocatorScenarios.spec.ts`'s
 * `LIVE_MULTI_TURN_SCENARIOS` id validation) can accept a multi-turn-only id without importing
 * `MULTI_TURN_ONLY_SCENARIOS` itself or duplicating its id list. */
export const MULTI_TURN_ONLY_SCENARIO_IDS: readonly MultiTurnOnlyScenarioId[] = MULTI_TURN_ONLY_SCENARIOS.map(
    s => s.id
);

/** Scenario lookup for {@link runMultiTurnLocatorScenario} only — checks the single-turn `SCENARIOS`
 * catalog first (so every existing scenario id still resolves exactly as before), then falls back
 * to {@link MULTI_TURN_ONLY_SCENARIOS}. `runLocatorScenario`/`runAllLocatorScenarios` keep using the
 * original `findScenario` above, which has no knowledge of `MULTI_TURN_ONLY_SCENARIOS` at all — so
 * a multi-turn-only scenario id is simply unresolvable through the single-turn path, by
 * construction, not by an added guard. Returns a union of both scenario shapes — the caller only
 * ever reads `seedNodes`/`prompt`/`check`, present identically on both. */
const findAnyScenario = (
    scenarioId: LocatorScenarioId | MultiTurnOnlyScenarioId
): ScenarioDefinition | MultiTurnOnlyScenarioDefinition => {
    const scenario: ScenarioDefinition | MultiTurnOnlyScenarioDefinition | undefined =
        SCENARIOS.find(s => s.id === scenarioId) ?? MULTI_TURN_ONLY_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) {
        throw new Error(`unknown locator scenario id: ${scenarioId}`);
    }
    return scenario;
};

/**
 * Test-only escape hatch: exposes a scenario's private `check()` directly. `verifyLocatorScenarios.spec.ts`
 * uses this for a small set of defensive branches (missing `dispatchResult`, canvas mutation with no
 * dispatch) that `runLocatorScenario` and `runMultiTurnLocatorScenario` can never produce themselves —
 * both runners guarantee a `dispatchResult` whenever `dispatchAllToolCalls` dispatches anything, and no
 * mutation happens without a dispatch. Those guards are still real scenario-contract validation, so
 * they're exercised directly rather than deleted or left permanently uncovered. Never used by production
 * code or by any other test — those all go through the real runners.
 */
export const __getScenarioCheckForTesting = (
    scenarioId: LocatorScenarioId | MultiTurnOnlyScenarioId
): ((outcome: {
    toolCall: { id: string; name: string; args: unknown } | null;
    dispatchResult?: ToolResult;
    toolCalls: readonly DispatchedToolCall[];
    positionsBefore: Record<string, XY>;
    positionsAfter: Record<string, XY>;
    textPresent: boolean;
}) => { pass: boolean; path?: 'refusal' | 'executor-error'; error?: string }) => findAnyScenario(scenarioId).check;

/** How a multi-turn run ended. Decided ONLY from `scenario.check()`'s pass/fail result (or a
 * turn-count/provider exhaustion) — never from `knownVariance`, which this runner does not consult. */
export type MultiTurnTaskOutcome = 'success' | 'failure' | 'provider-error' | 'max-turns';

/** Descriptive classification of *how* a successful run got there — purely informational, and
 * computed only from the already-decided {@link MultiTurnTaskOutcome}. Never itself a pass/fail
 * signal: a `'lookup-first'` run is exactly as much a pass as a `'direct'` one. */
export type MultiTurnStrategy = 'direct' | 'lookup-first' | 'text-only' | 'other';

/** One model turn's outcome, in the order turns occurred. */
export interface MultiTurnTurnTrace {
    turn: number;
    toolCallName: string | null;
    textPresent: boolean;
    /** Whether `argsDelta` parsed as valid JSON — absent when no tool call was made this turn. */
    argsValid?: boolean;
    /** Whether `ToolExecutor.dispatch` reported success — absent when no dispatch was attempted. */
    dispatchOk?: boolean;
    /**
     * Set only on a genuinely successful `list_nodes` lookup that earns another turn instead of
     * completing the task (see `isContinuableLookup`) — never set together with `error`. Exists so
     * that step can be told apart from an actual problem: a `pass: false` from `scenario.check()`
     * here doesn't mean anything went wrong, only that the task isn't done yet.
     */
    stepStatus?: 'continued';
    /** Present iff `stepStatus === 'continued'` — a human-readable reason another turn was earned. */
    continuationReason?: string;
    /**
     * A genuine problem on this turn: invalid tool-call JSON, a failed `ToolExecutor.dispatch`, or a
     * terminal (non-continuable) failed strict check. Never set on a successful, continuable
     * `list_nodes` lookup — see `stepStatus`/`continuationReason` for that case instead.
     */
    error?: string;
    /** Every tool call the model emitted THIS turn, in order — not just the one `check()` scored
     * (see `pickPrimaryToolCall`). Present whenever at least one tool call was made this turn;
     * absent (never an empty array) when the model made none. */
    toolCalls?: { name: string; argsValid: boolean; dispatchOk?: boolean }[];
}

export interface MultiTurnLocatorScenarioResult {
    scenarioId: LocatorScenarioId | MultiTurnOnlyScenarioId;
    taskOutcome: MultiTurnTaskOutcome;
    strategy: MultiTurnStrategy;
    /** See {@link MultiTurnCompletionMode} — orthogonal to `strategy`, always `'none'` unless
     * `taskOutcome === 'success'`. */
    completionMode: MultiTurnCompletionMode;
    turnCount: number;
    /** Tool call names, one per turn that made one, in the order they occurred (e.g. `['list_nodes', 'move_node']`). */
    toolSequence: string[];
    turns: MultiTurnTurnTrace[];
    positionsBefore: Record<string, XY>;
    positionsAfter: Record<string, XY>;
    error?: string;
}

export interface RunMultiTurnLocatorScenarioOptions {
    /** Maximum model turns before giving up with `taskOutcome: 'max-turns'`. Defaults to 3. */
    maxTurns?: number;
}

const DEFAULT_MAX_TURNS = 3;

/**
 * Serializes a {@link ToolResult} into a tool-message's `content` string. `BaseAgent`'s own
 * `resultToContent` (`libs/agent/src/agents/baseAgent.ts`) does exactly this but is a private
 * module-level `const`, not exported — so it can't be imported here. Kept byte-for-byte identical
 * (`result.ok ? JSON.stringify(result.data ?? { ok: true }) : JSON.stringify({ error: result.error })`)
 * so a tool-result message built by this runner is indistinguishable from one `BaseAgent` would have
 * produced from the same `ToolResult`, and matches the shape asserted in the provider gateway specs
 * (e.g. `GeminiToolLlmGateway.spec.ts`'s `{ role: 'tool', content: '{"ok":true}', toolCallId: 'c1' }`).
 */
const toolResultToMessageContent = (result: ToolResult): string =>
    result.ok ? JSON.stringify(result.data ?? { ok: true }) : JSON.stringify({ error: result.error });

/**
 * Test-only escape hatch: exposes {@link toolResultToMessageContent} directly. Its `result.data ?? { ok:
 * true }` fallback only matters for a tool whose SUCCESS handler omits `data` — neither tool this file's
 * scenarios ever dispatch (`move_node`, `list_nodes`) does that, both always populate `data` on success —
 * so no scripted scenario response can reach that fallback through the real runner. Tested directly for
 * the same reason as {@link __getScenarioCheckForTesting} above.
 */
export const __toolResultToMessageContentForTesting = toolResultToMessageContent;

/** Only a successful, non-mutating `list_nodes` lookup earns another turn — see the module doc above. */
const isContinuableLookup = (toolCall: ToolCall, dispatchResult: ToolResult): boolean =>
    toolCall.name === 'list_nodes' && dispatchResult.ok;

/**
 * Describes the observed interaction shape, independent of {@link MultiTurnTaskOutcome} — a
 * `lookup-first` or `text-only` run is exactly as much that strategy whether it ultimately
 * succeeded, failed, hit `max-turns`, or errored. Only `direct` is defined in terms of the outcome
 * (it requires `success`); the other three are pure observations about what happened, checked in
 * this order:
 *
 * 1. `lookup-first` — the first tool call of the run was `list_nodes`, regardless of what happened
 *    after (a later success, a later failure, exhausting `maxTurns`, or a provider error on a
 *    later turn all still count).
 * 2. `text-only` — no tool was ever called, but at least one completed turn's response contained
 *    non-empty text (whether that text satisfied the scenario's strict check or not).
 * 3. `direct` — `taskOutcome` is `success`, it was reached on turn 1, and exactly one (non-
 *    `list_nodes`) tool was called.
 * 4. `other` — everything else (e.g. an immediate wrong non-`list_nodes` tool call, or a run with
 *    neither a tool call nor any text at all).
 */
const classifyMultiTurnStrategy = (
    taskOutcome: MultiTurnTaskOutcome,
    turns: readonly MultiTurnTurnTrace[],
    toolSequence: readonly string[]
): MultiTurnStrategy => {
    if (toolSequence[0] === 'list_nodes') {
        return 'lookup-first';
    }
    if (toolSequence.length === 0 && turns.some(t => t.textPresent)) {
        return 'text-only';
    }
    if (taskOutcome === 'success' && turns.length === 1 && toolSequence.length === 1) {
        return 'direct';
    }
    return 'other';
};

/**
 * Orthogonal to {@link MultiTurnStrategy}: `strategy` describes how a run STARTED (was the first
 * tool call `list_nodes`?); `completionMode` describes how a SUCCESSFUL run ENDED — did its
 * terminal successful turn act via a tool call, or answer via text? Never a pass/fail signal and
 * never used to derive `taskOutcome` — always `'none'` for anything other than `'success'`.
 *
 * - `'tool-action'` — the terminal successful turn made a tool call. This includes the rare case
 *   where `list_nodes` itself is the scenario's own expected completing action (e.g.
 *   `list-nodes-read-only`, whose `check()` passes directly on a bare `list_nodes` call): the task
 *   still completed via a tool call, not text, which is the distinction this field exists to
 *   capture — not "which specific tool", only "tool call vs. text".
 * - `'text-response'` — the terminal successful turn had no tool call. Covers both a direct
 *   text-only success (e.g. a clarifying question accepted immediately) and a `list_nodes` lookup
 *   followed by an accepted text response on a later turn — in both cases the LAST successful turn
 *   itself was text, even though `strategy` may say `'lookup-first'` because of an earlier turn.
 */
export type MultiTurnCompletionMode = 'tool-action' | 'text-response' | 'none';

const classifyCompletionMode = (
    taskOutcome: MultiTurnTaskOutcome,
    turns: readonly MultiTurnTurnTrace[]
): MultiTurnCompletionMode => {
    if (taskOutcome !== 'success') {
        return 'none';
    }
    // Every 'success' exit pushes exactly one turn trace for its own turn before returning — see
    // the `!toolCallChunk` and tool-call branches below — so `turns` is never empty here.
    const terminalTurn = turns[turns.length - 1];
    return terminalTurn?.toolCallName != null ? 'tool-action' : 'text-response';
};

/**
 * Multi-turn sibling of {@link runLocatorScenario}: allows up to `options.maxTurns` (default 3)
 * model turns instead of exactly one, feeding a real assistant tool-call + tool-result message pair
 * back into the transcript between turns. A turn ends the run immediately on success or on any
 * failure EXCEPT a successful `list_nodes` lookup, which earns another turn (see the module doc
 * above for why, and `check()`'s own per-scenario logic for how e.g. `unknown-target`'s
 * executor-error path already counts as success without needing a second turn).
 *
 * Pure and offline-testable: takes any {@link LlmGateway} (fake or real), uses a fresh
 * `createInMemoryCanvasBinding` and real `ToolExecutor`, and never reads `knownVariance`.
 */
export const runMultiTurnLocatorScenario = async (
    gateway: LlmGateway,
    scenarioId: LocatorScenarioId | MultiTurnOnlyScenarioId,
    options?: RunMultiTurnLocatorScenarioOptions
): Promise<MultiTurnLocatorScenarioResult> => {
    const maxTurns = options?.maxTurns ?? DEFAULT_MAX_TURNS;
    const scenario = findAnyScenario(scenarioId);
    const binding = createInMemoryCanvasBinding({
        nodes: scenario.seedNodes.map(n => ({
            id: n.id,
            type: n.type,
            position: { ...n.position },
            customLabel: n.label,
        })),
        edges: [],
    });
    const executor = createToolExecutor();
    const config = buildConfig(binding);
    const positionsBefore = snapshotPositions(binding);

    // Every single-turn scenario (run here or via runLocatorScenario) gets the per-turn node-context
    // system message on turn 1 exactly as before — `hideInitialNodeContext` exists only on
    // MultiTurnOnlyScenarioDefinition, so this is `false` for anything from `SCENARIOS`.
    const hideInitialNodeContext = 'hideInitialNodeContext' in scenario && scenario.hideInitialNodeContext;
    const transcript: ChatMessage[] = [
        { role: 'system', content: config.systemPrompt },
        ...(hideInitialNodeContext ? [] : [{ role: 'system', content: renderNodeContext(binding) } as ChatMessage]),
        { role: 'user', content: scenario.prompt },
    ];

    const turns: MultiTurnTurnTrace[] = [];
    const toolSequence: string[] = [];

    const finalize = (taskOutcome: MultiTurnTaskOutcome, error?: string): MultiTurnLocatorScenarioResult => ({
        scenarioId,
        taskOutcome,
        strategy: classifyMultiTurnStrategy(taskOutcome, turns, toolSequence),
        completionMode: classifyCompletionMode(taskOutcome, turns),
        turnCount: turns.length,
        toolSequence: [...toolSequence],
        turns: [...turns],
        positionsBefore,
        positionsAfter: snapshotPositions(binding),
        ...(error ? { error } : {}),
    });

    for (let turnNumber = 1; turnNumber <= maxTurns; turnNumber += 1) {
        let chunks: Chunk[];
        try {
            chunks = await drain(gateway.chat({ messages: transcript, tools: await executor.listTools(config) }));
        } catch (err) {
            // A thrown provider/gateway error escaping gateway.chat() itself — never a normal
            // check()-scored outcome. Completed turn traces and toolSequence are preserved (they
            // were already pushed for prior turns before this one threw).
            const message = err instanceof Error ? err.message : String(err);
            return finalize('provider-error', message.slice(0, ERROR_MESSAGE_LIMIT));
        }

        const textPresent = chunks.some(c => typeof c.text === 'string' && c.text.length > 0);

        // Dispatch EVERY tool call the model emitted this turn, in order — never just the first.
        const dispatched = await dispatchAllToolCalls(chunks, executor, config, VERIFY_USER_PERMISSIONS);

        if (dispatched.length === 0) {
            const { pass, error } = scenario.check({
                toolCall: null,
                toolCalls: [],
                positionsBefore,
                positionsAfter: snapshotPositions(binding),
                textPresent,
            });
            turns.push({ turn: turnNumber, toolCallName: null, textPresent, ...(error ? { error } : {}) });
            return finalize(pass ? 'success' : 'failure', error);
        }

        // Every call this turn joins toolSequence in order — `isSuccessfulLookupActionRoundTrip`
        // already treats this as a flat sequence, not one entry per turn, so a batched
        // `list_nodes` + `move_node` turn is indistinguishable from the same two calls arriving on
        // separate turns for lookup-first/genuine-roundtrip classification purposes.
        for (const call of dispatched) {
            toolSequence.push(call.name);
        }

        // Append the real assistant tool-call message (one entry per dispatched call, exactly as
        // BaseAgent.send() would persist a multi-call turn) and one tool-result message per call —
        // same shape `mapTranscript`/`recordToolResult` in baseAgent.ts produce. `thoughtSignature`
        // rides along verbatim per call when the gateway captured one; Gemini's "thinking" models
        // reject a replayed functionCall with a 400 without it — absent for every other provider.
        transcript.push({
            role: 'assistant',
            content: null,
            toolCalls: dispatched.map(call => ({
                id: call.id,
                name: call.name,
                args: call.argsDelta,
                ...(call.thoughtSignature !== undefined ? { thoughtSignature: call.thoughtSignature } : {}),
            })),
        });
        for (const call of dispatched) {
            transcript.push({
                role: 'tool',
                content: toolResultToMessageContent(call.dispatchResult),
                toolCallId: call.id,
            });
        }

        const primary = pickPrimaryToolCall(dispatched) as DispatchedToolCall;
        const toolCall: ToolCall = { id: primary.id, name: primary.name, args: primary.args };
        const dispatchResult = primary.dispatchResult;

        const positionsAfter = snapshotPositions(binding);
        const { pass, error } = scenario.check({
            toolCall,
            dispatchResult,
            toolCalls: dispatched,
            positionsBefore,
            positionsAfter,
            textPresent,
        });
        const continuable = !pass && isContinuableLookup(toolCall, dispatchResult);

        turns.push({
            turn: turnNumber,
            toolCallName: toolCall.name,
            textPresent,
            argsValid: primary.argsValid,
            // `dispatchOk` reflects a REAL `ToolExecutor.dispatch` attempt only — absent, not
            // `false`, when args were invalid and dispatch was never actually attempted.
            ...(primary.argsValid ? { dispatchOk: dispatchResult.ok } : {}),
            toolCalls: dispatched.map(d => ({
                name: d.name,
                argsValid: d.argsValid,
                ...(d.argsValid ? { dispatchOk: d.dispatchResult.ok } : {}),
            })),
            // A continuable lookup's check() message (e.g. "unexpected tool call: list_nodes") is
            // never a real problem — it only means the task isn't done yet — so it's never surfaced
            // as `error` here; `error` is reserved for a terminal (non-continuable) failed check.
            ...(continuable
                ? { stepStatus: 'continued' as const, continuationReason: `task not complete after ${toolCall.name}` }
                : error
                  ? { error }
                  : {}),
        });

        if (pass) {
            return finalize('success');
        }
        if (!continuable) {
            return finalize('failure', error);
        }
        // Successful, non-mutating list_nodes lookup that didn't itself satisfy the scenario —
        // loop continues to the next turn with the tool-result now in the transcript.
    }

    return finalize('max-turns');
};
