# Agent Chat — Workflow Logic

> **Status:** Authoritative for turn control flow — the single source of truth for **how a turn works**. The typed shape of every seam lives in **[`component-interfaces.md`](component-interfaces.md)** (behavior here, shapes there), which is consistent with this file as of this revision. Other numbered files in this folder are stale.

This document is self-contained on behavior: the locked decisions, the components, the draft model, how the agent reads/mutates/runs, how a plan is computed and committed, how runs are tracked, and how drift is detected. Every mechanism is grounded in an existing codebase primitive, with file references, so the design is directly implementable.

The scope is a **skeleton**: the smallest coherent design that (a) does not break any existing editor logic, and (b) can be extended later. Anything the agent cannot yet use meaningfully (e.g. visual layout — it cannot see the canvas) is deferred rather than half-built.

---

## Locked decisions

1. **No persistent auto-approve.** Nothing reaches the live flow without an explicit user click.
    - **Plans** are gated **every time** — each plan needs Accept.
    - **Runs** are gated **once per turn** — the first _dispatchable_ `run_*` call asks; later runs in the same turn proceed without re-asking; the gate resets next turn.
    - This is _not_ a cross-turn session toggle (which we rejected).
2. **All-or-nothing plan.** The user accepts or rejects the whole plan — no partial toggling.
3. **Draft-first mutations.** Mutations run against a **forked headless draft** of the canvas store, never against the live flow. Nothing persists until the plan is accepted.
4. **The draft is the target state; the diff is the operation set.** A plan's _operations_ are the computed **draft-vs-baseline diff** — not an agent-authored op list. The agent supplies only the natural-language **explanation**. Because we apply the diff itself, "presented" and "applied" can never drift — no reconcile/fallback machinery is needed.
5. **The draft exists only for mutation.** It is forked **lazily on the first `mutate` call** and discarded at turn end. Runs and runtime reads (outputs, run history) operate on the **live** flow; structural reads reflect the draft once it exists (see [Read targeting](#read-targeting)).
6. **Runs execute on the live (persisted) flow only.** The backend has no knowledge of draft/temp-id nodes, so new structure must be **promoted before it can run**, and a run whose target the draft has changed is blocked until promote (see [Runs require unaffected targets](#runs-require-unaffected-targets)).
7. **Promote reuses the human persistence path — via _awaited_ writes.** The approved diff is committed through the **same server mutations a human's edits hit** — `createNodeAsync`/`upsertNode` for node create (position included in the create body) + config/label, `upsertFlow` for edges and deletes — invoked as **awaited** calls (`waitForNodeId` for creates; react-query `mutateAsync` otherwise), **not** the fire-and-forget/debounced UI wrappers (`syncNodeUpdate`'s 500 ms debounce, `createEdgeAsync`'s success-only callback), which resolve before the write is sent. Ops apply **one at a time**, so each server id is known before it is referenced and every write lands before the post-commit reload.
8. **The Orchestrator never touches the Flow layer or React directly.** All canvas/flow interaction goes through the **Tool Interface** (LLM-callable tools) and the **Environment** (turn-boundary ops). The Environment reaches the live, React-owned canvas through a **`CanvasBinding`** injected from React.

---

## Components

- **Agent Panel** — chat UI. Emits _commands_ (`send`, `resolvePending`); renders purely from the store. Never calls tools or the model.
- **Orchestrator** — the sole writer and coordinator. Owns the turn, the reasoning loop, and every gate. Holds the Tool Interface and the Environment; imports nothing from Flow or React.
- **Prompt Builder** — pure function assembling the `ChatRequest` (system prompt, history, tool defs, skill index, and the structural snapshot on the first iteration).
- **Tool Interface** — the seam between the Orchestrator and the flow world:
    - **Tool Registry** — the catalog: `name`, `description`, params schema, `requires` (permission flag), `kind` (`read`/`mutate`/`execute`/`meta`), `execute`, `summarize`. Pure metadata + logic.
    - **Tool Executor** — the per-call choke-point: validate args → check permission → route to the correct kind-scoped surface → return a `ToolResult`.
    - **Environment (Workspace)** — owns the draft store and the `CanvasBinding`; the only component that touches the draft or the live flow. Exposes the turn-boundary ops (`resolvePermissions`, `snapshotBaseline`, `fork`, `diff`, `checkDrift`, `promote`, `discardDraft`).
- **CanvasBinding** — a thin, **platform-specific, React-owned** adapter giving the Environment (a) a structural read of the live graph, (b) the **awaited** human persistence primitives, (c) a reload, (d) an owner-autosave flush, and (e) the live socket `connection` id. Desktop wraps `WorkflowCanvasRef`; mobile wraps the live canvas store. Injected at mount.
- **RunTracker** — turns socket-driven run completion into an awaitable, composed into the `live` surface so a run tool returns a finished result.
- **Skill Registry** — playbooks exposed via the `use_skill` meta-tool + a skill index in the prompt.
- **Storage Interface** — passive session store (messages, status, pending gate, the turn's `pendingRunIntent`); persisted to localStorage.
- **LLM Gateway** — the only outbound LLM dependency (Browser / Proxy / Simulation behind one interface).
- **Draft canvas store** — a forked **headless instance of the canvas store** built by a factory; mutations run the real reducers but never persist.
- **Flow layer / Live canvas** — real permissions, live nodes, the commit path, run execution, backend persistence.

**Two kinds of operations** (keeping the Tool Interface from becoming a god-object):

- **LLM-callable tools** (`read` / `mutate` / `execute` / `meta`) → Registry + Executor.
- **Environment ops** (`resolvePermissions` / `snapshotBaseline` / `fork` / `diff` / `checkDrift` / `promote` / `discardDraft`) → the model never calls these; the Orchestrator calls them at turn boundaries.

Typed contracts: [`component-interfaces.md`](component-interfaces.md).

---

## The draft model

The draft is a **second, headless instance of the canvas store**, seeded from the live canvas with **identical ids**.

### Where `useCanvasStore` is and isn't used (why `CanvasBinding` exists)

This is the crux, and easy to misread. There is **exactly one** use of the store _type_: to build the **draft** — a headless, in-memory instance. The **live** canvas is **not** assumed to be that store:

- On **desktop** (the v1 target) the live canvas renders from component-local `useState` inside `WorkflowCanvas.tsx` ([:257-258](../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx#L257-L258)) — **not** the store.
- On **mobile** the live canvas _is_ a store instance.

So the Environment never reads or writes the live canvas directly — it goes through **`CanvasBinding`**, which each platform implements over its own live canvas. That is the entire reason the binding exists: **the draft is uniformly a store; the live canvas is platform-specific; the binding is the seam.** "The draft uses `useCanvasStore`" and "we can't use `useCanvasStore` for the live canvas" are therefore _both_ true — they are about **different objects** (a headless draft instance vs. the mounted live canvas).

The agent's **tool surface is identical** whether the draft exists or not; what changes is only _where_ an edit lands:

|                         | Where edits go                          | Persists? |
| ----------------------- | --------------------------------------- | --------- |
| During the turn (draft) | headless draft store (pure reducers)    | **No**    |
| On Accept (promote)     | live canvas via `CanvasBinding.persist` | **Yes**   |

This satisfies the requirement directly: same tools, draft edits do not persist, Accept persists them to live, and the user can toggle between the pre-agent and post-agent versions (see [revert](#the-commit-path-promote)).

### Why a store instance, and why it reuses the human mutation path

The canvas store (`libs/flows/src/stores/useCanvasStore.ts`) already holds the full graph (`nodes`, `connections`) and a complete set of **pure** mutation actions (`setNodes`, `setConnections`, `addConnection`, `updateNodeData`, `deleteNode`, `loadWorkflow`, … [useCanvasStore.ts:193-441](../../../libs/flows/src/stores/useCanvasStore.ts#L193-L441)). Every action is a bare `set(...)` — **no network, no persistence, no side effects**; persistence lives entirely outside the store.

The **mobile human editor already edits through these exact actions** (`useMobileFlowActions`, `useConnectionMode`, `useNodeConfig`, `nodeServerSync`), with persistence layered on separately (inline `upsertNode`/`upsertFlow` + a `useMobileAutoSave` subscription). So "the agent mutates via the store actions" **is** an existing human mutation path — the store is the shared mutation layer, which is exactly the reuse we want.

Because the actions are pure, a **headless** draft mutates for real (real reducer logic, real validation) but **cannot** persist: none of the persistence surfaces (`useNodeSync`/`useEdgeSync`, the socket subscription, the mobile autosave subscription) are attached to it. Draft-first comes for free — no "suppress persistence" flag.

### Why identical ids are safe (and required)

- **Safe:** the draft is a separate instance. All id-keyed _state_ is per-instance; all id-keyed _side-effects_ (debounced persistence, socket subscriptions, run execution, autosave) attach to the **live** canvas only. Reducers are immutable (spread/new-object), so draft and live never mutate a shared object.
- **Required:** the diff matches pre-existing nodes by identical id; new draft nodes carry temp ids absent from the baseline (added). If the draft regenerated ids, every node would read as removed + re-added.

### Implementation (additive refactor)

The store is a Zustand `create()` **singleton** with no factory ([useCanvasStore.ts:171](../../../libs/flows/src/stores/useCanvasStore.ts#L171)). A draft needs a factory sharing the same state-creator:

```ts
const canvasStateCreator = (set, get) => ({
    /* all state + actions, unchanged */
});
export const useCanvasStore = create(canvasStateCreator); // live singleton — consumers untouched
export const createCanvasStore = () => createStore(canvasStateCreator); // zustand/vanilla — headless draft
```

- `create` (react) and `createStore` (`zustand/vanilla`, present at v5.0.10) take the identical state-creator; `create` delegates to `createStore`. The refactor is **purely additive** — the ~23 existing consumers and 64 `getState()` sites are untouched.
- The creator closes only over pure helpers + numeric consts and allocates its own `Set`/`Map`/arrays, so a second instance shares no mutable state.
- **Seeding:** `draft.getState().loadWorkflow({ nodes, connections }, flowId)` reuses existing logic and resets run state (fresh `traceLogs`/`nodeRuns`, [useCanvasStore.ts:363-378](../../../libs/flows/src/stores/useCanvasStore.ts#L363-L378)). `nodeRuns`/`traceLogs` are inert on a headless instance (only socket hooks populate them). `structuredClone` the seed as insurance.

### Known semantic caveat (port outputs)

`get_port_data` is a **live server fetch** (`GET /nodes/:portId/port`, [api/nodes.ts:65](../../../libs/flows/src/api/nodes.ts#L65)) returning the server's **persisted** output. For a node the agent edited in the draft, that output **predates the edit** (the draft never ran) — acceptable, and it matches existing behavior when a config changes but the node has not re-run. **No new staleness mechanism**; the system prompt instructs the agent to treat draft edits as _not yet executed_ until promoted and run.

---

## Tool groups & targets

| Group                            | Tools                                                                                             | Target                                                                    | Gate                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| **read (catalog)**               | `list_blocks`                                                                                     | Block Registry                                                            | —                             |
| **read (structural)**            | `get_flow`, `get_node`                                                                            | **Draft if forked this turn, else Live**                                  | —                             |
| **read (runtime)**               | `get_port_data`, `get_node_runs`                                                                  | **Live only**                                                             | —                             |
| **mutate**                       | `add_node`, `update_node_config`, `delete_node`, `connect`, `disconnect`                          | **Draft only** (forks lazily on first call)                               | Plan gate at finalize (S5)    |
| **execute**                      | `run_node`, `run_flow`                                                                            | **Live only — persisted ids; blocked while the draft affects the target** | Run gate before dispatch (S6) |
| **meta**                         | `use_skill`                                                                                       | Skill Registry                                                            | —                             |
| **env ops** _(not LLM-callable)_ | `resolvePermissions`, `snapshotBaseline`, `fork`, `diff`, `checkDrift`, `promote`, `discardDraft` | Environment                                                               | —                             |

> **`update_node_config` covers config _and_ label.** It accepts `{ config?, label? }` and sets a pre-existing node's `config` and/or `customLabel`. `label` is a first-class **semantic/diff** field (a rename is reviewable and drift-detectable), and the persistence primitive `upsertNode` already carries `customLabel`, so a label change **round-trips** (diff → op → commit). Without this, `label` would be a diff/drift field no op could apply — an un-committable "presented ≠ applied" hole.
>
> **No agent layout tool in v1.** The agent cannot see the canvas, so it does not arrange it. New nodes get a **deterministic default position** at `add_node` (a simple placement heuristic, refined later) that persists **in the create body** — `createNodeAsync`'s node body has `position` as a **required** field ([useNodeSync.ts:218](../../../libs/flows/src/hooks/useNodeSync.ts#L218)), so the position lands with the node and **no separate reposition step is needed** (a created node must therefore never reach promote without one). If a human wants the graph arranged, the **existing "Auto Layout" button** does it (unchanged). A global `auto_layout` agent tool is deferred: the existing algorithm is not headless-callable (it lives in the desktop component ref and a parallel lib hook, both bound to React), persists only indirectly through the 2s-debounced full-flow save, and re-running it on every promote would clobber the owner's manual arrangement.
>
> **`set_flow_metadata` is deferred.** Flow name/description live on neither the canvas store (`CanvasState` holds only `nodes`/`connections`/`flowId`) nor the diff projection, so a metadata edit would produce an empty diff and silently no-op. Wiring it needs a new store slice + baseline capture + a metadata channel to `updateFlowMetadata` ([api/flows.ts:126](../../../libs/flows/src/api/flows.ts#L126)). Until then it is not exposed.

### Read targeting

- **Structural reads** (`get_flow`, `get_node`) reflect the **draft if forked this turn** (so the agent sees its own in-progress edits), else **live**. Before the first mutate the two are identical, so this is a copy-on-write read-through — no observable special case.
- **Runtime reads** (`get_port_data`, `get_node_runs`) always target **live**, because the draft never executes and its run state is reset at seed. This is why "troubleshoot my last run via `get_node_runs`" reads real live history.

### Runs require unaffected targets

Runs execute on the live, persisted flow, so a run must not target structure the draft has changed but not committed. **This is an affected-target rule, not a whole-draft-empty rule:** only `run_flow` needs an empty diff; a `run_node` blocks solely on _its own_ target.

- A `run_*` is **dispatchable only when its targets are unaffected by the un-promoted draft**:
    - **`run_flow`** runs the whole flow → blocked whenever `env.diff()` is non-empty (any added/removed/modified node or edge changes what the flow does).
    - **`run_node(n)`** is blocked when `n` is in the draft's **added/modified** set (running live would ignore the pending edit, or `n` is a temp id absent server-side). A `run_node` on a node the draft did **not** touch dispatches **immediately** — legitimate troubleshooting mid-build, no over-blocking.
- A blocked run returns a `not_persisted` `ToolResult` and is recorded as a `pendingRunIntent` (see [Build-and-run](#build-and-run-in-one-prompt)); it dispatches only **after** promote. **If the plan is rejected (or the turn ends without a promote), any queued `pendingRunIntent` is surfaced as a system note** — never silently dropped.
- This closes the **"add a step and run my flow"** case: `run_flow` targets live input nodes (all `ServerNodeId`s), so a bare persisted-id check would pass and the run would fire against the **stale** live flow that lacks the just-built nodes. Scoping to _affected_ targets fixes that without blocking an unrelated troubleshooting `run_node`.
- A **pure troubleshooting turn** (no mutations → empty diff) runs immediately.

---

## Lifecycle (containment)

Each deeper scope pulls in more components; inner scopes run _inside_ outer ones (containment, not sequence).

- **S1 Session** = {Orchestrator, Storage} — contains →
- **S2 Turn** = + {Panel} — contains the Reasoning loop, then (at finalize) the Plan lifecycle —
- **S3 Reasoning loop** = + {Prompt Builder, LLM Gateway, Skill Registry} — contains →
- **S4 Tool dispatch** = + {Tool Interface, Draft} — which for runs contains →
    - **S6 Run lifecycle** = + {Flow layer, RunTracker}
- **S5 Plan lifecycle** = + {Environment, CanvasBinding, Flow, Live canvas} — sibling of the loop, inside the Turn (runs after the loop, over the accumulated draft).

_(Numbered by containment depth, not run order: S6 nests inside S4/the loop; S5 runs after the loop.)_

### S1 · Session — {Orchestrator, Storage}

On flow open, the Orchestrator loads or creates the session keyed by `flowId`; the Panel renders restored history. Storage persists on every change.

### S2 · Turn — + {Panel}

1. Panel → Orchestrator `send(text)`.
2. Orchestrator appends the user message, sets status `thinking`.
3. Orchestrator asks the Environment to `resolvePermissions()` and `snapshotBaseline()` — capture the live graph (`binding.readGraph()`) **and** compute `baselineHash` (see [Drift](#concurrency--drift-owner--agent)). The draft is **not** forked yet.
4. Runs the reasoning loop (S3). The **first `mutate`** triggers `Environment.fork()`. When the loop ends, runs the plan finalize (S5), emits the final answer, persists.

_The Orchestrator imports nothing from Flow or React — permissions, baseline, draft, and the live-write path all come from the Environment/CanvasBinding._

### S3 · Reasoning loop — + {Prompt Builder, LLM Gateway, Skill Registry}

Repeats until the model returns final text or the per-turn iteration cap is hit:

1. Prompt Builder builds the request (history + ctx, tool defs, skill index, **structural snapshot on the first iteration only**).
2. Orchestrator calls `gateway.createChatCompletion(request)`; Gateway streams deltas.
3. Orchestrator writes deltas to Storage → Panel shows text appearing (streaming = store writes, no socket).
4. **tool_calls** → dispatch each (S4), feed results back, loop. **Final text only** → exit.

### S4 · Tool dispatch — + {Tool Interface, Draft}

Per tool_call, the Executor validates args → checks the permission flag → routes → **returns a `ToolResult`** (`{ toolCallId, ok, data?, error? }`):

- **read** → routed per [Read targeting](#read-targeting).
- **mutate** → forks the draft on first call, applies the store action to the **Draft**; `data` = provisional entity (e.g. the new node's temp id).
- **use_skill** → `data` = playbook text.
- **run\_\*** → triggers the Run lifecycle (S6, gated). Precondition: every target is a persisted/live id **and unaffected by the un-promoted draft** (`run_flow` needs an empty diff; `run_node(n)` needs `n` untouched); else `ok:false` with `not_persisted` + `pendingRunIntent` recorded.

### S5 · Plan lifecycle — Draft → diff → explanation → commit

Runs once, at turn finalize, as a sibling of the loop.

1. **No draft** (pure Q&A / read-only / run-only turn) → skip the lifecycle; go to the final answer.
2. **Diff.** `Environment.diff()` compares the **Draft against the S2 baseline**:
    - **Semantic projection** (the reviewable diff): node → `{ id, type, config, label }`; edge → `{ sourceNodeId, sourcePortId, targetNodeId, targetPortId }`. **Excluded:** position, run/execution state, `inputData`/`outputData`, timestamps, `seq`.
    - nodes: **added** (temp id absent from baseline) / **removed** / **modified** (same id, projection differs → lowers to `update_node_config`).
    - edges: **added** / **removed**, keyed by the 4-tuple.
    - **Position is not a diff dimension.** A new node's default position rides on its `add` operation (persisted in the create body); the agent never repositions existing nodes, so there is no layout delta, no separate reposition step, and no "layout-only turn." `isEmpty` is purely the semantic diff.
3. **The diff _is_ the operation set.** No agent op-derivation, no reconcile. The semantic diff lowers deterministically to an **ordered** `operations[]` (see [Commit path](#the-commit-path-promote)).
4. **Agent writes the explanation.** The Orchestrator feeds the diff (and final draft structure) to the model in a dedicated completion and asks only for a natural-language **`explanation`**. If it fails, fall back to a mechanical diff summary. Either way the operations are unchanged, so the explanation is only higher-level narration of the exact change.
5. **Drift check.** `Environment.checkDrift()` recomputes the live hash; if it differs from `baselineHash`, the plan is **stale** → do not present; notify, re-snapshot baseline (re-arm the lazy fork), replan (see [Drift](#concurrency--drift-owner--agent)).
6. **Present.** Orchestrator writes the plan (`explanation` + per-op summaries via `ToolRegistry.summarize(op)`) to Storage → Panel renders the approval card → **Gate** (Accept / Reject).
7. **Accept → promote.** Re-check drift, then `Environment.promote(plan)` commits the operations through the human persistence path and reloads the live canvas.
8. **Reject → discard.** `Environment.discardDraft()`; the live flow was never touched.
9. **Always.** After finalize the draft is discarded; the next turn snapshots a fresh baseline and (on first mutate) forks a fresh draft from it.

### S6 · Run lifecycle — + {Flow layer, RunTracker}

Runs hit the live flow, so they are gated — but **once per turn**, not per call:

- On the **first** `run_*` that _passes the precondition and reaches dispatch_, the Orchestrator writes a "run?" gate; Panel shows Confirm / Decline. On Confirm the run dispatches. A blocked (`not_persisted`) attempt records `pendingRunIntent` and **neither fires nor consumes** the gate — so the first _dispatchable_ run (e.g. after promote) still asks.
- **Subsequent** dispatchable runs in the same turn proceed **without re-asking**. The counter is **not** reset by a mid-turn promote/re-arm.
- The confirmation resets each turn.
- Dispatch is fire-and-forget at the API level; the run tool `await`s **RunTracker** for the terminal result in one call, which flows into the next loop iteration (see [Run tracking](#run-tracking)).

---

## The commit path (promote)

Promote is the only place draft structure becomes live. It replays the diff through the **awaited** human persistence primitives, **one operation at a time**, so each server id is resolved before it is referenced and every write lands before the reload.

**Every `binding.persist.*` call is an awaited server write.** Creates use `createNodeAsync` + `waitForNodeId` (an awaitable that resolves with the server id and **rejects on failure**; it has **no built-in timeout**, so the binding wraps one — a never-settling mutation must not hang promote). Config/label edits use awaited `mutateAsync` over `upsertNode` ([api/nodes.ts:111](../../../libs/flows/src/api/nodes.ts#L111)). Edges and deletes use awaited `mutateAsync` over the exported `upsertFlow` API ([api/flows.ts:105](../../../libs/flows/src/api/flows.ts#L105)) — a **fresh** mutation, since `createEdgeAsync`'s own mutation isn't exported ([useEdgeSync.ts:104](../../../libs/flows/src/hooks/useEdgeSync.ts#L104)). New-node positions ride in the create body, so there is **no separate position write**. Promote **does not** use `syncNodeUpdate` (500 ms debounced) or `createEdgeAsync`'s success-only callback — a wrapper over `syncNodeUpdate` resolves _before the POST is sent_, so the subsequent reload would refetch pre-edit server state and silently revert the agent's edit.

**Ordering** (dependency-safe; teardown before build-up):

1. **disconnect** removed edges — `binding.persist.deleteEdges` (awaited `upsertFlow` tombstones `{ id: '#<id>' }`).
2. **delete** removed nodes — `binding.persist.deleteNodes` (awaited `upsertFlow` tombstones; node deletes cascade their edges server-side).
3. **create** added nodes — `binding.persist.createNode(tempId, body)` → `createNodeAsync` (`POST /nodes/0/upsert`, [useNodeSync.ts:213](../../../libs/flows/src/hooks/useNodeSync.ts#L213)), then `await waitForNodeId(tempId)`; record `tempId → serverId` (the `idMap`). The node's default **position travels in `body`** (a required field), so it persists here — there is no separate reposition step.
4. **config/label** on modified nodes — `binding.persist.updateNode` (awaited `mutateAsync` over `upsertNode`, carrying `config`/`customLabel`).
5. **connect** added edges — `binding.persist.upsertEdges` (awaited `upsertFlow`). Edge endpoints are resolved through the `idMap` **before** the POST — a temp endpoint is never transmitted.

**Any op rejection aborts the replay.** If any awaited write rejects, promote stops and returns an error; the Orchestrator surfaces it and routes to the drift/replan path — it does **not** swallow the failure or continue over a partial commit. The next turn re-snapshots from now-live and reconciles whatever landed.

**Reflect on the live canvas.** Only **after all writes land**, `binding.reload()` fetches `loadFlow(flowId)` and pushes it into the live canvas (`canvasRef.loadWorkflow` on desktop; `store.loadWorkflow` on mobile) — the exact reload the socket `FlowUpdateMessage` handler performs ([useSocketHandlers.ts:55](../../../apps/web/src/app/features/flows/hooks/useSocketHandlers.ts#L55)). Promoted nodes appear with real ids.

**Correctness rules baked into `promote`:**

- **Flush owner edits first.** `await` the owner's pending autosave to the server **before** the replay (via the binding). This persists owner edits that don't trip the drift hash — most importantly a position drag (position is excluded from the drift hash) — so the mandatory reload doesn't revert them. There is **no** "treat local `readGraph()` as baseline" alternative: the reload is a wholesale server-authoritative replace, so an un-flushed local edit is lost unless it reached the server. The flush completes before the first agent write so it doesn't race the per-op commits.
- **Suppress self-echo across the _whole_ replay + reload.** Hold a suppression flag (or re-stamp on **every** persist) spanning the entire replay **and** reload — **not** a single commit-time stamp. The self-echo window is a fixed 3 s from the last stamp ([useInitFlowSocket.ts:399](../../../libs/socket/src/hooks/useInitFlowSocket.ts#L399)); a multi-node build easily exceeds 3 s, so a one-shot stamp goes stale and a later `FlowUpdateMessage` escapes suppression → a mid-replay reload of a **partial** server graph. (The human path avoids this because every discrete save re-stamps.)
- **Assume single-editor during the replay (no lock in v1).** The replay is a multi-second sequence of server round-trips, so an owner edit landing _during_ it is theoretically unguarded. Under the **owner + their own agent** assumption, and because the owner _just accepted the plan_, v1 **assumes the owner does not edit during the short replay** rather than building a canvas lock. Two safety nets, both free:
    - **Drift re-check immediately before the replay** (S5.7) — if the owner changed the flow between Accept and promote, the hash differs → abort → replan.
    - **Abort-on-rejection** — if an owner edit _does_ land mid-replay and invalidates an op (e.g. they delete a node a `connect` references), the awaited `upsertFlow` rejects → the replay aborts and the next turn reconciles.
    - One case slips past both nets — a mid-replay owner edit that invalidates no op (an add, or an edit to a node the agent didn't touch), silently dropped by the authoritative reload ([Drift](#concurrency--drift-owner--agent) details it). Closing it needs a transient **owner-lock** (a `promoting` read-only flag threaded into the canvas): a clean _optional_ hardening, but **new machinery** today (`WorkflowCanvas` gates edits only by static role permissions, no transient read-only toggle), so it is deferred, not built. A post-replay/pre-reload drift re-check would be **inert** (the local hash isn't touched by the replay) and is not used.
- **Provide an explicit revert — not native undo.** The requirement is to _toggle back and forth between the pre-agent and post-agent version_. Native Ctrl-Z can't serve it (the binding can't reach `saveCheckpoint`; `reload()` clears the undo stack) and is the wrong tool anyway (undo is a local `setNodes` while the promoted state is already persisted server-side). Instead, retain **both** the pre-promote `binding.readGraph()` snapshot **and** the post-promote one (captured on the reload), and offer a **version toggle**: to switch versions, compute `diff(current-live, targetSnapshot)` and commit it through `binding.persist` + reload — **remove** the nodes present only in the current version (`upsertFlow` tombstone), **re-add** the ones present only in the target **by their original id** (`upsertFlow` with the node's full record), and **update in place** any shared node whose config/label differs. This hinges on a backend fact: **node deletion is reversible** — a tombstoned node can be re-added by its original id via `upsertFlow` (confirmed with the flow team; the human editor never does this, so it is a new — but backend-supported — usage of the existing primitive, not a client-verifiable one). Because a re-added node keeps its **original id**, node ids are **stable across toggles**: edges re-key to existing ids (no id remap), and **run history / saved port refs stay valid** — which is exactly what makes the back-and-forth clean (pre-agent ⇄ post-agent). The only unavoidable fresh id is the _initial_ creation of a genuinely new node at first promote; it is stable thereafter. This delivers the toggle without touching undo internals, and (per the user) is preferable to the buggy native undo/redo.

---

## Run tracking

`runNode`/`runFlow` only **kick off** execution; the definitive result (traces, outputs, terminal state) arrives asynchronously over the socket and is normalized into the live store by `finalizeRun` ([useCanvasStore.ts:312-334](../../../libs/flows/src/stores/useCanvasStore.ts#L312-L334)). There is no awaitable today — **RunTracker** builds one on top of that pipeline.

- **Correlate by _new_ runId + read synchronously on attach.** `runId` is server-minted and arrives over the socket. At dispatch, **snapshot the existing `runId`s for each target**; this run's `runId` is the first _new_ one to appear (robust to stale prior runs kept by `MAX_RUNS_PER_NODE`). Attach the store subscription, **then do a synchronous `nodeRuns` read** — a fast/cached run can reach terminal _during_ the awaited dispatch, before `subscribe()` attaches, and a plain zustand `subscribe` only fires on _subsequent_ changes; without the sync read the await stalls to the 60 s timeout. `finalizeRun` auto-creates a terminal `RunContext` for a final-only event ([useCanvasStore.ts:315-324](../../../libs/flows/src/stores/useCanvasStore.ts#L315-L324)), so a **direct-to-terminal** run is caught by the sync read — not by an `enter`-latch (there may be no `enter`).
- **`run_node`** — wait set = `[nodeId]`; resolve when terminal (`COMPLETED`/`ERROR`).
- **`run_flow` — split the dispatch set from the wait set.** The **dispatch set** is derived by **block stereotype** (`stereo === 'input' && autoExecutionEnabled !== false`) — the _same_ derivation the human **"Run All"** button uses (`WorkflowCanvas.tsx` `runAll`, mobile `useMobileRunAll`) — **not** `useFlowExecution`'s topology derivation. The **wait set** is the nodes that actually **enter `RUNNING`** (latched on first `RUNNING`/`enter`), bounded by 60 s — waiting on the dispatch set alone resolves prematurely; waiting on _all_ nodes stalls on untaken conditional branches. Explicit `nodeIds` become the dispatch set.
- **Timeout.** Reuse the 60 s `POLL_TIMEOUT` ([useFlowExecution.ts](../../../apps/web/src/app/features/process/hooks/useFlowExecution.ts)); on timeout resolve `timedOut: true` (there is no `'TIMEOUT'` node state) and let the agent fall back to `get_node_runs`.
- **Result fed to the LLM.** On terminal, read outputs via `getPortData(portId, 'out', { flowId, runId })` (same API the socket handler uses, [useSocketHandlers.ts:238](../../../apps/web/src/app/features/flows/hooks/useSocketHandlers.ts#L238); note the mandatory `direction` positional arg) and return `{ nodeId, state, error?, outputs }`.
- **The socket `connection` id comes through the `CanvasBinding`.** Runs must pass the WS `connection` id so results stream back to _this_ client. That id is **React state that changes on reconnect** and is **not** in any store (`useWebSocketStore` holds an unrelated `id`), so the non-React Environment can't read it from a store. The `CanvasBinding` exposes it as a **live getter** (read at dispatch time). Without this bridge, every agent run times out at 60 s.

### Build-and-run in one prompt

The trigger is explicit, not inferred:

1. Agent builds in the draft (reasoning loop, `mutate` tools).
2. A `run_*` whose target the draft has changed returns `not_persisted` (see [Runs require unaffected targets](#runs-require-unaffected-targets)); the Orchestrator records it as a **`pendingRunIntent`** `{ tool, args }`. This is the _only_ auto-continue signal.
3. Loop ends → **plan gate** (Accept/Reject).
4. On Accept → **promote** (persist + build `idMap`).
5. **If `pendingRunIntent` is non-empty** → the turn **auto-continues**: re-snapshot the baseline from now-live (re-arming the lazy fork), remap the recorded targets `temp → real` via the `idMap`, and replay them (dispatch set now derived over the **promoted** live structure) into the run gate. The gate counter is preserved across the re-arm, so this first _dispatchable_ run still asks. **If empty** → the turn ends after promote.
6. Further runs proceed without re-asking → final message.

**`pendingRunIntent` is persisted alongside the Plan message** (small, turn-scoped). Otherwise a **reload during the plan gate** would silently drop the "…and run it" half: `awaiting_plan` survives reload (so the plan is still resolvable), but a non-persisted intent would be empty → auto-continue sees nothing → the run vanishes with no notice. Persisting it: the recorded temp targets match the temp ids in `Plan.steps`, so the promote `idMap` still remaps them, and the (correctly non-persisted) run-gate latch resets on reload so the re-armed run re-asks.

The turn is bounded by the per-turn iteration cap, which persists across the in-turn re-entry.

---

## Concurrency & drift (owner + agent)

v1 supports only **owner + their own agent** editing one flow (multi-user co-editing is out of scope). Because the draft is forked once, the owner's live edits during a turn never corrupt the agent's in-flight draft — the two diverge cleanly. The risk is only at **promote**, where the diff commits onto a live flow that may have moved.

**Detection: content hash, not `seq`.** There is no reliable client-side persisted-version counter — `FlowModel.seq` is a _WebSocket event-ordering_ number, not a save version, and config saves return no flow version. So drift is detected by hashing the **semantic projection** (node `{id, type, config, label}` + edge 4-tuple); position and runtime fields are excluded, so a cosmetic owner-drag never marks a plan stale:

- `baselineHash` is computed at `snapshotBaseline()` (S2).
- Drift is checked when the plan gate is presented and re-validated **immediately before** the replay begins.
- On stale detection the Orchestrator **does not promote** (or aborts an in-flight promote): it informs the user, re-snapshots a fresh baseline, and asks the agent to **replan** against it.

**The replay is a window, not a point** — but v1 does not lock the canvas (see [Commit path](#the-commit-path-promote)). Under the single-editor assumption the two free nets cover the _dangerous_ cases: the **pre-replay drift re-check** catches anything the owner changed between Accept and promote, and **abort-on-rejection** catches a mid-replay edit that _invalidates an op_ (e.g. deleting a node a `connect` references). They **do not** catch a mid-replay owner edit that invalidates no op — an **add**, or a config/label change to a node the agent didn't touch — which, if it hasn't cleared the owner's debounced autosave, is **silently discarded by the authoritative reload**. That residual slice is exactly what a transient owner-lock (or a single atomic server transaction) would close; both are deferred (the lock is new UI machinery; the transaction needs backend support and conflicts with the one-at-a-time human path), so v1 accepts it under the single-editor assumption — the owner just accepted the plan and is not expected to edit during the few-second replay.

**Early trigger (optional).** Subscribe to `FlowUpdateMessage` ([socket types:59](../../../libs/socket/src/types/index.ts#L59)) during the turn (respecting the 3 s self-echo window) as a cheap "owner just edited" wake-up. The hash stays the source of truth; the event only prompts an earlier re-check.

---

## Gate (shared primitive)

Both Accept/Reject (plan) and Confirm/Decline (run) are the _same_ mechanism: Orchestrator suspends the turn → writes `pending` to Storage → Panel renders the decision → Panel calls `resolvePending` → Orchestrator resumes. There is one `pending` slot; the plan gate (finalize) and the run gate (in-loop) are time-disjoint within a turn, so they never collide.

## UI-sync (shared)

Always the same triangle: Panel emits commands → Orchestrator writes state → Storage → Panel reactively renders. Panel is a pure view; Orchestrator is the only writer. Streaming, gates, and status are all just store writes.

---

## Component interfaces

The typed shape of every seam — branded ids, discriminated `ToolResult`/`FlowDiff`/`Plan`/`Gate`/`TurnPhase` unions, kind-scoped tool surfaces, and the `Environment`/`CanvasBinding`/`RunTracker`/`Storage`/`Gateway` contracts — lives in **[`component-interfaces.md`](component-interfaces.md)**, consistent with this file as of this revision.

| Concept here                          | Interfaces there                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Reasoning loop, gates, phases         | `Orchestrator`, `TurnPhase`, `Gate` / `GateResolution`                                                    |
| Tool dispatch                         | `ToolRegistry`, `ToolExecutor` (kind-scoped `SurfaceFor<K>`), `ToolCall` / `ToolResult`                   |
| Draft / diff / plan / promote / drift | `Environment`, `CanvasBinding`, `Draft`, `FlowDiff`, `Plan` / `PlanOperation`, `Baseline` / `DriftStatus` |
| Runs                                  | `RunTracker`, `RunRequest` / `RunHandle` / `RunOutcome`                                                   |
| Reads / snapshot / catalog            | `ReadCanvas`, `FlowSnapshot`, `NodeSnapshot`, `BlockCatalogEntry`                                         |
| Session / persistence / streaming     | `AgentSession` / `AgentMessage`, `StorageInterface`, `LlmGateway`                                         |

---

## Future-refactor concern

**Desktop canvas is not store-backed.** The desktop editor (`WorkflowCanvas.tsx`) renders the graph from component-local `useState` ([:257-258](../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx#L257-L258)); mobile and the agent use `useCanvasStore`. In v1 the desktop human editor and the agent share the **persistence** layer (via `CanvasBinding.persist`) but not the **mutation** layer (desktop = local-`useState` handlers; agent = store actions), bridged by the binding.

**Planned refactor:** migrate `WorkflowCanvas` onto `useCanvasStore` as its single source of truth (~50-60 call sites; ~80% mechanical). Watch four non-mechanical areas: the multi-select `Set<string>` (store has a single `selectedNodeId`), the `createNodeAsync` temp→real remap that threads React setters, the ref-based undo/redo history, and the socket-sync updaters. When done, human (both platforms) and agent collapse onto **one** mutation layer, `CanvasBinding` shrinks to a trivial reload, native undo becomes viable for promoted changes, and draft/live symmetry becomes exact. A headless-callable `auto_layout` (extracting the shared algorithm out of the component ref) is a natural follow-on once this lands.

---

## Resolved / open decisions

- ~~Post-promote run continuation~~ → **resolved:** explicit `pendingRunIntent` (persisted with the Plan); auto-continue only if the agent attempted a run blocked by an un-promoted draft.
- ~~Draft-edited port-data staleness~~ → **resolved:** `get_port_data` is a live fetch of persisted output; rely on the system prompt.
- ~~Plan op-derivation / reconcile safeguard~~ → **resolved:** the diff _is_ the op set; presented ≡ applied by construction.
- ~~Drift detection mechanism (`seq` vs hash)~~ → **resolved:** content hash of the semantic projection.
- ~~Promote from a non-React Environment~~ → **resolved:** the React-owned `CanvasBinding` exposes the human persistence primitives; the Environment orchestrates the ordered one-by-one replay.
- ~~Concurrent-edit lock during promote~~ → **resolved for v1:** _assume_ single-editor (owner just accepted); guard with pre-replay drift re-check + abort-on-rejection. An owner-lock is optional future hardening.
- ~~Layout / node positioning~~ → **resolved for v1:** no agent layout tool; new nodes get a default position that persists **in the create body** (no separate reposition step); humans use the existing Auto Layout button.

**Hardened after code review** (each defect verified against the codebase):

- **Awaited writes** on promote (`mutateAsync`/`waitForNodeId`), not debounced/fire-and-forget — else the reload reverts non-awaited edits.
- **Replay-spanning self-echo suppression** (flag, not one-shot stamp) — else a >3 s build lets a mid-replay reload load a partial graph.
- **Flush owner edits** before commit (the "or treat local as baseline" alternative was false).
- **Explicit id-preserving version toggle** (two retained snapshots; re-adds removed nodes by original id via `upsertFlow`, so ids stay stable and run history/port refs survive) replaces the unworkable native-undo promise.
- **Single-editor assumption + pre-replay drift re-check + abort-on-rejection** for the promote window (owner-lock deferred).
- **`label` round-trips** via `update_node_config` `{ config?, label? }`.
- **Run correlation** by new-runId snapshot + synchronous `nodeRuns` read — fixes the fast/cached-run 60 s stall.
- **`run_flow` dispatch-set vs wait-set** split, block-stereotype derivation matching Run All.
- **Socket `connection` id via `CanvasBinding`** — else every run times out.
- **Affected-target run precondition** — fixes "add a step and run my flow" without over-blocking unrelated troubleshooting runs.
- **`pendingRunIntent` persisted** — survives a reload at the plan gate.

**Open (implementation-level):**

- The desktop→store migration above (the agent ships on the `CanvasBinding` bridge until then).
