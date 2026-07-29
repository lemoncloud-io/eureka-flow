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

/**
 * Built by hand rather than with `URL`, which is the one platform API here that is not
 * uniformly available.
 *
 * React Native ships a `URL` shim whose `searchParams` is missing or incomplete — and
 * `searchParams.set` is precisely what this needed. Injecting a `URL` constructor would
 * not help: the object it returns is the part that cannot be trusted. `encodeURIComponent`
 * is ES-core and exists on every runtime including Hermes, so the dependency goes away
 * instead of becoming another knob.
 *
 * Encoding is deliberately `encodeURIComponent` and not `URLSearchParams` semantics. The
 * two differ on exactly one character this codebase can produce — a space, which
 * `URLSearchParams` writes as `+` and this writes as `%20`. No query the engine sends
 * carries one today, and `%20` is the form that is correct in a URL rather than in a form
 * body, so a future one is safer this way. A spec pins it.
 */
const buildUrl = (baseUrl: string, auth: AuthPort, req: HttpRequest): string => {
    const path = `${baseUrl}${auth.endpointPath()}${req.path}`;
    const query = Object.entries(req.query ?? {})
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
    return query ? `${path}?${query}` : path;
};

/**
 * `new URL()` used to reject a malformed root as soon as the adapter was built. Nothing
 * else would: a concatenated string flows all the way into `fetch` and fails there, far
 * from the mistake. So the check stays, explicitly.
 *
 * A trailing slash is stripped rather than rejected — `URL` used to collapse the `//` that
 * would otherwise appear before `/_api_`, and a root written with one is a typo, not an
 * error worth stopping a session for.
 */
const normalizeBaseUrl = (baseUrl: string): string => {
    if (!/^https?:\/\/[^/?#]+/i.test(baseUrl)) {
        throw new Error(`baseUrl must be an absolute http(s) URL, got "${baseUrl}"`);
    }
    return baseUrl.replace(/\/+$/, '');
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
}: FetchHttpPortOptions): HttpPort => {
    const root = normalizeBaseUrl(baseUrl);

    return {
        request: async <T>(req: HttpRequest) => {
            const apiKey = auth.getApiKey();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetchFn(buildUrl(root, auth, req), {
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
                let data: T;
                try {
                    data = text ? (JSON.parse(text) as T) : (undefined as T);
                } catch (parseError) {
                    // A failure body is not always JSON — a gateway 502 is usually HTML. Parsing
                    // it first would throw SyntaxError and lose the status code, which is the one
                    // thing callers branch on (the 403-clears-credentials policy, for one).
                    // A non-JSON body on a 2xx is a real surprise, so that still throws.
                    if (response.ok) throw parseError;
                    throw new HttpError(response.status, req.path, text as unknown as T);
                }

                if (!response.ok) throw new HttpError(response.status, req.path, data);
                return { status: response.status, data };
            } finally {
                clearTimeout(timer);
            }
        },
    };
};
