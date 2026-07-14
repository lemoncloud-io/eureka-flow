import { describe, expect, it, vi } from 'vitest';

import { createFetchHttpRequest } from '../FetchHttpRequest';
import { ScriptedHttpRequest } from '../ScriptedHttpRequest';

const createFetchResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

describe('createFetchHttpRequest', () => {
    it('encodes JSON bodies and sets the content type', async () => {
        const fetchFn = vi.fn().mockResolvedValue(createFetchResponse(200, { ok: true }));
        const http = createFetchHttpRequest({ fetchFn });

        await http.request({ method: 'POST', url: 'https://api.test/v1', body: { hello: 'world' } });

        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe('https://api.test/v1');
        expect(init.method).toBe('POST');
        expect(init.headers['content-type']).toBe('application/json');
        expect(init.body).toBe('{"hello":"world"}');
    });

    it('lets caller headers win over the default content type and skips body for GET', async () => {
        const fetchFn = vi.fn().mockResolvedValue(createFetchResponse(200, null));
        const http = createFetchHttpRequest({ fetchFn });

        await http.request({
            method: 'POST',
            url: 'https://api.test/v1',
            headers: { 'content-type': 'text/plain', 'x-goog-api-key': 'k' },
            body: 'raw',
        });
        await http.request({ method: 'GET', url: 'https://api.test/v2' });

        expect(fetchFn.mock.calls[0][1].headers['content-type']).toBe('text/plain');
        expect(fetchFn.mock.calls[0][1].headers['x-goog-api-key']).toBe('k');
        expect(fetchFn.mock.calls[1][1].body).toBeUndefined();
        expect(fetchFn.mock.calls[1][1].headers['content-type']).toBeUndefined();
    });

    it('maps status, ok, headers, and body accessors onto HttpResponse', async () => {
        const fetchFn = vi
            .fn()
            .mockResolvedValue(createFetchResponse(404, { error: 'missing' }, { 'x-request-id': 'r1' }));
        const http = createFetchHttpRequest({ fetchFn });

        const response = await http.request({ method: 'GET', url: 'https://api.test/v1' });

        expect(response.status).toBe(404);
        expect(response.ok).toBe(false);
        expect(response.headers?.['x-request-id']).toBe('r1');
        await expect(response.json()).resolves.toEqual({ error: 'missing' });
    });

    it('passes the abort signal through to fetch', async () => {
        const fetchFn = vi.fn().mockResolvedValue(createFetchResponse(200, null));
        const http = createFetchHttpRequest({ fetchFn });
        const controller = new AbortController();

        await http.request({ method: 'GET', url: 'https://api.test/v1', signal: controller.signal });

        expect(fetchFn.mock.calls[0][1].signal).toBe(controller.signal);
    });
});

describe('ScriptedHttpRequest', () => {
    it('replies with scripted responses in order and records requests', async () => {
        const http = new ScriptedHttpRequest([{ json: { first: true } }, { status: 500, text: 'boom' }]);

        const first = await http.request({ method: 'GET', url: 'https://api.test/1' });
        const second = await http.request({ method: 'POST', url: 'https://api.test/2', body: { b: 1 } });

        expect(first.ok).toBe(true);
        await expect(first.json()).resolves.toEqual({ first: true });
        expect(second.ok).toBe(false);
        expect(second.status).toBe(500);
        await expect(second.text()).resolves.toBe('boom');
        expect(http.requests.map(request => request.url)).toEqual(['https://api.test/1', 'https://api.test/2']);
    });

    it('fails loudly when the script is exhausted', async () => {
        const http = new ScriptedHttpRequest();

        await expect(http.request({ method: 'GET', url: 'https://api.test/1' })).rejects.toThrow(
            /no scripted response/
        );
    });
});
