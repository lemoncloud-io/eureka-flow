import { HttpError } from '../ports/http';

import type { AuthPort } from '../ports/auth';
import type { HttpPort, HttpRequest } from '../ports/http';

export interface FetchHttpPortOptions {
    /** API root, e.g. `https://api.eureka.codes/flw-d1`. The auth path is appended to it. */
    baseUrl: string;
    auth: AuthPort;
    /** Defaults to the global `fetch` — Node 22 has one, so the same adapter serves both runtimes. */
    fetchFn?: typeof fetch;
    /** Milliseconds before a request is abandoned. Matches the browser client's 30s. */
    timeoutMs?: number;
}

const buildUrl = (baseUrl: string, auth: AuthPort, req: HttpRequest): string => {
    const url = new URL(`${baseUrl}${auth.endpointPath()}${req.path}`);
    for (const [key, value] of Object.entries(req.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
};

/**
 * The one HTTP adapter both runtimes use.
 *
 * Node 22 ships `fetch` as a global, so there is no browser branch here and nothing to
 * keep in sync — the reason the port is this small in the first place.
 */
export const createFetchHttpPort = ({
    baseUrl,
    auth,
    fetchFn = fetch,
    timeoutMs = 30_000,
}: FetchHttpPortOptions): HttpPort => ({
    request: async <T>(req: HttpRequest) => {
        const apiKey = auth.getApiKey();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetchFn(buildUrl(baseUrl, auth, req), {
                method: req.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'x-api-key': apiKey } : {}),
                },
                body: req.body === undefined ? undefined : JSON.stringify(req.body),
                signal: controller.signal,
            });

            // Read the body either way: a failure's body is what says why.
            const text = await response.text();
            const data = text ? (JSON.parse(text) as T) : (undefined as T);

            if (!response.ok) throw new HttpError(response.status, req.path, data);
            return { status: response.status, data };
        } finally {
            clearTimeout(timer);
        }
    },
});
