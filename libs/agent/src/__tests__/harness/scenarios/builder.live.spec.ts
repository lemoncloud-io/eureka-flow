/**
 * Builder agent-level LIVE eval (real Gemini): hands the composition `builder` a real function-calling gateway
 * and checks the graph-shape oracle when the MODEL chooses the tool calls — the build-a-flow contract end to
 * end. Deterministic counterpart: builder.spec.ts; the orchestrator-level live eval is integration.live.spec.ts.
 *
 * OPT-IN: hits the real Gemini API, so it runs ONLY when RUN_LIVE is set — a key in .env.local is not enough.
 * `nx test` and CI leave RUN_LIVE unset, so the suite stays offline. Run one case:
 *   RUN_LIVE=1 npx vitest run libs/agent/src/__tests__/harness/scenarios/builder.live.spec.ts -t pipeline
 * Skill SELECTION (did it use_skill?) is a model judgement — observe it with LIVE_VERBOSE; the graph shape is
 * the hard oracle here, so a build that skips the playbook but still produces the right graph passes.
 */
import '../../loadEnvLocal'; // FIRST: load repo-root .env.local so GEMINI_API_KEY is set before the gate below

import { describe, expect, it } from 'vitest';

import { createBuilderAgent } from '../../../agents/builderAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createInMemorySessionStore } from '../../../session/session';
import { createFixtureCatalog } from '../fixtures';
import { resolveLiveGateway } from '../liveGateway';

import type { Graph } from '../../../canvas/canvasBinding';

const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
// One seam resolves the gateway: the Gemini Developer API when GEMINI_API_KEY is set, else undefined (skip).
const gateway = resolveLiveGateway({
    model,
    generation: { temperature: 0, thinkingBudget: 2048, maxOutputTokens: 8192 },
});
// Opt-in gate: live specs hit the real API, so they run only when RUN_LIVE is set (else `nx test` would run them).
const SKIP_LIVE = !gateway || !process.env.RUN_LIVE;
const TIMEOUT_MS = 180_000;

/** Run the builder DIRECTLY (no orchestrator) with a concrete plan over a starting graph; return the post-turn graph. */
const runBuilder = async (plan: string, initial: Graph): Promise<Graph> => {
    const binding = createInMemoryCanvasBinding(structuredClone(initial));
    const agent = createBuilderAgent({
        gateway: gateway!,
        binding,
        catalog: createFixtureCatalog(),
        storage: createInMemorySessionStore(),
        flowId: 'builder-live',
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    });
    await agent.send(plan);
    return binding.readGraph();
};

const EMPTY: Graph = { nodes: [], edges: [] };

describe.skipIf(SKIP_LIVE)('Builder — LIVE against a real Gemini key', () => {
    it(
        'pipeline: builds text-input → generator → preview, wired in order',
        async () => {
            const after = await runBuilder(
                'Build a flow from scratch: a Text Input (block type input-text), an AI Generator (block type ' +
                    'single-output-generator) configured with model gemini-2.5-pro, and a Preview (block type ' +
                    'output-preview). Create all three and wire them in order so the text input feeds the generator ' +
                    'and the generator feeds the preview.',
                EMPTY
            );
            const typeOf = (t: string) => after.nodes.find(n => n.type === t);
            const txt = typeOf('input-text');
            const gen = typeOf('single-output-generator');
            const prev = typeOf('output-preview');
            expect(txt).toBeDefined();
            expect(gen).toBeDefined();
            expect(prev).toBeDefined();
            // wired in dependency order (relational shape — never assert minted ids or exact positions)
            expect(after.edges.some(e => e.sourceNodeId === txt!.id && e.targetNodeId === gen!.id)).toBe(true);
            expect(after.edges.some(e => e.sourceNodeId === gen!.id && e.targetNodeId === prev!.id)).toBe(true);
        },
        TIMEOUT_MS
    );

    it(
        'repair: wires a dangling generator input',
        async () => {
            const initial: Graph = {
                nodes: [
                    { id: 'n_txt', type: 'input-text', position: { x: 100, y: 100 }, config: { text: 'hi' } },
                    {
                        id: 'n_gen',
                        type: 'single-output-generator',
                        position: { x: 340, y: 100 },
                        config: { model: 'gemini-2.5-flash' },
                    },
                ],
                edges: [],
            };
            const after = await runBuilder(
                'The generator’s input is not connected. Wire the text input’s output into the generator’s input.',
                initial
            );
            expect(after.edges.some(e => e.sourceNodeId === 'n_txt' && e.targetNodeId === 'n_gen')).toBe(true);
        },
        TIMEOUT_MS
    );
});
