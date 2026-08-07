# Change note — remove the Agent Environment

**Status:** planned · **Branch:** `feat/agent-observability` (from `develop`)
**Type:** transition/how-to (a→b). The clean end-state for tracing lives in [trace-spec.md](./trace-spec.md); this note is the migration that makes "no `environment/`" true.
**Provenance:** grounded in a 9-agent removal audit (6 facet mappers + 3 adversarial completeness critics) over the whole repo. Every consumer below was verified by grep+read, not recollection.

## Why

`AgentEnvironmentSupportable` is a convenience god-object bundling seven things — `storage`, `traceReporter`, `now`, `capabilities`, `runtime`, `createAbortController`, `close`. The audit confirmed:

- The **agent core uses none of it** (`agents/`, `tools/`, `canvas/`, `session/` never import it).
- Only **three members are live**: `storage` (web session persistence), `traceReporter` (gateway + web), `now` (gateway timing). The other four are inert — never read, never called.
- Each real consumer wants only **one or two discrete ports**, not the bundle.

The composite violates SRP and forces DIP violations on consumers (depend on a fat bundle to get one port). Removing it and injecting discrete ports is the SOLID-correct end-state.

## Sequencing — split by dependency (the key decision)

The two halves of the removal relate differently to the **new `Tracer`** we are adding (observability spec), so they are sequenced differently:

- **Track 1 — storage.** Independent of trace, and nothing replaces it → a pure mechanical extraction, done **first and standalone**.
- **Track 2 — trace + composite.** Our own `Tracer` **replaces** the old `AgentTraceReporterSupportable`. Rehoming the old reporter into an interim module would be throwaway motion — so we **delete it as the new Tracer supersedes it**, folded into the observability implement. The environment composite dies here too, because its last live member (`traceReporter`) is only gone once the gateway + web are migrated off it.

Rationale (DRY / no-throwaway): storage has no replacement, so it moves once and stays; the old trace has a replacement, so it is replaced-in-place, never rehomed.

## Symbol disposition

| Outcome                                                                                                                          | Symbols                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MOVE → `libs/agent/src/storage/`** (Track 1, permanent)                                                                        | `AgentStorageSupportable` (name kept), `createMemoryAgentStorage`, `createBrowserAgentStorage`, `WebStorageLike`, the `json.ts` helpers                                                                                                                                                                                                      |
| **REPLACE** (Track 2 — deleted as the observability `Tracer`/`NoopTracer`/`memorySink`/`redact` supersede them; **not rehomed**) | `AgentTraceReporterSupportable`, `AgentTraceLevel`, `AgentTraceEntry`, `NoopAgentTraceReporter`, `BufferAgentTraceReporter`, `redactSecrets`                                                                                                                                                                                                 |
| **DELETE** (Track 2 — the "environment" concept)                                                                                 | `AgentEnvironmentSupportable`, `AgentEnvironmentCapabilities`, `AGENT_ENVIRONMENT_CAPABILITIES`, `AgentRuntime`, `createAgentEnvironment`, `createBrowserAgentEnvironment`, `createVirtualAgentEnvironment`, `runAgentEnvironmentSelfCheck` (+ result types), and the inert members `runtime`/`capabilities`/`createAbortController`/`close` |
| **NARROW** (`llm/`, Track 2)                                                                                                     | `GeminiLlmGatewayOptions`: drop `environment` entirely. Internal `llm.gemini.*` trace + `startedAt`/`durationMs` timing removed (superseded by the external `tracingGateway`); no new port added                                                                                                                                             |
| **REWIRE** (`apps/web`, Track 2)                                                                                                 | compose `storage` + a `Tracer`/sink directly instead of a composite                                                                                                                                                                                                                                                                          |

## Decisions (each resolves an audit finding)

| Decision                                                                | Rationale                                                                                                                                                                                    | Principle                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Extract storage to a leaf module and keep it public                     | Real consumers (web) still need it; reimplementing in `apps/web` would duplicate the JSON key-guard **and** secret redaction into the app                                                    | DRY, SRP, DIP                       |
| Keep the name `AgentStorageSupportable` (no rename)                     | No app imports it by name; a rename is a breaking public change for zero benefit                                                                                                             | YAGNI, minimal churn                |
| Replace the old trace reporter rather than rehome it                    | We are adding our own `Tracer`; moving the doomed reporter first is throwaway motion                                                                                                         | DRY, no-throwaway                   |
| Drop the gateway's internal trace **and** `now` in Track 2 (not before) | `tracingGateway` supersedes both, and it measures its own duration → `now` has no remaining consumer once the trace goes; removing earlier would drop live observability with no replacement | no-dangling-code, decoupled changes |
| Delete the inert members outright                                       | `capabilities`/`runtime` never read; `createAbortController`/`close` never called; `selfCheck` only tests itself                                                                             | YAGNI                               |
| Lift the old `redactSecrets` regex into the new `redact`                | Same proven redaction logic, reshaped for `TraceRecord` — reuse, don't reinvent                                                                                                              | DRY                                 |
| Rename the web persistence prop (not `storage`)                         | `useAgent` already binds `storage: SessionStore`; a second `storage` would shadow it                                                                                                         | SRP clarity                         |

## End-state module shape

```
libs/agent/src/
  storage/                    ← NEW leaf module (Track 1)
    types.ts                  AgentStorageSupportable
    memoryAgentStorage.ts     createMemoryAgentStorage
    browserAgentStorage.ts    createBrowserAgentStorage, WebStorageLike
    json.ts                   assertStorageKey / parseStoredJson / serializeJson
    index.ts
  trace/                      ← NEW module (Track 2): Tracer/sinks/createTracer + tracingGateway/observableCanvasBinding + projectors. NOT a rehome of the old reporter — it replaces it.
  environment/                ← DELETED (Track 2)
```

