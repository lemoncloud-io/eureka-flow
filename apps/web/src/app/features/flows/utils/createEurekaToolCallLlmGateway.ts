import { api } from '@flows/web-core';

import type { ChatRequest, Chunk, LlmGateway, ToolDef } from '@flows/agent';

/**
 * Browser-safe production gateway for provider-native tool calling, routed through
 * eureka-flows-api — never a provider directly. Implements the shared {@link LlmGateway}
 * `chat()` contract exactly like the provider-native gateways in `@flows/agent`
 * (`createOpenAiLlmGateway`, `createGeminiToolLlmGateway`, ...), but this one never holds a
 * provider key: it sends a `provider`/`requestedModel` identifier pair plus the normal
 * `ChatRequest` to a single backend endpoint, and the backend is the only thing that ever
 * touches a real provider credential.
 *
 * **Endpoint status: not yet deployed.** This gateway is real, typed, and tested against a
 * scripted local HTTP server (`createEurekaToolCallLlmGateway.contract.spec.ts`) — it is not
 * yet wired to a live backend, because that backend doesn't exist yet. Nothing in the running
 * app selects it: `FlowAgentPanel.tsx` builds `createGenerateApiLlmGateway` unconditionally, so
 * this gateway never activates against a nonexistent endpoint.
 *
 * This file lives in the app layer, not `libs/agent`, for the same reason
 * `createGenerateApiLlmGateway.ts` does: it depends on the app's API client (`@flows/web-core`),
 * which owns session auth (`x-api-key`) and base-URL construction — reused here rather than
 * duplicated, so this gateway never has its own notion of how the app authenticates.
 */

/** Request body sent to the tool-call endpoint. `provider`/`requestedModel` are checked against
 * a server-side allowlist — this gateway does not enforce one client-side; a rejected
 * combination comes back as a normal {@link EurekaToolCallErrorBody}, not a client-side throw. */
export interface EurekaToolCallRequest {
    requestId: string;
    provider: string;
    requestedModel: string;
    messages: ChatRequest['messages'];
    tools: ToolDef[];
    generation?: { temperature?: number; maxOutputTokens?: number };
}

export interface EurekaToolCallErrorBody {
    /** Stable, provider-neutral machine-readable category — see the contract doc for the fixed
     * set (e.g. `auth_error`, `model_not_allowed`, `provider_error`, `timeout`, `rate_limited`). */
    code: string;
    /** Already sanitized by the backend — never a raw provider error body, never a stack trace,
     * never a key. Safe to show directly or log. */
    message: string;
}

export interface EurekaToolCallSuccessResponse {
    requestId: string;
    /** Normalized `Chunk[]` — the exact same shape every provider-native gateway yields, so this
     * gateway's own `chat()` body below is a plain array iteration, not a second mapping layer. */
    chunks: Chunk[];
}

export interface EurekaToolCallErrorResponse {
    requestId: string;
    error: EurekaToolCallErrorBody;
}

export type EurekaToolCallResponse = EurekaToolCallSuccessResponse | EurekaToolCallErrorResponse;

/** Base class for every error this gateway throws — lets a caller catch one type and still
 * branch on `instanceof` for the specific cases it cares about. */
export class EurekaToolCallGatewayError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EurekaToolCallGatewayError';
    }
}

/** The request never reached the backend, or the backend never responded (DNS, offline, CORS,
 * connection reset, ...) — distinct from an HTTP error response, which means the backend *did*
 * respond, just with a non-2xx status. */
export class EurekaToolCallNetworkError extends EurekaToolCallGatewayError {
    constructor(
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'EurekaToolCallNetworkError';
    }
}

/** The backend responded with a non-2xx HTTP status. `status` is preserved so a caller can
 * distinguish e.g. a 401 (session expired — existing app auth already handles this via
 * `libs/web-core`'s response interceptor) from a 5xx (transient backend/provider issue). */
export class EurekaToolCallHttpError extends EurekaToolCallGatewayError {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
        this.name = 'EurekaToolCallHttpError';
    }
}

/** The backend responded 2xx, but the body doesn't match {@link EurekaToolCallResponse} at
 * all — a contract violation, not a provider/request problem. Never partially trusted: this
 * gateway does not attempt to salvage a malformed response. */
export class EurekaToolCallInvalidResponseError extends EurekaToolCallGatewayError {
    constructor(message: string) {
        super(message);
        this.name = 'EurekaToolCallInvalidResponseError';
    }
}

/** The backend responded with a well-formed {@link EurekaToolCallErrorResponse} — a real,
 * understood failure (auth, disallowed model, provider error, timeout, ...), not a network or
 * contract problem. `code` is the stable machine-readable category from the response body. */
export class EurekaToolCallProviderError extends EurekaToolCallGatewayError {
    constructor(
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'EurekaToolCallProviderError';
    }
}

/** Deliberately minimal, structural — matches `createGenerateApiLlmGateway.ts`'s `GeneratePostFn`
 * convention rather than importing Axios's own types directly (this app layer has no direct
 * `axios` dependency of its own; `@flows/web-core` owns that). `api.post`'s real return type
 * (`AxiosResponse<T>`) structurally satisfies this — it has `data` plus more, which is fine here
 * since only `data` is read. */
