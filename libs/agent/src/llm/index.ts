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

// Gemini provider (HTTP, text-only) — the Developer API (x-goog-api-key → generativelanguage.googleapis.com).
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

// Gemini provider (HTTP, tool-capable — separate from the text-only gateway above)
export { createGeminiToolLlmGateway } from './GeminiToolLlmGateway';
export type { GeminiToolLlmGateway, GeminiToolLlmGatewayOptions } from './GeminiToolLlmGateway';

// OpenAI provider (HTTP, tool-capable; also serves OpenRouter via baseUrl override)
export { createOpenAiLlmGateway } from './OpenAiLlmGateway';
export type { OpenAiLlmGateway, OpenAiLlmGatewayOptions } from './OpenAiLlmGateway';

// Anthropic/Claude provider (HTTP, tool-capable, native gateway)
export { createAnthropicToolLlmGateway } from './AnthropicToolLlmGateway';
export type { AnthropicToolLlmGateway, AnthropicToolLlmGatewayOptions } from './AnthropicToolLlmGateway';

// Shared provider-native tool-call verification — see provider-tool-calling.md §4
export { verifyMoveNodeToolCall } from './verifyProviderToolCall';
export type { VerifyMoveNodeResult } from './verifyProviderToolCall';

// Tool-selection scenario matrix (list_nodes vs move_node, directions, absolute position,
// refusal, unknown-target) — see provider-tool-calling.md §4
export { LOCATOR_SCENARIOS, runAllLocatorScenarios, runLocatorScenario } from './verifyLocatorScenarios';
export type { LocatorScenarioId, LocatorScenarioResult, SeedNode } from './verifyLocatorScenarios';
