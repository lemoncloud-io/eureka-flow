/**
 * Public entry for @flows/agent.
 *
 * Environment foundation (07.07): the environment / storage / trace-reporter contracts,
 * their browser and node-virtual implementations, and the environment self-check.
 * W04 (07.14): the HTTP port and the LLM gateway (fake gateway for tests + the Gemini
 * 2.5 Flash provider), plus the locator agent vertical: canvas seam, tools + executor,
 * session, and the generic BaseAgent.
 */

// Environment foundation + self-check
export * from './environment';

// HTTP port (provider/proxy calls go through this, never raw fetch)
export * from './http';

// LLM gateway: chat contract + fake gateway + Gemini provider
export * from './llm';

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
