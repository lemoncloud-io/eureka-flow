# Locator Agent — Specification (v0)

> **Scope:** the smallest end-to-end agent that **moves one existing node** by chat — "nudge the
> fetch node 10px to the right," "move _Summarize_ up 40px," "put the email node at x=200, y=120."
> It is the first concrete vertical slice of the agent architecture in
> [`design`](../../design/SPEC.md): it reuses the same `LlmGateway`, `ToolExecutor`,
> and the already-built `CanvasBinding`, but **drops the draft / plan / approval gate** — the move is
> applied straight to the live canvas. Adding / removing / reconfiguring nodes, and the approval flow,
> stay in scope of the design spec.
>
> Last updated: 2026-07-15.

---

## 1. What it is

A chat agent in the flow editor whose one job is **relocation**. You describe where an existing node
should go — relative ("right 10px", "up a bit") or absolute ("to x=200, y=120") — and the agent finds
that node and moves it. Position is a frontend-only property (§7), so a move is a single, safe,
synchronous canvas edit with no server write.

Crucially, **the agent is the only thing that edits the canvas.** The human — even the flow's owner —
does not drag nodes around directly; the canvas is theirs to _view_, and every change goes through the
agent. Moving a node by chat isn't a convenience alongside dragging — in this design it's _the_ way to
move a node.

One turn:

