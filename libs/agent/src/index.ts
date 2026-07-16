// Agent + permissions
export type { Agent, AgentConfig } from './agent';
export type { AgentGrant, Capability } from './permissions';
export { effectiveCapabilities } from './permissions';

// Canvas seam
export type { CanvasBinding, Graph, XY } from './canvas/canvasBinding';
export { createInMemoryCanvasBinding } from './canvas/inMemoryCanvasBinding';
export { createCanvasToolProvider, listNodeLocations } from './canvas/canvasTools';
export type { NodeLocation } from './canvas/canvasTools';
export { applyMove, directionToDelta, hasExactlyOneTarget, DEFAULT_STEP } from './canvas/moveSemantics';
export type { Delta, Direction, MoveNodeArgs } from './canvas/moveSemantics';

// LLM gateway
export type { ChatMessage, ChatRequest, Chunk, JsonSchema, LlmGateway, ToolDef } from './llm/llmGateway';
export { createFakeGateway } from './llm/fakeGateway';
export type { FakeGateway, FakeResponse, FakeScriptStep } from './llm/fakeGateway';

// Tools + executor
export type { ToolCall, ToolExecutor, ToolProvider, ToolResult } from './tools/toolTypes';
export { createToolExecutor } from './tools/toolExecutor';
export { validateArgs } from './tools/validateArgs';

// Session
export type { AgentPhase, Message, SessionState, Storage } from './session/session';
export { createInMemoryStorage } from './session/session';

// Agents — generic base + concrete agents
export { BaseAgent, DEFAULT_MAX_ITERATIONS } from './agents/baseAgent';
export type { BaseAgentDeps } from './agents/baseAgent';
export { createLocatorAgent, LocatorAgent, LOCATOR_SYSTEM_PROMPT } from './agents/locatorAgent';
export type { LocatorAgentDeps } from './agents/locatorAgent';
