export type { HttpMethod, HttpRequestInput, HttpClient, HttpResponse } from './types';
export { createFetchHttpRequest } from './FetchHttpRequest';
export type { FetchHttpRequestOptions } from './FetchHttpRequest';
// ScriptedHttpRequest is a test double; its specs import it directly, so it stays off the public API.
