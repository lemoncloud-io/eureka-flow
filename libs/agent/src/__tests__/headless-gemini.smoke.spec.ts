/**
 * Headless (Node, no DOM) smoke test for the flow agent against a REAL Gemini key.
 *
 * Repo vitest env is `environment: 'node'`, so this is a
 * plain spec — no new tooling. The two REAL-KEY cases are OPT-IN: they run only when RUN_LIVE is set (a
 * key in .env.local is not enough), so `nx test` and CI skip them. The offline CONTROL (case 3) always
 * runs. Exercise the real-key path with:
 *
 *     RUN_LIVE=1 npx vitest run libs/agent/src/__tests__/headless-gemini.smoke.spec.ts
 *
 * The Gemini gateway supports FUNCTION-CALLING (`capabilities.toolCalls === true`): it maps our
 * tools to Gemini `functionDeclarations` and streams response `functionCall`s back as tool-call
 * chunks, so a real key can drive a tool-using agent end-to-end (no browser, no backend proxy).
 *
 * So this file proves three things, each labelled:
 *   1. REAL KEY  — a direct gateway.chat() reaches Gemini headlessly (plain text, no tools).
 *   2. REAL KEY  — the real Gemini gateway + builder actually moves the node (function-calling).
 *   3. CONTROL   — the same builder pipeline with the fake gateway moves the node offline.
 */
import './loadEnvLocal'; // FIRST: load repo-root .env.local so GEMINI_API_KEY is set before the gate below

import { describe, expect, it } from 'vitest';

import { createBuilderAgent } from '../agents/builderAgent';
import { createInMemoryCanvasBinding } from '../canvas/inMemoryCanvasBinding';
import { createFetchHttpClient } from '../http/FetchHttpClient';
import { createFakeGateway } from '../llm/fakeGateway';
import { createGeminiLlmGateway } from '../llm/GeminiLlmGateway';
import { createInMemorySessionStore } from '../session/session';

import type { Graph } from '../canvas/canvasBinding';
import type { CatalogLookup } from '../catalog';
import type { Chunk } from '../llm/llmGateway';
import type { SessionState } from '../session/session';

const MODEL = 'gemini-2.5-flash';
const FLOW_ID = 'flow-headless';

// Opt-in gate for the real-key cases: they hit the real API, so they run only when RUN_LIVE is set — a
// key in .env.local is not enough (else `nx test` would run them). The offline CONTROL case is unguarded.
const SKIP_LIVE = !process.env.GEMINI_API_KEY || !process.env.RUN_LIVE;

/** A no-op catalog — this spec never reaches `describe_node`, so schema lookups don't matter. */
const emptyCatalog: CatalogLookup = { has: () => false, schema: () => undefined, search: () => [] };

/** Two seeded nodes. `type` is a free-form NodeData string (this spec wires no block catalog). */
const seedGraph = (): Graph => ({
    nodes: [
        { id: 'n1', type: 'input-text', position: { x: 100, y: 200 } },
        { id: 'n2', type: 'output-preview', position: { x: 400, y: 200 } },
    ],
    edges: [],
});

const posOf = (binding: ReturnType<typeof createInMemoryCanvasBinding>, id: string) =>
    binding.readGraph().nodes.find(n => n.id === id)?.position;

/** Drain the provider-neutral chat stream into its joined text. */
const collectText = async (stream: AsyncIterable<Chunk>): Promise<string> => {
    let text = '';
    for await (const chunk of stream) {
        if (chunk.text) text += chunk.text;
    }
    return text;
};

describe('flow agent headless (Node, no DOM) with a real Gemini key', () => {
    // ── 1. REAL KEY — proves the key/model/HTTP/Node path works headlessly ────────────────
    // A plain text chat (no tools) is the simplest real-key check. Opt-in via RUN_LIVE (see SKIP_LIVE).
    it.skipIf(SKIP_LIVE)('reaches Gemini over the network (plain text chat)', async () => {
        const http = createFetchHttpClient(); // Node 18+ global fetch; no DOM
        const gateway = createGeminiLlmGateway({
            http,
            apiKey: process.env.GEMINI_API_KEY as string, // (a) key from env, sent only as x-goog-api-key
            model: MODEL,
            // DIRECT to Google — NOT a backend. Default baseUrl is generativelanguage.googleapis.com;
            // pinned here so it is unambiguous this bypasses any backend proxy (no CORS in Node).
            baseUrl: 'https://generativelanguage.googleapis.com',
        });

        expect(gateway.capabilities.toolCalls).toBe(true); // gateway supports function-calling

        const text = await collectText(
            gateway.chat({ messages: [{ role: 'user', content: 'Reply with the single word: pong' }], tools: [] })
        );

        console.log('[1] REAL Gemini text reply:', JSON.stringify(text));
        expect(text.trim().length).toBeGreaterThan(0);
    });

    // ── 2. REAL KEY — real Gemini gateway drives the builder end-to-end → node moves ──
    // A real function-calling round-trip, so this is opt-in via RUN_LIVE (see SKIP_LIVE).
    it.skipIf(SKIP_LIVE)('drives the builder with the real Gemini gateway → node moves, phase done', async () => {
        const http = createFetchHttpClient();
        const gateway = createGeminiLlmGateway({
            http,
            apiKey: process.env.GEMINI_API_KEY as string, // (a) key from env
            model: MODEL, // real model id
        });
        expect(gateway.capabilities.toolCalls).toBe(true);

        const binding = createInMemoryCanvasBinding(seedGraph()); // (c) two real nodes
        const storage = createInMemorySessionStore(); // (d) in-memory session
        const agent = createBuilderAgent({
            gateway,
            binding,
            storage,
            flowId: FLOW_ID,
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        const before = posOf(binding, 'n1');
        await agent.send('move the input-text node right by 40px'); // (e)
        const after = posOf(binding, 'n1'); // (f)

        const state = storage.load(FLOW_ID) as SessionState;
        console.log('[2] real-gateway builder: before', before, '→ after', after, '| phase', state.phase);

        // The tool-capable gateway lets the builder actually issue move_node:
        expect(state.phase).toBe('done');
        expect(after?.x ?? 0).toBeGreaterThan(before?.x ?? 0); // moved right
        expect(after?.y).toBe(before?.y); // y kept
    });

    // ── 3. CONTROL — same pipeline, fake tool-capable gateway → the node actually moves ───
    // Proves the builder → binding → executor → storage pipeline is sound headlessly; the only
    // missing piece for the real path is a gateway that can emit tool calls.
    it('moves the node headlessly via the fake (tool-capable) gateway', async () => {
        const binding = createInMemoryCanvasBinding(seedGraph());
        const storage = createInMemorySessionStore();
        const gateway = createFakeGateway([
            { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 40, dy: 0 } } }] },
            { text: 'Moved the input-text node 40px right to (140, 200).' },
        ]);
        const agent = createBuilderAgent({
            gateway,
            binding,
            storage,
            flowId: 'flow-control',
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        const before = posOf(binding, 'n1');
        await agent.send('move the input-text node right by 40px');
        const after = posOf(binding, 'n1');

        console.log('[3] fake-gateway builder: before', before, '→ after', after);
        expect(after).toEqual({ x: 140, y: 200 });
        expect((storage.load('flow-control') as SessionState).phase).toBe('done');
    });
});
