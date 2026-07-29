import { describe, expect, it } from 'vitest';

import { validateArgs } from '../../tools/validateArgs';

import type { JsonSchema } from '../../llm/llmGateway';

const MOVE_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {
        nodeId: { type: 'string' },
        by: { type: 'object', properties: { dx: { type: 'number' }, dy: { type: 'number' } }, required: ['dx', 'dy'] },
        to: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
    },
    required: ['nodeId'],
};

describe('validateArgs', () => {
    it('accepts a valid object', () => {
        expect(validateArgs(MOVE_SCHEMA, { nodeId: 'a', by: { dx: 1, dy: 2 } })).toEqual([]);
    });

    it('rejects a non-object', () => {
        expect(validateArgs(MOVE_SCHEMA, 'nope')).toContain('value must be an object');
        expect(validateArgs(MOVE_SCHEMA, null)).toContain('value must be an object');
        expect(validateArgs(MOVE_SCHEMA, [])).toContain('value must be an object');
    });

    it('flags a missing required property', () => {
        expect(validateArgs(MOVE_SCHEMA, { by: { dx: 1, dy: 2 } })).toContain('nodeId is required');
    });

    it('flags a wrong primitive type', () => {
        expect(validateArgs(MOVE_SCHEMA, { nodeId: 42 })).toContain('nodeId must be a string');
    });

    it('recurses into nested objects and reports the path', () => {
        const errors = validateArgs(MOVE_SCHEMA, { nodeId: 'a', by: { dx: 'x' } });
        expect(errors).toContain('by.dx must be a finite number');
        expect(errors).toContain('by.dy is required');
    });

    it('validates array items', () => {
        const schema: JsonSchema = { type: 'array', items: { type: 'number' } };
        expect(validateArgs(schema, [1, 2, 3])).toEqual([]);
        expect(validateArgs(schema, [1, 'two'])).toContain('value[1] must be a finite number');
        expect(validateArgs(schema, 'nope')).toContain('value must be an array');
    });

    it('rejects NaN and Infinity for numbers', () => {
        expect(validateArgs({ type: 'number' }, Infinity)).toContain('value must be a finite number');
        expect(validateArgs({ type: 'number' }, -Infinity)).toContain('value must be a finite number');
        expect(validateArgs({ type: 'number' }, NaN)).toContain('value must be a finite number');
        expect(validateArgs(MOVE_SCHEMA, { nodeId: 'a', by: { dx: Infinity, dy: 0 } })).toContain(
            'by.dx must be a finite number'
        );
    });

    it('validates the null type', () => {
        expect(validateArgs({ type: 'null' }, null)).toEqual([]);
        expect(validateArgs({ type: 'null' }, 'x')).toContain('value must be null');
    });

    it('enforces integer and enum', () => {
        expect(validateArgs({ type: 'integer' }, 1.5)).toContain('value must be an integer');
        expect(validateArgs({ type: 'string', enum: ['a', 'b'] }, 'c')).toHaveLength(1);
        expect(validateArgs({ type: 'string', enum: ['a', 'b'] }, 'a')).toEqual([]);
    });
});
