# Locator Agent — Implementation Record

What was actually built for [SPEC.md](SPEC.md), in the order it happened. Companion to the
spec (the "what/why"); this is the "what shipped / how to run it".

Last updated: 2026-07-15 · Branch: `feat/locator-agent`

---

## 1. Summary

Shipped the first concrete in-browser flow agent — the **locator agent**, which moves an
existing canvas node from a natural-language request ("move Fetch 10px right", "put Email at
x=100,y=100"). It is applied **live** through the `CanvasBinding` (no draft, no approval gate),
and the agent is the **sole editor** of the canvas.

Two pieces:

1. **`libs/agent` (`@flows/agent`)** — a DOM-free, node-testable agent core.
2. **Flow-editor wiring (`apps/web`)** — an always-present, right-docked chat panel that
   shrinks the canvas, backed by the agent.

---

## 2. Code map — hierarchy, reading order, purpose

The feature spans a DOM-free library (`libs/agent`) and its flow-editor wiring (`apps/web`).
The tree below is the file hierarchy with each file's purpose; the reading path after it makes
each file make sense by the time you reach it (contracts → pure logic → orchestration → wiring →
UI → tests).

### Hierarchy & purpose

```text
libs/agent/src/                          @flows/agent — DOM-free agent core (vitest env: node)
├─ agent.ts                              Agent (the turn surface) + AgentConfig (what varies per agent)
├─ permissions.ts                        Capability / AgentGrant — capability vocabulary the executor enforces
├─ canvas/
│  ├─ canvasBinding.ts                   CanvasBinding / Graph / XY — the ONE seam to the live canvas (sole write path)
│  ├─ inMemoryCanvasBinding.ts           Headless reference binding for tests / Node runs
│  ├─ moveSemantics.ts                   Pure move math: direction→delta, relative/absolute, 20px default
│  └─ canvasTools.ts                     Shared canvas tool provider: createCanvasToolProvider (list_nodes + move_node)
├─ llm/
│  ├─ llmGateway.ts                      LlmGateway + ChatMessage / ToolDef / Chunk / JsonSchema — the ONE outbound LLM dep
│  └─ fakeGateway.ts                     Scripted, deterministic gateway for tests
├─ tools/
│  ├─ toolTypes.ts                       ToolProvider / ToolExecutor / ToolCall / ToolResult contracts
│  ├─ validateArgs.ts                    Minimal JSON-Schema structural validator
│  └─ toolExecutor.ts                    The ONE shared executor: validate → permission → route → provider
├─ agents/
│  └─ locatorAgent.ts                    The think/act turn loop — composes the canvas tool provider + persona; the heart
│                                        (the home for concrete agents; more join here)
├─ session/session.ts                    SessionState (the Panel renders from it) + in-memory Storage
└─ index.ts                              Public barrel

apps/web/src/app/features/flows/         Flow-editor wiring (vitest env: jsdom)
├─ utils/createDesktopCanvasBinding.ts   Real CanvasBinding over the editor's node state
├─ utils/createCommandLlmGateway.ts      Offline command gateway (DEV — no network, no key): parses a command, resolves the node by exact match, emits real move_node/list_nodes tool calls
├─ hooks/useLocatorAgent.ts              React glue: per-flow localStorage-backed session store (survives reload) + lifecycle (arm/dispose; StrictMode-safe; abort on flow switch / unmount)
├─ components/AgentPanel.tsx             The docked chat panel — renders purely from SessionState
└─ pages/FlowEditorPage.tsx             Mounts the panel; flex layout that shrinks the canvas
```

### Reading order

1. **Intent** — [SPEC.md](SPEC.md) (the what/why), then this file (the what-shipped).
2. **Contracts** (`libs/agent`, read as interfaces first): `permissions.ts` → `canvas/canvasBinding.ts`
   → `llm/llmGateway.ts` → `tools/toolTypes.ts` → `session/session.ts` → `agent.ts`.
3. **Pure logic** (verifiable in isolation): `canvas/moveSemantics.ts` → `tools/validateArgs.ts`.
4. **Orchestration**: `tools/toolExecutor.ts` → `canvas/canvasTools.ts` → `agents/locatorAgent.ts`
   (the turn loop — read last; it pulls in everything above) → `index.ts`.
5. **App wiring** (binding → gateway → hook → UI → mount): `createDesktopCanvasBinding.ts` →
   `createCommandLlmGateway.ts` → `useLocatorAgent.ts` → `AgentPanel.tsx` → `FlowEditorPage.tsx`.
6. **Tests**: each `*.spec.ts(x)` next to its subject; `locatorAgent.spec.ts` and
   `useLocatorAgent.spec.tsx` carry the most behavior.

**Shortest high-signal path** (most risk / design weight): `canvasBinding.ts` (the sole-editor seam)
→ `locatorAgent.ts` (the turn loop) → `useLocatorAgent.ts` (the lifecycle + persistence) →
`createCommandLlmGateway.ts` (command parse → exact-match node resolution).

---

## 3. The library — `@flows/agent`

Location: [`libs/agent`](../../../libs/agent). Pure-TS nx library; vitest `test` target runs in
`environment: 'node'`. See [libs/agent/README.md](../../../libs/agent/README.md).

| Area             | Files                                                          | Notes                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas seam      | `src/canvas/canvasBinding.ts`, `inMemoryCanvasBinding.ts`      | `CanvasBinding`/`Graph`/`XY` interface **now owned here**; in-memory impl mirrors the desktop binding for headless runs.                                                                                                                        |
| Canvas tools     | `src/canvas/moveSemantics.ts`, `canvasTools.ts`                | Pure move math + the shared canvas tool provider (`list_nodes` + `move_node`); reused across agents, with each tool's `requires` gating it per call.                                                                                            |
| LLM gateway      | `src/llm/llmGateway.ts`, `fakeGateway.ts`                      | The one outbound LLM dependency. This lib ships only `createFakeGateway` (for tests); the app ships an offline command gateway (DEV — no network, no key) in `createCommandLlmGateway.ts` (§4). A backend-proxied real gateway is **deferred**. |
| Tools + executor | `src/tools/toolTypes.ts`, `toolExecutor.ts`, `validateArgs.ts` | Single choke-point per call: validate args → check the agent's grant → route by name → provider.                                                                                                                                                |
| Agents           | `src/agents/locatorAgent.ts`                                   | Concrete agents (home for more). The locator composes the single canvas tool provider with its persona and runs the think/act turn loop.                                                                                                        |
| Session          | `src/session/session.ts`                                       | `SessionState` the panel renders from + in-memory `Storage`.                                                                                                                                                                                    |
| Permissions      | `src/permissions.ts`                                           | `Capability`/`AgentGrant` — a dependency-free mirror of `FlowPermissions`.                                                                                                                                                                      |

Key design decisions:

- **No draft / no approval gate** (SPEC §2.2): `move_node` applies immediately via the binding.
- **Permissions are enforced, not skipped**: the executor checks each tool's `requires` against
  the agent's grant; the locator is granted `canModifyCanvas`. The session-role ceiling is deferred.
- **`Connection` avoided**: the installed `@lemoncloud/eureka-flows-api` doesn't export
  `Connection` (the app's import is broken); the lib uses the exported `EdgeData` instead.
- **One canvas tool provider, per-tool permission**: `list_nodes` + `move_node` live in a single
  canvas `ToolProvider` (`canvas/canvasTools.ts`), reusable by any agent. Read vs. mutate is gated by
  each tool's `requires` (checked by the executor per call), not by splitting providers — providers
  split by domain, not by capability.

### Integration change

`apps/web/.../utils/createDesktopCanvasBinding.ts` was refactored to **implement** the interface
from `@flows/agent` (single source of truth) and re-export the types, dropping its own copies and
the broken `Connection` import. Wired nx: `tsconfig.base.json` path `@flows/agent`, project
references in root `tsconfig.json` and `apps/web/tsconfig.app.json`.

---

## 4. The panel — flow-editor wiring (`apps/web`)

| File                               | Role                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/AgentPanel.tsx`        | The docked chat panel — renders from `SessionState`, emits `send`, shows thinking/error, Enter-to-send (guarded against IME composition), and an empty state showing the command syntax. No settings / API-key UI.                                                                                                         |
| `hooks/useLocatorAgent.ts`         | Reactive glue: per-flow **localStorage-backed** session store (survives reload) + `createLocatorAgent`; re-renders on every `save` (Panel → agent → store → Panel); arms/disposes the agent per flow (StrictMode-safe).                                                                                                    |
| `utils/createCommandLlmGateway.ts` | **Offline command gateway (DEV) — no network, no key.** Parses a structured command (`move(...)` / `list`) from the latest user message, resolves the node by **exact** match, and emits real `move_node`/`list_nodes` tool calls; console-logs the request a real LLM would receive. Tests can also inject `FakeGateway`. |
| `pages/FlowEditorPage.tsx`         | Mounts `<AgentPanel>` using the already-instantiated `canvasBinding` + a memoized gateway.                                                                                                                                                                                                                                 |

### The offline command gateway (DEV)

`createCommandLlmGateway` is an **offline stand-in for a real LLM** — no network, no API key. It
receives the _exact same_ `ChatRequest` a real gateway would (system prompt + live node list +
transcript + tool defs), parses a structured command out of the latest user message, resolves the
target node by **exact** (case-insensitive) match on label/type/id — **no fuzzy substring**, since a
substring fallback silently moves the wrong node (e.g. "Beta" → "Betamax") — and emits real
`move_node` / `list_nodes` tool calls, so the full **agent → ToolExecutor → CanvasBinding** pipeline
runs and actually moves the node. It console-logs the request a real LLM would receive, so the wiring
can be verified before a real gateway is plugged in. Commands: `move(<node>, <dir>, <dist?>)` ·
`move(<node>, to, <x>, <y>)` · `list`. The production **backend-proxied** gateway (a real model, no
client-side key) remains deferred until an endpoint exists (SPEC §9).

### Layout — the canvas shrinks for the panel

The editor render tree was converted to a **flex row**:

- outer container: `relative flex h-screen … overflow-hidden`
- **canvas region**: `relative flex-1 min-w-0 h-full overflow-hidden` — wraps the canvas and all
  editor chrome (Header, Sidebar, banners, dialogs, dev tools, overlays). Being `flex-1`, it
  **shrinks by exactly the panel width**.
- **panel**: `AgentPanel` is a fixed-width docked column (`w-[360px] shrink-0 h-full`, `border-l`) —
  no longer an overlay. (Earlier v0 overlaid the canvas per SPEC §6.5; this replaces that with the
  deferred "shrink/re-fit" behavior, now implemented.)

### Removed

Deleted `components/DevCanvasBindingPanel.tsx` (the dev-only binding validation panel) and its
import/usage/barrel export — the real panel supersedes it.

---

## 5. Testing

Everything runs under vitest.

| Suite                                   | Command                                             | Env             | Result    |
| --------------------------------------- | --------------------------------------------------- | --------------- | --------- |
| Agent core + turn loop                  | `npx nx test @flows/agent`                          | **node**        | 68 passed |
| Panel end-to-end wiring                 | `npx nx test @flows/web -- AgentPanel`              | jsdom (on node) | 2 passed  |
| Hook lifecycle / persistence            | `npx nx test @flows/web -- useLocatorAgent`         | jsdom (on node) | 5 passed  |
| Offline command gateway (full pipeline) | `npx nx test @flows/web -- createCommandLlmGateway` | jsdom (on node) | 9 passed  |

- The agent suite covers move semantics, arg validation, the executor (routing/permission/errors),
  the tools, and the full turn (both spec user stories + edge cases: absolute/vague/ambiguous moves,
  multi-node turns, abort, iteration cap, gateway error, permission denial, re-entrancy).
- The panel tests drive the **real wiring**: test 1 injects `FakeGateway`, types "move Fetch right 10",
  and asserts the in-memory node moved to (210, 80) with the confirmation rendered; test 2 drives the
  real offline command gateway end-to-end — "move(Fetch, up, 10)" moves the node to (200, 70).
- The command-gateway suite runs the full agent→executor→canvas pipeline offline: relative/absolute
  moves, default step, match-by-type, unknown/ambiguous targets, the `list` command (+ empty canvas),
  and the exact-match regression ("Beta" must not move "Betamax").
- The hook suite asserts a mid-request flow switch **aborts + silences** the outgoing agent and resets
  the transcript; unmount aborts too; the transcript keeps rendering under **StrictMode** (re-arm after
  the simulated remount); it **persists to localStorage and rehydrates on reload**; and a stale
  `thinking` phase is sanitized to `idle` on rehydrate.

Other gates: `npx nx typecheck @flows/agent` ✓, `npx nx lint @flows/agent` ✓, `npx nx lint @flows/web` ✓
(0 errors). The app's overall `typecheck @flows/web` remains blocked only by the pre-existing web-core
`nodenext` issue — no new errors from this work.

---

## 6. Adversarial review + fixes

Ran a two-phase review (parallel finders across dimensions → independent verification). Of 26
findings: 15 confirmed (with cross-dimension duplicates), 10 refuted, 1 plausible. Fixes applied to
the confirmed bugs, each with a regression test:

- **Per-call tool status**: the 2nd+ call in a multi-move turn was recorded `ok` even on failure
  (stale array-index reference) → capture the assistant message by stable reference.
- **Re-entrancy**: concurrent `send()` interleaved the transcript and orphaned `abort()` →
  single-active-turn guard (`phase === 'thinking'` ignores a new send).
- **Abort**: a move from a response that finished after Stop was still applied → re-check
  `signal.aborted` after `collect()`, before dispatch.
- **Non-finite coordinates**: `Infinity` (via `1e999`) slipped through validation → `Number.isFinite`
  guard in the validator and the `move_node` handler.
- **Message ids**: `seq` restarted per instance, colliding after a reload → seed from the persisted
  transcript length.
- Minor: `validateArgs` null-type branch; in-memory `readGraph` returns a fresh array wrapper.

One finding was a spec mismatch, not a bug: v0 surfaces only `customLabel` (block default-label
resolution needs the registry the lib avoids). Resolved by amending the SPEC (§5, §6.2, §9) rather
than coupling the lib to `@flows/flows`.

### 6b. Design / quality audit (panel + gateway + layout)

A second audit (design · structure · extensibility · cleanliness · correctness, each finding
independently verified) produced 14 actionable findings. **Fixed:**

- **Flow-switch agent leak (high)** — switching flows mid-request left the old agent running; it
  mutated the _new_ flow's canvas (shared binding) and clobbered its transcript, and leaked the
  stream on unmount. `useLocatorAgent` now aborts + silences (`alive` gate) the outgoing agent on
  replace/unmount, and resets the transcript during render (also kills the one-frame flash).
- **IME composition (medium)** — Enter during Korean/CJK composition sent a half-composed message;
  now guarded with `!e.nativeEvent.isComposing`.
- Cleanliness: fixed the `NodeLocation.label` doc to match the spec, deleted the dead
  `CanvasBinding`/`Graph`/`XY` re-exports (+ false comment), added a named `Delta` type, and softened
  the `directionToDelta` docstring.

**Deliberately deferred** (verified as the correct "add-on later, don't build speculatively" call):
extracting a generic turn engine / making the loop resumable for the approval gate (the real 2nd
agent has a _different_ turn shape — extracting now would build the wrong seams); `Graph` reusing the
flows-api types (intentional for a flows-specific agent); the type-only import cycle (erased); the
gateway reading its config store via `getState()` (idiomatic here); the loading overlay not covering
the always-present panel; and trimming the lib's public barrel (private lib, non-breaking later).

---

### 6c. Later changes — gateway pivot, persistence, lifecycle

After the audits above, the feature changed materially (chronological record):

- **LLM gateway pivot — OpenAI browser gateway → offline command gateway.** The dev browser-direct
  OpenAI gateway proved unusable (no billing → 429; and Gemini's OpenAI-compatible endpoint has no
  browser CORS). It was removed entirely — `createBrowserLlmGateway.ts`, the `useAgentLlmConfig` key/
  model store, the ⚙ settings UI, and the `openai` dependency all deleted — and replaced with the
  offline `createCommandLlmGateway` (§4). The real (backend-proxied) gateway stays the deferred target
  (§7). This supersedes §6b's notes about the gateway's config store and the barrel-trim call.
- **Session persistence (reload survival).** `useLocatorAgent` now persists `SessionState` to
  `localStorage` keyed by `flow-agent-session:<flowId>`, rehydrates on mount / flow-switch / reload,
  and sanitizes a stale `thinking` phase to `idle`. Implements SPEC §6.4; durable _server_ persistence
  stays out of scope (SPEC §3).
- **StrictMode lifecycle fix.** The outgoing-agent teardown ran on StrictMode's simulated unmount and
  left the transcript invisible for the whole dev session. Fixed with an `arm()` / `dispose()` pair
  driven by a `useLayoutEffect` — teardown runs synchronously at commit (silence + abort before a
  cross-flow clobber can happen), and the agent re-arms on remount.
- **`resolveNode` exact-match.** The command gateway matches a target by **exact** (case-insensitive)
  label/type/id only; a substring fallback was removed because it silently moved the wrong node
  ("Beta" → "Betamax"). Regression-tested.
- **i18n.** `agentPanel.{title,subtitle,empty,thinking,placeholder,send}` added to `en`/`ko`
  `flows.json` (the empty state carries the command syntax); the `missingKey` dev-console spam is gone.
  No `apiKey`/`model`/`settings`/`testMode` keys remain.

---

## 7. Deferred (not built)

- **Production (backend-proxied) LLM gateway** — the dev path is now an offline command gateway
  (`createCommandLlmGateway`: no network, no key), so no real model runs yet. A backend-proxied
  gateway (a real model, key server-side) needs a chat/generate endpoint that doesn't exist yet
  (SPEC §9).
- **Read-only canvas enforcement** — the SPEC assumes the human can't drag nodes (agent is sole
  editor); disabling direct manipulation in `WorkflowCanvas` is a companion change, not yet done.
- **Block default-label resolution**, approval gate, permission ceiling, undo/revert, multi-node
  layout — see SPEC §9.

---

## 8. Commits / status

- `9232d1a` — `feat(agent): add locator agent (@flows/agent) — move nodes by chat` (the library,
  spec, and desktop-binding refactor).
- **Uncommitted in the working tree:** the panel wiring + canvas-shrink layout + `DevCanvasBindingPanel`
  removal; the `libs/agent` restructure (`locator/` → `canvas/` + `agents/`); the LLM-gateway pivot
  (removed the OpenAI browser gateway, `useAgentLlmConfig`, the ⚙ settings UI, and the `openai`
  dependency; added the offline `createCommandLlmGateway`); session `localStorage` persistence; the
  StrictMode/`useLayoutEffect` lifecycle fix; the `agentPanel` i18n keys (en/ko); and `resolveNode`
  exact-match. None of this is committed yet.
