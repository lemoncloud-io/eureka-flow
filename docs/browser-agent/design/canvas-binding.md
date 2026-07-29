# CanvasBinding — desktop implementation notes

> How the **desktop** binding wraps the live canvas. The **contract** lives in code
> (`libs/agent/src/canvas/canvasBinding.ts`, owned by `@flows/agent`) and is summarized in
> [architecture.md](architecture.md#canvasbinding--the-seam); this page is the desktop _how_. Desktop
> only. Shipped implementation:
> [`createDesktopCanvasBinding.ts`](../../../apps/web/src/app/features/flows/utils/createDesktopCanvasBinding.ts).

`readGraph` + `updateNode` + the structural primitives (`addNode` / `deleteNode` / `addEdge` / `deleteEdge`)
are the whole contract, shared by the orchestrator and its specialists. The
[locator agent](../agents/locator.md) uses `updateNode` to move a node (`position`); the
[property agent](../agents/property.md) uses it to rename (`label`) and set config (`config`); the
[node agent](../agents/node.md) uses `addNode` / `deleteNode`; the [edge agent](../agents/edge.md)
uses `addEdge` / `deleteEdge`. So the contract is a node patch (`NodePatch` = `{ label?, position?, config? }`)
plus four structural primitives — `addNode`/`addEdge` return the new id, `deleteNode` cascades the node's
edges.

## Grounded primitives

| Need                      | Primitive                                                                                                                                                                                    | Where                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| read nodes                | `useCanvasStore.getState()` (`nodes` + `connections`), returned as `{ nodes, edges }`                                                                                                        | `createDesktopCanvasBinding.ts` |
| edit one node (immediate) | `WorkflowCanvasRef.updateNode(id, Partial<NodeData>)` — guards `canModifyCanvas`, `saveCheckpoint()`s, then `setNodes`; no server call                                                       | `WorkflowCanvas.tsx`            |
| add a node                | `WorkflowCanvasRef.addNode(type, position)` — seeds `{ ...defaultConfig }`, generates the id, `saveCheckpoint()`s; agent path suppresses the interactive auto-connect and returns the new id | `WorkflowCanvas.tsx`            |
| delete a node             | store `deleteNode(id)` — filters the node **and** every connection touching it (cascade) in one update                                                                                       | `useCanvasStore.ts`             |
| add / delete an edge      | store `addConnection(conn)` (id via `newEdgeId()`; replace an occupied input port) / `deleteConnection(id)`                                                                                  | `useCanvasStore.ts`             |
| connection validity       | `arePortTypesCompatible(sourceType, targetType)` + `wouldCreateCycle(connections, source, target)` (self-loops included)                                                                     | `apps/web/.../utils/graph.ts`   |
| the name field            | `NodeData.customLabel`, falling back to the block's definition label                                                                                                                         | `NodeBlock.tsx`                 |
| position                  | `NodeData.position` (`{ x, y }`)                                                                                                                                                             | `@lemoncloud/eureka-flows-api`  |
| the ref to reach          | `canvasRef` on the editor page; `<WorkflowCanvas>` mounted below it                                                                                                                          | `FlowEditorPage.tsx`            |

**Precedent:** `useSocketHandlers` already writes to the canvas through this ref
(`loadWorkflow` / `updateNodeFromServer`), so the seam is proven — the agent is the same pattern with a
tool call instead of a socket message.

## How the desktop impl works

It lives in the web app because it wraps `WorkflowCanvasRef` (app-side, not `libs/agent`). Two notes
that the source (linked above) makes concrete:

- **The write path reads `ref.current` lazily**, so it stays valid across canvas re-renders (and throws
  a clear error if the canvas isn't mounted). Reads go straight to `useCanvasStore` and don't need the ref.
- **`updateNode` shallow-merges**, so `position` is passed whole (never a partial axis), and `label` maps
  to `customLabel` — an empty string clears the override.
- **Structural writes are checkpointed and guarded on `canModifyCanvas`** (flows' "add/delete nodes, connect
  edges" flag — the same one `updateNode`'s move path uses; _not_ flows' `canEditStructure`, which is
  rename/publish metadata), so an add / delete is undoable like a user action. `deleteNode` leans on the
  store's cascade (the node and its edges go in one update), so the binding never hand-removes edges first.
  `addNode`/`addEdge` return the new id the agent references next; the agent-driven `addNode` passes an
  explicit position and **suppresses** the interactive auto-connect heuristic (last-or-selected node, jittered
  position), so an agent edit is predictable and oracle-able rather than implicitly wired.

## Validation

The seam is exercised by the shipped agents: once the flow has an id, `FlowEditorPage` mounts the
`FlowAgentPanel` container, which builds this binding and drives the orchestrator (which spawns the
locator/property specialists), handing the transcript to the pure right-docked `<AgentPanel>` view. A
chat command like "move Fetch 10px right" flows agent → `updateNode` → the canvas re-renders
immediately, with no server write. That proves the two things that
matter: external (non-React) code reaching the live canvas, and frontend-only label/position edits.

## Note on reads

The desktop canvas graph is store-sourced (`useCanvasStore`), so the binding reads it directly via
`useCanvasStore.getState()` rather than through the ref — a write is visible to the next read within the
same turn. Reads are still a per-call pull (no subscription); the binding re-reads on demand.
