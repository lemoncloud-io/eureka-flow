import { describe, expect, it } from 'vitest';

import { formatCredits } from '@flows/shared';

describe('formatCredits', () => {
    it('should add thousands separators', () => {
        expect(formatCredits(1234567)).toBe((1234567).toLocaleString());
    });

    it('should format zero', () => {
        expect(formatCredits(0)).toBe('0');
    });

    it('should format negative values', () => {
        expect(formatCredits(-1500)).toBe((-1500).toLocaleString());
    });

    it('should fall back to "0" for non-finite values', () => {
        expect(formatCredits(NaN)).toBe('0');
        expect(formatCredits(Infinity)).toBe('0');
        expect(formatCredits(-Infinity)).toBe('0');
    });
});
