import type { HttpRequestSupportable, HttpResponse } from './types';

export interface FetchHttpRequestOptions {
    /** Injectable fetch for tests; defaults to the global fetch bound to globalThis. */
    fetchFn?: typeof fetch;
}

/**
 * The browser (and modern Node) implementation of the HTTP port, backed by `fetch`. JSON
 * bodies are encoded here so callers pass plain values; an explicit content-type header
 * from the caller wins over the default.
 */
export const createFetchHttpRequest = (options: FetchHttpRequestOptions = {}): HttpRequestSupportable => {
    if (!options.fetchFn && typeof globalThis.fetch !== 'function') {
        throw new Error('createFetchHttpRequest: no global fetch available; pass options.fetchFn');
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    return {
        request: async (input): Promise<HttpResponse> => {
            const hasBody = input.body !== undefined;
            const response = await fetchFn(input.url, {
                method: input.method,
                headers: {
                    ...(hasBody ? { 'content-type': 'application/json' } : {}),
                    ...input.headers,
                },
                ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
                ...(input.signal ? { signal: input.signal } : {}),
            });

            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });

            return {
                status: response.status,
                ok: response.ok,
                headers,
                json: () => response.json(),
                text: () => response.text(),
            };
        },
    };
};
