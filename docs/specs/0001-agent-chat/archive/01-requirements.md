# Requirements

> ⚠️ **Superseded on specifics — supporting material.** Predates the authoritative redesign; where they disagree, **[workflow-logic.md](workflow-logic.md)** (behavior) and **[component-interfaces.md](component-interfaces.md)** (shapes) win. Kept for context, not as an implementation source.

> Part of the [Agent Chat spec](README.md) · Prev: [Overview](README.md) · Next: [User stories →](02-user-stories.md)

## Functional requirements

**Chat surface**

- FR-1 An **Agent panel** is available in the flow editor (desktop) as a dockable/collapsible side panel, toggled from the header. It shows a message transcript and a text input. The panel is only available when a flow is open (it is bound to the open flow's editor); there is no agent surface outside an open flow.
- FR-2 The agent maintains a **per-flow conversation session**. Switching flows switches sessions;
  the session for the current flow persists across reloads (localStorage, see NFR-6).
- FR-3 The user can send free-text messages. The agent streams its response (reasoning summary + tool
  activity) incrementally.
- FR-3a **Single active turn.** Only one agent turn runs at a time per session. While the agent is
  working, the composer's **Send** is replaced by **Stop**; the user cannot start a new turn until the
  current one finishes or they Stop it. There is no message queue — the user waits or stops (EC-10).
- FR-4 The agent can ask clarifying questions before acting when the request is ambiguous.

**Generate**

- FR-5 Given a natural-language description, the agent produces a flow: it selects blocks from the
  live `blockRegistry`, creates nodes, sets initial config, and connects ports into a valid graph.
- FR-6 The agent operates on an **already-open flow only**. The user must open a flow (a new blank flow or an existing one) via the normal editor UI before the agent can act; the agent never creates or switches flows itself. Generation therefore always targets the currently open flow — typically a freshly-created blank one the user just opened.
- FR-7 The agent must only use block types that exist in `blockRegistry`, and must only connect
  ports whose `DataType`s are compatible (`text`/`image`/`number`/`json`/`any`).

**Edit**

- FR-8 The agent can add, delete, reconfigure, and reconnect nodes in the current flow.
- FR-9 During a turn, mutations do **not** hit the live persistence path. They run against a
  **forked, headless draft** of the canvas store — the same pure reducer actions the human editor uses,
  but with no autosave, socket, or `useNodeSync` attached, so nothing persists. Persistence happens
  only at **promote** (on Accept), through the **awaited** human persistence primitives — not the
  debounced UI wrappers. See [draft model](workflow-logic.md#the-draft-model) and
  [commit path](workflow-logic.md#the-commit-path-promote).
- FR-10 Mutations are **never** applied to the live flow mid-turn. They accumulate in the draft and
  are surfaced **once, at turn end**, as a single **plan** — the draft-vs-baseline diff plus a
  natural-language explanation — rendered as an approval card in the panel. The user **accepts or
  rejects the whole plan** (all-or-nothing; no per-action toggling). Before Accept, the change
  touches neither the canvas nor the backend; on Accept it is **promoted** to the live flow. Every
  plan is gated (FR-16).
  See [Plan lifecycle](workflow-logic.md#s5--plan-lifecycle--draft--diff--explanation--commit).

**Troubleshoot**

- FR-11 The agent can read the current flow's structure, each node's `state`/`status`/`error`, run
  history (`nodeRuns` → `RunContext.traces`), and port data (`getPortData`).
- FR-12 The agent can explain why a node is in `ERROR`, identify missing/incompatible connections or
  missing config, and propose a concrete fix. The fix is not a special path — it is a normal mutation
  tool call (`connect`/`update_node_config`/etc.) applied to the **draft**, and it rides in the
  turn's **plan** like any other edit. The user approves the plan (FR-10), never an individual call.

**Execute**

- FR-13 The agent can run a single node (`run_node`), a set of nodes / the whole flow (`run_flow`),
  and report per-node outcomes by observing the resulting WebSocket node events. Runs execute on the
  **live, persisted** flow only, so a run whose target the un-promoted draft has changed is **blocked
  until promote** (recorded as a `pendingRunIntent` and auto-continued after Accept); an unaffected
  `run_node` dispatches immediately. See [Runs require unaffected targets](workflow-logic.md#runs-require-unaffected-targets).
- FR-14 Execution respects frontend vs backend blocks exactly as the human path does (frontend blocks
  run via `EXECUTE_FUNCTIONS` then persist via `runNode({output})`; backend blocks call
  `runNode`). The agent reuses the existing execution utility, it does not reimplement it.

**Permissions & safety**

- FR-15 Every tool is gated by the current `FlowPermissions`. A Viewer's agent can read and run
  (`canRun`) but cannot mutate; an Anonymous user has no agent (no session/`canRun`).
- FR-16 **Two gates, no persistent auto-approve.** Nothing reaches the live flow without an explicit
  user click, and approval is **not** a cross-turn toggle.
    - **Plan gate** — mutations are gated **every turn**: each turn's plan needs an explicit Accept (FR-10).
    - **Run gate** — runs are gated **once per turn**: the first _dispatchable_ run asks Confirm/Decline;
      later runs in the same turn proceed without re-asking; the gate resets next turn.

    See [Locked decisions](workflow-logic.md#locked-decisions) and [Gate](workflow-logic.md#gate-shared-primitive).

- FR-17 The agent surfaces a clear summary (the plan's explanation + per-operation summaries) of what
  it changed. Because promoted changes are persisted server-side, reverting is **not** native canvas
  undo/redo; the user instead gets an explicit **version toggle** between the pre-agent and post-agent
  flow — id-preserving, so run history and saved port refs survive. See [commit path → revert](workflow-logic.md#the-commit-path-promote).

**Credits / cost**

- FR-18 **Two cost paths, split by capability.** _Execution_ (running nodes/flows) reuses the
  existing server-side run path (`runNode`/`runFlow`) unchanged, so it is metered on the existing
  **Credit ledger** exactly like an AI block — no new billing. _Reasoning_ (the agent's own
  chat-completion / tool-loop calls) goes through the pluggable **LLM gateway** (see [Interfaces](04-data-models.md#interfaces--contracts)). In
  **Stage 1** (browser-key gateway) those reasoning tokens are billed by the provider behind the BYO
  key, **not** the Eureka Credit ledger; a **Stage 2** backend-proxy gateway may later bring reasoning
  onto the Credit ledger. See CONTEXT.md → Credits / Run mode.
- FR-19 When _execution_ would fail for lack of credits / AI key, the agent surfaces the standard
  charge deep-link (`BILLING_URL`) rather than failing silently. Balance is read via the existing
  `getCreditBalance()` (`GET /wallets/0/balance`). Reasoning-side cost failures surface as a gateway
  error (NFR-8).

## Non-functional requirements

- NFR-1 **Reuse over rebuild.** No new state stores for things the four Zustand stores already own;
  no second WebSocket; no second flow-mutation path. The agent's tool executor calls the same store
  actions and API functions the UI calls. (The draft is a second **headless instance** of the
  existing canvas store running the same reducer actions — not a new mutation path.)
- NFR-2 **Correctness of mutations.** A generated/edited flow must be loadable and runnable with no
  manual repair: valid node types, valid port refs, no dangling edges, no type-incompatible links.
- NFR-3 **Streaming latency.** First token / first trace visible < 2 s p50 after send (depends on the
  gateway streaming — see [Interfaces](04-data-models.md#interfaces--contracts)). **Draft mutations
  are invisible on the live canvas during the turn** (they run against the headless draft); the
  promoted changes appear on the live canvas **together, at promote**, via the single post-commit
  reload — not one-at-a-time as each tool completes, and never before Accept. What streams _during_
  the turn is the agent's text/trace output, not canvas changes.
- NFR-4 **Bounded context.** The flow snapshot sent to the model is compact (see
  [Data flow](05-data-flow.md#data-flow)); large port payloads (images, big JSON) are summarized/omitted, never
  inlined. Trace/run buffers stay within the existing caps (`traceLogs` ≤ 500/node, `nodeRuns` ≤
  20/node).
- NFR-5 **i18n.** All panel UI strings go through the existing i18n system (en/ko), matching the app.
- NFR-6 **Session persistence.** Conversation history persists per-flow in localStorage under the
  existing `flow_mosaic_` prefix convention; capped and prunable.
- NFR-7 **Security posture (staged).** The agent may call only the fixed tool catalog — never
  arbitrary endpoints — and every tool arg is schema-validated before execution. Provider-key
  handling is staged: **Stage 1** — a BYO provider key is stored in **localStorage** (the same web
  storage the existing flow API key uses via `web-core`'s `apiKey.ts`/`EnhancedStorage`) and used by
  the direct gateway; acceptable for dev/self-host with a **spend-capped, model-restricted** key, but
  it persists across sessions and is exposed to XSS and devtools (see [Concerns → Key in browser](07-concerns.md#concerns)).
  **Stage 2**
  — swap in a backend-proxy gateway so the key never reaches the browser (production target). The
  `LlmGateway` interface makes this swap invisible to the orchestrator. The **flow API key** in
  localStorage is unchanged and out of scope.
- NFR-8 **Graceful degradation.** If the LLM gateway is unavailable, the editor is fully usable; the
  panel shows an error state and never blocks canvas interaction.
- NFR-9 **Observability.** The agent **reuses the `TraceEntry` format and the timeline UI** that
  renders `agent-codex` runs — reused, not rebuilt — but stores traces where they belong, by scope:
    - **Reasoning / tool-decision traces** (planner, `tool_start`/`tool_end`, plan/run gate) are session-level,
      so they live on `AgentMessage.traces` in `useAgentStore` and render in the chat panel via that same
      timeline component.
    - **Node-execution traces** (produced when the agent runs a node) stay in the node-keyed
      `nodeRuns`/`traceLogs` in `useCanvasStore`, exactly as today.

    (In Stage 1 the reasoning traces are produced client-side by the orchestrator rather than arriving
    over the socket; the format and the rendering component are identical either way.)

- NFR-10 **Simulation parity.** A `SimulationGateway` can drive the entire agent loop with no real LLM
  and no backend: only the gateway is simulated — the stores, tool executor, approval flow, and canvas
  are the real browser runtime — so a simulated run is behaviorally identical to a live one above the
  gateway boundary. This is the default gateway for tests, offline dev, and demos.

---

Prev: [Overview](README.md) · Next: [User stories →](02-user-stories.md)
