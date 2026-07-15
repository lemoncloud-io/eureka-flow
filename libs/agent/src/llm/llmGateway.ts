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
}

/**
 * The one outbound LLM dependency, behind a single interface so it can be swapped.
 * This lib ships only {@link ../llm/fakeGateway.createFakeGateway} (it backs the tests);
 * concrete gateways live in the app — today an offline dev command gateway (no network, no
 * key) that parses a command and emits real tool calls, with a backend-proxied production
 * gateway deferred until an endpoint exists (see docs/specs/0002-locator-agent/SPEC.md §9).
 */
export interface LlmGateway {
    chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk>;
}
