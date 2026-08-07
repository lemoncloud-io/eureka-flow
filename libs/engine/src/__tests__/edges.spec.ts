import { describe, expect, it } from 'vitest';

import { arePortTypesCompatible } from '../core/edges';

/**
 * Port-type compatibility is the shared rule behind every connection check — the interactive canvas
 * (apps/web), the engine's own `connect` op, and the agent's `connect_nodes` tool all call this one
 * function. The wildcard cases below are the contract those callers rely on; the `undefined` source
 * cases in particular exist because a block schema declares `type?`, so a catalog-driven caller can
 * hold an absent type on either side.
 */
describe('arePortTypesCompatible', () => {
    it('matches equal types (case-insensitive)', () => {
        expect(arePortTypesCompatible('text', 'text')).toBe(true);
        expect(arePortTypesCompatible('Text', 'tEXt')).toBe(true);
    });

    it('rejects differing concrete types', () => {
        expect(arePortTypesCompatible('text', 'number')).toBe(false);
    });

    it("treats 'any' as a wildcard on either side", () => {
        expect(arePortTypesCompatible('any', 'number')).toBe(true);
        expect(arePortTypesCompatible('text', 'any')).toBe(true);
    });

    it('treats an absent type as a wildcard on either side', () => {
        expect(arePortTypesCompatible(undefined, 'number')).toBe(true);
        expect(arePortTypesCompatible('text', undefined)).toBe(true);
        expect(arePortTypesCompatible(undefined, undefined)).toBe(true);
    });
});
