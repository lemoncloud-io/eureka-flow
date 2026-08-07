import { describe, expect, it } from 'vitest';

import { isNodeState } from '@flows/engine';

import { getEffectiveState } from './status';

describe('getEffectiveState', () => {
    it('prefers state and falls back to the deprecated status twin', () => {
        expect(getEffectiveState('RUNNING', 'IDLE')).toBe('RUNNING');
        expect(getEffectiveState(undefined, 'IDLE')).toBe('IDLE');
        expect(getEffectiveState()).toBeUndefined();
    });

    /**
     * This used to be a second copy of the engine's five values. Both lists said the same
     * thing, so nothing failed — until one moved, and then the load path and the socket
     * path disagreed about whether a state exists at all. The guard is the delegation, not
     * the values: whatever the engine models, this must accept.
     */
    it('accepts exactly what the engine models, with no list of its own', () => {
        const candidates = ['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR', 'SKIPPED', 'WAITING', '', 'toString'];

        candidates.forEach(value => {
            expect(getEffectiveState(value)).toBe(isNodeState(value) ? value : undefined);
        });
    });
});
