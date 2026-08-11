# LLM Tool-Calling Production Readiness — Current Source of Truth

**As of commit `3b31a90` (plus this review's uncommitted changes), run 2026-08-04.**
This document supersedes any contradictory
architecture/status claims elsewhere — where an older doc still says something different, treat
this document as current and the other as historical (marked as such below, not deleted).

**Headline status: NOT production-ready.** The eureka-flows-api tool-calling endpoint this
architecture depends on is not deployed. Nothing in this document should be read as claiming a
live, working, deployed production path — see §9 for exactly what is real vs. still blocked.

## 1. Architecture

```
Browser (apps/web)
  FlowAgentPanel.tsx → createProductionGateway()
    ├─ default: createGenerateApiLlmGateway  (text-only, socket-delivered — existing, unaffected)
    └─ if VITE_EUREKA_TOOL_CALL_ENDPOINT set:
       createEurekaToolCallLlmGateway  (tool-capable, HTTP)
         → POST <endpointPath> via @flows/web-core's `api` (session x-api-key auth, ~30s timeout)
           → eureka-flows-api tool-calling endpoint  [NOT DEPLOYED — see §2]
             → server-side provider gateway (mirrors libs/agent's provider-native mapping)
               → real provider (OpenAI / Gemini / OpenRouter / Anthropic / ...)
           ← normalized Chunk[] (text / structured tool call / usage / actualModel / cost)
  ← BaseAgent.collect() → ToolExecutor.dispatch() → real CanvasBinding mutation
  ← recorded via verificationMetrics.ts-style usage/cost/elapsed capture (client-side today;
    the same shape a future eureka-flows-api response should carry, per the contract doc)
```

`libs/agent`'s provider-native gateways (`OpenAiLlmGateway`, `GeminiToolLlmGateway`,
`AnthropicToolLlmGateway`) are a separate, parallel path used only by this repo's own
verification/benchmark test suites (§6, layer D) — never called from the running browser app.
They exist to verify what a provider-native mapping should look like; eureka-flows-api's backend
is expected to implement an equivalent mapping server-side (see §2).

## 2. Browser/server security boundary

- The browser never holds, sends, or can be configured with a provider API key. Every provider
  key env var (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
  `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, `GLM_API_KEY`) is Node-only, read only in vitest specs, never
  `VITE_`-prefixed (`vite.config.mts`'s `htmlEnvInjectionPlugin` would otherwise leak a
  `VITE_`-prefixed var into page source — see `provider-tool-calling.md` §7).
- The browser never sends an arbitrary provider base URL or arbitrary authorization header — only
  a `provider`/`requestedModel` string pair, checked server-side against an allowlist (see the
  contract doc, §5/§7-9) that this repo does not enforce client-side.
- Session auth (`x-api-key`) is the _only_ auth mechanism `createEurekaToolCallLlmGateway` uses —
  inherited from `@flows/web-core`'s shared Axios client, not reinvented.
- `createEurekaToolCallLlmGateway.contract.spec.ts` asserts, against a real (scripted) HTTP
  boundary, that no request body ever contains anything resembling an API key or bearer token.

**eureka-flows-api dependency status: the tool-calling endpoint is NOT deployed.**
`docs/browser-agent/design/eureka-tool-calling-endpoint-contract.md` is an implementation
contract for the eureka-flows-api backend team — it describes what to build, not something already
live. `VITE_EUREKA_TOOL_CALL_ENDPOINT` is unset by default specifically so the browser app never
depends on this by accident (falls back to the existing text-only socket gateway).

## 3. Gateway responsibilities

| Layer                                      | Owns                                                                                                                                                | Never does                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `createEurekaToolCallLlmGateway` (browser) | Request serialization, response validation, error typing, `AbortSignal`, capability declaration                                                     | Hold/send a provider key, pick an arbitrary endpoint/base URL, retry, parse provider-native wire formats |
| eureka-flows-api (server, not built)       | Auth check, provider/model allowlist, provider-native request/response mapping, retry/timeout, secret storage, usage/cost/actualModel normalization | Trust an unlisted provider/model, leak a key or raw provider error body                                  |
| `ToolExecutor` (`libs/agent`)              | Tool-name allowlist, arg schema validation, capability gate (agent grant AND user permission ceiling), safe dispatch                                | Execute based on model-claimed text, trust an unvalidated tool name/args                                 |

## 4. Tool-execution responsibilities

Every structured tool call — regardless of which gateway produced it — flows through the same
real `ToolExecutor` (`libs/agent/src/tools/toolExecutor.ts`), never a test-only stand-in:
name lookup → `validateArgs` (hand-rolled JSON-Schema validator, malformed/missing args rejected,
never throws) → double capability gate (agent's fixed `grant` AND the caller's `userPermissions`
ceiling) → provider dispatch, with any thrown error caught into a failed `ToolResult`. Duplicate
streamed-chunk tool-call ids merge safely by design (`BaseAgent.collect()`, regression-tested in
`baseAgent.spec.ts`) — a colliding id degrades to a schema-validation rejection, never an
unintended second dispatch.

## 5. Model manifest

`libs/agent/src/llm/modelManifest.ts` (built on `providerRegistry.ts`). As of 2026-08-04:

| Provider   | Fixed models                                                                                                                                                                     | Dynamic routes        | Discovery source                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| OpenAI     | 4 (`gpt-4o-mini`, `gpt-4.1-mini`, `gpt-5-mini`, `gpt-4.1`)                                                                                                                       | —                     | provider docs / eureka's own model catalog / OpenRouter Models API (cross-corroboration) |
| Gemini     | 5 (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3-flash-preview`_, `gemini-2.5-flash-lite`, `gemini-3.1-pro-preview`_)                                                          | —                     | same as above (`*` = preview)                                                            |
| OpenRouter | 6 (`openai/gpt-4o-mini`, `google/gemini-2.5-flash`, `anthropic/claude-haiku-4.5`, `openai/gpt-oss-20b:free`, `meta-llama/llama-3.3-70b-instruct`, `deepseek/deepseek-chat-v3.1`) | 1 (`openrouter/free`) | OpenRouter public Models API (`GET https://openrouter.ai/api/v1/models`, no auth)        |
| DeepSeek   | 2 (planned, offline-wired only)                                                                                                                                                  | —                     | DeepSeek's own migration notice                                                          |
| Qwen       | 3 (planned, offline-wired only)                                                                                                                                                  | —                     | Alibaba Cloud Model Studio docs                                                          |
| Anthropic  | 2 (`claude-haiku-4-5`, `claude-sonnet-5`; planned, offline-wired only)                                                                                                           | —                     | Anthropic's own pricing/models pages                                                     |
| GLM (Z.ai) | 2 (planned, offline-wired only)                                                                                                                                                  | —                     | Z.ai's own API reference / general web search (lower confidence)                         |

