# Agent Chat — Specification (skeleton v0)

> **Scope:** the smallest coherent version of the in-browser flow agent — it **generates and edits**
> flows by chat (add / remove / reconfigure / **rename / move** blocks). Running flows, multi-editor
> safety, and durable backend persistence are **deferred** (§9). Earlier, fuller design iterations are
> kept for reference under [`archive/`](archive/).
>
> Friendly companion with diagrams: **[README.md](README.md)**. · Last updated: 2026-07-12.

---

## 1. What it is

A side-panel agent in the flow editor. It reads the flow you're editing, proposes changes against a
hidden **draft** copy, and — only after you approve a diff — **swaps** the draft into your live canvas.

One turn:

1. You send a message.
2. The agent thinks (LLM) and calls **tools** to read the flow + block catalog and to mutate a
   **draft** copy of the flow.
3. When it's done, the **draft-vs-original diff** is shown to you as a plan.
4. **Accept** → the draft replaces your live flow in one step. **Reject** → the draft is discarded.

The live flow is never touched until Accept.

## 2. Principles (locked)

1. **No auto-approve** — nothing is applied without an explicit click.
2. **All-or-nothing plan** — you accept or reject the whole diff; no partial toggling.
3. **Draft-first** — mutations land in a forked draft, never the live flow.
4. **Apply the whole draft, don't replay operations** — on Accept we swap in the exact draft you
   reviewed. The diff is just the human-readable summary of what changed, so "what you saw" and "what
   got applied" are the same object by construction.

## 3. Assumptions (this version)

To stay as simple as possible, the skeleton assumes a **frontend-swap apply model**:

- **Applying changes = swapping the flow on the frontend.** On Accept the whole draft is loaded into
  the live canvas in one step (`binding.swapFlow`). No per-node server replay, no operation ordering,
  no temp→real id remapping.
- **Autosave is not triggered by the swap.** Because the swap doesn't kick off autosave, none of the
  debounce / self-echo / flush machinery from earlier designs is needed.
- **Label and position are frontend-only.** They don't touch the backend (today they do, via
  `upsertNode`; that will be fixed later). This is what lets the agent freely edit them and include
  them in the swap.
- **Durable backend persistence is out of scope here.** The agent produces a new frontend flow state
  and swaps it in; new nodes keep their `temp:` id in the frontend until a later real save. Saving to
  the server rides on the normal flow-save path and is a later concern.

These assumptions are exactly what make the commit a single, safe, synchronous step. When they change
(real server persistence, multiple editors), the deferred hardening in §9 comes back.

## 4. Components

| Component         | Role                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| **Agent Panel**   | Chat UI. Emits `send` / `resolvePlan`; renders purely from the session store. No logic.                 |
| **Orchestrator**  | Owns the turn and is the **only writer**. Runs the think/act loop and the approval gate.                |
| **LlmGateway**    | The one outbound LLM dependency (a real browser impl + a fake for tests).                               |
| **ToolExecutor**  | Runs each tool call the model emits: validate → permission → do it → result.                            |
| **Workspace**     | Owns the **draft**. Snapshots the baseline, diffs, and swaps the draft in. The model never calls these. |
| **CanvasBinding** | The single seam to the real, React-owned canvas: read it, edit a node, swap it.                         |
| **Storage**       | The persisted session (`SessionState`) the Panel renders from.                                          |

## 5. Interface definitions

Everything, in one place. Ids are **plain strings**; a draft-only node carries a `"temp:"`-prefixed
id that stays as-is after the swap (until a later real save). Branded ids are deferred (§9).

