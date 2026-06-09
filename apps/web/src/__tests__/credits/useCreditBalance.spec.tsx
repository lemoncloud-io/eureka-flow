import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreditBalance } from '@flows/shared';

import type { ReactNode } from 'react';

const getMock = vi.fn();
let storeApiKey: string | null = null;

// Stub web-core so the query runs without a real HTTP client or store.
// vi.mock is hoisted above the import, so @flows/shared resolves with this stub.
vi.mock('@flows/web-core', () => ({
    api: { get: (...args: unknown[]) => getMock(...args) },
    // useWebCoreStore is called as a selector: useWebCoreStore(s => s.apiKey)
    useWebCoreStore: (selector: (state: { apiKey: string | null }) => unknown) => selector({ apiKey: storeApiKey }),
}));

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};

describe('useCreditBalance', () => {
    beforeEach(() => {
        getMock.mockReset();
        storeApiKey = null;
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('should not call the query function when apiKey is null', async () => {
        storeApiKey = null;
        const { result } = renderHook(() => useCreditBalance(), { wrapper: createWrapper() });

        // enabled:false → fetch never fires.
        await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
        expect(getMock).not.toHaveBeenCalled();
    });

    it('should call the query function and return data when apiKey is set', async () => {
        storeApiKey = 'key-123';
        getMock.mockResolvedValue({ data: { total: 4200 } });

        const { result } = renderHook(() => useCreditBalance(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(getMock).toHaveBeenCalledWith('/wallets/0/balance');
        expect(result.current.data).toEqual({ total: 4200 });
    });

    it('retries 3 times then stops on a persistent error (no request storm)', async () => {
        vi.useFakeTimers();
        storeApiKey = 'key-503';
        getMock.mockRejectedValue(new Error('503 $sess.gid is required'));

        const { result } = renderHook(() => useCreditBalance(), { wrapper: createWrapper() });

        // initial attempt + 3 backoff retries (1s + 2s + 4s) settle within 8s
        await act(async () => {
            await vi.advanceTimersByTimeAsync(8000);
        });

        expect(result.current.isError).toBe(true);
        expect(getMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries

        // and then it STOPS — no further requests as time passes
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(getMock).toHaveBeenCalledTimes(4);
    });
});
