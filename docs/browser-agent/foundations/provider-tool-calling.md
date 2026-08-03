# Provider-Native Tool Calling

Provider-native, tool-capable `LlmGateway` implementations for OpenAI, Gemini, and Anthropic,
plus the verification harness and usage/cost monitoring built on top of them. See
`llm-gateway.md` for the general `LlmGateway` contract and its other implementations; this
document covers what's specific to structured tool calling.

## 1. Why these gateways call providers directly

A **provider-native** gateway sends `ToolDef`s to the LLM provider in that provider's own
tool-calling wire format (OpenAI's `tools`/`tool_calls`, Gemini's `functionDeclarations`/
`functionCall`, Anthropic's `tools`/`tool_use`) and parses the structured response back into the
shared `Chunk` shape.

eureka-flows-api's Generate endpoint (`/runs/0/generate`) is text-only: it accepts a `tools`
field without error but never returns a structured tool call in any request shape tried,
including each provider's own native schema. The existing Generate gateways
(`createGenerateApiSyncLlmGateway`, `createGenerateApiLlmGateway`, `createGeminiLlmGateway`)
correctly declare `capabilities.toolCalls = false` and are unaffected by this work. Provider-native
verification instead calls OpenAI, Gemini, and Anthropic's own APIs directly, behind the same
shared `LlmGateway` contract.

`capabilities.toolCalls` is load-bearing: `BaseAgent` only fetches and sends `ToolExecutor`'s tool
definitions when `capabilities?.toolCalls !== false`. A gateway that declares `toolCalls: false`
would otherwise be sent tool definitions on every turn and throw immediately — `BaseAgent` gates
on this capability flag specifically to keep text-only gateways usable.

## 2. Provider mapping

Each gateway is additive and does not touch any existing text-only gateway.

**OpenAI** (`OpenAiLlmGateway.ts`, also serves **OpenRouter** and any OpenAI-compatible provider
via a `baseUrl` override):
- `ToolDef` → `tools: [{ type: 'function', function: { name, description, parameters } }]`,
  `tool_choice: 'auto'`, omitted when there are no tools.
- Assistant tool-call turn → `{ role: 'assistant', tool_calls: [{ id, type: 'function', function:
  { name, arguments } }] }`; tool-result message → `{ role: 'tool', tool_call_id, content }`.
- Response `tool_calls[].function.arguments` is already a JSON string, mapped straight to
  `Chunk.toolCall.argsDelta` with no re-encoding.

**Gemini** (`GeminiToolLlmGateway.ts`, separate from the text-only `GeminiLlmGateway`):
- `ToolDef` → `tools: [{ functionDeclarations: [...] }]`. Gemini's schema requires uppercase
  OpenAPI `Type` enums (`OBJECT`/`STRING`/...) where `JsonSchema.type` is lowercase; a recursive
  conversion uppercases `type` through nested `properties`/`items`.
- Response `functionCall.args` is a parsed object (not a string like OpenAI's), so it's
  stringified to fit `Chunk.toolCall.argsDelta`. Gemini issues no call id, so one is generated
  per turn.
- Gemini correlates a tool *result* to the call it answers by function **name**, not an id — the
  gateway recovers the name by scanning the assistant tool-call message earlier in the same
  request. A `toolCallId` with no matching entry throws rather than guessing.

**Anthropic** (`AnthropicToolLlmGateway.ts`, native — not an OpenAI-compatible `baseUrl` reuse):
- `ToolDef` → `tools[].input_schema` (plain lowercase JSON Schema, no case conversion needed).
- An assistant tool-call turn becomes a `content[]` block array (a leading `text` block, if any,
  then one `tool_use` block per call); a tool-result message becomes a **user** message carrying a
  `tool_result` block (Anthropic has no separate `role: 'tool'`). Tool results correlate by id
  (`tool_use_id`, matching `ChatMessage.toolCallId` directly) — no name recovery needed.
- Requires `x-api-key`/`anthropic-version` headers and a `max_tokens` field on every request.

All three gateways' multi-turn message mapping (`role: 'tool'` messages, assistant tool-call
turns) is exercised by their own offline test suites, independent of any single-turn-only
verification harness built on top.

## 3. How `ToolExecutor` handles a call

`ToolExecutor.dispatch()` is provider-agnostic — it only ever sees a parsed `{ id, name, args }`:

1. Looks up the tool by name; an unknown name is a failed `ToolResult`, not a throw.
2. Validates `args` against the tool's `JsonSchema`.
3. Checks the tool's `requires` capability against the calling agent's effective permission grant.
4. Dispatches to the matching provider and catches any thrown error into a failed `ToolResult` —
   `dispatch()` never throws, so a malformed model response can't crash the agent loop.

## 4. Verification scenarios

`verifyMoveNodeToolCall` (`verifyProviderToolCall.ts`) is the smallest end-to-end check: seed one
canvas node, prompt a model to move it, assert the gateway emits a structured `move_node` call,
dispatch it through the real `ToolExecutor`, and confirm the node actually moved. The function is
pure (no test-runner assertions inside it), so identical logic runs from both the offline spec and
the env-gated real-key spec.

`verifyLocatorScenarios.ts` extends this into an 11-scenario matrix exercising the real
`LocatorAgent`/`ToolExecutor`/`CanvasBinding`:

| Scenario | What it checks |
| --- | --- |
| `list-nodes-read-only` | A read-only question triggers `list_nodes` with zero canvas mutation |
| `move-node-right/-left/-up/-down` | Each cardinal direction maps to the correct delta via the real `directionToDelta` |
| `move-node-absolute` | An absolute-position instruction produces an exact `to` target |
| `no-tool-refusal` | An unsupported action produces a text refusal, no tool call |
| `unknown-target` | A nonexistent node produces either a text refusal or an executor-rejected call — never a mutation of an unrelated node |
| `selective-multi-node` | Only the named node moves; unrelated nodes stay byte-identical to their seed values |
| `ambiguous-instruction` | An unresolvable reference produces a clarifying question, not a guess |
| `no-op-instruction` | An explicit no-change instruction produces a confirmation with zero mutation |

Multi-turn scenarios (a single instruction requiring two sequential tool calls, e.g. "look up the
node, then move it") are intentionally out of this matrix: it exercises one `gateway.chat()` call
per scenario by design. That is a harness limitation, not a mapping gap — each gateway's own
multi-turn request/response mapping (§2) is implemented and verified independently of this matrix.

Real-provider runners (`realProviderToolCall.spec.ts`, `realLocatorScenarios.spec.ts`) run the
same scenarios against live APIs, gated per-provider on that provider's own API key environment
variable via `describe.runIf`. They are skipped, not failing, whenever the key isn't set —
including in CI, which does not run real-key tests.

## 5. Provider/model support

| Provider | Gateway | Status |
| --- | --- | --- |
| OpenAI | `createOpenAiLlmGateway` | Implemented, real-provider verified |
| Gemini | `createGeminiToolLlmGateway` | Implemented, real-provider verified |
| OpenRouter | `createOpenAiLlmGateway` + `baseUrl` override | Implemented, real-provider verified (OpenAI-wire-compatible, zero new gateway code) |
| Anthropic / Claude | `createAnthropicToolLlmGateway` | Implemented, offline-verified; not yet run against a live key |
| DeepSeek | `createOpenAiLlmGateway` + `baseUrl` override | Registered, offline-wired; not yet run against a live key |
| Qwen | `createOpenAiLlmGateway` + `baseUrl` override | Registered, offline-wired; not yet run against a live key |
| GLM (Z.ai) | `createOpenAiLlmGateway` + `baseUrl` override | Registered, offline-wired; response `tool_calls[].function.arguments` shape not yet confirmed against a captured response |

The full per-provider model list, API key env var name, and any real-verified model ids live in
`libs/agent/src/llm/providerRegistry.ts`, which is the source of truth this table summarizes —
`providerRegistry.spec.ts` enforces structural invariants (env vars never `VITE_`-prefixed,
`realVerifiedModels` only names a model present in `models[]`, non-empty `realVerifiedModels`
implies `status: 'implemented'`).

Registered model ids are fixed, concrete versions rather than provider-side `"latest"` aliases, so
a recorded real-key verification stays a meaningful, checkable claim regardless of what a provider
later calls "latest".

## 6. Usage, cost, and elapsed-time monitoring

`Chunk.usage` (`UsageInfo` in `llmGateway.ts`) is a normalized per-call accounting shape: input
tokens are split into standard/cached/cache-write/tool-use buckets, output tokens into
visible/reasoning buckets, plus provider-reported or locally estimated USD cost. Each gateway is
responsible for making these buckets mutually disjoint before populating the shape — some
providers nest one bucket inside another in their raw response (e.g. a prompt-token count that
already includes cached tokens), so the subtraction happens once, at the gateway boundary.

Cost is computed by a versioned, per-model pricing table (`pricing.ts`) kept outside every gateway
implementation. `estimateCost()` returns `null` — never a fabricated `0` — when the model isn't
registered, the call reported no tokens, a nonzero bucket has no configured rate, or (for
Anthropic) a cache write's billing TTL can't be determined from the response alone. A
provider-reported cost (e.g. OpenRouter's `usage.cost`) is always preferred over a local estimate
when present.

`verificationMetrics.ts` aggregates per-call records into a per-(provider, model) report: scenario
counts by outcome (pass/known-variance/fail/timeout/provider-error), summed token buckets, total
and average cost, and total and average elapsed time. Elapsed time is measured at the call site,
not inside the gateway wrapper, so it stays honest even when a scenario times out or the gateway
throws before its own `finally` block runs. Usage capture is best-effort: if a scenario times out
before its usage arrives, the usage field is `null` for that scenario — indistinguishable from (and
reported the same as) a provider that never returns usage at all, never fabricated as zero.

## 7. Security: provider keys never reach the browser

`vite.config.mts`'s `htmlEnvInjectionPlugin` injects `window.<VAR>` into `index.html` for every
`VITE_`-prefixed env var, so a `VITE_`-prefixed provider key would leak into page source visible
to anyone who views it. Rules that follow:

- Every provider's API key env var (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
  `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, `GLM_API_KEY`) and its optional
  `<PROVIDER>_TEST_MODEL` override are read via `process.env.*` only in Node contexts (vitest
  specs), never as a `VITE_`-prefixed var — enforced by an offline test for every registered
  provider, not just documented in prose.
- These env vars must not appear in `apps/web/.env.example`, which documents vars meant to be
  bundled into the browser build.
- Each gateway redacts its own key out of any thrown error before it propagates, so a provider or
  proxy that echoes request data back in an error can't leak the key through that path either.
  Keys are never traced or logged.

## 8. Running the verification suite

```sh
# Offline suite (no keys needed)
npx nx test agent

# Real-key run for one provider (skipped automatically without the key)
OPENAI_API_KEY=sk-... npx nx test agent --skip-nx-cache -- realLocatorScenarios
GEMINI_API_KEY=... GEMINI_TEST_MODEL=gemini-2.5-pro npx nx test agent --skip-nx-cache -- realLocatorScenarios
```

`<PROVIDER>_TEST_MODEL` narrows a real-key run to one model instead of every model registered for
that provider.

## 9. Known limitations

- Structured tool calling has only been verified single-turn (one `gateway.chat()` call per
  scenario). Multi-turn round-trip verification (a scenario that feeds a tool result back and
  checks a follow-up tool call) is not yet part of this harness.
- Real-key verification runs locally, on demand, against a provider's live API — there is no CI
  job that runs these, since that would require committing provider keys to CI secrets.
- Gemini has an observed tendency to call `list_nodes` before committing to the tool a scenario
  expects, even when the per-turn context it already received should make the lookup unnecessary.
  The verification scoring records this as an accepted alternate outcome, not a silent pass or a
  hard failure.
- DeepSeek, Qwen, and GLM are registered but have no real-key verification yet. GLM specifically
  has an unconfirmed claim about its response `arguments` field shape (string vs. parsed object)
  that needs a captured response to resolve before its reused-OpenAI-gateway assumption can be
  trusted beyond documentation.
- A general-purpose "forward any `ChatRequest` to a real provider and stream back `Chunk`s" proxy,
  which would let a real chat UI drive a live multi-turn conversation through one of these
  providers, does not exist — the verification harness runs one fixed scenario per call, not
  arbitrary chat.
