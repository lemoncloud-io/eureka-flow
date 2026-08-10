import { describe, expect, it } from 'vitest';

import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { ScriptedHttpRequest } from '../../http/ScriptedHttpRequest';
import { createAnthropicToolLlmGateway } from '../../llm/AnthropicToolLlmGateway';
import { createGeminiToolLlmGateway } from '../../llm/GeminiToolLlmGateway';
import { accumulateExtendedUsage, wrapGatewayWithUsageCapture } from '../../llm/verificationMetrics';
import { LOCATOR_SCENARIOS, runMultiTurnLocatorScenario } from '../../llm/verifyLocatorScenarios';

import type { ChatRequest, Chunk, LlmGateway } from '../../llm/llmGateway';
import type { CapturedCallInfo } from '../../llm/verificationMetrics';

/** A gateway that returns the next scripted response on each successive `chat()` call, and records
 * every `ChatRequest` it was given — so transcript construction between turns can be asserted.
 * `runMultiTurnLocatorScenario` passes the SAME mutable transcript array on every call (pushing the
 * next turn's assistant/tool messages onto it in place) — so each captured request's `messages` is
 * cloned at capture time; otherwise every entry in `requests` would alias the one array and end up
 * showing its final, fully-mutated state regardless of which turn actually requested it. */
const scriptedGateway = (responses: (Chunk[] | Error)[]): { gateway: LlmGateway; requests: ChatRequest[] } => {
    const requests: ChatRequest[] = [];
    let call = 0;
    return {
        requests,
        gateway: {
            capabilities: { toolCalls: true },
            async *chat(req: ChatRequest): AsyncIterable<Chunk> {
                requests.push({ ...req, messages: [...req.messages] });
                const response = responses[call];
                call += 1;
                if (response instanceof Error) {
                    throw response;
                }
                for (const chunk of response ?? []) yield chunk;
            },
        },
    };
};

describe('runMultiTurnLocatorScenario: direct move', () => {
    it('succeeds in one turn via the expected tool, strategy=direct', async () => {
        const { gateway } = scriptedGateway([
            [
                { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('direct');
        expect(result.turnCount).toBe(1);
        expect(result.toolSequence).toEqual(['move_node']);
        expect(result.positionsAfter['text-1']).toEqual({ x: 300, y: 200 });
    });
});

describe('runMultiTurnLocatorScenario: lookup-first completion', () => {
    it('completes on turn 2 after a list_nodes lookup, strategy=lookup-first', async () => {
        const { gateway, requests } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [
                { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.turnCount).toBe(2);
        expect(result.toolSequence).toEqual(['list_nodes', 'move_node']);
        expect(result.positionsAfter['text-1']).toEqual({ x: 300, y: 200 });
        expect(requests).toHaveLength(2);
    });

    it('feeds a real assistant tool-call + tool-result message pair back for the second request', async () => {
        const { gateway, requests } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [
                { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
                { done: true },
            ],
        ]);
        await runMultiTurnLocatorScenario(gateway, 'move-node-right');

        const secondRequest = requests[1];
        const messages = secondRequest.messages;
        const assistantIdx = messages.findIndex(m => m.role === 'assistant');
        expect(assistantIdx).toBeGreaterThanOrEqual(0);
        const assistantMsg = messages[assistantIdx];
        expect(assistantMsg.toolCalls).toEqual([{ id: 'c1', name: 'list_nodes', args: '{}' }]);

        const toolMsg = messages[assistantIdx + 1];
        expect(toolMsg.role).toBe('tool');
        expect(toolMsg.toolCallId).toBe('c1');
        // Same serialization BaseAgent.recordToolResult/resultToContent produces for a successful
        // dispatch with no data payload: JSON.stringify(result.data ?? { ok: true }).
        expect(typeof toolMsg.content).toBe('string');
        expect(() => JSON.parse(toolMsg.content as string)).not.toThrow();
    });
});

describe('runMultiTurnLocatorScenario: repeated lookup exhausts maxTurns', () => {
    it('returns max-turns with no canvas mutation when every turn calls list_nodes, strategy=lookup-first', async () => {
        const { gateway, requests } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c2', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c3', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('max-turns');
        // Strategy describes the observed interaction (first tool called was list_nodes), not the
        // outcome — a lookup-first run that never gets past looking things up is still lookup-first.
        expect(result.strategy).toBe('lookup-first');
        expect(result.turnCount).toBe(3);
        expect(result.toolSequence).toEqual(['list_nodes', 'list_nodes', 'list_nodes']);
        expect(result.positionsAfter).toEqual(result.positionsBefore);
        expect(requests).toHaveLength(3);
    });
});

describe('runMultiTurnLocatorScenario: invalid JSON args', () => {
    it('fails immediately with argsValid=false and never dispatches', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'move_node', argsDelta: '{not valid json' } }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('failure');
        expect(result.turns[0].argsValid).toBe(false);
        expect(result.turns[0].dispatchOk).toBeUndefined();
        expect(result.positionsAfter).toEqual(result.positionsBefore);
    });
});

describe('runMultiTurnLocatorScenario: provider error on a later turn', () => {
    it('returns provider-error while preserving completed turn traces and toolSequence, strategy=lookup-first', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            new Error('OpenAI request failed with status 500'),
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('provider-error');
        // The lookup happened before the provider errored out on the next turn — still lookup-first.
        expect(result.strategy).toBe('lookup-first');
        expect(result.toolSequence).toEqual(['list_nodes']);
        expect(result.turns).toHaveLength(1);
        expect(result.turns[0].toolCallName).toBe('list_nodes');
        expect(result.error).toBeDefined();
        // Canvas-state evidence must still be present even on a thrown-provider-error exit — the
        // live runner (realMultiTurnLocatorScenarios.spec.ts) persists these into MultiTurnLiveRecord
        // unconditionally on this path (only a task-level 'timeout', caught one layer up outside
        // this function entirely, has no result object to read positions from at all).
        expect(result.positionsBefore).toBeDefined();
        expect(result.positionsAfter).toBeDefined();
        expect(result.positionsAfter).toEqual(result.positionsBefore); // list_nodes never mutates
    });
});

