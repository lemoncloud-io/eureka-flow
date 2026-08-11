# eureka-flows-api Tool-Calling Endpoint Contract

**Status: implementation contract for the eureka-flows-api backend team. The endpoint described
here is NOT deployed.** `createEurekaToolCallLlmGateway.ts` (`apps/web/src/app/features/flows/utils/`)
is the real, typed, offline-tested browser client for this contract — see its module doc and
`createEurekaToolCallLlmGateway.contract.spec.ts` for the client-side proof. Nothing in this
document should be read as describing a live, reachable service. Selecting this path in the
browser app requires `VITE_EUREKA_TOOL_CALL_ENDPOINT` to be explicitly set (see
`FlowAgentPanel.tsx`); it is off by default specifically so the app never depends on this
undeployed endpoint by accident.

This is the single source of truth for the wire contract. If this document and the browser
client's TypeScript types (`EurekaToolCallRequest` / `EurekaToolCallResponse` /
`EurekaToolCallErrorBody` in `createEurekaToolCallLlmGateway.ts`) ever disagree, the code is
current and this document is stale — update this document, not the other way around.

## 1. Endpoint

```
POST /api/v1/llm/tool-calls
```

Chosen to match this repo's existing eureka-flows-api call sites under `libs/flows/src/api/*.ts`
(a versioned `/api/v1/...` prefix) and to sit alongside the existing text-only Generate endpoint
(`/runs/0/generate`) as a distinct, tool-capable sibling rather than a breaking change to it. The
browser client's own default path (`DEFAULT_ENDPOINT_PATH` in `createEurekaToolCallLlmGateway.ts`)
is currently the unversioned `/llm/tool-calls` and is passed as `endpointPath` at gateway
construction time — whichever path the backend team actually deploys, the app's call site
(`FlowAgentPanel.tsx`, `VITE_EUREKA_TOOL_CALL_ENDPOINT`) supplies it without a gateway code change.

Single request/response, non-streaming — no SSE/websocket framing required for a first version
(the browser gateway does a plain `POST` and reads a JSON body, not a stream).

## 2. Authentication requirements

Reuse the app's existing session mechanism: the browser sends the same `x-api-key` header every
other authenticated eureka-flows-api call already sends (`libs/web-core/src/api/client.ts`'s
Axios interceptor). No new auth scheme, no separate token, no provider credential ever
originates from or passes through the browser. A missing/invalid/expired `x-api-key` is a normal
401, handled exactly like every other eureka-flows-api call (session-expired flow already exists
client-side).

## 3. Request JSON Schema

```json
{
  "type": "object",
  "required": ["requestId", "provider", "requestedModel", "messages", "tools"],
  "additionalProperties": false,
  "properties": {
    "requestId": { "type": "string", "description": "Client-generated, echoed back verbatim for correlation/idempotency/logging." },
    "provider": { "type": "string", "enum": ["openai", "gemini", "openrouter", "anthropic", "deepseek", "qwen", "glm"] },
    "requestedModel": { "type": "string", "description": "Checked against the provider's model allowlist server-side; the browser does not enforce one." },
    "messages": {
      "type": "array",
      "maxItems": 200,
      "items": {
        "type": "object",
        "required": ["role"],
        "properties": {
          "role": { "type": "string", "enum": ["system", "user", "assistant", "tool"] },
          "content": { "type": ["string", "null"] },
          "toolCalls": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "name", "args"],
              "properties": {
                "id": { "type": "string" },
                "name": { "type": "string" },
                "args": {}
              }
            }
          },
          "toolCallId": { "type": "string" }
        }
      }
    },
    "tools": {
      "type": "array",
      "maxItems": 32,
      "items": {
        "type": "object",
        "required": ["name", "description", "parameters"],
        "properties": {
          "name": { "type": "string", "pattern": "^[a-zA-Z0-9_]{1,64}$" },
          "description": { "type": "string" },
          "parameters": { "type": "object", "description": "A JSON Schema object, max 16KB serialized." },
          "requires": { "type": "string" }
        }
      }
    },
    "generation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "temperature": { "type": "number" },
        "maxOutputTokens": { "type": "number" }
      }
    }
  }
}
```

This is exactly the shape `EurekaToolCallRequest` in `createEurekaToolCallLlmGateway.ts` sends —
`messages`/`tools` are the shared `ChatRequest['messages']`/`ToolDef[]` types from
`@flows/agent`'s `llmGateway.ts`, unchanged. The request contains **only** these fields — no
provider base URL, no authorization header, no API key, no arbitrary passthrough field. Anything
else in the body should be rejected (`additionalProperties: false`), not silently ignored.

## 4. Response JSON Schema