```ts
// ── 1 · Orchestrator ───────────────────────────────────────────────────────
interface Orchestrator {
    send(text: string): Promise<void>; // append user msg → run the whole turn
    resolvePlan(decision: 'accept' | 'reject'): void; // Panel → resume at the plan gate
    abort(): void; // cancel the in-flight stream, discard the draft
}

// ── 2 · LlmGateway ─────────────────────────────────────────────────────────
interface LlmGateway {
    chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk>;
}
interface ChatRequest {
    messages: ChatMessage[];
    tools: ToolDef[];
    stream?: boolean;
}
interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    toolCalls?: { id: string; name: string; args: string }[];
    toolCallId?: string;
}
interface ToolDef {
    name: string;
    description: string;
    parameters: JsonSchema;
}
interface Chunk {
    text?: string;
    toolCall?: { id: string; name: string; argsDelta: string };
    done?: boolean;
}

// ── 3 · ToolExecutor ───────────────────────────────────────────────────────
// Tool identity is an open string so tools can be discovered at runtime (dynamic /
// external / MCP). The built-ins are a known subset, not the whole universe.
type BuiltinToolName =
    | 'list_blocks'
    | 'get_flow' // read   → catalog / live-or-draft
    | 'add_node'
    | 'update_node'
    | 'delete_node'
    | 'connect'
    | 'disconnect'; // mutate → draft only
interface ToolCall {
    id: string;
    name: string;
    args: unknown;
}
type ToolResult = { toolCallId: string; ok: true; data?: unknown } | { toolCallId: string; ok: false; error: string };

// A ToolProvider owns a set of tools and can list + run them — the seam that
// dynamic / MCP tools plug into. One BuiltinToolProvider (the flow tools) today.
interface ToolProvider {
    listTools(): Promise<ToolDef[]> | ToolDef[]; // discovery (MCP: tools/list)
    owns(name: string): boolean;
    dispatch(call: ToolCall): Promise<ToolResult>; // run one   (MCP: tools/call)
}
interface ToolExecutor {
    listTools(): Promise<ToolDef[]>; // union across providers → the LLM's tool defs
    dispatch(call: ToolCall): Promise<ToolResult>; // validate → permission → route to the owning provider
}

// ── 4 · Workspace (draft + swap; never LLM-callable) ────────────────────────
interface Workspace {
    snapshotBaseline(): void; // read the live flow → keep as baseline + seed for the draft (no fork)
    getFlow(): FlowSnapshot; // structural read: the draft if it exists this turn, else live
    mutate: MutateOps; // the draft-only editing surface
    diff(): FlowDiff; // draft vs baseline = the review summary
    promote(): void; // swap the whole draft into the live canvas (synchronous; no server writes)
    discard(): void; // drop the draft (Reject / turn end)
}
interface MutateOps {
    addNode(input: { type: string; position?: XY; config?: Record<string, string>; label?: string }): {
        tempId: string;
    };
    updateNode(id: string, patch: { config?: Record<string, string>; label?: string; position?: XY }): void;
    deleteNode(id: string): void;
    connect(edge: Edge): { edgeId: string };
    disconnect(edgeId: string): void;
}

// ── 5 · CanvasBinding (the one door to the real canvas) ─────────────────────
// Graph = the live canvas shape from the store: { nodes: NodeData[]; connections: Connection[] }
// (NodeData / Connection are existing codebase types — see §7).
interface CanvasBinding {
    readGraph(): Graph; // live structural read
    updateNode(id: string, patch: { label?: string; position?: XY }): void; // one node, immediate, frontend-only
    swapFlow(graph: Graph): void; // replace the whole flow at once (apply a draft)
}

// ── 6 · Session (what the Panel renders from) ───────────────────────────────
interface SessionState {
    flowId: string;
    messages: Message[];
    phase: 'idle' | 'thinking' | 'awaiting_plan' | 'done' | 'error';
    plan?: Plan; // present while phase === 'awaiting_plan'
}
interface Storage {
    load(flowId: string): SessionState | null;
    create(flowId: string): SessionState;
    save(state: SessionState): void; // localStorage; called on every change
}

// ── Data shapes ─────────────────────────────────────────────────────────────
type Graph = { nodes: NodeData[]; connections: Connection[] }; // existing codebase types (§7)

interface FlowSnapshot {
    flowId: string;
    nodes: NodeView[];
    edges: Edge[];
}
interface NodeView {
    id: string;
    type: string;
    label?: string;
    position: XY;
    config?: Record<string, string>;
    inputs: { portId: string; type?: string }[];
    outputs: { portId: string; type?: string }[];
}
interface Edge {
    id?: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
}
interface XY {
    x: number;
    y: number;
}

interface FlowDiff {
    addedNodes: { tempId: string; type: string; position: XY; config?: Record<string, string>; label?: string }[];
    removedNodes: string[];
    modifiedNodes: { id: string; config?: Record<string, string>; label?: string; position?: XY }[];
    addedEdges: Edge[];
    removedEdges: string[];
    isEmpty: boolean;
}
interface Plan {
    id: string;
    explanation: string;
    diff: FlowDiff;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content?: string;
    toolCalls?: { id: string; name: string; args: unknown; status: 'proposed' | 'running' | 'ok' | 'error' }[];
    plan?: Plan; // assistant plan message → rehydrates the gate on reload
    ts: number;
}
```

