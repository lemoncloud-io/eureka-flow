import { afterEach, describe, expect, it, vi } from 'vitest';

import { listAppsSeo } from '@flows/flows';

describe('listAppsSeo', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('hits the bare _seo_ base, unauthenticated (no /public, no /_api_, no headers)', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.test/flw-d1');
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ list: [], total: 0 }) });
        vi.stubGlobal('fetch', fetchMock);

        await listAppsSeo();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.test/flw-d1/_seo_/apps/0/list');
        expect(url).not.toContain('/public');
        expect(url).not.toContain('/_api_');
        // No second arg → no custom headers, so no x-api-key can leak onto a public call.
        expect(init).toBeUndefined();
    });

    it('returns the parsed list result verbatim', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.test/flw-d1');
        const body = { list: [{ title: 't', image: 'i', description: 'd', url: 'u' }], total: 1, page: 0 };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));

        await expect(listAppsSeo()).resolves.toEqual(body);
    });

    it('throws on a non-ok response', async () => {
        vi.stubEnv('VITE_API_URL', 'https://api.test/flw-d1');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));

        await expect(listAppsSeo()).rejects.toThrow('HTTP 503');
    });
});
