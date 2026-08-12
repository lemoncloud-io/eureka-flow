// Generic base + concrete specialists + orchestrator
export { BaseAgent, DEFAULT_MAX_ITERATIONS } from './baseAgent';
export type { BaseAgentDeps, CollectedToolCall } from './baseAgent';
// Block agents (per block type): the generic BlockAgent + the named generator specialist.
export { createBlockAgent, BlockAgent, blockAgentSystemPrompt } from './blockAgent';
export type { BlockAgentDeps } from './blockAgent';
export { createSingleOutputGeneratorAgent, SINGLE_OUTPUT_GENERATOR_SYSTEM_PROMPT } from './singleOutputGeneratorAgent';
// Composition specialist: the Builder (full editing toolset + use_skill over SEED_SKILLS).
export { createBuilderAgent, BuilderAgent, BUILDER_SYSTEM_PROMPT } from './builderAgent';
export type { BuilderAgentDeps } from './builderAgent';
export { createOrchestratorAgent, OrchestratorAgent, ORCHESTRATOR_SYSTEM_PROMPT } from './orchestratorAgent';
export type { OrchestratorAgentDeps } from './orchestratorAgent';

// Agent roster (registry) + sub-agent runner (spawn)
export { createAgentRoster } from './roster';
export type { AgentCard, AgentRegistration, AgentRoster, SpecialistTurnDeps } from './roster';
export { DEFAULT_REGISTRATIONS, createDefaultRoster, ORCHESTRATOR_MODEL_TIER } from './registrations';
// Per-agent model selection: declarative config (withModels) + the memoized gatewayFor resolver.
export { withModels, assertKnownModels } from './withModels';
export { createModelGatewayFor, agentModelResolver } from './modelGatewayFor';
export type { GatewayFactory, ModelForType, ModelGatewayForDeps } from './modelGatewayFor';
export { createSubAgentRunner } from './subAgentRunner';
export type {
    SpawnChildSpec,
    SpawnChildResult,
    SpawnInput,
    SpawnResult,
    SubAgentRunner,
    SubAgentRunnerDeps,
} from './subAgentRunner';