describe('runMultiTurnLocatorScenario: positionsBefore/positionsAfter are present on every outcome', () => {
    // The live runner depends on this being universally true (see multiTurnVerificationMetrics.ts's
    // MultiTurnLiveRecord.positionsBefore/positionsAfter doc) — locked in here across all four
    // MultiTurnTaskOutcome values, not just the provider-error case above.
    it('success', async () => {
        const { gateway } = scriptedGateway([
            [
                { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('success');
        expect(result.positionsBefore).toBeDefined();
        expect(result.positionsAfter).toBeDefined();
    });

    it('failure', async () => {
        const { gateway } = scriptedGateway([[{ text: 'I moved the node for you.' }, { done: true }]]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('failure');
        expect(result.positionsBefore).toBeDefined();
        expect(result.positionsAfter).toBeDefined();
    });

    it('max-turns', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c2', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c3', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('max-turns');
        expect(result.positionsBefore).toBeDefined();
        expect(result.positionsAfter).toBeDefined();
    });
});

describe('runMultiTurnLocatorScenario: text-only scenarios', () => {
    it('succeeds via a valid text-only response, strategy=text-only (no-tool-refusal)', async () => {
        const { gateway } = scriptedGateway([[{ text: 'I can only move nodes, not delete them.' }, { done: true }]]);
        const result = await runMultiTurnLocatorScenario(gateway, 'no-tool-refusal');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('text-only');
        expect(result.turnCount).toBe(1);
        expect(result.toolSequence).toEqual([]);
    });

    it('succeeds via a valid text-only response, strategy=text-only (no-op-instruction)', async () => {
        const { gateway } = scriptedGateway([[{ text: 'Sure, nothing moved.' }, { done: true }]]);
        const result = await runMultiTurnLocatorScenario(gateway, 'no-op-instruction');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('text-only');
    });

    it('fails the strict check on a text-only response, strategy is still text-only', async () => {
        // move-node-right requires a move_node tool call; text alone never satisfies it — a
        // failing outcome, but the interaction shape (no tool, some text) is still text-only.
        const { gateway } = scriptedGateway([[{ text: 'I moved the node for you.' }, { done: true }]]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('failure');
        expect(result.strategy).toBe('text-only');
        expect(result.toolSequence).toEqual([]);
        expect(result.positionsAfter).toEqual(result.positionsBefore);
    });
});

describe('runMultiTurnLocatorScenario: wrong tool', () => {
    it('does not become success merely because the wrong tool call is understandable; strategy=other', async () => {
        const { gateway } = scriptedGateway([
            [
                { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":0,"dy":0}}' } },
                { done: true },
            ],
        ]);
        // no-tool-refusal expects a text refusal, not any tool call. A wrong non-list_nodes tool
        // call is neither lookup-first, text-only, nor (since it fails) direct — it's `other`.
        const result = await runMultiTurnLocatorScenario(gateway, 'no-tool-refusal');
        expect(result.taskOutcome).toBe('failure');
        expect(result.strategy).toBe('other');
    });

    it('a non-list_nodes wrong tool does not earn a second turn', async () => {
        const { gateway, requests } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [
                { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
                { done: true },
            ],
        ]);
        // selective-multi-node expects the http node to move; moving text-1 is simply wrong, not a lookup.
        const result = await runMultiTurnLocatorScenario(gateway, 'selective-multi-node');
        expect(result.taskOutcome).toBe('failure');
        expect(result.turnCount).toBe(2);
        expect(requests).toHaveLength(2);
    });
});

describe('runMultiTurnLocatorScenario: completionMode — orthogonal to strategy', () => {
    it('direct tool-action success: strategy=direct, completionMode=tool-action', async () => {
        const { gateway } = scriptedGateway([
            [
                { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('direct');
        expect(result.completionMode).toBe('tool-action');
    });

    it('lookup-first tool-action success: strategy=lookup-first, completionMode=tool-action (move-named-node-without-id)', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [
                {
                    toolCall: {
                        id: 'c2',
                        name: 'move_node',
                        argsDelta: '{"nodeId":"node-a17","by":{"dx":100,"dy":0}}',
                    },
                },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.completionMode).toBe('tool-action');
    });

    it('direct text-response success: strategy=text-only, completionMode=text-response (no-tool-refusal, turn 1)', async () => {
        const { gateway } = scriptedGateway([[{ text: 'I can only move nodes, not delete them.' }, { done: true }]]);
        const result = await runMultiTurnLocatorScenario(gateway, 'no-tool-refusal');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('text-only');
        expect(result.completionMode).toBe('text-response');
    });

    it('lookup-first text-response success: strategy=lookup-first, completionMode=text-response (ambiguous-instruction, list_nodes then clarification)', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ text: 'Two text-input nodes match — which one did you mean?' }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'ambiguous-instruction');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.turnCount).toBe(2);
        expect(result.completionMode).toBe('text-response');
    });

    it('a failure never gets a tool-action/text-response completionMode — always none', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'move_node', argsDelta: '{not valid json' } }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('failure');
        expect(result.completionMode).toBe('none');
    });

    it('a provider-error always has completionMode=none', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            new Error('OpenAI request failed with status 500'),
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('provider-error');
        expect(result.completionMode).toBe('none');
    });

    it('max-turns always has completionMode=none', async () => {
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c2', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c3', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('max-turns');
        expect(result.completionMode).toBe('none');
    });

    it('list-nodes-read-only success: strategy=lookup-first (per the existing heuristic), completionMode=tool-action — the terminal call is list_nodes itself', async () => {
        // Documents the deliberate edge case from classifyCompletionMode's own doc: list_nodes can
        // itself be the scenario's expected completing action. Never confuse this single-call
        // success with a genuine lookup-action ROUND TRIP — isSuccessfulLookupActionRoundTrip
        // (multiTurnVerificationMetrics.ts) requires a LATER, non-list_nodes tool call too, which
        // this attempt's toolSequence (['list_nodes']) never has.
        const { gateway } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'list-nodes-read-only');
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.completionMode).toBe('tool-action');
        expect(result.toolSequence).toEqual(['list_nodes']);
    });
});

