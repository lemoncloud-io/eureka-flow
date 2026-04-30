const API_PATH = '/_api_' as const;
const API_PATH_PUBLIC = '/public' as const;

/**
 * Determines the API endpoint path based on the API key.
 * - null (no key) uses '/public' (read-only public endpoint)
 * - Any key uses '/_api_'
 */
export const getApiEndpointPath = (apiKey: string | null): string => {
    if (apiKey == '#') return ''; // no use api (might be local)
    if (apiKey === null) return API_PATH_PUBLIC;
    return API_PATH;
};
