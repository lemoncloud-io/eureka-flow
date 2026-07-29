import { createCatalogLookup } from '../../catalog';

import type { Graph } from '../../canvas/canvasBinding';
import type { CatalogLookup } from '../../catalog';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** Stable node ids used across the scenario scripts + oracles. */
export const IDS = {
    txt: 'n_txt', // input-text
    buf: 'n_buf', // buffer
    gen: 'n_gen', // single-output-generator
    prev: 'n_prev', // output-preview
} as const;

const node = (id: string, type: string, x: number, y: number, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type,
    position: { x, y },
    ...extra,
});

/**
 * The scenario graph: a text input → buffer → generator → preview chain, at distinct positions
 * (so "keep y" is a meaningful oracle) with the generator pre-configured (so A2's "temperature kept"
 * merge is testable).
 */
export const makeInitialGraph = (): Graph => ({
    nodes: [
        node(IDS.txt, 'input-text', 100, 100, { config: { text: 'hello' } }),
        node(IDS.buf, 'buffer', 300, 200, { config: { delayMs: '500' } }),
        node(IDS.gen, 'single-output-generator', 500, 300, {
            config: { model: 'gemini-2.5-flash', temperature: '0.7' },
        }),
        node(IDS.prev, 'output-preview', 700, 400),
    ],
    edges: [
        { id: 'e_txt_buf', sourceNodeId: IDS.txt, sourcePortId: 'out', targetNodeId: IDS.buf, targetPortId: 'in' },
        { id: 'e_buf_gen', sourceNodeId: IDS.buf, sourcePortId: 'out', targetNodeId: IDS.gen, targetPortId: 'in' },
        { id: 'e_gen_prev', sourceNodeId: IDS.gen, sourcePortId: 'out', targetNodeId: IDS.prev, targetPortId: 'in' },
    ],
});

/** Find a node in a graph by id (throws if absent — a test-only convenience). */
export const nodeById = (graph: Graph, id: string): NodeData => {
    const found = graph.nodes.find(n => n.id === id);
    if (!found) {
        throw new Error(`test fixture: no node "${id}"`);
    }
    return found;
};

/** The model options the fixture generator block accepts (a select field). */
export const GENERATOR_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
] as const;

/**
 * The four catalog types the scenarios exercise (harness-scenarios.md "Blocks used"): `input-text`,
 * `buffer`, `single-output-generator`, `output-preview`. Test fixture only — the app builds its
 * catalog from the real `blockRegistry` (see `createBlockCatalogLookup`).
 */
export const createFixtureCatalog = (): CatalogLookup =>
    createCatalogLookup([
        {
            type: 'input-text',
            label: 'Text Input',
            stereo: 'input',
            summary: 'Emits a fixed text string as its output.',
            config: { type: 'object', properties: { text: { type: 'string' } } },
            inputs: [],
            outputs: [{ portId: 'out', type: 'text' }],
        },
        {
            type: 'buffer',
            label: 'Buffer',
            stereo: 'process',
            summary: 'Delays its input by a number of milliseconds, then passes it through.',
            config: { type: 'object', properties: { delayMs: { type: 'number' } } },
            inputs: [{ portId: 'in' }],
            outputs: [{ portId: 'out' }],
        },
        {
            type: 'single-output-generator',
            label: 'Generator',
            stereo: 'process',
            summary: 'Runs a language model over its input and emits generated text.',
            config: {
                type: 'object',
                properties: {
                    model: { type: 'string', enum: [...GENERATOR_MODELS] },
                    temperature: { type: 'number' },
                    topK: { type: 'number' },
                },
            },
            inputs: [{ portId: 'in' }],
            outputs: [
                { portId: 'out', type: 'text' },
                { portId: 'err', type: 'text' },
            ],
        },
        {
            type: 'output-preview',
            label: 'Preview',
            stereo: 'output',
            summary: 'Displays whatever reaches its input; no output.',
            config: { type: 'object', properties: {} },
            inputs: [{ portId: 'in' }],
            outputs: [],
        },
    ]);