Meets the benchmark-breadth target (>=4 OpenAI, >=5 Gemini, >=6 fixed OpenRouter, `openrouter/free`
tracked separately) — enforced as a regression guard by `modelManifest.spec.ts`. `openrouter/free`
is never aggregated as one model: its results are always separated by `Chunk.actualModel`
(`aggregateByActualModel` in `verificationMetrics.ts`).

No live discovery/qualification run has executed this session (§9) — every row above is
`configured`/`offline-verified`, except `gpt-4o-mini` (OpenAI), `gemini-2.5-flash` (Gemini), and
`openrouter/free` (OpenRouter), which carry a prior `live-verified` result from an earlier session
(dated in `providerRegistry.ts`'s own notes) — historical, not re-confirmed today.

## 6. Qualification policy

A model may be marked **QUALIFIED** only when all of the following are true: (1) a live-provider
qualification run actually executed against it in this or a prior dated session; (2) the positive
scenario matrix passed; (3) negative-control behavior was acceptable; (4) no severe malformed-tool
-call issue remains; (5) usage and `actualModel` were captured correctly; (6) the production
browser E2E (layer E, §7) passed through a _deployed_ eureka-flows-api; (7) no provider key was
ever exposed to the browser.

States: `QUALIFIED` · `CONDITIONAL` · `FAILED` · `NOT RUN` · `UNAVAILABLE` · `PREVIEW ONLY` ·
`DYNAMIC ROUTE` · `BLOCKED BY API DEPLOYMENT`.

**Current qualification, this session: every model is `NOT RUN` (no live keys present) or
`BLOCKED BY API DEPLOYMENT` (criterion 6 — the endpoint doesn't exist).** Nothing is `QUALIFIED`
today, including `gpt-4o-mini`/`gemini-2.5-flash`/`openrouter/free`, despite their historical
live-verified provider-native results — criterion 6 alone blocks all of them, since no production
E2E has ever run against a deployed endpoint.

## 7. Test layers (with exact paths)

| Layer                                | Purpose                                                                                            | Files                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Unit                              | Agent control flow, scoring, metrics, chart, tool-selection logic — `FakeGateway`/scripted allowed | `libs/agent/src/__tests__/llm/{verificationMetrics,verifyLocatorScenarios,verifyProviderToolCall,modelManifest,classifyRealProviderResult,pricing}.spec.ts`, `libs/agent/src/__tests__/agents/*.spec.ts` |
| B. Provider adapter contract         | Request construction/response parsing per provider, scripted HTTP                                  | `libs/agent/src/__tests__/llm/{OpenAiLlmGateway,GeminiToolLlmGateway,AnthropicToolLlmGateway,providerRegistry}.spec.ts`                                                                                  |
| C. eureka-flows-api browser contract | Real HTTP boundary (local scripted server), never `FakeGateway`                                    | `apps/web/src/app/features/flows/utils/createEurekaToolCallLlmGateway.contract.spec.ts`                                                                                                                  |
| D. Live-provider qualification       | Real gateways, real HTTP, real models, env-gated per provider key                                  | `libs/agent/src/__tests__/llm/{realLocatorScenarios,realProviderToolCall}.spec.ts`                                                                                                                       |
| E. Production browser E2E            | Deploy-gated, real browser → deployed backend → real provider → canvas                             | `apps/web/src/app/features/flows/utils/browserToolCalling.production.e2e.spec.ts` — **placeholder only, always skipped; no Playwright/E2E framework exists in this repo yet**                            |

## 8. Live evidence

**None generated this session — explicitly.** `OPENAI_API_KEY`, `GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, `GLM_API_KEY`, and
`RUN_LIVE_PROVIDER_TESTS`-equivalent gating were all confirmed unset in this environment before
any work began. Prior sessions' live evidence (dated in `providerRegistry.ts`'s own per-entry
notes — e.g. OpenAI `gpt-4o-mini`, Gemini `gemini-2.5-flash`, OpenRouter `openrouter/free`) remains
in the repo as historical record; it is not re-confirmed by this review and must not be read as
current.

To generate real evidence (exact, safe commands — no key value is ever printed by these):

```sh
# Offline suite only (no keys, no network) — safe to run any time
npx nx test agent

# One provider's live qualification (skipped automatically if the key is absent)
OPENAI_API_KEY=sk-... npx nx test agent --skip-nx-cache -- realLocatorScenarios
GEMINI_API_KEY=... npx nx test agent --skip-nx-cache -- realLocatorScenarios
OPENROUTER_API_KEY=... OPENROUTER_TEST_MODEL=openrouter/free npx nx test agent --skip-nx-cache -- realLocatorScenarios

# Narrow to one model instead of every model registered for a provider
GEMINI_API_KEY=... GEMINI_TEST_MODEL=gemini-2.5-pro npx nx test agent --skip-nx-cache -- realLocatorScenarios
```

`RUN_LIVE_PROVIDER_TESTS`-style opt-in note: this repo's actual convention gates each provider on
its own `<PROVIDER>_API_KEY` presence (`describe.runIf(!!apiKey)` per provider/model, see
`realLocatorScenarios.spec.ts`) rather than one blanket flag — functionally equivalent (a live
call only ever happens with an explicit, provider-specific key present), just per-provider instead
of global. No cost guard (`BENCHMARK_MAX_COST_USD`-style env var) exists yet for this harness; the
matrix is small (11 scenarios per model) and sequential, so a rough upper bound is: 11 scenarios ×
~1 short chat completion each × the cheapest configured model per provider — estimate before
running with a real, funded key, and never assume a key being present is itself permission to run.

## 9. Known limitations

- No live provider calls were made this session (no keys present) — see §8 for exact commands to
  do so.
- No production browser E2E can pass — the eureka-flows-api endpoint isn't deployed and no
  browser-automation framework is configured in this repo (§7, layer E).
- Structured tool calling is verified single-turn only (`provider-tool-calling.md` §9) — multi-turn
  tool-result round trips are not covered by the scenario matrix.
- DeepSeek/Qwen/Anthropic/GLM remain `status: 'planned'` (offline-wired, never real-key-verified).
- Gemini's fine-grained failure classification (`classifyGeminiFailureCategory`) cannot distinguish
  "no candidates" from "malformed response" — `GeminiToolLlmGateway.ts`'s own diagnostic string
  covers both uniformly; splitting them needs a gateway change, deferred until a real failure
  actually needs it (see the classifier's own doc comment).
- The eureka-flows-api tool-calling endpoint contract (this review's Phase 3 deliverable) is an
  implementation proposal the backend team has not yet reviewed or built against — path, exact
  limits, and error-code set may still change during that review.

## 10. Deployment blocker status

**BLOCKED BY API DEPLOYMENT.** The single blocking dependency for any part of this architecture to
be genuinely production-ready is eureka-flows-api's tool-calling endpoint
(`docs/browser-agent/design/eureka-tool-calling-endpoint-contract.md`) going from
"implementation contract" to "deployed and passing its own acceptance criteria (§24 of that
doc)". Until then: `VITE_EUREKA_TOOL_CALL_ENDPOINT` must stay unset in every real deployment,
layer E stays a skipped placeholder, and no model may be marked `QUALIFIED` regardless of its
provider-native live-verification history.

## Related documents

- `docs/browser-agent/design/tool-calling-integration-handoff.md` — the consolidated
  engineering handoff for this work: architecture, implemented-vs-prototype-vs-proposed status,
  verification evidence, the proposed production flow, open technical decisions, a prioritized
  remaining-work checklist, and exact verification commands. Use that document as the primary
  reference for onboarding onto this work; use this document for the current qualification-policy
  detail it covers that the handoff only summarizes.

## Historical documents

- `docs/browser-agent/design/provider-tool-calling.md` — still accurate for what it covers
  (provider-native gateway wire mapping, `ToolExecutor` contract, offline/real-key test commands
  for `libs/agent`'s own verification harness); §10 there now points here for the browser/backend
  picture it didn't originally cover. Not superseded, just narrower in scope than this document.
