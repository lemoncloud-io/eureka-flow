# Change note — structural agents (node + edge)

> The **transition** from the move/config/rename roster to one that also adds/deletes nodes and
> connects/disconnects edges. The clean end-state lives in the design docs
> ([harness-spec.md](./harness-spec.md), [harness-interfaces.md](./harness-interfaces.md),
> [architecture.md](./architecture.md), [canvas-binding.md](./canvas-binding.md), and the per-agent
> [node.md](../agents/node.md) / [edge.md](../agents/edge.md) SPECs). This page is the a→b how-to for making
> the code conform; delete it once the change has landed. Written 2026-07-28.
>
> **Superseded in part:** the "replace an existing edge on an occupied target input" behavior below was later
> changed — `connect_nodes` now **rejects** an occupied input and reports the occupying edge (the binding
> just appends). See [change-note-edge-reject-occupied-input.md](./change-note-edge-reject-occupied-input.md).

## Why, and what changed from the parked plan

Structural edits were **parked** in [harness-deferred.md](./harness-deferred.md) (§2 "Structural ops + the
`builder` agent", §4 the edge read, §5 the structural `CanvasBinding`). This change brings them in-phase, with
three deliberate departures from that older sketch — driven by the preference order **accuracy > cost >
time**:

- **Two focused specialists, not one `builder`.** The parked plan was a single `builder` carrying all four
  ops. Instead: a `node` agent (add + delete) and an `edge` agent (connect + disconnect), symmetric with the
  locator/property split. Focused personas + focused validation beat one broad agent on accuracy; the roster
  makes the split free to register.
- **Creation is defaults-only; config stays in the property agent.** `add_node` seeds the block's
  `defaultConfig` and stops. A configured new node is a **composition** — the orchestrator spawns `node`, then
  `edge` + `property` concurrently against the returned id — so the tested reject-don't-guess config path is
  reused, never duplicated in a creator.
- **Direct-to-live, not the async server-backed binding.** The parked §5 imagined async
  `addNode`/`connect` returning server ids with temp→real reconciliation. That belonged to the (also deferred)
  record→replay model. The shipped harness edits the **live canvas directly**, and the canvas store already
  exposes **synchronous** structural mutations, so the new binding primitives are synchronous and frontend-only
  — exactly like `updateNode`. Persistence and any server-side id reconciliation ride the app's existing
  autosave, the same path a user's manual add/delete already uses.

**Capability — read the name trap.** All four ops need **`canModifyCanvas`**, whose `FlowPermissions`
definition is literally "add/delete/resize nodes, connect edges, undo/redo, layout" (Owner + Editor). Flows'
`canModifyCanvas`, **not** flows' `canEditStructure` — the latter is flow _metadata_ (rename/publish, Owner
only). Since `toAgentGrant` is a 1:1 name map, requiring the agent capability `canEditStructure` would gate on
the owner-only metadata flag and wrongly deny an editor. The ref's existing write guards (`updateNode`,
`addNode`) already check `canModifyCanvas`, so structural edits **reuse that guard** — no new capability, no
new wiring.

Everything below is **already grounded** in the repo — no backend work.

## The delta (a → b)

### 1 · Widen the `CanvasBinding` seam

[`libs/agent/src/canvas/canvasBinding.ts`](../../../libs/agent/src/canvas/canvasBinding.ts) — add four
synchronous primitives to the interface (contract), keeping `readGraph` + `updateNode`:

```ts
addNode(type: string, position: XY): { id: string };   // create with the block's defaultConfig; returns the new id
deleteNode(id: string): void;                           // remove the node; cascade its edges
addEdge(spec: EdgeSpec): { id: string };                // link two ports; returns the new edge id
deleteEdge(id: string): void;                           // remove one edge by id
```

[`createDesktopCanvasBinding.ts`](../../../apps/web/src/app/features/flows/utils/createDesktopCanvasBinding.ts)
— implement them; each reuses the existing `canModifyCanvas` guard + `saveCheckpoint()`:

- **`addNode`** → a new `WorkflowCanvasRef` method (or an agent-path flag on the existing `ref.addNode`): pass
  the explicit position, **suppress** the interactive auto-connect + `Math.random` jitter, and **return the
  generated id** (today `ref.addNode` is `void` and auto-connects).
- **`deleteNode`** → `useCanvasStore.getState().deleteNode(id)` — already cascades connections in one update.
- **`addEdge`** → store `addConnection({ id: newEdgeId(), ...spec })`, replacing any existing edge on the
  occupied target input (match the manual-connect path).
- **`deleteEdge`** → store `deleteConnection(id)`.

> The store already exposes `deleteNode` (cascading), `addConnection`, and `deleteConnection`
> ([useCanvasStore.ts](../../../libs/flows/src/stores/useCanvasStore.ts)); the ref already guards
> `canModifyCanvas` and checkpoints. The only genuinely new app-side work is the id-returning,
> auto-connect-suppressed `addNode`.

### 2 · New tools

[`libs/agent/src/tools/nodeTools.ts`](../../../libs/agent/src/tools/nodeTools.ts) — add
`createNodeStructureToolProvider(binding, catalog)`:

- `add_node({ type, position })` — validate `catalog.has(type)`, then `binding.addNode(...)` → `{ nodeId }`;
  reject unknown type. `requires: 'canModifyCanvas'`.
- `delete_node({ nodeId })` — validate the node exists, then `binding.deleteNode(nodeId)`; reject missing
  node. `requires: 'canModifyCanvas'`.

