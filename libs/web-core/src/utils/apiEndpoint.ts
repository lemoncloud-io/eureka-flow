const API_PATH = '/_api_' as const;
const API_PATH_PUBLIC = '/public' as const;

/**
 * Determines the API endpoint path based on the API key.
 * - '#' means talk to the root directly, for a server running locally
 * - null (no key) uses '/public' (read-only public endpoint)
 * - Any other key uses '/_api_'
 *
 * `apiEndpointPath` in `@flows/engine` (`ports/auth.ts`) says the same thing for callers
 * that have no browser. Deliberately a second copy rather than a shared one: the engine
 * declares no dependencies so it can be run from a CLI or a worker, and importing it here
 * would be the only edge from this package into a domain library. Change both together.
 */
export const getApiEndpointPath = (apiKey: string | null): string => {
    if (apiKey === '#') return ''; // no use api (might be local)
    if (apiKey === null) return API_PATH_PUBLIC;
    return API_PATH;
};