## 6. Detailed specifications

### 6.1 Orchestrator

The spine. `send(text)` runs the entire turn; the loop and the gate live _inside_ it.

`send(text)`:

1. Append the user message; set `phase = 'thinking'`; `workspace.snapshotBaseline()`.
2. **Reasoning loop** (bounded by a per-turn iteration cap):
    - Build the request: system prompt + history + tool defs, plus the **structural snapshot on the
      first iteration only** (`workspace.getFlow()`).
    - `gateway.chat(req)`; stream text deltas into the store (the Panel shows text appear — streaming
      is store writes, not a socket).
    - If the model emits **tool calls** → `executor.dispatch()` each, append results, continue.
    - If it returns **final text only** → exit the loop.
3. **Finalize:** `diff = workspace.diff()`.
    - `diff.isEmpty` (pure Q&A / read-only turn) → emit the final answer; `phase = 'done'`.
    - Otherwise ask the model, in one dedicated completion, for a natural-language **`explanation`**
      of the diff (fallback: a mechanical summary). Build the `Plan`, set `phase = 'awaiting_plan'`,
      store it → the Panel renders the approval card.
4. `resolvePlan('accept')` → `workspace.promote()` (the swap) → `phase = 'done'`.
   `resolvePlan('reject')` → `workspace.discard()` → `phase = 'done'`.

Because the swap is synchronous there is no separate "promoting" phase. `abort()` cancels the
in-flight gateway stream (via `AbortSignal`) and discards any draft. There is exactly **one** gate at
a time, so a single `plan?` slot on `SessionState` suffices.

### 6.2 LlmGateway

The only outbound LLM dependency, behind one interface so it can be swapped:

- **`BrowserLlmGateway`** — Stage 1, bring-your-own-key, talks to the provider directly.
- **`FakeGateway`** — deterministic scripted responses for tests.

`chat(req)` returns an async stream of `Chunk`s (text and/or tool-call deltas). The provider-neutral
request shape mirrors chat-completions; a proxy gateway and multi-provider drivers are deferred (§9).

### 6.3 ToolExecutor & tools

