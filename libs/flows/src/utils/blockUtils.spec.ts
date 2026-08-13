import { describe, expect, it } from 'vitest';

import { blockAcceptsPortType } from './blockUtils';

import type { BlockDefinitionWithFrontend } from '../types';

const block = (inputs: { id: string; type: string }[]): BlockDefinitionWithFrontend =>
    ({ type: 'test-block', inputs, outputs: [] }) as unknown as BlockDefinitionWithFrontend;

describe('blockAcceptsPortType', () => {
    it('accepts a block whose input type matches the dragged port', () => {
        expect(blockAcceptsPortType(block([{ id: 'in', type: 'text' }]), 'text')).toBe(true);
    });

    it('rejects a block whose inputs are all a different type', () => {
        expect(blockAcceptsPortType(block([{ id: 'in', type: 'image' }]), 'text')).toBe(false);
    });

    it('accepts a block when any one of several inputs matches', () => {
        const multi = block([
            { id: 'a', type: 'image' },
            { id: 'b', type: 'text' },
        ]);
        expect(blockAcceptsPortType(multi, 'text')).toBe(true);
    });

    it('rejects a block with no inputs — nothing to connect the link to', () => {
        expect(blockAcceptsPortType(block([]), 'text')).toBe(false);
    });

    it('treats "any" on either side as compatible', () => {
        expect(blockAcceptsPortType(block([{ id: 'in', type: 'any' }]), 'text')).toBe(true);
        expect(blockAcceptsPortType(block([{ id: 'in', type: 'image' }]), 'any')).toBe(true);
    });

    it('matches regardless of case', () => {
        expect(blockAcceptsPortType(block([{ id: 'in', type: 'Text' }]), 'text')).toBe(true);
    });
});
