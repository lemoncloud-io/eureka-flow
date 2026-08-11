import { createInMemoryCanvasBinding } from '../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../catalog';
import { dispatchAllToolCalls, pickPrimaryToolCall } from './verifyLocatorScenarios';
import { LIST_NODES, MOVE_NODE } from '../tools/nodeTools';
import { createToolExecutor } from '../tools/toolExecutor';
import { toolset } from '../tools/toolset';

import type { AgentConfig } from '../agent';
import type { Chunk, LlmGateway } from './llmGateway';
import type { AgentGrant } from '../permissions';

// No blocks are ever described in this Scope-A verification — the model is only expected to
// call move_node, which doesn't read the catalog — so an empty one merely satisfies `toolset`'s
// `CanvasToolDeps` shape.
const emptyCatalog = createCatalogLookup([]);

/**
 * Shared single-turn provider-native tool-call verification: seed a single text-input node, ask
 * the given gateway (any real provider gateway, or a fake/scripted one for tests) to move it
 * 100px right, assert it emits a structured `move_node` call, dispatch that through the real
 * `ToolExecutor`, and report whether the node actually moved (100,200) -> (200,200).
 *
 * Pure result-returning (no test-runner assertions) so the offline spec and the env-gated
 * real-key spec (`realProviderToolCall.spec.ts`) run identical verification logic — see
 * docs/browser-agent/design/provider-tool-calling.md §4.
 *
 * The `error` field is always a short, already-provider-redacted message (gateways redact API
 * keys from their own thrown errors) truncated defensively — never the raw prompt or the raw
 * provider response body.
 */

const START_POSITION = { x: 100, y: 200 } as const;
const EXPECTED_POSITION = { x: 200, y: 200 } as const;
const ERROR_MESSAGE_LIMIT = 200;

// This harness verifies the agent's own fixed `grant`, not the user-permission ceiling the
// orchestrator refactor added — so the ceiling here is permissive, matching (never narrower
// than) `config.grant` below, and never the thing under test.
const VERIFY_USER_PERMISSIONS: AgentGrant = {
    canModifyCanvas: true,
    canEditConfig: true,
    canEditStructure: true,
    canRun: true,
};

export interface VerifyMoveNodeResult {
    toolCallName: string | null;
    positionBefore: { x: number; y: number };
    positionAfter: { x: number; y: number };
    pass: boolean;
    error?: string;
    /** Every tool call the model emitted this turn, in order — not just the one used for the
     * pass/fail identity check above. Present whenever at least one tool call was made; absent
     * (never an empty array) when the model made none. */
    toolCalls?: { name: string; argsValid: boolean; dispatchOk?: boolean }[];
}

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

export const verifyMoveNodeToolCall = async (gateway: LlmGateway): Promise<VerifyMoveNodeResult> => {
    const binding = createInMemoryCanvasBinding({
        nodes: [{ id: 'text-1', type: 'text-input', position: { ...START_POSITION } }],
        edges: [],
    });
    const executor = createToolExecutor();
    const config: AgentConfig = {
        id: 'locator-verify',
        description: 'moves nodes on the canvas',
        systemPrompt: 'You move nodes on a visual canvas by calling the provided tools.',
        tools: [toolset({ binding, catalog: emptyCatalog }, [LIST_NODES, MOVE_NODE])],
        grant: { canModifyCanvas: true },
    };

    try {
        // Seed the node list so the model can call move_node in one turn — no multi-turn
        // tool-result round-trip. Mirrors the retired LocatorAgent's per-turn context injection
        // (see verifyLocatorScenarios.ts's LOCATOR_SYSTEM_PROMPT doc for why this harness keeps
        // that narrow persona/toolset rather than the builder's much broader one).
        const chunks = await drain(
            gateway.chat({
                messages: [
                    { role: 'system', content: config.systemPrompt },
                    {
                        role: 'system',
                        content: 'Current nodes on the canvas:\n- id="text-1" type="text-input" at (100, 200)',
                    },
                    { role: 'user', content: 'Move the text input node 100px to the right.' },
                ],
                tools: await executor.listTools(config),
            })
        );

        // Dispatch EVERY tool call the model emitted this turn, in order — never just the first.
        // `positionAfter` below reflects every one of them, so a second, unscored call that also
        // mutated the node is never silently missed by a final-state check on a single position.
        const dispatched = await dispatchAllToolCalls(chunks, executor, config, VERIFY_USER_PERMISSIONS);
        const toolCallsVisibility = dispatched.length
            ? {
                  toolCalls: dispatched.map(d => ({
                      name: d.name,
                      argsValid: d.argsValid,
                      ...(d.argsValid ? { dispatchOk: d.dispatchResult.ok } : {}),
                  })),
              }
            : {};

        const primary = pickPrimaryToolCall(dispatched);
        if (!primary) {
            return {
                toolCallName: null,
                positionBefore: START_POSITION,
                positionAfter: START_POSITION,
                pass: false,
                error: 'model did not emit a structured tool call',
                ...toolCallsVisibility,
            };
        }
        if (primary.name !== 'move_node') {
            return {
                toolCallName: primary.name,
                positionBefore: START_POSITION,
                positionAfter: binding.readGraph().nodes[0].position,
                pass: false,
                error: `unexpected tool call: ${primary.name}`,
                ...toolCallsVisibility,
            };
        }
        if (!primary.argsValid) {
            return {
                toolCallName: primary.name,
                positionBefore: START_POSITION,
                positionAfter: binding.readGraph().nodes[0].position,
                pass: false,
                error: 'tool call arguments were not valid JSON',
                ...toolCallsVisibility,
            };
        }

        const positionAfter = binding.readGraph().nodes[0].position;
        const movedCorrectly = positionAfter.x === EXPECTED_POSITION.x && positionAfter.y === EXPECTED_POSITION.y;
        const pass = primary.dispatchResult.ok && movedCorrectly;

        return {
            toolCallName: primary.name,
            positionBefore: START_POSITION,
            positionAfter,
            pass,
            ...(pass
                ? {}
                : {
                      error: primary.dispatchResult.ok
                          ? `node moved to (${positionAfter.x},${positionAfter.y}), expected (${EXPECTED_POSITION.x},${EXPECTED_POSITION.y})`
                          : primary.dispatchResult.error,
                  }),
            ...toolCallsVisibility,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            toolCallName: null,
            positionBefore: START_POSITION,
            positionAfter: START_POSITION,
            pass: false,
            error: message.slice(0, ERROR_MESSAGE_LIMIT),
        };
    }
};
