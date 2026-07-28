import { describe, expect, it } from 'vitest';

import { applyMove, hasExactlyOneTarget } from '../../canvas/moveSemantics';

describe('hasExactlyOneTarget', () => {
    it('is true for exactly one of by / to', () => {
        expect(hasExactlyOneTarget({ by: { dx: 1, dy: 2 } })).toBe(true);
        expect(hasExactlyOneTarget({ to: { x: 1, y: 2 } })).toBe(true);
    });

    it('is false for neither or both', () => {
        expect(hasExactlyOneTarget({})).toBe(false);
        expect(hasExactlyOneTarget({ by: { dx: 1, dy: 2 }, to: { x: 1, y: 2 } })).toBe(false);
    });
});

describe('applyMove', () => {
    it('adds a relative delta to the current position', () => {
        expect(applyMove({ x: 200, y: 80 }, { by: { dx: 10, dy: 0 } })).toEqual({ x: 210, y: 80 });
        expect(applyMove({ x: 200, y: 80 }, { by: { dx: -5, dy: 15 } })).toEqual({ x: 195, y: 95 });
    });

    it('uses an absolute point verbatim', () => {
        expect(applyMove({ x: 200, y: 80 }, { to: { x: 100, y: 120 } })).toEqual({ x: 100, y: 120 });
    });

    it('allows negative coordinates (no clamping)', () => {
        expect(applyMove({ x: 5, y: 5 }, { by: { dx: -20, dy: -20 } })).toEqual({ x: -15, y: -15 });
        expect(applyMove({ x: 0, y: 0 }, { to: { x: -50, y: -50 } })).toEqual({ x: -50, y: -50 });
    });

    it('throws when neither or both targets are given', () => {
        expect(() => applyMove({ x: 0, y: 0 }, {})).toThrow(/exactly one/);
        expect(() => applyMove({ x: 0, y: 0 }, { by: { dx: 1, dy: 1 }, to: { x: 1, y: 1 } })).toThrow(/exactly one/);
    });
});
