const API_PATH_DEFAULT = '/_apis' as const;
const API_PATH_EUREKA_CODES = '/_api_' as const;
const EUREKA_CODES_PREFIX = 'ec-' as const;

/**
 * Determines the API endpoint path based on the API key prefix.
 * - Keys starting with 'ec-' use '/_api_' (Eureka Codes endpoint)
 * - All other keys use '/_apis' (default endpoint)
 *
 * @param apiKey - The API key (can be null)
 * @returns The API path to use ('/_apis' or '/_api_')
 * @remarks The prefix check is case-sensitive. Only lowercase 'ec-' is matched.
 */
export const getApiEndpointPath = (apiKey: string | null): string => {
    if (apiKey?.startsWith(EUREKA_CODES_PREFIX)) {
        return API_PATH_EUREKA_CODES;
    }
    return API_PATH_DEFAULT;
};
