import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAgentModelCommit } from '../app/features/flows/hooks/useAgentModelCommit';

describe('useAgentModelCommit — apply on the next turn, never mid-turn', () => {
    it('commits the pick while idle', () => {
        const commit = vi.fn();
        renderHook(() => useAgentModelCommit({ selected: 'gemini-2.5-pro', running: false, commit }));
        expect(commit).toHaveBeenCalledWith('gemini-2.5-pro');
    });

    it('does not commit while a turn is running', () => {
        const commit = vi.fn();
        renderHook(() => useAgentModelCommit({ selected: 'gemini-2.5-pro', running: true, commit }));
        expect(commit).not.toHaveBeenCalled();
    });

    it('defers a mid-turn change until the turn settles, then commits the latest pick', () => {
        const commit = vi.fn();
        const { rerender } = renderHook(props => useAgentModelCommit({ ...props, commit }), {
            initialProps: { selected: 'gemini-2.5-flash' as string | undefined, running: false },
        });
        expect(commit).toHaveBeenLastCalledWith('gemini-2.5-flash'); // committed at idle
        commit.mockClear();

        // turn starts, then the user switches model mid-turn → held back
        rerender({ selected: 'gemini-2.5-flash', running: true });
        rerender({ selected: 'gemini-2.5-pro', running: true });
        expect(commit).not.toHaveBeenCalled();

        // turn settles → the new pick commits (applies to the next turn)
        rerender({ selected: 'gemini-2.5-pro', running: false });
        expect(commit).toHaveBeenCalledWith('gemini-2.5-pro');
    });

    it('never commits when no model is selected', () => {
        const commit = vi.fn();
        const { rerender } = renderHook(props => useAgentModelCommit({ ...props, commit }), {
            initialProps: { selected: undefined as string | undefined, running: false },
        });
        rerender({ selected: undefined, running: true });
        expect(commit).not.toHaveBeenCalled();
    });
});
