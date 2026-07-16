import { describe, expect, it } from 'vitest';

import { DEFAULT_STEP, applyMove, directionToDelta, hasExactlyOneTarget } from './moveSemantics';

describe('directionToDelta', () => {
    it('maps the four cardinal directions to canvas-coordinate signs', () => {
        expect(directionToDelta('right', 10)).toEqual({ dx: 10, dy: 0 });
        expect(directionToDelta('left', 10)).toEqual({ dx: -10, dy: 0 });
        expect(directionToDelta('up', 10)).toEqual({ dx: 0, dy: -10 });
        expect(directionToDelta('down', 10)).toEqual({ dx: 0, dy: 10 });
    });

    it('combines axes for diagonals', () => {
        expect(directionToDelta('up-right', 10)).toEqual({ dx: 10, dy: -10 });
        expect(directionToDelta('up-left', 10)).toEqual({ dx: -10, dy: -10 });
        expect(directionToDelta('down-right', 10)).toEqual({ dx: 10, dy: 10 });
        expect(directionToDelta('down-left', 10)).toEqual({ dx: -10, dy: 10 });
    });

    it('uses the default step when no amount is given', () => {
        expect(directionToDelta('right')).toEqual({ dx: DEFAULT_STEP, dy: 0 });
        expect(DEFAULT_STEP).toBe(20);
    });
});

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
