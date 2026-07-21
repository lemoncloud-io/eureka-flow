import type { Capability } from '../permissions';

/**
 * A minimal JSON-Schema shape — enough to describe tool parameters to the model and
 * to drive the executor's structural validation (see `toolExecutor`). Not a complete
 * JSON-Schema implementation; extended as tools need it.
 */
export interface JsonSchema {
    type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null';
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    description?: string;
    enum?: unknown[];
    [key: string]: unknown;
}

/** A tool as advertised to the model. */
export interface ToolDef {
    name: string;
    description: string;
    parameters: JsonSchema;
    /** The capability this tool needs (mutate tools set it; reads omit it). */
    requires?: Capability;
}

/** One message in the provider-neutral chat transcript. */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    /** Present on assistant messages that call tools; `args` is the raw JSON string. */
    toolCalls?: { id: string; name: string; args: string }[];
    /** Present on tool-result messages: the id of the assistant tool call it answers. */
    toolCallId?: string;
}

export interface ChatRequest {
    messages: ChatMessage[];
    tools: ToolDef[];
    stream?: boolean;
}

/** A streamed fragment: text delta and/or a tool-call arg delta, and/or done. */
export interface Chunk {
    text?: string;
    toolCall?: { id: string; name: string; argsDelta: string };
    done?: boolean;
    /** Optional token accounting, emitted with the final (`done`) chunk when the provider reports it. */
    usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * What a gateway/model supports. Callers that need tool calling should check this before
 * sending tool definitions; a text-only gateway rejects requests that carry them.
 */
export interface LlmGatewayCapabilities {
    /** Whether the gateway/model can emit tool calls. */
    readonly toolCalls: boolean;
}

/**
 * The one outbound LLM dependency, behind a single interface so it can be swapped.
 * This lib ships {@link ../llm/fakeGateway.createFakeGateway} (it backs the tests) and
 * {@link ../llm/GeminiLlmGateway.createGeminiLlmGateway} (the first HTTP provider,
 * text-only, over the HttpRequest port); the app adds an offline dev command gateway (no
 * network, no key) that parses a command and emits real tool calls, with a backend-proxied
 * production gateway deferred until an endpoint exists.
 */
export interface LlmGateway {
    /**
     * Capability metadata; optional for backward compatibility — absent means unspecified
     * (callers should not assume tool support).
     */
    readonly capabilities?: LlmGatewayCapabilities;
    chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk>;
}
