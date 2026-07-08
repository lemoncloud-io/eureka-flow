/**
 * Public entry for @flows/agent.
 *
 * Currently exposes only the environment foundation (07.07 meeting): the environment /
 * storage / trace-reporter contracts, their browser and node-virtual implementations, and
 * the two environment factories. The agent core (orchestrator, gateway, tools) lands in
 * later slices.
 */
export * from './environment';
