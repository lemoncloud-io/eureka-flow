# Data flow & lifecycle

> Part of the [Agent Chat spec](README.md) · Prev: [Data models & interfaces](04-data-models.md) · Next: [Testing strategies →](06-testing.md)

## Data flow

1. User types a message in the Agent Panel → the Orchestrator appends a `user` `AgentMessage`, sets
   phase `thinking`.
2. The Orchestrator asks the Environment to `resolvePermissions()` and `snapshotBaseline()` —
   capturing the live graph and `baselineHash`. **No draft is forked yet.**
3. The Prompt Builder assembles the request — history, permission-filtered tool defs, skill index, and
   the compact **structural snapshot** (draft-if-forked-else-live) **on the first iteration only** —
   and the Orchestrator calls `gateway.createChatCompletion(...)`.
4. The gateway streams assistant text + `tool_calls`; the Orchestrator appends `TraceEntry` items to
   the current `AgentMessage.traces` (NFR-9). Node-run traces (from `run_*`) land in
   `useCanvasStore`'s `nodeRuns`/`traceLogs`.
5. For each tool call the Executor validates args → checks permission → routes by kind:
    - **read** → draft-if-forked-else-live (structural) or live (runtime);
    - **mutate** → **forks the Draft on the first call**, applies the store action to the Draft —
      nothing persists, nothing appears on the live canvas;
    - **run\_\*** → checks the affected-target precondition; if clear, it passes the **run gate** (the
      first dispatchable run of the turn) and dispatches via RunTracker; if the un-promoted draft
      affects the target it returns `not_persisted` and records a `pendingRunIntent`.
6. The Executor returns compact `AgentToolResult`s → the Orchestrator feeds them into the next
   `createChatCompletion` call → loop (step 4) until final text or the iteration cap (EC-8).
7. Runs resolve asynchronously through **RunTracker**: it snapshots existing `runId`s, dispatches,
   subscribes and does a synchronous `nodeRuns` read (catching a fast/cached run), then resolves on the
   terminal event (`COMPLETED`/`ERROR`) or the 60 s `POLL_TIMEOUT` (EC-7). Output summaries come from
   `getPortData(portId, 'out', {flowId, runId})`.
8. When the loop ends, if a Draft exists the Orchestrator runs the **plan lifecycle** (below); a pure
   Q&A / read-only / run-only turn skips it and goes straight to the answer.
9. The final assistant message is rendered; the session (including any `pendingRunIntent`) is persisted
   to localStorage (NFR-6).

## Mutation lifecycle: draft → plan → promote

Mutations never touch the live flow mid-turn. They accumulate in a **headless Draft**; at turn end the
Draft-vs-baseline **diff** becomes a single **plan** the user Accepts or Rejects; only on Accept is it
**promoted** to the live flow. **Canvas visibility** and **backend persistence** stay coupled — both
happen only at promote. There is no per-tool "appears on canvas" moment and no "visible but unsaved"
stage.

| Stage                         | Draft                                        | Live canvas                                      | Backend                                  | Where the user sees it                                  |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------- |
| **1. Build** (reasoning loop) | mutations apply to the Draft (pure reducers) | untouched                                        | untouched                                | streaming text/traces in the panel — **not** the canvas |
| **2. Plan** (turn finalize)   | frozen; diffed vs baseline                   | untouched                                        | untouched                                | the **plan card**: explanation + per-op summaries       |
| **3a. Reject**                | discarded                                    | untouched                                        | untouched                                | nothing ever happened on the live flow                  |
| **3b. Accept → promote**      | replayed onto live                           | nodes/edges appear **together** after the reload | persisted via the **awaited** primitives | live on the canvas                                      |

- **Every plan is gated (LD-1); no auto-approve.** What streams during the build is the agent's
  text/traces; structural changes appear on the canvas at promote, **all at once**, via the single
  post-commit reload (NFR-3).
- **Promote is one-at-a-time, teardown → build-up** (`disconnect` → `delete_node` → `add_node` →
  `update_node_config` → `connect`); each create resolves its server id before any edge references it.
  See [the commit path](workflow-logic.md#the-commit-path-promote).
- **Revert is an id-preserving version toggle**, not native undo/redo (FR-17).
- **Rejected alternative:** rendering proposals as translucent "ghost" nodes _on the live canvas_
  before Accept would need new staged-node state in `useCanvasStore`, cutting against NFR-1. The
  headless Draft achieves the same isolation using the store's own reducers, and the panel-card plan is
  the chosen review surface.

## Simulation mode

Simulation swaps **only the gateway** for `SimulationGateway`; everything else is the real browser
runtime (real `useAgentStore`, real tool executor, real Environment + headless Draft, real
`useCanvasStore` / live canvas). Because the substitution happens at the `LlmGateway` seam, a simulated
run is behaviorally identical to a live one above that line — the orchestrator, permission gates, the
plan/run gates, the draft → plan → promote lifecycle, and the version-toggle revert all behave exactly
as in production (NFR-10).

- `SimulationGateway(script)` returns a **deterministic, scripted** sequence of assistant messages and
  `tool_calls` — e.g. "emit a `tool_call` for `add_node(input-text)`, then `add_node(...)`, then a
  final text summary" — instead of contacting a model. No network, no key, no tokens.
- **Fidelity boundary:** simulated = the LLM's _decisions_ (which tools, which args). Real = their
  _effects_ (the executor actually mutates the store, actually calls `runNode`, etc., unless the
  flow API layer is itself stubbed for a pure-offline run).
- **Uses:** deterministic orchestrator/executor tests ([Testing](06-testing.md)), offline development, reproducible bug
  repros, and product demos without spend. It is the **default gateway in tests and Storybook-style
  harnesses**.

---

Prev: [Data models & interfaces](04-data-models.md) · Next: [Testing strategies →](06-testing.md)
