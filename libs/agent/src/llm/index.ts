// Shared chat contract (provider-neutral messages, tool defs, streamed chunks)
export type { ChatMessage, ChatRequest, Chunk, JsonSchema, LlmGateway, ToolDef } from './llmGateway';
export { createFakeGateway } from './fakeGateway';
export type { FakeGateway, FakeResponse, FakeScriptStep } from './fakeGateway';

// W04 completion contract + Gemini provider (contract reconciliation in progress)
export type {
    LlmCompletionInput,
    LlmCompletionResult,
    LlmGatewaySupportable,
    LlmMessage,
    LlmRole,
    LlmUsage,
} from './types';
export { createGeminiLlmGateway } from './GeminiLlmGateway';
export type { GeminiLlmGatewayOptions } from './GeminiLlmGateway';