`dispatch(call)` is the single choke-point per tool call: **validate** `args` against the tool's JSON
Schema → **check permission** (the tool's `requires` flag against `FlowPermissions`) → **route by
name** → return a `ToolResult`. `data` is the compact value fed back to the model (e.g. a new node's
`tempId`, or a `FlowSnapshot`).

Tools live behind **providers** (`ToolProvider`): `listTools()` advertises them to the LLM and
`dispatch()` routes a call to whichever provider owns that name. Today there's one
`BuiltinToolProvider` (the flow tools below); a dynamic / MCP provider can be added later with no
change to the Executor (§9).

| Tool          | Kind   | Target                                   | Notes                                                                                            |
| ------------- | ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `list_blocks` | read   | block catalog                            | the palette the agent composes from                                                              |
| `get_flow`    | read   | **draft if forked this turn, else live** | so the agent sees its own in-progress edits                                                      |
| `add_node`    | mutate | **draft**                                | `{ type, position?, config?, label? }`; position optional (a default is assigned)                |
| `update_node` | mutate | **draft**                                | `{ config?, label?, position? }` — reconfigure, **rename**, and/or **move**; config patch merges |
| `delete_node` | mutate | **draft**                                |                                                                                                  |
| `connect`     | mutate | **draft**                                | 4-tuple endpoints                                                                                |
| `disconnect`  | mutate | **draft**                                | by edge id                                                                                       |

- **Label & position are first-class mutations now** (§3): `update_node` can rename (`label`) and move
  (`position`) an existing node, and `add_node` can place a new one. They ride along in the swap — no
  backend write.
- **Permissions:** mutate tools require the relevant `FlowPermissions` flag (`canModifyCanvas` /
  `canEditStructure` / `canEditConfig`); a denied call returns `{ ok:false, error }` and changes nothing.
- **Lazy fork:** the _first_ mutate call triggers the draft fork; before that, `get_flow` reads live.
- **No `run_*`, no runtime reads, no skill/layout/metadata tools** in the skeleton — see §9.

### 6.4 Workspace (draft, diff, swap)

Owns the draft and the `CanvasBinding` as private fields; exposes only the turn-boundary methods above
(the model reaches the draft only indirectly, through the mutate tools).

- **`snapshotBaseline()`** — `binding.readGraph()` → keep as the **baseline** (what the diff compares
  against, and what the draft is seeded from). Does not fork.
- **The draft** — a second, **headless** instance of the canvas store (`createCanvasStore()`), seeded
  from the baseline with **identical ids** via `loadWorkflow`. Mutations run the store's existing pure
  actions, so nothing leaks anywhere during the turn (§7). Forked lazily on the first mutate; discarded
  at turn end.
- **`getFlow()`** — structural read: the draft if forked this turn, else live.
- **`diff()`** — compare the draft to the baseline: nodes **added** (temp id absent from baseline),
  **removed**, or **modified** (same id, and any of `config` / `label` / `position` differs); edges
  **added** / **removed** by 4-tuple. `isEmpty` when nothing changed. This is the review summary shown
  in the plan — it **does not** drive the commit.
- **`promote()`** — `binding.swapFlow(draftGraph)`: replace the live canvas with the draft in one
  synchronous step. No server writes, no ordering, no id remapping; autosave stays off. Because we
  install the exact draft you reviewed, "presented ≡ applied" holds by construction. Assumes the live
  flow was not edited during the turn (single editor); otherwise the swap would overwrite that edit —
  deferred (§9).
- **`discard()`** — drop the draft; the live flow was never touched.

### 6.5 CanvasBinding

The seam that lets the (non-React) Workspace reach the React-owned live canvas. It exists because on
desktop the live canvas renders from **component-local state in `WorkflowCanvas.tsx`, not the store** —
so the Workspace can't read/write it directly. Injected at mount; desktop wraps the canvas ref, mobile
wraps the live store.

- **`readGraph()`** — the live `{ nodes, connections }`.
- **`updateNode(id, patch)`** — one node's label / position, applied immediately (frontend-only).
- **`swapFlow(graph)`** — load `graph` into the live canvas (the draft, on Accept). Wraps the same
  `loadWorkflow` the socket `FlowUpdateMessage` handler uses, with autosave suppressed.

Implementation detail (desktop impl, dev panel, grounding): **[canvas-binding.md](canvas-binding.md)**.

### 6.6 Session & storage

`SessionState` is the whole persisted turn state; the Panel is a pure function of it. `Storage`
loads/creates a session keyed by `flowId` and `save`s on every change (streaming deltas, phase
transitions, the plan). The **render loop** is one-way: Panel emits commands → Orchestrator writes
`SessionState` → store → Panel re-renders. Persisting the `plan` on the assistant message means an
`awaiting_plan` gate survives a page reload.

### 6.7 Data shapes

See the block in §5. Notes:

- **`NodeView.position` is included** — position is now meaningful to the agent (it can place/move).
- **`FlowDiff` is a review summary**, not an executable op list: `modifiedNodes` carries whichever of
  `config` / `label` / `position` changed. The commit ignores the diff and swaps the whole draft.
- **`Plan = { explanation, diff }`** — the agent supplies only `explanation`; the diff is derived.

## 7. Grounding (what already exists)

Every seam wraps a primitive already in the repo — this is what makes the skeleton implementable
without new backend work.

| Seam               | Wraps                                                                                                                                                      | Where                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| draft store        | `createCanvasStore()` = `createStore(canvasStateCreator)` (`zustand/vanilla`, v5.0.10) — an additive factory beside the live `create()` singleton          | `libs/flows/src/stores/useCanvasStore.ts`                                                                  |
| `MutateOps.*`      | store pure actions `setNodes` / `updateNodeData` / `deleteNode` / `addConnection` / `deleteConnection` (no `addNode` action — create via `setNodes`)       | `libs/flows/src/stores/useCanvasStore.ts`                                                                  |
| `list_blocks`      | `blockRegistry` / `listBlocks()`                                                                                                                           | `libs/flows/src/stores/useFlowsStore.ts`, `libs/flows/src/api/blocks.ts`                                   |
| `readGraph` (live) | store `nodes`/`connections` (mobile); `WorkflowCanvasRef.getWorkflow()` (desktop)                                                                          | `libs/flows/src/stores/useCanvasStore.ts`, `apps/web/src/app/features/flows/components/WorkflowCanvas.tsx` |
| `updateNode`       | `WorkflowCanvasRef.updateNode(id, Partial<NodeData>)` — local `setNodes`, immediate, no server call                                                        | `apps/web/src/app/features/flows/components/WorkflowCanvas.tsx`                                            |
| `swapFlow`         | `loadWorkflow(graph)` on the live store / `canvasRef.loadWorkflow` (same primitive the socket `FlowUpdateMessage` handler uses) — with autosave suppressed | `libs/flows/src/stores/useCanvasStore.ts`, `apps/web/src/app/features/flows/hooks/useSocketHandlers.ts`    |
| permissions        | `FlowPermissions` (`canModifyCanvas`, `canEditConfig`, `canEditStructure`, `canRun`, …)                                                                    | `libs/flows/src/types/permissions.ts`                                                                      |

Reused codebase types (not redefined): `NodeData` (note **`config`**, not `data`; holds `position`),
`Connection`/`EdgeData` (the store collection is `connections`), `BlockDefinitionWithFrontend`,
`WorkflowState = { nodes, edges }`. New agent code is proposed for `libs/agent/src`, mirroring how
`flows`/`socket` are structured.

> **What is deliberately _not_ grounded here:** the old server-write primitives (`createNodeAsync` /
> `waitForNodeId`, `upsertNode`, `upsertFlow`) are unused in this version — the swap replaces them.
> They return when durable backend persistence does (§9).

## 8. The draft model (why it's safe)

The store (`useCanvasStore`) holds the whole graph and a complete set of **pure** mutation actions —
each a bare `set(...)` with **no network and no persistence**; persistence lives entirely outside the
store. The skeleton needs one **additive** refactor: expose the state-creator through a factory so a
second, headless instance can be built.

```ts
const canvasStateCreator = (set, get) => ({
    /* all state + actions, unchanged */
});
export const useCanvasStore = create(canvasStateCreator); // live singleton — consumers untouched
export const createCanvasStore = () => createStore(canvasStateCreator); // zustand/vanilla — the headless draft
```

A headless instance runs the real reducers (real validation) but has **none** of the persistence
surfaces attached, so draft edits stay in memory until the swap. Identical ids are **safe** (all
id-keyed side-effects attach to the live canvas only) and **required** (the diff matches pre-existing
nodes by id; regenerating ids would make everything read as removed + re-added).

## 9. Deferred (the roadmap)

Each is a clean addition to the skeleton, not a rewrite:

- **Durable backend persistence** — replace (or follow) the frontend swap with real server writes so
  changes survive reload; this is where label/position start touching the backend again and the old
  awaited-write commit path returns.
- **Runs** — `run_node` / `run_flow`, an awaitable run tracker over the socket, and "build-and-run in
  one prompt." Unlocks troubleshoot + execute.
- **Multi-editor safety** — a content **drift hash** so an Accept that would overwrite a concurrent
  owner edit is caught instead of clobbering it.
- **Revert** — trivial under the swap model: keep the baseline snapshot and `swapFlow` back to it.
  (Not built yet, just noted.)
- **Branded ids** — `ServerNodeId` / `TempNodeId` / … for compile-time guarantees once ids hit the
  server again.
- **Kind-scoped tool surfaces** — split the one executor into read/mutate surfaces so a read tool
  _cannot_ call a mutating primitive.
- **Dynamic & MCP external tools** — add a `ToolProvider` beside the built-in one (`listTools()` ↔ MCP
  `tools/list`, `dispatch()` ↔ `tools/call`). External tools don't edit the flow, so they stay out of
  the draft/plan loop and get their own approval. The open `string` name + `ToolProvider` already
  allow for this.
- **Prompt Builder / Skill Registry / provider drivers**, and a headless **auto-layout** tool.

---

Diagrams & narrative: **[README.md](README.md)** · Prior iterations: **[`archive/`](archive/)**
