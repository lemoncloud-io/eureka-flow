/**
 * Where the API key comes from, and what that key implies about the endpoint.
 *
 * A port because the answer differs by runtime and neither answer belongs in the graph:
 * the browser reads a zustand store fed by a login dialog, a CLI reads an environment
 * variable. What both share is the mapping below, which is a server contract.
 */
export interface AuthPort {
    /** The key to send as `x-api-key`, or null to talk to the public endpoint. */
    getApiKey: () => string | null;
    /** The path segment that key implies, appended to the API root. */
    endpointPath: () => string;
}

const API_PATH = '/_api_' as const;
const API_PATH_PUBLIC = '/public' as const;

/**
 * Determines the API endpoint path based on the API key.
 * - '#' means talk to the root directly, for a server running locally
 * - null (no key) uses '/public' (read-only public endpoint)
 * - Any other key uses '/_api_'
 *
 * `getApiEndpointPath` in `@flows/web-core` (`utils/apiEndpoint.ts`) is the same mapping
 * for the browser client. Kept separate so this package can declare no dependencies —
 * see the note there. Change both together.
 */
export const apiEndpointPath = (apiKey: string | null): string => {
    if (apiKey === '#') return '';
    if (apiKey === null) return API_PATH_PUBLIC;
    return API_PATH;
};

/** The ordinary case: one key, fixed for the session. */
export const createApiKeyAuth = (apiKey: string | null): AuthPort => ({
    getApiKey: () => apiKey,
    endpointPath: () => apiEndpointPath(apiKey),
});