1. You send a message.
2. The agent thinks (LLM) and reads the flow to identify the target node and compute its new position.
3. It calls **`move_node`**, which applies the move immediately via the `CanvasBinding`.
4. The agent replies with a one-line confirmation (or, if it couldn't resolve the request, asks / reports).

## 2. Principles (locked)

1. **The agent is the sole editor.** The canvas is read-only to the human (owner included); all
   mutations flow through the agent. There is therefore no such thing as a concurrent human edit — the
   "single editor" concern from the design spec collapses to a guarantee (§3).
2. **Direct apply — no approval gate.** This version deliberately skips the plan/accept step; a
   `move_node` call takes effect at once. (The approval machinery from the design spec is deferred, §9.)
3. **Existing nodes only.** The agent never creates, deletes, connects, or reconfigures — it only
   changes a node's `position`. Anything else is out of scope and the agent declines.
4. **One node per move call.** A request that names several nodes becomes several `move_node` calls in
   the same turn; each call moves exactly one node.
5. **Frontend-only.** A move is `CanvasBinding.updateNode(id, { position })` — no backend write, no
   autosave trigger (§7).
6. **Resolve or ask — never guess destructively.** If the target is ambiguous (multiple matches) or
   missing (no match), the agent asks a clarifying question or reports it, and moves nothing.

## 3. Scope & assumptions (this version)

- **In:** move one existing node by a **relative delta** (direction + pixels) or to an **absolute
  point**; reference the node by its label/name or block type; move several nodes in one turn (one
  call each); confirm what it did.
- **Out (→ the design spec or §9):** add / delete / reconfigure / connect nodes; the draft + plan + Accept/Reject
  gate; permission prompts; multi-select / relative-to-another-node layout ("align these", "space them
  evenly"); undo of an agent move; durable server persistence.
- **Guarantee — sole editor.** Because only the agent writes to the canvas (§2.1), no drift check or
  concurrency handling is needed: the graph the agent reads at the start of a turn is still the graph it
  writes to. (Enforcing "human can't drag" in the canvas UI is a companion change — see §6.5 / §9.)
- **Assumption — canvas coordinates.** Origin top-left, `x` increases **right**, `y` increases
  **down** (§6.2). This is the existing canvas convention (`NodeData.position`).

## 4. Components

Same cast as the design spec, minus the Workspace (there is no draft — the move is applied live).

| Component         | Role                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Agent Panel**   | Chat UI, **docked on the right, always present** (§6.5). Emits `send`; renders from the session store.                            |
| **Locator Agent** | Owns the turn: runs the think/act loop, resolves the target node, computes the new position, moves it.                            |
| **LlmGateway**    | The one outbound LLM dependency — a dev **offline** gateway (no network, no key) + a fake for tests. Reused from the design spec. |
| **ToolExecutor**  | Runs the agent's tool calls: route by name → validate args → do it → result. Reused from the design spec.                         |
| **CanvasBinding** | The single door to the live canvas: `readGraph()` to find the node, `updateNode()` to move it. Built.                             |
| **Storage**       | The persisted session (`SessionState`) the Panel renders from. Reused from the design spec.                                       |

The `grant` / effective-set machinery of the design spec **is** live: the executor checks each tool's required
capability against the agent's grant (the mutate tool requires `canModifyCanvas`). Only the design spec's
session-role ceiling is deferred (§9).

## 5. Interface definitions

Only the pieces new to the locator agent are shown; everything else (`Agent`, `LlmGateway`,
`ToolExecutor`, `ToolProvider`, `SessionState`, `Storage`) is unchanged from
[design §5](../../design/SPEC.md#5-interface-definitions). `CanvasBinding` / `Graph` / `XY` are now
owned by the agent lib (`libs/agent/src/canvas/canvasBinding.ts`); the desktop binding implements them.

```ts
// ── The move tool's input ────────────────────────────────────────────────────
// Exactly one of `by` (relative) or `to` (absolute) is provided.
interface MoveNodeArgs {
    nodeId: string; // resolved id of the node to move (see §6.1)
    by?: { dx: number; dy: number }; // relative delta in px, in canvas coords (§6.2)
    to?: XY; // absolute destination in px
}

// ── Reading the flow, trimmed to what relocation needs ───────────────────────
// `list_nodes` returns just enough for the model to pick a target and do math.
interface NodeLocation {
    id: string;
    type: string; // block/process type
    label?: string; // the node's customLabel if set; otherwise omitted (v0). Resolving the
    // block's default label needs the block registry, which this lib
    // doesn't depend on — deferred (§9); the model falls back to `type`.
    position: XY;
}

// ── Agent turn phases (generic across agents; the locator uses this subset — no `awaiting_plan`) ──
type AgentPhase = 'idle' | 'thinking' | 'done' | 'error';

interface XY {
    x: number;
    y: number;
} // = the existing CanvasBinding XY
```

The locator agent is one `AgentConfig` (design §5): persona "relocate the user's nodes"; `grant` =
`{ canModifyCanvas }` (enforced — §6.3). Its `tools` = the shared **canvas tool provider**
(`list_nodes` + `move_node`); another agent reuses the same provider, and each tool's `requires` gates
it per call (§6.3).

## 6. Detailed specifications

### 6.1 The turn

`send(text)`:

1. Append the user message; set `phase = 'thinking'`.
2. **Reasoning loop** (bounded by a per-turn iteration cap):
    - Build the request: the agent's `systemPrompt` + history + tool defs, plus the current node list
      seeded directly (the same projection `list_nodes` returns), so the model can match a name/type
      to an id and read current positions.
    - `gateway.chat(req)`; stream text into the store.
    - If the model emits **`move_node`** calls → `executor.dispatch` each (applies the move), append
      results, continue.
    - If it returns **final text only** → exit the loop.
3. **Finalize:** emit the confirmation text (e.g. "Moved _Fetch_ 10px right → (210, 80)."); set
   `phase = 'done'`.

There is no draft, no diff, and no `awaiting_plan` gate — a `move_node` result _is_ the applied change.
`abort()` cancels the in-flight gateway stream. Moves already applied before an abort stay applied
(no rollback this version, §9).

### 6.2 Move semantics

- **Target resolution.** The model matches the user's reference (a label like _Summarize_, or a type
  like "the http node") against `list_nodes`. Resolution is name/type based and case-insensitive.
  In v0 only a node's **`customLabel`** is surfaced as its label; a node the user never relabeled is
  matched on its **`type`** (resolving the block's default label is deferred, §9).
    - **No match** → the agent reports it can't find that node; nothing moves.
    - **Multiple matches** → the agent asks which one (lists the candidates); nothing moves.
- **Relative (`by`).** Direction → sign, in canvas coords: **right** `dx = +n`, **left** `dx = −n`,
  **up** `dy = −n`, **down** `dy = +n`. New position = `{ x: pos.x + dx, y: pos.y + dy }`. Diagonals
  combine (e.g. "up-right 10" → `dx = +10, dy = −10`).
- **Absolute (`to`).** New position = `to` verbatim.
- **Vague amounts.** If the user gives no number ("nudge it right", "move it up a bit"), the agent
  uses a small default step (**20px**) and says so in its confirmation.
- **`move_node`** validates that exactly one of `by` / `to` is present and that `nodeId` exists in the
  live graph, then computes the final `XY` and calls `binding.updateNode(nodeId, { position })`.
  Positions may go negative — the canvas allows off-origin nodes; no clamping this version.

### 6.3 Tools

| Tool         | Kind   | Target      | Notes                                                                        |
| ------------ | ------ | ----------- | ---------------------------------------------------------------------------- |
| `list_nodes` | read   | live canvas | `binding.readGraph()` → `NodeLocation[]`; the palette of movable targets     |
| `move_node`  | mutate | live canvas | `MoveNodeArgs`; resolves final `XY` → `binding.updateNode(id, { position })` |

Both live in **one canvas tool provider** — a `ToolProvider` is a _source_ (it maps 1:1 to an MCP
server), so it's split by **domain**, not by read/mutate. Read vs. mutate is a **per-tool** property:
each tool's `requires` (`list_nodes` none, `move_node` `canModifyCanvas`) is what the executor checks
per call — route by name → validate args → check the capability → dispatch. Other agents reuse the same provider;
their `grant` decides what they may actually call. A future flow-edit agent adds sibling providers by
domain (config, edges, …), not more read/mutate splits.

No `add_node` / `delete_node` / `update_node`(config/label) / `connect` here — those belong to the
flow-edit agent (the design spec). If the user asks for one, the agent declines and points at what it _can_ do.

### 6.4 Session & storage

Reused from design §6.6, with the generic `AgentPhase` narrowed to the locator's subset (no `plan` slot,
since there is no approval gate). The render loop is unchanged: Panel emits `send` → the Agent writes `SessionState`
→ store → Panel re-renders. The session is persisted **per-flow, client-side** (keyed by `flowId`) so the
transcript survives a page reload / re-opening the flow; **durable _server_ persistence stays out of scope (§3).**

### 6.5 UI / layout

- **The Agent Panel is docked on the right and is always present** whenever a flow is open. There is
  **no open/close toggle** — the agent is a permanent part of the flow editor, because it is the only
  way to edit the canvas (§2.1). Opening a flow rehydrates its persisted session (design §6.6) so the
  conversation is there too.
- **The canvas occupies the remaining width** to the left of the panel: the panel is a fixed-width
  docked column and the canvas region **shrinks by exactly that width** (not an overlay). Actively
  **re-fitting** the viewport content to the smaller region is a further refinement, deferred unless it
  proves necessary (§9).
- **Direct canvas manipulation is disabled for the human** (dragging a node, etc.), consistent with
  §2.1. Enforcing this in `WorkflowCanvas` is a companion UI change tracked in §9; the locator agent
  assumes it but does not implement it.

## 7. Grounding (what already exists)

The move rides entirely on primitives already in the repo — no new backend work.

| Seam                | Wraps                                                                                                       | Where                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `list_nodes` (read) | `CanvasBinding.readGraph()` → `{ nodes, edges }`, projected to `NodeLocation[]`                             | `apps/web/src/app/features/flows/utils/createDesktopCanvasBinding.ts`      |
| `move_node` (apply) | `CanvasBinding.updateNode(id, { position })` → `WorkflowCanvasRef.updateNode` (local `setNodes`, immediate) | same file; `apps/web/src/app/features/flows/components/WorkflowCanvas.tsx` |
| node shape          | `NodeData` — `id`, `type`, `position: {x,y}`, `customLabel` (the label the agent matches / falls back on)   | `@lemoncloud/eureka-flows-api` (`NodeData`)                                |
| Agent / LLM / tools | `Agent`, `LlmGateway`, `ToolExecutor`, `ToolProvider`, `SessionState`, `Storage`                            | [`design` §7](../../design/SPEC.md#7-grounding-what-already-exists)        |

New agent code lives in `libs/agent/src` (as proposed by the design spec); the locator agent is its first
concrete `AgentConfig`, composed from the shared canvas tool provider (§6.3).

## 8. User stories (acceptance tests)

**Story 1 — relative nudge (the headline case).**

> **As** a flow editor, **I want** to say "move the Fetch node 10px to the right" **so that** I can
> place a node precisely — since dragging it myself isn't an option, the agent is how I move it.

- **Given** a flow with a node whose label is _Fetch_ at position `(200, 80)`,
- **When** I send _"move the Fetch node 10px to the right"_,
- **Then** the agent calls `move_node({ nodeId: <fetch>, by: { dx: 10, dy: 0 } })`,
- **And** the node's position becomes `(210, 80)` on the live canvas,
- **And** the agent replies confirming the node and its new position,
- **And** no other node moves and no plan/approval step appears.

**Story 2 — target not found (graceful failure).**

> **As** a flow editor, **I want** a clear response when I name a node that isn't there **so that** I'm
> not left guessing whether anything changed.

- **Given** a flow with no node matching _Translate_,
- **When** I send _"move the Translate node up 30px"_,
- **Then** the agent moves nothing,
- **And** it replies that it couldn't find a _Translate_ node (optionally listing the nodes it can see).

_(Nice-to-have coverage: absolute move "put Email at x=100, y=100"; vague amount "nudge it up" → 20px
default; ambiguous reference → asks which one.)_

## 9. Deferred (the roadmap)

Each folds cleanly back into the design:

- **Canvas viewport re-fit** — the canvas region already shrinks for the docked panel (§6.5); actively
  re-centering / re-fitting the graph within the smaller viewport is deferred until needed.
- **Enforce read-only canvas for the human** — disable node dragging / direct edits in
  `WorkflowCanvas`, since the agent is the sole editor (§2.1). The locator agent assumes this; making
  the UI actually enforce it is a companion change.
- **Approval gate** — route moves through the draft + plan + Accept/Reject flow of the design spec instead of
  applying live (this version's §2.2 is the only thing that changes).
- **Session-role permission ceiling** — per-tool capability checks against the agent's `grant` already
  ship (§6.3); still deferred is clamping that grant to the session's role ceiling (the design spec).
- **Backend-proxied LLM gateway (production)** — the shipped dev gateway is offline (no network, no
  provider key), so nothing runs a real model yet; production proxies a real model through a backend
  (still no key client-side). Deferred until such an endpoint exists.
- **Block default-label resolution** — surface each node's block-definition label (not just
  `customLabel`) in `list_nodes`, so name-matching works for un-relabeled nodes. This needs the block
  registry, which the agent lib deliberately doesn't depend on; the desktop binding (which has the
  registry) would resolve it. Until then the model matches un-relabeled nodes on `type`.
- **Undo / revert** — snapshot prior positions so a move can be taken back.
- **Relational & multi-node layout** — "align these three," "space them evenly," "put X below Y" —
  moves that reason about several nodes at once.
- **Grid snap / clamping / bounds** — snap to a grid, keep nodes on-canvas.
- **Fold into the flow-edit agent** — once the design spec ships, `move_node` becomes one more mutate tool on the
  single flow-edit agent rather than a standalone agent.

---

Architecture this builds on: **[design/SPEC.md](../../design/SPEC.md)**.
