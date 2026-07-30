import { describe, expect, it } from 'vitest';

import { transformNodeForSave, transformNodesForSave } from '@flows/flows';

import type { BlockDefinitionWithFrontend, GraphNode } from '@flows/flows';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (overrides: Partial<NodeData> = {}): GraphNode =>
    ({
        id: 'node-1',
        type: 'input-text',
        position: { x: 100, y: 200 },
        ...overrides,
    }) as GraphNode;

const makeRegistry = (
    entries: Record<string, Partial<BlockDefinitionWithFrontend>> = {}
): Record<string, BlockDefinitionWithFrontend> => {
    const base: Record<string, BlockDefinitionWithFrontend> = {
        'input-text': { type: 'input-text', id: '0008' } as BlockDefinitionWithFrontend,
        'llm-chat': { type: 'llm-chat', id: '0010' } as BlockDefinitionWithFrontend,
    };
    return { ...base, ...entries } as Record<string, BlockDefinitionWithFrontend>;
};

describe('transformNodeForSave', () => {
    it('should keep only essential fields', () => {
        const node = makeNode({
            status: 'COMPLETED' as GraphNode['status'],
            inputData: { in: { value: 'hello' } },
            outputData: { out: { value: 'world' } },
        });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result).toEqual({
            id: 'node-1',
            type: 'input-text',
            blockId: 'input-text',
            position: { x: 100, y: 200 },
        });
        expect(result).not.toHaveProperty('status');
        expect(result).not.toHaveProperty('inputData');
        expect(result).not.toHaveProperty('outputData');
    });

    it('should use blockDef.type when available', () => {
        const registry = makeRegistry({
            'custom-block': { type: 'process-custom', id: '9999' } as BlockDefinitionWithFrontend,
        });
        const node = makeNode({ type: 'custom-block' });

        const result = transformNodeForSave(node, registry);

        expect(result.type).toBe('process-custom');
    });

    it('should fallback to node.type when block not in registry', () => {
        const node = makeNode({ type: 'unknown-block' });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.type).toBe('unknown-block');
    });

    it('should include width when present', () => {
        const node = makeNode({ width: 300 });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.width).toBe(300);
    });

    it('should exclude width when falsy', () => {
        const node = makeNode({ width: 0 });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result).not.toHaveProperty('width');
    });

    it('should include height from node.height', () => {
        const node = makeNode({ height: 150 });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.height).toBe(150);
    });

    it('should extract height from legacy config.textareaHeight', () => {
        const node = makeNode({
            config: { textareaHeight: '120' } as Record<string, string>,
        });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.height).toBe(120);
    });

    it('should include customLabel when non-empty', () => {
        const node = makeNode({ customLabel: 'My Label' });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.customLabel).toBe('My Label');
    });

    it('should exclude customLabel when empty', () => {
        const node = makeNode({ customLabel: '' });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result).not.toHaveProperty('customLabel');
    });

    it('should include description when non-empty', () => {
        const node = makeNode({ description: 'Does stuff' });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.description).toBe('Does stuff');
    });

    it('should include config when non-empty', () => {
        const node = makeNode({ config: { text: 'hello' } as Record<string, string> });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.config).toEqual({ text: 'hello' });
    });

    it('should exclude config when empty', () => {
        const node = makeNode({ config: {} as Record<string, string> });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result).not.toHaveProperty('config');
    });

    it('should use node.blockId when available', () => {
        const node = makeNode({ blockId: '0008' });

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.blockId).toBe('0008');
    });

    it('should fallback blockId to node.type', () => {
        const node = makeNode();
        // Remove blockId if makeNode sets it
        delete (node as Partial<NodeData>).blockId;

        const result = transformNodeForSave(node, makeRegistry());

        expect(result.blockId).toBe('input-text');
    });
});

describe('transformNodesForSave', () => {
    it('should transform all nodes in array', () => {
        const nodes = [makeNode({ id: 'a', type: 'input-text' }), makeNode({ id: 'b', type: 'llm-chat' })];

        const results = transformNodesForSave(nodes, makeRegistry());

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('a');
        expect(results[1].id).toBe('b');
        expect(results[1].type).toBe('llm-chat');
    });

    it('should return empty array for empty input', () => {
        const results = transformNodesForSave([], makeRegistry());

        expect(results).toEqual([]);
    });
});
