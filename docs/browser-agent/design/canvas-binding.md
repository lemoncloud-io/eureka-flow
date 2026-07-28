# CanvasBinding — desktop implementation notes

> How the **desktop** binding wraps the live canvas. The **contract** lives in code
> (`libs/agent/src/canvas/canvasBinding.ts`, owned by `@flows/agent`) and is summarized in
> [architecture.md](architecture.md#canvasbinding--the-seam); this page is the desktop _how_. Desktop
> only. Shipped implementation:
> [`createDesktopCanvasBinding.ts`](../../../apps/web/src/app/features/flows/utils/createDesktopCanvasBinding.ts).

`readGraph` + `updateNode` are the whole contract, shared by the orchestrator and its specialists.
The [locator agent](../agents/locator.md) uses it to find a node and move it (`position`); the
property specialist uses the same `updateNode` to rename (`label`) and set config (`config`). So the
contract is move + rename + config — `NodePatch` is `{ label?, position?, config? }`.

## Grounded primitives

| Need                      | Primitive                                                                                                                              | Where                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| read nodes                | `useCanvasStore.getState()` (`nodes` + `connections`), returned as `{ nodes, edges }`                                                  | `createDesktopCanvasBinding.ts` |
| edit one node (immediate) | `WorkflowCanvasRef.updateNode(id, Partial<NodeData>)` — guards `canModifyCanvas`, `saveCheckpoint()`s, then `setNodes`; no server call | `WorkflowCanvas.tsx`            |
| the name field            | `NodeData.customLabel`, falling back to the block's definition label                                                                   | `NodeBlock.tsx`                 |
| position                  | `NodeData.position` (`{ x, y }`)                                                                                                       | `@lemoncloud/eureka-flows-api`  |
| the ref to reach          | `canvasRef` on the editor page; `<WorkflowCanvas>` mounted below it                                                                    | `FlowEditorPage.tsx`            |

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
