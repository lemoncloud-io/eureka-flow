// Shared chat contract (provider-neutral messages, tool defs, streamed chunks, capabilities)
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

// Gemini provider (first HTTP provider over the HttpRequest port; text-only for now)
export { createGeminiLlmGateway } from './GeminiLlmGateway';
export type { GeminiLlmGateway, GeminiLlmGatewayOptions } from './GeminiLlmGateway';
