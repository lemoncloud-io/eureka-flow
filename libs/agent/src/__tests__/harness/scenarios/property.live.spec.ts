/**
 * Property agent-level LIVE eval (real Gemini): hands the property agent a real function-calling gateway and
 * checks the graph oracle when the MODEL chooses the tool calls. Deterministic counterpart: property.spec.ts;
 * the orchestrator-level live eval is integration.live.spec.ts.
 *
 * OPT-IN: hits the real Gemini API, so it runs ONLY when RUN_LIVE is set — a key in .env.local is not
 * enough. `nx test` and CI leave RUN_LIVE unset, so the suite stays offline.
 *
 * Each case builds the MINIMAL graph it needs — the node list is seeded into the prompt every turn, so a
 * small graph keeps the live token cost down. Cases are independent; run one:
 *   RUN_LIVE=1 npx vitest run libs/agent/src/__tests__/harness/scenarios/property.live.spec.ts -t merge
 * Key: put GEMINI_API_KEY (and optional GEMINI_MODEL) in the repo-root .env.local — loaded on import.
 */
import '../../loadEnvLocal'; // FIRST: load repo-root .env.local so GEMINI_API_KEY is set before the gate below

import { describe, expect, it } from 'vitest';

import { createPropertyAgent } from '../../../agents/propertyAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createVirtualAgentEnvironment } from '../../../environment/createVirtualAgentEnvironment';
import { createFetchHttpRequest } from '../../../http/FetchHttpRequest';
import { createGeminiLlmGateway } from '../../../llm/GeminiLlmGateway';
import { createInMemorySessionStore } from '../../../session/session';
import { createFixtureCatalog, nodeById } from '../fixtures';

import type { Graph } from '../../../canvas/canvasBinding';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
// Opt-in gate: live specs hit the real API, so they run only when RUN_LIVE is set — a key in .env.local
// is not enough (else `nx test` would run them). Run live with `RUN_LIVE=1 npx vitest run <file>`.
const SKIP_LIVE = !apiKey || !process.env.RUN_LIVE;
const TIMEOUT_MS = 120_000;

const gateway = apiKey
    ? createGeminiLlmGateway({
          environment: createVirtualAgentEnvironment(),
          http: createFetchHttpRequest(),
          apiKey,
          model,
          generation: { temperature: 0, thinkingBudget: 1024, maxOutputTokens: 8192 },
      })
    : undefined;

// Minimal single-node graphs: the generator (pre-configured, so "merge keeps temperature" is testable) and
// the preview (for rename). The fixture catalog supplies their schemas — it is NOT seeded into the prompt,
// so its size costs no tokens; only the node list (kept to one node here) is.
const generator = (): NodeData => ({
    id: 'gen',
    type: 'single-output-generator',
    position: { x: 100, y: 100 },
    config: { model: 'gemini-2.5-flash', temperature: '0.7' },
});
const preview = (): NodeData => ({ id: 'prev', type: 'output-preview', position: { x: 100, y: 100 } });
const graphOf = (...nodes: NodeData[]): Graph => ({ nodes, edges: [] });

/** Run the property agent DIRECTLY (no orchestrator) with a concrete task over a minimal graph; return the post-turn graph. */
const runProperty = async (task: string, graph: Graph): Promise<Graph> => {
    const binding = createInMemoryCanvasBinding(structuredClone(graph));
    const agent = createPropertyAgent({
        gateway: gateway!,
        binding,
        catalog: createFixtureCatalog(),
        storage: createInMemorySessionStore(),
        flowId: 'property-live',
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    });
    await agent.send(task);
    return binding.readGraph();
};

describe.skipIf(SKIP_LIVE)('Property — LIVE against a real Gemini key', () => {
    it(
        'merge: sets the model and KEEPS the existing temperature',
        async () => {
            const after = await runProperty("Set the generator's model to gemini-2.5-pro.", graphOf(generator()));
            expect(nodeById(after, 'gen').config).toEqual({ model: 'gemini-2.5-pro', temperature: '0.7' });
        },
        TIMEOUT_MS
    );

    it(
        'rename: sets the custom label',
        async () => {
            const after = await runProperty('Rename the preview to "Result".', graphOf(preview()));
            expect(nodeById(after, 'prev').customLabel).toBe('Result');
        },
        TIMEOUT_MS
    );

    it(
        'reject invalid value: does not substitute, leaves the model unchanged',
        async () => {
            const after = await runProperty("Set the generator's model to gpt-4o.", graphOf(generator()));
            expect(nodeById(after, 'gen').config?.model).toBe('gemini-2.5-flash'); // gpt-4o not in enum → nothing applied
        },
        TIMEOUT_MS
    );
});
