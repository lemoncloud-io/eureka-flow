/**
 * HTTP port for agent-layer services
 *
 * Gateways never call the global `fetch` directly — they depend on this small port. That
 * matters for two reasons:
 *
 *  1. CORS/security: some provider APIs cannot be called reliably from the browser. The
 *     planned backend proxy becomes just another HttpRequestSupportable implementation
 *     (or a different base URL), with no change to gateway code.
 *  2. The environment forbids arbitrary network access. Agent services reach the network
 *     only through an explicitly injected HTTP port aimed at approved endpoints.
 */

export type HttpMethod = 'GET' | 'POST';

export interface HttpRequestInput {
    method: HttpMethod;
    url: string;
    headers?: Record<string, string>;
    /** JSON-serializable request body; implementations encode it and set the content type. */
    body?: unknown;
    /** Cancellation signal, typically from AgentEnvironmentSupportable.createAbortController(). */
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

export interface HttpRequestSupportable {
    request(input: HttpRequestInput): Promise<HttpResponse>;
}