// =================================================================================================
// move-named-node-without-id: the one multi-turn-ONLY scenario (never in SCENARIOS/LOCATOR_SCENARIOS
// — see verifyLocatorScenarios.ts's MultiTurnOnlyScenarioDefinition/MULTI_TURN_ONLY_SCENARIOS). The
// target ("Login button") is named only by its visible label; its opaque id (`node-a17`) cannot be
// inferred from the prompt, so a genuine lookup-first round trip is the natural strategy — while a
// model that reads the id straight out of the per-turn node context and calls move_node directly
// still passes (classified `direct`, not forced into a fabricated lookup).
// =================================================================================================

describe('runMultiTurnLocatorScenario: move-named-node-without-id (multi-turn-only scenario)', () => {
    it('lookup-first success: list_nodes then move_node with the discovered id — exact transcript verification', async () => {
        const { gateway, requests } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [
                {
                    toolCall: {
                        id: 'c2',
                        name: 'move_node',
                        argsDelta: '{"nodeId":"node-a17","by":{"dx":100,"dy":0}}',
                    },
                },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.turnCount).toBe(2);
        expect(result.toolSequence).toEqual(['list_nodes', 'move_node']);
        expect(result.positionsBefore['node-a17']).toEqual({ x: 200, y: 300 });
        expect(result.positionsAfter['node-a17']).toEqual({ x: 300, y: 300 });
        // Distractors never moved.
        expect(result.positionsAfter['node-b42']).toEqual(result.positionsBefore['node-b42']);
        expect(result.positionsAfter['node-c88']).toEqual(result.positionsBefore['node-c88']);

        expect(requests).toHaveLength(2);

        // Turn 1 request: ONLY the system prompt + user prompt — no per-turn node-context message at
        // all, so no node id (target or distractor) is visible anywhere before list_nodes is called.
        const firstMessages = requests[0].messages;
        expect(firstMessages).toHaveLength(2);
        expect(firstMessages[0].role).toBe('system');
        expect(firstMessages[1]).toEqual({ role: 'user', content: 'Move the Login button 100 pixels to the right.' });

        // Required assertion: no node id, and no serialized label-to-id mapping, appears anywhere in
        // the complete first-turn transcript (both messages, not just the user prompt).
        const firstTurnSerialized = JSON.stringify(firstMessages);
        expect(firstTurnSerialized).not.toContain('node-a17');
        expect(firstTurnSerialized).not.toContain('node-b42');
        expect(firstTurnSerialized).not.toContain('node-c88');
        // No serialized label-to-id mapping: `renderNodeContext`'s own line format is exactly
        // `- id="<id>" type="<type>" label="<label>" ...` — its absence here is direct proof the
        // node-context system message was never built into this transcript at all.
        expect(firstTurnSerialized).not.toContain('id="');
        expect(firstTurnSerialized).not.toContain('label="Login"');

        // Turn 2 request: the first 2 messages unchanged, plus a real assistant tool-call + tool-result
        // pair for the list_nodes call — the tool result must contain the real canvas nodes (proving
        // the model was genuinely given the lookup data, not a fabricated/forced result), and this is
        // the FIRST point at which any node id becomes visible.
        const secondMessages = requests[1].messages;
        expect(secondMessages).toHaveLength(4);
        expect(secondMessages.slice(0, 2)).toEqual(firstMessages);
        expect(secondMessages[2]).toEqual({
            role: 'assistant',
            content: null,
            toolCalls: [{ id: 'c1', name: 'list_nodes', args: '{}' }],
        });
        expect(secondMessages[3].role).toBe('tool');
        expect(secondMessages[3].toolCallId).toBe('c1');
        const listNodesResult = JSON.parse(secondMessages[3].content as string) as {
            nodes: { id: string; label?: string }[];
        };
        expect(listNodesResult.nodes.map(n => ({ id: n.id, label: n.label }))).toEqual(
            expect.arrayContaining([{ id: 'node-a17', label: 'Login' }])
        );
        expect(JSON.stringify(secondMessages[3].content)).toContain('node-a17');

        // Required: a successful lookup-first record's per-turn trace never carries a misleading
        // "error" for the intermediate list_nodes step — that step genuinely succeeded, it just
        // doesn't complete the task yet. `stepStatus`/`continuationReason` say so explicitly instead.
        expect(result.turns[0]).toEqual({
            turn: 1,
            toolCallName: 'list_nodes',
            textPresent: false,
            argsValid: true,
            dispatchOk: true,
            stepStatus: 'continued',
            continuationReason: 'task not complete after list_nodes',
        });
        expect(result.turns[0].error).toBeUndefined();
        // Turn 2 (the completing move_node) has no error and no stepStatus either — it's simply done.
        expect(result.turns[1]).toEqual({
            turn: 2,
            toolCallName: 'move_node',
            textPresent: false,
            argsValid: true,
            dispatchOk: true,
        });
        expect(result.turns[1].error).toBeUndefined();
        expect(result.turns[1].stepStatus).toBeUndefined();
    });

    it('lookup-only exhausts maxTurns without ever calling move_node — never counted as success', async () => {
        const { gateway, requests } = scriptedGateway([
            [{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c2', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
            [{ toolCall: { id: 'c3', name: 'list_nodes', argsDelta: '{}' } }, { done: true }],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('max-turns');
        expect(result.strategy).toBe('lookup-first');
        expect(result.turnCount).toBe(3);
        expect(result.toolSequence).toEqual(['list_nodes', 'list_nodes', 'list_nodes']);
        expect(result.positionsAfter).toEqual(result.positionsBefore);
        expect(requests).toHaveLength(3);
        // Every one of these successful-but-incomplete list_nodes turns is `continued`, never an
        // error — even the LAST one, which exhausts maxTurns without ever becoming a real failure.
        for (const t of result.turns) {
            expect(t.stepStatus).toBe('continued');
            expect(t.continuationReason).toBe('task not complete after list_nodes');
            expect(t.error).toBeUndefined();
        }
    });

    it('guessed wrong id fails: move_node dispatch itself fails, never treated as success', async () => {
        const { gateway } = scriptedGateway([
            // A guessed, human-readable id (never actually assigned to any seeded node) instead of
            // the real opaque id `node-a17`.
            [
                {
                    toolCall: {
                        id: 'c1',
                        name: 'move_node',
                        argsDelta: '{"nodeId":"login-button","by":{"dx":100,"dy":0}}',
                    },
                },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('failure');
        expect(result.turns[0].dispatchOk).toBe(false);
        expect(result.error).toContain('no node with id "login-button" exists');
        expect(result.positionsAfter).toEqual(result.positionsBefore);
        // Required: a genuine dispatch failure still carries a real `error` on the trace — this is
        // exactly the kind of actual problem `error` is reserved for, unlike the continuable-lookup
        // case above.
        expect(result.turns[0].error).toContain('no node with id "login-button" exists');
        expect(result.turns[0].stepStatus).toBeUndefined();
        expect(result.turns[0].continuationReason).toBeUndefined();
    });

    it('wrong target fails the strict check: dispatch succeeds but the named node never moved', async () => {
        const { gateway } = scriptedGateway([
            // Moves the "Sign up" distractor instead of the named "Login" target — a real, existing
            // node id, so dispatch succeeds; the strict check must still fail this.
            [
                {
                    toolCall: {
                        id: 'c1',
                        name: 'move_node',
                        argsDelta: '{"nodeId":"node-b42","by":{"dx":100,"dy":0}}',
                    },
                },
                { done: true },
            ],
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('failure');
        expect(result.turns[0].dispatchOk).toBe(true);
        expect(result.error).toContain('named node moved to');
        expect(result.positionsAfter['node-a17']).toEqual(result.positionsBefore['node-a17']);
        expect(result.positionsAfter['node-b42']).toEqual({ x: 600, y: 300 });
        // Required: this is a TERMINAL failure (dispatch succeeded, but move_node is not a
        // continuable list_nodes lookup) — the trace must preserve a meaningful `error`, not drop it
        // the way a continuable lookup's message would be.
        expect(result.turns[0].error).toContain('named node moved to');
        expect(result.turns[0].stepStatus).toBeUndefined();
        expect(result.turns[0].continuationReason).toBeUndefined();
    });

    it("a text-only response fails: no tool call can ever satisfy this scenario's check", async () => {
        const { gateway } = scriptedGateway([[{ text: 'The Login button is at (200, 300).' }, { done: true }]]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('failure');
        expect(result.strategy).toBe('text-only');
        expect(result.toolSequence).toEqual([]);
        expect(result.error).toContain('did not emit a structured tool call');
        expect(result.positionsAfter).toEqual(result.positionsBefore);
    });
});

describe('runMultiTurnLocatorScenario: error handling', () => {
    it('stringifies a thrown non-Error value from the gateway (e.g. a plain string)', async () => {
        const gateway: LlmGateway = {
            capabilities: { toolCalls: true },
            // eslint-disable-next-line require-yield -- intentionally throws before any yield
            async *chat(): AsyncIterable<Chunk> {
                throw 'plain string thrown, not an Error';
            },
        };
        const result = await runMultiTurnLocatorScenario(gateway, 'move-node-right');
        expect(result.taskOutcome).toBe('provider-error');
        expect(result.error).toBe('plain string thrown, not an Error');
    });

    it('throws for an unknown scenario id (single-turn AND multi-turn-only catalogs both miss it)', async () => {
        const gateway: LlmGateway = {
            capabilities: { toolCalls: true },
            async *chat(): AsyncIterable<Chunk> {
                yield { done: true };
            },
        };
        await expect(
            runMultiTurnLocatorScenario(
                gateway,
                'not-a-real-scenario' as unknown as Parameters<typeof runMultiTurnLocatorScenario>[1]
            )
        ).rejects.toThrow(/unknown locator scenario id/);
    });
});

describe('single-turn catalog is unaffected by the multi-turn-only scenario', () => {
    it('LOCATOR_SCENARIOS still lists exactly the pre-existing eleven single-turn ids', () => {
        expect(LOCATOR_SCENARIOS.map(s => s.id)).toEqual([
            'list-nodes-read-only',
            'move-node-right',
            'move-node-left',
            'move-node-up',
            'move-node-down',
            'move-node-absolute',
            'selective-multi-node',
            'ambiguous-instruction',
            'no-tool-refusal',
            'no-op-instruction',
            'unknown-target',
        ]);
        expect(LOCATOR_SCENARIOS.map(s => s.id)).not.toContain('move-named-node-without-id');
    });
});

// =================================================================================================
// runMultiTurnLocatorScenario wired to a REAL createAnthropicToolLlmGateway, over a scripted (no
// network) HTTP layer — the strongest OFFLINE confidence check available before ever spending a
// real Anthropic API call: proves the full benchmark pipeline (transcript construction, real
// Anthropic request/response mapping, ToolExecutor dispatch, usage capture/accumulation) works
// end-to-end through the actual gateway code, not just through AnthropicToolLlmGateway.spec.ts's
// own isolated unit tests or this file's synthetic scriptedGateway fake.
// =================================================================================================

describe('runMultiTurnLocatorScenario + a real Anthropic gateway (offline, scripted HTTP — zero network)', () => {
    it('completes the move-named-node-without-id lookup-action round trip through real Anthropic request/response mapping', async () => {
        const http = new ScriptedHttpRequest([
            {
                json: {
                    content: [{ type: 'tool_use', id: 'toolu_1', name: 'list_nodes', input: {} }],
                    stop_reason: 'tool_use',
                    usage: { input_tokens: 200, output_tokens: 20 },
                    // The pinned snapshot the bare 'claude-haiku-4-5' alias actually resolved to —
                    // deliberately different from the requested model string.
                    model: 'claude-haiku-4-5-20251001',
                },
            },
            {
                json: {
                    content: [
                        {
                            type: 'tool_use',
                            id: 'toolu_2',
                            name: 'move_node',
                            input: { nodeId: 'node-a17', by: { dx: 100, dy: 0 } },
                        },
                    ],
                    stop_reason: 'tool_use',
                    usage: { input_tokens: 260, output_tokens: 25 },
                    model: 'claude-haiku-4-5-20251001',
                },
            },
        ]);
        const gateway = createAnthropicToolLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: 'test-anthropic-key',
            model: 'claude-haiku-4-5',
        });
        const captured: CapturedCallInfo[] = [];
        const wrapped = wrapGatewayWithUsageCapture(gateway, c => captured.push(c));

        const result = await runMultiTurnLocatorScenario(wrapped, 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.completionMode).toBe('tool-action');
        expect(result.toolSequence).toEqual(['list_nodes', 'move_node']);
        // The real ToolExecutor genuinely dispatched move_node with the id discovered from the real
        // (scripted) Anthropic list_nodes response — not a forced/mocked outcome.
        expect(result.positionsAfter['node-a17']).toEqual({ x: 300, y: 300 });
        expect(result.positionsAfter['node-b42']).toEqual(result.positionsBefore['node-b42']);

        // Real Anthropic tool-result transcript mapping: Anthropic has no role:'tool' — a tool
        // result must appear as a USER message carrying a tool_result block correlated by
        // tool_use_id, verified against the actual request body this gateway sent, not a mock.
        expect(http.requests).toHaveLength(2);
        interface AnthropicWireMessage {
            role: string;
            content:
                | string
                | Array<{
                      type: string;
                      id?: string;
                      name?: string;
                      input?: unknown;
                      tool_use_id?: string;
                      content?: string;
                  }>;
        }
        const secondBody = http.requests[1].body as { messages: AnthropicWireMessage[] };
        const assistantIdx = secondBody.messages.findIndex(m => m.role === 'assistant');
        expect(assistantIdx).toBeGreaterThanOrEqual(0);
        const assistantContent = secondBody.messages[assistantIdx].content;
        expect(assistantContent).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'list_nodes', input: {} }]);
        const toolResultMsg = secondBody.messages[assistantIdx + 1];
        expect(toolResultMsg.role).toBe('user');
        const toolResultBlock = (
            toolResultMsg.content as Array<{ type: string; tool_use_id?: string; content?: string }>
        )[0];
        expect(toolResultBlock.type).toBe('tool_result');
        expect(toolResultBlock.tool_use_id).toBe('toolu_1');
        // The real list_nodes dispatch result (containing the discovered node) is what was actually
        // sent back — proving the tool_use_id -> tool_result correlation carries real dispatch data,
        // not a placeholder.
        expect(toolResultBlock.content).toContain('node-a17');

        // Usage accumulation over BOTH turns, via the same accumulateExtendedUsage the live runner
        // (realMultiTurnLocatorScenarios.spec.ts) uses — proves multi-call usage genuinely sums,
        // not just that a single call's usage maps correctly (already covered by
        // AnthropicToolLlmGateway.spec.ts's own isolated tests).
        expect(captured).toHaveLength(2);
        const usage = accumulateExtendedUsage(captured);
        expect(usage.inputTokens).toBe(460); // 200 + 260
        expect(usage.outputTokens).toBe(45); // 20 + 25
        expect(usage.totalTokens).toBe(505);
        // claude-haiku-4-5 is priced in pricing.ts, so a real cost estimate is expected, never null.
        expect(usage.estimatedCost).not.toBeNull();
        expect(usage.costSource).toBe('estimated');

        // Requested vs. actual model stay distinct: the gateway was asked for the bare alias, but
        // both turns' captured usage reports the pinned snapshot Anthropic actually served —
        // exactly the field realMultiTurnLocatorScenarios.spec.ts's lastReportedActualModel()
        // reads to populate MultiTurnLiveRecord.actualModel.
        expect(gateway.model).toBe('claude-haiku-4-5');
        expect(captured.every(c => c.actualModel === 'claude-haiku-4-5-20251001')).toBe(true);
        expect(captured[0].actualModel).not.toBe(gateway.model);
    });

    it('a genuine dispatch failure through the real Anthropic mapping still fails the strict check — never forced to success', async () => {
        const http = new ScriptedHttpRequest([
            {
                json: {
                    content: [
                        {
                            type: 'tool_use',
                            id: 'toolu_1',
                            name: 'move_node',
                            input: { nodeId: 'login-button', by: { dx: 100, dy: 0 } },
                        },
                    ],
                    stop_reason: 'tool_use',
                    usage: { input_tokens: 150, output_tokens: 15 },
                },
            },
        ]);
        const gateway = createAnthropicToolLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: 'test-anthropic-key',
            model: 'claude-haiku-4-5',
        });

        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('failure');
        expect(result.completionMode).toBe('none');
        expect(result.error).toContain('no node with id "login-button" exists');
    });
});

// =================================================================================================
// runMultiTurnLocatorScenario wired to a REAL createGeminiToolLlmGateway, over a scripted (no
// network) HTTP layer — the Gemini sibling of the Anthropic section above, and specifically the
// offline regression net for the `thoughtSignature` round trip: Gemini's "thinking" model family
// (3.x) rejects a turn-2 request with a 400 ("Function call is missing a thought_signature in
// functionCall parts.") unless the exact opaque signature it issued with turn 1's functionCall is
// replayed on that same functionCall part. This is exactly the live failure the multi-turn matrix
// exposed on 2026-08-07 — the runner used to rebuild the assistant tool-call message without the
// captured signature (verifyLocatorScenarios.ts's transcript push), which no gateway-level unit
// test could catch.
// =================================================================================================

describe('runMultiTurnLocatorScenario + a real Gemini gateway (offline, scripted HTTP — zero network): thoughtSignature round trip', () => {
    /** A canned Gemini functionCall reply; `thoughtSignature` rides on the functionCall PART (never
     * a separate part), exactly where Gemini's wire format puts it. */
    const geminiFunctionCallReply = (name: string, args: unknown, thoughtSignature?: string) => ({
        candidates: [
            {
                content: {
                    parts: [
                        {
                            functionCall: { name, args },
                            ...(thoughtSignature !== undefined ? { thoughtSignature } : {}),
                        },
                    ],
                },
            },
        ],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 },
    });

    const createGeminiGateway = (http: ScriptedHttpRequest) =>
        createGeminiToolLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: 'test-gemini-key',
        });

    interface GeminiWireContent {
        role: string;
        parts: Array<Record<string, unknown>>;
    }

    it("replays turn 1's exact thoughtSignature on the matching turn-2 functionCall part, functionResponse following it", async () => {
        const http = new ScriptedHttpRequest([
            { json: geminiFunctionCallReply('list_nodes', {}, 'opaque-sig-turn1') },
            {
                json: geminiFunctionCallReply(
                    'move_node',
                    { nodeId: 'node-a17', by: { dx: 100, dy: 0 } },
                    'opaque-sig-turn2'
                ),
            },
        ]);

        const result = await runMultiTurnLocatorScenario(createGeminiGateway(http), 'move-named-node-without-id');

        // The lookup-required scenario genuinely completes — these four are exactly what the live
        // runner persists as MultiTurnLiveRecord.outcome / strategy / requestedToolSequence /
        // finalStateCorrect (the last being `taskOutcome === 'success'`, i.e. the strict final
        // canvas check passed; see realMultiTurnLocatorScenarios.spec.ts's record construction).
        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.completionMode).toBe('tool-action');
        expect(result.turnCount).toBe(2);
        expect(result.toolSequence).toEqual(['list_nodes', 'move_node']);
        // Strict final canvas state: the named node moved exactly +100x, distractors untouched.
        expect(result.positionsBefore['node-a17']).toEqual({ x: 200, y: 300 });
        expect(result.positionsAfter['node-a17']).toEqual({ x: 300, y: 300 });
        expect(result.positionsAfter['node-b42']).toEqual(result.positionsBefore['node-b42']);
        expect(result.positionsAfter['node-c88']).toEqual(result.positionsBefore['node-c88']);

        expect(http.requests).toHaveLength(2);

        // Turn-1 request carries no signature anywhere — a signature only ever originates FROM a
        // provider response; it is never fabricated locally.
        const firstBodySerialized = JSON.stringify(http.requests[0].body);
        expect(firstBodySerialized).not.toContain('thoughtSignature');
        expect(firstBodySerialized).not.toContain('opaque-sig');

        // Turn-2 request: user prompt, then the model-role functionCall part replaying the EXACT
        // turn-1 signature, then the functionResponse user turn immediately following it.
        const secondBody = http.requests[1].body as { contents: GeminiWireContent[] };
        expect(secondBody.contents).toHaveLength(3);
        expect(secondBody.contents[1]).toEqual({
            role: 'model',
            parts: [{ functionCall: { name: 'list_nodes', args: {} }, thoughtSignature: 'opaque-sig-turn1' }],
        });
        const followUp = secondBody.contents[2];
        expect(followUp.role).toBe('user');
        expect(followUp.parts).toHaveLength(1);
        const responsePart = followUp.parts[0] as { functionResponse?: { name: string; response: unknown } };
        expect(responsePart.functionResponse?.name).toBe('list_nodes');
        // The real list_nodes dispatch data (containing the discovered node) rode along.
        expect(JSON.stringify(responsePart)).toContain('node-a17');

        // The signature never leaks onto unrelated parts: the replayed functionCall part is the
        // ONLY place in the whole turn-2 request a thoughtSignature key appears, and the only
        // signature VALUE present is the one the provider issued on turn 1.
        const secondBodySerialized = JSON.stringify(secondBody);
        expect(secondBodySerialized.split('"thoughtSignature"').length - 1).toBe(1);
        expect(secondBodySerialized).toContain('opaque-sig-turn1');
        expect(secondBodySerialized).not.toContain('opaque-sig-turn2');

        // Never exposed in the human-facing result (which is what every report/CSV/JSONL/dashboard
        // serializes from): no signature key or value anywhere in the scenario result.
        const resultSerialized = JSON.stringify(result);
        expect(resultSerialized).not.toContain('thoughtSignature');
        expect(resultSerialized).not.toContain('opaque-sig');
    });

    it('omits thoughtSignature end-to-end when the provider never issued one (non-thinking Gemini models stay unchanged)', async () => {
        const http = new ScriptedHttpRequest([
            { json: geminiFunctionCallReply('list_nodes', {}) },
            { json: geminiFunctionCallReply('move_node', { nodeId: 'node-a17', by: { dx: 100, dy: 0 } }) },
        ]);

        const result = await runMultiTurnLocatorScenario(createGeminiGateway(http), 'move-named-node-without-id');

        expect(result.taskOutcome).toBe('success');
        expect(result.strategy).toBe('lookup-first');
        expect(result.toolSequence).toEqual(['list_nodes', 'move_node']);
        // Nothing fabricated: the key never appears in either request.
        expect(JSON.stringify(http.requests[0].body)).not.toContain('thoughtSignature');
        expect(JSON.stringify(http.requests[1].body)).not.toContain('thoughtSignature');
        const secondBody = http.requests[1].body as { contents: GeminiWireContent[] };
        expect(secondBody.contents[1]).toEqual({
            role: 'model',
            parts: [{ functionCall: { name: 'list_nodes', args: {} } }],
        });
    });
});
