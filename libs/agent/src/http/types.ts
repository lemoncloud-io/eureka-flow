/** HTTP port for agent-layer services; gateways depend on this instead of calling `fetch` directly. */

export type HttpMethod = 'GET' | 'POST';

export interface HttpRequestInput {
    method: HttpMethod;
    url: string;
    headers?: Record<string, string>;
    /** JSON-serializable request body; implementations encode it and set the content type. */
    body?: unknown;
    /** Cancellation signal, typically an AbortController's signal. */
    signal?: AbortSignal;
}

export interface HttpResponse {
    status: number;
    ok: boolean;
    headers?: Record<string, string>;
    /** Parse the response body as JSON. */
    json(): Promise<unknown>;
    /** Read the response body as text. */
    text(): Promise<string>;
}

export interface HttpClient {
    request(input: HttpRequestInput): Promise<HttpResponse>;
}
