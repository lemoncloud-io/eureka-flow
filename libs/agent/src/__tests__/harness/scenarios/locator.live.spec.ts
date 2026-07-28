/**
 * Locator agent-level LIVE eval (real Gemini): hands the locator a real function-calling gateway and checks
 * the graph oracle when the MODEL chooses the tool calls. Deterministic counterpart: locator.spec.ts; the
 * orchestrator-level live eval is integration.live.spec.ts. Auto-skips without GEMINI_API_KEY.
 *
 * Each case builds the MINIMAL graph it needs — the node list is seeded into the prompt every turn, so a
 * small graph keeps the live token cost down. Cases are independent; run one:
 *   npx vitest run libs/agent/src/__tests__/harness/scenarios/locator.live.spec.ts -t ambiguous
 * Key: put GEMINI_API_KEY (and optional GEMINI_MODEL) in the repo-root .env.local — loaded on import.
 */
import '../../loadEnvLocal'; // FIRST: load repo-root .env.local so GEMINI_API_KEY is set before the gate below

import { describe, expect, it } from 'vitest';

import { createLocatorAgent } from '../../../agents/locatorAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createVirtualAgentEnvironment } from '../../../environment/createVirtualAgentEnvironment';
import { createFetchHttpRequest } from '../../../http/FetchHttpRequest';
import { createGeminiLlmGateway } from '../../../llm/GeminiLlmGateway';
import { createInMemorySessionStore } from '../../../session/session';
import { nodeById } from '../fixtures';

import type { Graph } from '../../../canvas/canvasBinding';
import type { CatalogLookup } from '../../../catalog';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const NO_KEY = !apiKey;
const TIMEOUT_MS = 120_000;

// The locator only moves — describe_node is never exercised, so an empty catalog is enough.
const emptyCatalog: CatalogLookup = { has: () => false, schema: () => undefined, search: () => [] };

const gateway = apiKey
    ? createGeminiLlmGateway({
          environment: createVirtualAgentEnvironment(),
          http: createFetchHttpRequest(),
          apiKey,
          model,
          generation: { temperature: 0, thinkingBudget: 1024, maxOutputTokens: 8192 },
      })
    : undefined;

const node = (id: string, x: number, y: number, label: string): NodeData => ({
    id,
    type: 'http',
    position: { x, y },
    customLabel: label,
});
const graphOf = (...nodes: NodeData[]): Graph => ({ nodes, edges: [] });

/** Run the locator DIRECTLY (no orchestrator) with a concrete task over a minimal graph; return the post-turn graph. */
const runLocator = async (task: string, graph: Graph): Promise<Graph> => {
    const binding = createInMemoryCanvasBinding(structuredClone(graph));
    const agent = createLocatorAgent({
        gateway: gateway!,
        binding,
        catalog: emptyCatalog,
        storage: createInMemorySessionStore(),
        flowId: 'locator-live',
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    });
    await agent.send(task);
    return binding.readGraph();
};

describe.skipIf(NO_KEY)('Locator — LIVE against a real Gemini key', () => {
    it(
        'relative: nudges the one node right (x↑, y=)',
        async () => {
            const after = await runLocator('Move the Fetch node right by 30px.', graphOf(node('n1', 200, 80, 'Fetch')));
            const pos = nodeById(after, 'n1').position;
            expect(pos.x).toBeGreaterThan(200); // relational — never assert an exact magnitude
            expect(pos.y).toBe(80);
        },
        TIMEOUT_MS
    );

    it(
        'absolute: moves the node to a pinned point',
        async () => {
            const after = await runLocator(
                'Move the Fetch node to the exact position x=400, y=250.',
                graphOf(node('n1', 200, 80, 'Fetch'))
            );
            expect(nodeById(after, 'n1').position).toEqual({ x: 400, y: 250 });
        },
        TIMEOUT_MS
    );

    it(
        'ambiguous: two nodes match → asks which, moves nothing',
        async () => {
            const initial = graphOf(node('n1', 0, 0, 'Fetch'), node('n2', 300, 300, 'Fetch'));
            const after = await runLocator('Move the Fetch node right by 20px.', initial);
            // both are labelled "Fetch" — the locator must not guess; nothing lands
            expect(after).toEqual(initial);
        },
        TIMEOUT_MS
    );

    it(
        'no such node: moves nothing',
        async () => {
            const initial = graphOf(node('n1', 200, 80, 'Fetch'));
            const after = await runLocator('Move the Translate node up by 20px.', initial);
            expect(after).toEqual(initial); // there is no "Translate" node
        },
        TIMEOUT_MS
    );
});