Root barrel (`libs/agent/src/index.ts`): `export * from './environment'` → `export * from './storage'` (Track 1) + `export * from './trace'` (Track 2).

## Track 1 — storage extraction (standalone, green at every commit)

1. Move the storage files into `storage/`; fix internal relative imports (`../types` → `./types`, `../../utils/errors` → `../utils/errors`). Have `environment/` re-import `AgentStorageSupportable` + the factories from `storage/` so the composite still builds. Root barrel adds `export * from './storage'` **alongside** the existing environment export. Move the three storage specs to `__tests__/storage/`, re-pointed. → both build targets green; behavior unchanged.

Track 1 can ship on its own, before any observability code exists.

## Track 2 — trace replacement + composite deletion (with the observability implement)

Ordered so both `libs/agent` and `apps/web` stay green at every commit (deletions last):

2. **Build `trace/`** — `Tracer`/`TraceSink`/`createTracer`/`NoopTracer`, sinks, `tracingGateway`, `observableCanvasBinding` (per the spec). Additive; nothing consumes it yet. Lift the `redactSecrets` regex into `redact`.
3. **Decouple the gateway (lib-internal).** `GeminiLlmGatewayOptions`: drop `environment`; delete the seven `trace?.…` calls and the `startedAt`/`durationMs` timing; wrap the gateway with `tracingGateway` at the construction seam (`resolveLiveGateway`). Rewrite `GeminiLlmGateway.spec` (the "traces request and response" case moves to the `tracingGateway` spec) and `headless-gemini.smoke.spec` (drop the virtual env). → `libs/agent` green; `apps/web` untouched.
4. **Rewire `apps/web`.** `useAgentEnvironment` composes `createBrowserAgentStorage({ keyPrefix: 'flow_mosaic_agent_' })` (from `storage/`) + a `Tracer` over a `memorySink` for the dev buffer; drop `createBrowserAgentEnvironment`. Retype `AgentEnvironmentSupportable` → discrete ports in `useAgentSession` (`sessionPersistence: Pick<AgentStorage,'getJson'|'setJson'>` + a trace port), `useAgent` (passthrough), and the composition roots. `withGatewayTracing`/run-lifecycle traces move onto the `Tracer`. → `apps/web` green.
5. **Delete the composite.** Remove `createAgentEnvironment.ts`, both `create*AgentEnvironment.ts`, `selfCheck.ts`, `environment/types.ts`, `environment/index.ts`, the old `traceReporters.ts`, and the folder; drop `export * from './environment'` from the root barrel; delete `environment.spec.ts` + `selfCheck.spec.ts`. Scrub stale prose (below). → both targets green.

## Test disposition

| Test                                                 | Action                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/environment/storage/*` (3 specs)          | Track 1: MOVE → `__tests__/storage/`, re-point imports                                                                                      |
| `__tests__/environment/trace/traceReporters.spec.ts` | Track 2: DELETE — coverage replaced by the observability core specs (`createTracer`/sinks/`redact`)                                         |
| `__tests__/environment/environment.spec.ts`          | Track 2: DELETE (asserts runtime/capabilities/abort/close + the deleted factories; storage/clock coverage lives in the moved storage specs) |
| `__tests__/environment/selfCheck.spec.ts`            | Track 2: DELETE (with `selfCheck.ts`)                                                                                                       |
| `__tests__/llm/GeminiLlmGateway.spec.ts`             | Track 2: REWRITE — drop the env + internal-trace assertions; the request/response trace case moves to the `tracingGateway` spec             |
| `__tests__/headless-gemini.smoke.spec.ts`            | Track 2: REWRITE — drop the virtual env; construct the gateway with no env                                                                  |

## Docs to reconcile (repo standard: design-docs ↔ code)

- `docs/browser-agent/foundations/environment.md` — DELETE or fully rewrite (the "Agent Environment" concept is gone; describe the `storage/` + observability ports instead).
- `docs/browser-agent/design/architecture.md:385` and `:407-408` — `:385` ("persist through the Agent Environment's storage port") → the `storage/` port; `:407-408` drop the Agent-Environment bullet/link.
- `docs/browser-agent/foundations/llm-gateway.md:85, 170` — "Uses the Agent Environment for tracing and time" → external `tracingGateway`; `runAgentEnvironmentSelfCheck` no longer exists.
- Stale JSDoc: `libs/agent/src/index.ts:1-4` header, `libs/agent/src/http/types.ts:11`, `libs/agent/src/session/session.ts:39`, `apps/web/.../useAgent.ts:23`, `apps/web/.../useAgentEnvironment.ts` doc block.

## SWE principles honored

- **SRP / DIP / ISP** — the god-object is dissolved; each consumer depends on the one narrow port it uses (e.g. the web session hook takes `Pick<AgentStorage,'getJson'|'setJson'>`).
- **DRY / no-throwaway** — storage moves once and stays; the old trace is replaced-in-place, never rehomed; redaction logic is lifted, not reinvented; no interface copies.
- **YAGNI** — inert members and a self-testing diagnostic are deleted, not carried.
- **No dangling code / no orphaned replacement** — the gateway trace is removed only in the same track that ships its replacement; docs reconciled in the same change.
- **Safe refactor (green at every commit)** — Track 1 is standalone and additive; Track 2 is additive-first, deletions-last, across both build targets.
