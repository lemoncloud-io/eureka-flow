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

// Gemini provider (HTTP) — Developer API and Vertex AI share one core, differing only in URL + auth.
export { createGeminiLlmGateway, createVertexLlmGateway } from './GeminiLlmGateway';
export type {
    GeminiGenerationConfig,
    GeminiLlmGateway,
    GeminiLlmGatewayOptions,
    GeminiRetryConfig,
    VertexLlmGateway,
    VertexLlmGatewayOptions,
} from './GeminiLlmGateway';