interface EurekaPostResult {
    data: unknown;
}
type EurekaPostFn = (url: string, body: unknown, config: { signal?: AbortSignal }) => Promise<EurekaPostResult>;

const DEFAULT_ENDPOINT_PATH = '/llm/tool-calls';

const defaultPost: EurekaPostFn = (url, body, config) => api.post(url, body, config);

const defaultGenerateRequestId = (): string =>
    globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Structural check only — deliberately not exhaustive on every `UsageInfo` field (those are all
 * optional numbers/strings consumed downstream by pricing/report code, which already guards
 * against missing fields); this just rejects a `usage` that isn't even an object. */
const isPlausibleUsage = (value: unknown): boolean => value === undefined || isPlainObject(value);

const isChunk = (value: unknown): value is Chunk => {
    if (!isPlainObject(value)) return false;
    if (value.text !== undefined && typeof value.text !== 'string') return false;
    if (value.done !== undefined && typeof value.done !== 'boolean') return false;
    if (value.actualModel !== undefined && typeof value.actualModel !== 'string') return false;
    if (!isPlausibleUsage(value.usage)) return false;
    if (value.toolCall !== undefined) {
        if (!isPlainObject(value.toolCall)) return false;
        const { id, name, argsDelta } = value.toolCall;
        if (typeof id !== 'string' || typeof name !== 'string' || typeof argsDelta !== 'string') return false;
    }
    return true;
};

const isEurekaToolCallErrorBody = (value: unknown): value is EurekaToolCallErrorBody =>
    isPlainObject(value) && typeof value.code === 'string' && typeof value.message === 'string';

/** Runtime validation of the backend's response body — this repo has no schema-validation
 * library (`zod`/`ajv`/...) anywhere, so this follows the same hand-rolled, structural-guard
 * convention already established by `libs/agent/src/tools/validateArgs.ts` rather than adding a
 * new dependency for one call site. */
const isEurekaToolCallResponse = (value: unknown): value is EurekaToolCallResponse => {
    if (!isPlainObject(value)) return false;
    if (typeof value.requestId !== 'string') return false;
    if ('error' in value) return isEurekaToolCallErrorBody(value.error);
    return Array.isArray(value.chunks) && value.chunks.every(isChunk);
};

export interface CreateEurekaToolCallLlmGatewayOptions {
    /** Checked server-side against an allowlist — see the contract doc. Not enforced here. */
    provider: string;
    /** Checked server-side against an allowlist — see the contract doc. Not enforced here. */
    requestedModel: string;
    /** Defaults to `/llm/tool-calls`. Override for a proxy path or an eventual versioned route
     * (e.g. `/v1/llm/tool-calls`) once the backend team settles on one — kept configurable
     * specifically so that decision doesn't require a code change here. */
    endpointPath?: string;
    /** Defaults to `api.post` from `@flows/web-core` (adds session `x-api-key` + base URL
     * automatically — the same existing app auth every other API call uses). Overridable for
     * tests, so contract tests can point this at a real local HTTP server instead of mocking the
     * network layer away. */
    post?: EurekaPostFn;
    /** Defaults to `crypto.randomUUID()`. Overridable for deterministic tests. */
    generateRequestId?: () => string;
    generation?: { temperature?: number; maxOutputTokens?: number };
}

/** The eureka-flows-api tool-calling gateway: the shared `chat()` contract over a single,
 * non-streaming HTTP POST to a backend endpoint that itself calls a real provider. See the
 * module doc for what's implemented vs. what still needs the backend endpoint deployed. */
export const createEurekaToolCallLlmGateway = (options: CreateEurekaToolCallLlmGatewayOptions): LlmGateway => {
    const {
        provider,
        requestedModel,
        endpointPath = DEFAULT_ENDPOINT_PATH,
        post = defaultPost,
        generateRequestId = defaultGenerateRequestId,
        generation,
    } = options;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const requestId = generateRequestId();
        const body: EurekaToolCallRequest = {
            requestId,
            provider,
            requestedModel,
            messages: req.messages,
            tools: req.tools,
            ...(generation ? { generation } : {}),
        };

        let response: EurekaPostResult;
        try {
            response = await post(endpointPath, body, {
                ...(opts?.signal ? { signal: opts.signal } : {}),
            });
        } catch (err) {
            if (opts?.signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (typeof status === 'number') {
                throw new EurekaToolCallHttpError(status, `eureka tool-call endpoint returned HTTP ${status}`);
            }
            throw new EurekaToolCallNetworkError('eureka tool-call endpoint request failed', err);
        }

        if (opts?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const data = response.data;
        if (!isEurekaToolCallResponse(data)) {
            throw new EurekaToolCallInvalidResponseError(
                'eureka tool-call endpoint returned a response that does not match the expected contract'
            );
        }
        if ('error' in data) {
            throw new EurekaToolCallProviderError(data.error.code, data.error.message);
        }

        for (const chunk of data.chunks) {
            if (opts?.signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            yield chunk;
        }
    }

    return {
        capabilities: { toolCalls: true },
        chat,
    };
};
