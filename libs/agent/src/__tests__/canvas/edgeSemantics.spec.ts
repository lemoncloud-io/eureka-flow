import { describe, expect, it } from 'vitest';

import { arePortTypesCompatible, wouldCreateCycle } from '../../canvas/edgeSemantics';

import type { EdgeData } from '@lemoncloud/eureka-flows-api';

const edge = (sourceNodeId: string, targetNodeId: string): EdgeData => ({
    sourceNodeId,
    sourcePortId: 'out',
    targetNodeId,
    targetPortId: 'in',
});

describe('arePortTypesCompatible', () => {
    it('matches equal types (case-insensitive)', () => {
        expect(arePortTypesCompatible('text', 'text')).toBe(true);
        expect(arePortTypesCompatible('Text', 'tEXt')).toBe(true);
    });

    it('rejects differing concrete types', () => {
        expect(arePortTypesCompatible('text', 'number')).toBe(false);
    });

    it("treats 'any' or an absent type as a wildcard on either side", () => {
        expect(arePortTypesCompatible('any', 'number')).toBe(true);
        expect(arePortTypesCompatible('text', 'any')).toBe(true);
        expect(arePortTypesCompatible(undefined, 'number')).toBe(true);
        expect(arePortTypesCompatible('text', undefined)).toBe(true);
        expect(arePortTypesCompatible(undefined, undefined)).toBe(true);
    });
});

describe('wouldCreateCycle', () => {
    it('is always true for a self-loop', () => {
        expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
    });

    it('is false when there is no path back from target to source', () => {
        // a → b exists; adding a → c does not cycle.
        expect(wouldCreateCycle([edge('a', 'b')], 'a', 'c')).toBe(false);
    });

    it('detects a direct back-edge (b → a when a → b exists)', () => {
        expect(wouldCreateCycle([edge('a', 'b')], 'b', 'a')).toBe(true);
    });

    it('detects a cycle across a longer chain (a→b→c, adding c→a)', () => {
        expect(wouldCreateCycle([edge('a', 'b'), edge('b', 'c')], 'c', 'a')).toBe(true);
    });

    it('does not cycle when adding a forward edge to a DAG', () => {
        expect(wouldCreateCycle([edge('a', 'b'), edge('b', 'c')], 'a', 'c')).toBe(false);
    });
});
