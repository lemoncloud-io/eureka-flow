/**
 * The engine's only way out to a server.
 *
 * Deliberately smaller than axios: a method, a path, a body. Everything the browser
 * client layers on top — interceptors, toasts, clearing credentials on 403 — is browser
 * policy and belongs to whoever adapts this, not to the graph.
 */
export interface HttpRequest {
    method: 'GET' | 'POST';
    /** Path below the API root, e.g. `/flows/123/load`. */
    path: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
}

export interface HttpResponse<T> {
    status: number;
    data: T;
}

export interface HttpPort {
    request: <T>(req: HttpRequest) => Promise<HttpResponse<T>>;
}

/** A request that came back with a status the caller cannot use. */
export class HttpError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(status: number, path: string, body: unknown) {
        super(`${status} from ${path}`);
        this.name = 'HttpError';
        this.status = status;
        this.body = body;
    }
}
