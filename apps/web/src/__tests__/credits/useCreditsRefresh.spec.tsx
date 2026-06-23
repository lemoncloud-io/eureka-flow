import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCreditsRefresh } from '@flows/shared';

import type { ReactNode } from 'react';

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('useCreditsRefresh', () => {
    it('debounces a burst of run-event calls into a single credit invalidation', async () => {
        vi.useFakeTimers();
        const client = new QueryClient();
        const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );

        const { result } = renderHook(() => useCreditsRefresh(1000), { wrapper });

        // simulate a streamed run (many trace/message events)
        act(() => {
            result.current();
            result.current();
            result.current();
        });

        expect(spy).not.toHaveBeenCalled(); // nothing yet — still debouncing

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith({ queryKey: ['credits'] });
    });
});
