/**
 * Public entry for @flows/agent.
 *
 * Exposes the environment foundation (07.07 meeting) — the environment / storage /
 * trace-reporter contracts, their browser and node-virtual implementations, the two
 * environment factories, and the environment self-check — plus the W04 (07.14) slice:
 * the HTTP port and the LlmGateway with the Gemini 2.5 Flash provider. The agent core
 * (orchestrator, tools) lands in later slices.
 */
export * from './environment';
export * from './http';
export * from './llm';