Success:

```json
{
  "type": "object",
  "required": ["requestId", "chunks"],
  "properties": {
    "requestId": { "type": "string" },
    "chunks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "toolCall": {
            "type": "object",
            "required": ["id", "name", "argsDelta"],
            "properties": {
              "id": { "type": "string" },
              "name": { "type": "string" },
              "argsDelta": { "type": "string", "description": "A JSON-encoded string, not a parsed object — matches every provider-native gateway's convention." }
            }
          },
          "done": { "type": "boolean" },
          "actualModel": { "type": "string", "description": "The model that actually served the request — required whenever it can differ from requestedModel (e.g. any OpenRouter route)." },
          "usage": {
            "type": "object",
            "properties": {
              "inputTokens": { "type": "number" },
              "cachedInputTokens": { "type": "number" },
              "cacheWriteInputTokens": { "type": "number" },
              "cacheWriteTtl": { "type": "string", "enum": ["5m", "1h", "unknown"] },
              "outputTokens": { "type": "number" },
              "reasoningTokens": { "type": "number" },
              "toolUseInputTokens": { "type": "number" },
              "providerTotalTokens": { "type": "number" },
              "providerReportedCost": { "type": ["number", "null"] },
              "estimatedCost": { "type": ["number", "null"] },
              "costSource": { "type": "string", "enum": ["provider-reported", "estimated"] },
              "pricingVersion": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

This is exactly `EurekaToolCallSuccessResponse` — `chunks: Chunk[]`, the *same* normalized shape
every provider-native gateway (`OpenAiLlmGateway`, `GeminiToolLlmGateway`,
`AnthropicToolLlmGateway`) already yields from `libs/agent`. The backend's job is to run its own
provider-native mapping (see `provider-tool-calling.md` §2 for the exact per-provider wire
mapping each of those gateways already implements) and hand back `Chunk[]` in this same shape —
not a new format the browser has to learn.

Error (a **well-formed**, understood failure — distinct from a raw non-2xx HTTP response, see §5):

```json
{
  "type": "object",
  "required": ["requestId", "error"],
  "properties": {
    "requestId": { "type": "string" },
    "error": {
      "type": "object",
      "required": ["code", "message"],
      "properties": {
        "code": { "type": "string" },
        "message": { "type": "string", "description": "Already sanitized — never a raw provider error body, stack trace, or key." }
      }
    }
  }
}
```

Matches `EurekaToolCallErrorResponse` / `EurekaToolCallErrorBody` exactly.

## 5. Normalized error schema / categories

`error.code` is a stable, provider-neutral, machine-readable string. Fixed set for a first
version:

| code | Meaning | Typical HTTP status |
|---|---|---|
| `auth_error` | Session auth failed (should be rare — normally caught by the existing 401 flow before reaching this endpoint's own logic) | 401 |
| `model_not_allowed` | `provider`/`requestedModel` combination is not on the server-side allowlist | 400 |
| `invalid_request` | Request fails schema validation (§3), exceeds a size/count limit (§8-11), or has a malformed tool schema | 400 |
| `provider_error` | The upstream provider returned an error (safety block, invalid provider-side request, 5xx, etc.) | 502 |
| `rate_limited` | Upstream provider or this endpoint's own rate limit was hit | 429 |
| `timeout` | The provider call did not complete within the timeout policy (§12) | 504 |

The browser client (`isEurekaToolCallResponse` in `createEurekaToolCallLlmGateway.ts`) only
requires `requestId` + (`error` XOR `chunks`) — additional fields on the error body beyond
`code`/`message` are ignored, not rejected, so the backend is free to add optional diagnostic
fields later without a client-side contract break.

A non-2xx HTTP status with a body that does **not** match this error schema is treated by the
client as `EurekaToolCallHttpError`, not `EurekaToolCallProviderError` — the backend should
prefer always returning a 200 with a well-formed `error` body for understood failures, reserving
raw non-2xx statuses for cases where even producing a JSON body failed.

## 6. Authentication requirements (backend side)

Validate the same session `x-api-key` every other eureka-flows-api endpoint validates. Do not
introduce a second auth scheme for this endpoint alone.

## 7. Provider allowlist

Fixed, server-side, versioned with deploys — not client-configurable. Initial recommended set
matches `libs/agent/src/llm/providerRegistry.ts`'s `PROVIDER_REGISTRY` entries: `openai`,
`gemini`, `openrouter`, `anthropic`, `deepseek`, `qwen`, `glm`. The browser sends a plain string;
rejecting an unlisted value is `model_not_allowed`, never a silent fallback to a default provider.

## 8. Model allowlist

Server-side, per provider, fixed at deploy time — see `libs/agent/src/llm/modelManifest.ts` for
this repo's own curated candidate list (with discovery source/timestamp per model) as a starting
point; the backend's allowlist does not have to be identical to it, but should be a deliberate,
reviewed list, not "anything the provider currently exposes."

## 9. Preview-model restrictions

Preview/experimental model ids (e.g. anything with a `-preview` suffix) may be allowlisted for
benchmarking but should be flagged distinctly (e.g. a `preview: true` marker in whatever internal
config drives the allowlist) so a client requesting one gets a normal successful response, not an
implicit promise of production stability — preview models are subject to upstream rename/retire
without notice.

## 10. Request-size limits

- Total serialized request body: 256 KB.
- See §11/§3 for message/tool count and per-schema size limits specifically.

## 11. Maximum message count / maximum tool count / maximum JSON Schema size

- `messages`: max 200 entries (matches §3's schema `maxItems`).
- `tools`: max 32 entries.
- Each tool's `parameters` (a JSON Schema object): max 16 KB serialized.

Reject with `invalid_request` (400) if exceeded — do not silently truncate.

## 12. Timeout policy

Recommended default: 60s per request, matching a generous real-provider call (some scenarios,
e.g. an OpenRouter free-tier route, are measurably slower — see
`ProviderModelEntry.realTestTimeoutMs` in `providerRegistry.ts` for this repo's own per-provider
timeout overrides used during verification). On timeout, respond with the `timeout` error code
(§5) rather than leaving the connection open past the browser's own client timeout. Note the
browser's Axios client (`libs/web-core/src/api/client.ts`) already applies a 30s client-side
timeout to every request including this one — a backend timeout longer than 30s will simply never
be observed by the browser as anything other than its own client timeout, so backend and client
timeout values should be kept coherent (either shorten the backend timeout to comfortably under
30s, or the browser client's timeout for this specific endpoint should be raised — a decision for
whoever owns the deploy, not assumed here).

## 13. Retry policy

Retries (if any) happen server-side, against the upstream provider, before responding to the
browser — the browser client does not retry a failed call itself. Recommended: at most 1 retry
for a transient upstream 5xx/network failure, none for a 4xx (client/request error) or a safety
block. Never retry silently past the client's own request lifetime/AbortSignal (§14).

## 14. Cancellation behavior

The browser sends `AbortSignal`-driven cancellation as an aborted HTTP request (a closed
connection), exactly like every other Axios call in this app — no special cancellation message
format. The backend should treat a client-disconnected request as a signal to stop waiting on
(and ideally cancel, if the provider SDK supports it) the upstream provider call, to avoid paying
for/generating a response nobody will read.

## 15. Rate-limit requirements

Apply a per-session (per `x-api-key`) rate limit to this endpoint independent of upstream
provider rate limits, so one session cannot exhaust shared provider quota for all users. Exact
numbers are a backend-team/product decision; the browser client itself imposes no client-side
throttling.

## 16. Concurrency requirements

No specific concurrency requirement from the browser side — `FlowAgentPanel` issues one
`gateway.chat()` call per agent turn, awaited to completion before the next. The backend should
size its own upstream-provider connection pool/concurrency independent of this.

## 17. Secret-handling requirements

Provider API keys live only in backend-side secret storage/config (Node-only env vars, following
this repo's own `apiKeyEnv` convention in `providerRegistry.ts` — never a `VITE_`-prefixed var,
never sent to or readable by the browser). The response body (§4) must never include a provider
key or authorization header value in any field, including `error.message` — sanitize any raw
provider error text before it reaches `message`.

## 18. Logging and redaction requirements

Server-side logs may include `requestId`, `provider`, `requestedModel`, `actualModel`, usage/cost
fields, and elapsed time. Logs must never include: the raw provider API key, the full raw
provider request/response body verbatim (a sanitized summary is fine), or full tool-call
arguments if they could plausibly contain user-sensitive canvas data — log tool *names*, not
necessarily full `args`, unless a redaction pass is applied first. This mirrors
`AgentTraceReporterSupportable`'s own rule client-side (`libs/agent/src/environment/types.ts`):
"Reporters must never log secrets or API keys."

## 19. Usage-normalization requirements

`usage` on each `Chunk` must use the same disjoint-bucket accounting `UsageInfo` already defines
(`libs/agent/src/llm/llmGateway.ts`): `inputTokens`, `cachedInputTokens`,
`cacheWriteInputTokens`(+`cacheWriteTtl`), `outputTokens`, `reasoningTokens`,
`toolUseInputTokens`, `providerTotalTokens` (raw provider total, diagnostic only — never used as
the addable total), `providerReportedCost`/`estimatedCost`/`costSource`/`pricingVersion`. Never
fabricate a `0` for a field the provider didn't report — omit it, matching every provider-native
gateway's existing convention (`verificationMetrics.ts`'s aggregation explicitly treats missing
totals as "incomplete", never coerces to zero).

## 20. Actual-model reporting requirements

`Chunk.actualModel` must be populated whenever the provider's own response identifies which model
actually served the request, and is **required** (not optional in practice) for any
dynamic-routing provider path (e.g. an OpenRouter route like `openrouter/free`) — see
`providerRegistry.ts`'s `OPENROUTER_ENTRY` notes and `verificationMetrics.ts`'s
`aggregateByActualModel` for why this repo treats `requestedModel` and `actualModel` as two
separate, both-required-for-reporting fields rather than one.

## 21. Provider error categories

The backend's own provider-native call may fail for reasons an upstream SDK/HTTP call
distinguishes (auth, invalid request, model unavailable, rate limit, timeout, safety block, no
candidates, malformed response) — map all of these into the fixed `error.code` set in §5 before
responding; do not pass through a provider-specific error shape or string verbatim.

## 22. Example request and response

Request:

```json
{
  "requestId": "req-7f3c1e2a",
  "provider": "openai",
  "requestedModel": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "You can move nodes on a canvas." },
    { "role": "user", "content": "Move the text input node 100px to the right." }
  ],
  "tools": [
    {
      "name": "move_node",
      "description": "Move an existing node by a relative delta or to an absolute position.",
      "parameters": { "type": "object", "properties": { "nodeId": { "type": "string" } } }
    }
  ]
}
```

Success response:

```json
{
  "requestId": "req-7f3c1e2a",
  "chunks": [
    {
      "toolCall": { "id": "call_1", "name": "move_node", "argsDelta": "{\"nodeId\":\"text-1\",\"by\":{\"dx\":100,\"dy\":0}}" },
      "actualModel": "gpt-4o-mini-2024-07-18",
      "usage": { "inputTokens": 412, "outputTokens": 18, "costSource": "provider-reported", "providerReportedCost": 0.00009, "pricingVersion": "2026-08" },
      "done": true
    }
  ]
}
```

Error response (disallowed model):

```json
{
  "requestId": "req-7f3c1e2b",
  "error": { "code": "model_not_allowed", "message": "requestedModel is not on the allowlist for provider openai" }
}
```

## 23. Browser integration expectations

- The browser never sends a provider API key, arbitrary base URL, or arbitrary authorization
  header — `createEurekaToolCallLlmGateway.ts`'s own contract spec
  (`createEurekaToolCallLlmGateway.contract.spec.ts`) asserts this directly against a real scripted
  HTTP server.
- The browser treats `chunks` as the complete, final result of one `chat()` call (this is a
  single-shot, non-streaming HTTP integration today, not SSE) — every chunk is yielded in order,
  then the async generator completes.
- A structured `toolCall` in any yielded chunk flows through the exact same path as every other
  gateway: `BaseAgent` → `ToolExecutor.dispatch` (name allowlist, arg schema validation, capability
  gate) → the real `CanvasBinding` — this endpoint's job ends at producing a normalized `Chunk`,
  never at deciding whether a mutation is allowed.

## 24. Backend acceptance criteria

Before this endpoint is considered ready for the browser feature flag to be turned on in any
environment:

1. Request/response bodies validate against §3/§4 exactly (verified by a contract test the
   backend team owns, mirroring `createEurekaToolCallLlmGateway.contract.spec.ts`'s expectations
   from the client side).
2. Provider/model allowlist (§7/§8) enforced server-side, returning `model_not_allowed` for an
   unlisted combination.
3. No provider credential, raw provider error body, or authorization header ever appears in a
   response body or in a log line reachable by anything other than backend-internal, redacted
   logging (§17/§18).
4. `actualModel` is populated for at least one dynamic-routing provider path end-to-end (e.g. an
   OpenRouter model) — not just for providers where `requestedModel` always equals `actualModel`.
5. Usage/cost fields (§19) follow the disjoint-bucket, never-fabricated-zero convention.
6. Timeout (§12) and cancellation (§14) behave as specified under an artificially slow/hung
   upstream provider call in a backend-side test.
7. A structured tool call round-trips through a real `POST` → real `ToolExecutor.dispatch` → real
   canvas mutation in a browser-side integration/E2E test (see
   `browserToolCalling.production.e2e.spec.ts` for the placeholder this repo already has, gated on
   this endpoint actually being reachable).

Only once all seven are true should `VITE_EUREKA_TOOL_CALL_ENDPOINT` be set in any deployed
environment's build config.
