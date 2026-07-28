import { describe, expect, it } from 'vitest';

import { createFetchHttpPort } from '../adapters/fetchHttpPort';
import { createApiKeyAuth } from '../ports/auth';
import { HttpError } from '../ports/http';

/**
 * The adapter that builds every request the engine makes, and had no coverage at all —
 * which is how a change to the wire format would have gone unnoticed.
 *
 * The URL is assembled by hand rather than with `URL`, because React Native's shim has no
 * usable `searchParams`. These specs pin what that assembly produces, byte for byte, so
 * the portability fix cannot quietly become a protocol change.
 */
const BASE = 'https://api.example.com/flw-d1';

/** Records the URL it was called with and answers 200 with an empty body. */
const recorder = () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(new Response('', { status: 200 }));
    }) as unknown as typeof fetch;
    return { calls, fetchFn };
};

const urlFor = async (req: Parameters<ReturnType<typeof createFetchHttpPort>['request']>[0], apiKey = 'key') => {
    const { calls, fetchFn } = recorder();
    await createFetchHttpPort({ baseUrl: BASE, auth: createApiKeyAuth(apiKey), fetchFn }).request(req);
    return calls[0].url;
};

describe('fetchHttpPort — URL assembly', () => {
    it('puts the auth path between the root and the request path', async () => {
        expect(await urlFor({ method: 'GET', path: '/flows/1/load' })).toBe(
            'https://api.example.com/flw-d1/_api_/flows/1/load'
        );
    });

    /** The three branches of `apiEndpointPath`, which is a server contract. */
    it.each([
        ['a normal key', 'key', '/_api_'],
        ['no key — public endpoint', null, '/public'],
        ["'#' — a server running locally", '#', ''],
    ] as const)('%s maps to %s', async (_case, apiKey, segment) => {
        expect(await urlFor({ method: 'GET', path: '/flows/1/load' }, apiKey)).toBe(`${BASE}${segment}/flows/1/load`);
    });

    it('appends nothing when there is no query', async () => {
        expect(await urlFor({ method: 'GET', path: '/blocks/0/list' })).not.toContain('?');
    });

    it('appends nothing when every query value is undefined', async () => {
        const url = await urlFor({ method: 'POST', path: '/nodes/n1/run', query: { connection: undefined } });
        expect(url).not.toContain('?');
    });

    it('keeps the values that are present and drops the ones that are not', async () => {
        const url = await urlFor({
            method: 'POST',
            path: '/nodes/n1/run',
            query: { async: 1, force: undefined, propagate: 0 },
        });
        expect(url).toBe(`${BASE}/_api_/nodes/n1/run?async=1&propagate=0`);
    });

    /**
     * The connection id is base64url and ends in `==`. Sending it raw would end the query
     * value early, so this is the one encoding the run path actually depends on.
     */
    it('percent-encodes a base64 connection id', async () => {
        const url = await urlFor({
            method: 'POST',
            path: '/nodes/n1/run',
            query: { connection: 'gVcW5A_cAQJoKEhsnA==' },
        });
        expect(url).toBe(`${BASE}/_api_/nodes/n1/run?connection=gVcW5A_cAQJoKEhsnA%3D%3D`);
    });

    /**
     * The one place hand-assembly differs from `URLSearchParams`, pinned deliberately:
     * that writes a space as `+` (form-encoding), this writes `%20` (URL-encoding). No
     * query the engine sends carries a space today, so this spec exists to make a future
     * one a decision rather than a silent flip.
     */
    it('encodes a space as %20, not +', async () => {
        const url = await urlFor({ method: 'GET', path: '/flows/0/list', query: { view: 'my flows' } });
        expect(url).toBe(`${BASE}/_api_/flows/0/list?view=my%20flows`);
        expect(url).not.toContain('+');
    });

    it('encodes the key as well as the value', async () => {
        const url = await urlFor({ method: 'GET', path: '/x', query: { 'a&b': 'c=d' } });
        expect(url).toBe(`${BASE}/_api_/x?a%26b=c%3Dd`);
    });

    it('serializes non-string values rather than dropping them', async () => {
        const url = await urlFor({ method: 'GET', path: '/blocks/0/list', query: { cores: 1, limit: -1 } });
        expect(url).toBe(`${BASE}/_api_/blocks/0/list?cores=1&limit=-1`);
    });
});

describe('fetchHttpPort — baseUrl', () => {
    /**
     * `new URL()` used to reject this at construction. Hand-assembly would have carried a
     * malformed root all the way into `fetch`, where the error says nothing about where
     * the mistake was made.
     */
    it.each(['garbage', '/flw-d1', 'ftp://api.example.com', ''])('rejects %s at construction', baseUrl => {
        expect(() => createFetchHttpPort({ baseUrl, auth: createApiKeyAuth('key') })).toThrow(/absolute http/);
    });

    /** `URL` used to collapse the `//` this would otherwise leave before `/_api_`. */
    it('tolerates a trailing slash on the root', async () => {
        const { calls, fetchFn } = recorder();
        await createFetchHttpPort({
            baseUrl: 'https://api.example.com/flw-d1/',
            auth: createApiKeyAuth('key'),
            fetchFn,
        }).request({ method: 'GET', path: '/flows/1/load' });

        expect(calls[0].url).toBe('https://api.example.com/flw-d1/_api_/flows/1/load');
    });
});

describe('fetchHttpPort — responses', () => {
    it('sends the api key as a header, and omits it when there is none', async () => {
        const withKey = recorder();
        await createFetchHttpPort({ baseUrl: BASE, auth: createApiKeyAuth('k'), fetchFn: withKey.fetchFn }).request({
            method: 'GET',
            path: '/x',
        });
        expect((withKey.calls[0].init?.headers as Record<string, string>)['x-api-key']).toBe('k');

        const noKey = recorder();
        await createFetchHttpPort({ baseUrl: BASE, auth: createApiKeyAuth(null), fetchFn: noKey.fetchFn }).request({
            method: 'GET',
            path: '/x',
        });
        expect(noKey.calls[0].init?.headers as Record<string, string>).not.toHaveProperty('x-api-key');
    });

    it('raises HttpError carrying the failure body, which is what says why', async () => {
        const fetchFn = (() =>
            Promise.resolve(
                new Response(JSON.stringify({ message: '400 INVALID - not supported' }), { status: 400 })
            )) as unknown as typeof fetch;

        const port = createFetchHttpPort({ baseUrl: BASE, auth: createApiKeyAuth('k'), fetchFn });
        await expect(port.request({ method: 'GET', path: '/flows/1' })).rejects.toMatchObject({
            name: 'HttpError',
            status: 400,
            body: { message: '400 INVALID - not supported' },
        });
        await expect(port.request({ method: 'GET', path: '/flows/1' })).rejects.toBeInstanceOf(HttpError);
    });

    it('treats an empty 200 body as undefined rather than failing to parse it', async () => {
        const fetchFn = (() => Promise.resolve(new Response('', { status: 200 }))) as unknown as typeof fetch;
        const port = createFetchHttpPort({ baseUrl: BASE, auth: createApiKeyAuth('k'), fetchFn });

        await expect(port.request({ method: 'GET', path: '/x' })).resolves.toEqual({ status: 200, data: undefined });
    });
});
