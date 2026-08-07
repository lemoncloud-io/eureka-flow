// Shared, provider-neutral chat contract
export type {
    ChatMessage,
    ChatRequest,
    Chunk,
    JsonSchema,
    LlmGateway,
    LlmGatewayCapabilities,
    ToolDef,
} from './llmGateway';
export { createFakeGateway } from './fakeGateway';
export type { FakeGateway, FakeResponse, FakeScriptStep } from './fakeGateway';

// Per-agent tracing decorator: emits llm.request/llm.response around chat(), pass-through otherwise.
export { tracingGateway } from './tracingGateway';

// Gemini provider (HTTP) — the Developer API (x-goog-api-key → generativelanguage.googleapis.com).
export { createGeminiLlmGateway } from './GeminiLlmGateway';
export type {
    GeminiGenerationConfig,
    GeminiLlmGateway,
    GeminiLlmGatewayOptions,
    GeminiRetryConfig,
} from './GeminiLlmGateway';

// Build the real Gemini gateway from the environment — shared by the live specs and the local terminal.
export { liveModel, liveProvider, resolveLiveGateway } from './resolveLiveGateway';
export type { LiveGatewayConfig } from './resolveLiveGateway';