`libs/agent/src/tools/edgeTools.ts` (new) — `createEdgeToolProvider(binding, catalog)`:

- `list_edges()` — compact `{ edges: EdgeSummary[] }` from `binding.readGraph().edges`.
- `connect_nodes({ sourceNodeId, sourcePortId, targetNodeId, targetPortId })` — validate both nodes/ports
  exist (via `catalog.schema(type).inputs/outputs`), `arePortTypesCompatible`, and `!wouldCreateCycle`, then
  `binding.addEdge(spec)` → `{ edgeId }`. `requires: 'canModifyCanvas'`.
- `disconnect_edge({ edgeId })` — validate the edge exists, then `binding.deleteEdge(edgeId)`. `requires:
'canModifyCanvas'`.

> `arePortTypesCompatible` + `wouldCreateCycle` are pure functions in
> [`apps/web/.../utils/graph.ts`](../../../apps/web/src/app/features/flows/utils/graph.ts) /
> [`utils/index.ts`](../../../apps/web/src/app/features/flows/utils/index.ts). Move them to a shared util
> reachable from `@flows/agent` (or re-implement in the lib — they're small and dependency-free) so the tool
> validates headlessly.

### 3 · Two agent subclasses + personas

- `libs/agent/src/agents/nodeAgent.ts` — `NodeAgent extends BaseAgent`, grant `{ canModifyCanvas: true }`,
  tools = node read + catalog + `createNodeStructureToolProvider`. `NODE_SYSTEM_PROMPT`: add/delete only;
  defaults-only creation; never invents a `type` or `position`; no config, no wiring.
- `libs/agent/src/agents/edgeAgent.ts` — `EdgeAgent extends BaseAgent`, grant `{ canModifyCanvas: true }`,
  tools = node read + `createEdgeToolProvider`. `EDGE_SYSTEM_PROMPT`: connect/disconnect only;
  read-before-connect; a rejected connection is reported, not rerouted.

### 4 · Register them

[`libs/agent/src/agents/registrations.ts`](../../../libs/agent/src/agents/registrations.ts) — two entries
added to `DEFAULT_REGISTRATIONS`:

```ts
{ type: 'node', summary: 'adds a node to the canvas or deletes one', create: deps => createNodeAgent(deps) },
{ type: 'edge', summary: 'connects two nodes or disconnects an edge', create: deps => createEdgeAgent(deps) },
```

No orchestrator prompt change — it discovers them via `list_agents`.

### 5 · Permissions

**No new capability, no `toAgentGrant` change.** Declare `requires: 'canModifyCanvas'` on the four write
tools; the executor's two-gate check (agent grant + user `userPermissions`) does the rest. A viewer
(`canModifyCanvas: false`) is denied; an owner or editor is allowed. Do **not** use `canEditStructure` — it is
the owner-only rename/publish metadata flag (see the name trap above).

### 6 · Tests (the definition of done)

- `scenarios/node.{spec,live.spec}.ts` and `edge.{spec,live.spec}.ts` — driving each agent directly (see each
  SPEC's **Definition of done**).
- `tools/nodeTools.spec.ts` (extend) + `tools/edgeTools.spec.ts` (new) — tool-level validation: unknown type,
  missing node, incompatible ports, cycle, unknown edge, replace-on-occupied-input.
- `integration.spec.ts` (extend) — the compound add → wire → configure (`applied`), and a partial where the
  wire is rejected but the node + config land (`partial`).
- The permission gate is verified once at the executor (not per agent).

## Order of work

1. Widen `CanvasBinding` + desktop impl (§1) — nothing depends on the agents until the seam exists.
2. Tools (§2) over an in-memory binding, with unit tests.
3. Agents + personas (§3) and registration (§4).
4. Scenario suites (§6).

## Docs to reconcile when this lands

- **[harness-deferred.md](./harness-deferred.md)** — remove §2 (structural ops + `builder`) and the
  structural halves of §4 / §5; they are now in-phase. What stays deferred: the record→replay draft (§1), the
  static `Validator` (§3), cost metering (§6), and the async server-backed binding for a future
  persistence model.
- **[agents/README.md](../agents/README.md)** and the per-agent SPECs already carry the end-state.

## Grounding references

- Store primitives: [`useCanvasStore.ts`](../../../libs/flows/src/stores/useCanvasStore.ts) —
  `deleteNode` (cascades), `addConnection`, `deleteConnection`.
- Node create + auto-connect heuristic to suppress:
  [`WorkflowCanvas.tsx`](../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx) `addNode`
  (already guards `canModifyCanvas`).
- Connection validity: `wouldCreateCycle` in
  [`graph.ts`](../../../apps/web/src/app/features/flows/utils/graph.ts); `arePortTypesCompatible` in
  [`utils/index.ts`](../../../apps/web/src/app/features/flows/utils/index.ts).
- Capability: `canModifyCanvas` in [`permissions.ts`](../../../libs/flows/src/types/permissions.ts)
  ("add/delete/resize nodes, connect edges"); the 1:1 `toAgentGrant` in
  [`libs/agent/src/permissions.ts`](../../../libs/agent/src/permissions.ts).
- Data shapes: `NodeData`, `EdgeData` (`sourceNodeId`/`sourcePortId`/`targetNodeId`/`targetPortId`),
  `BlockDefinition` (`defaultConfig`, `inputs`/`outputs`) from `@lemoncloud/eureka-flows-api`.
