/**
 * Moved: the live-gateway resolver now ships at `src/llm/resolveLiveGateway.ts` (promoted so the local
 * terminal can share it). This file stays as a re-export so the existing `*.live.spec.ts` importers keep
 * working unchanged.
 */
export { liveModel, liveProvider, resolveLiveGateway } from '../../llm/resolveLiveGateway';
export type { LiveGatewayConfig } from '../../llm/resolveLiveGateway';
