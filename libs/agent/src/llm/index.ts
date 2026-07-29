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

// Gemini provider (HTTP)
export { createGeminiLlmGateway } from './GeminiLlmGateway';
export type { GeminiLlmGateway, GeminiLlmGatewayOptions } from './GeminiLlmGateway';
