import { describe, it } from 'vitest';

/**
 * PLACEHOLDER — production browser E2E (layer E). Always skipped. This file exists to make the
 * intended production path and its gates explicit and discoverable, not to exercise it — there is
 * no Playwright/Cypress (or any browser-automation) framework configured anywhere in this repo
 * today, and eureka-flows-api's tool-calling endpoint (see
 * `docs/browser-agent/foundations/eureka-tool-calling-endpoint-contract.md`) is not deployed.
 * Setting up real browser-automation infra is future work, tracked separately — not attempted by
 * this file.
 *
 * The real path this stands in for, once both prerequisites exist:
 *
 *   real browser
 *     → deployed eureka-flows-api (`POST /api/v1/llm/tool-calls`, or whatever path the backend
 *       team actually deploys — see the contract doc)
 *     → a real provider (OpenAI/Gemini/OpenRouter/...)
 *     → a normalized structured tool call, exactly the `Chunk` shape every provider-native
 *       gateway in `libs/agent` already yields
 *     → the real `ToolExecutor` (`libs/agent/src/tools/toolExecutor.ts`) — name allowlist, arg
 *       schema validation, capability gate
 *     → a visible mutation on the real canvas (`FlowAgentPanel`'s `createEngineCanvasBinding`)
 *     → a recorded usage/cost/elapsed-time metric (`libs/agent/src/llm/verificationMetrics.ts`)
 *
 * Required gates before this can be a real, running, passing test (see
 * docs/browser-agent/foundations/production-readiness.md's qualification policy):
 *
 *   1. A Playwright (or equivalent) config + an `nx` E2E target for `apps/web` — does not exist
 *      yet; a repo-level decision, not something to add silently alongside this placeholder.
 *   2. eureka-flows-api's tool-calling endpoint actually deployed and reachable from wherever this
 *      suite runs.
 *   3. `VITE_EUREKA_TOOL_CALL_ENDPOINT` (and friends — see `FlowAgentPanel.tsx`) configured for
 *      the build under test, pointed at that deployed endpoint.
 *   4. An explicit opt-in env var for this specific suite, e.g. `E2E_DEPLOYED_EUREKA_TOOL_CALL=1`
 *      — mirroring this repo's `RUN_LIVE_PROVIDER_TESTS`-style convention of never running a
 *      real-network suite just because some other precondition (a key, a URL) happens to be set.
 *
 * Until all four are true, this suite must stay `describe.skip` — it must never be reported as
 * passing, and must never be presented as evidence of a working production path.
 */
describe.skip('browser tool-calling — production E2E (placeholder, gated on Playwright + a deployed endpoint)', () => {
    it('a real user turn produces a structured tool call that mutates the visible canvas', () => {
        throw new Error(
            'not implemented — requires Playwright/E2E infra (none configured in this repo) plus a ' +
                'deployed eureka-flows-api tool-calling endpoint; see this file’s header comment'
        );
    });
});
