# CanvasBinding — desktop implementation notes

> How the **desktop** binding wraps the live canvas. The **contract** lives in code
> (`libs/agent/src/canvas/canvasBinding.ts`, owned by `@flows/agent`) and is summarized in
> [architecture.md](architecture.md#canvasbinding--the-seam); this page is the desktop *how*. Desktop
> only. Shipped implementation:
> [`createDesktopCanvasBinding.ts`](../../../apps/web/src/app/features/flows/utils/createDesktopCanvasBinding.ts).

`readGraph` + `updateNode` are what the [locator agent](../agents/locator/SPEC.md) uses (find a node,
move it) — the whole contract.

## Grounded primitives

| Need                      | Primitive                                                                                | Where                          |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| read nodes                | `WorkflowCanvasRef.getWorkflow()` → `{ nodes, edges }`                                   | `WorkflowCanvas.tsx:91`        |
| edit one node (immediate) | `WorkflowCanvasRef.updateNode(id, Partial<NodeData>)` — local `setNodes`, no server call | `WorkflowCanvas.tsx:103`       |
| the name field            | `NodeData.customLabel`, falling back to the block's `definition.label`                   | `NodeBlock.tsx:513`            |
| position                  | `NodeData.position` (`{ x, y }`)                                                          | `@lemoncloud/eureka-flows-api` |
| the ref to reach          | `canvasRef` on the editor page; `<WorkflowCanvas>` mounted below it                      | `FlowEditorPage.tsx`           |

**Precedent:** `useSocketHandlers` already writes to the canvas through this ref
(`loadWorkflow` / `updateNodeFromServer`), so the seam is proven — the agent is the same pattern with a
tool call instead of a socket message.

## How the desktop impl works

It lives in the web app because it wraps `WorkflowCanvasRef` (app-side, not `libs/agent`). Two notes
that the source (linked above) makes concrete:

- **Reads `ref.current` lazily on every call**, so the binding stays valid across canvas re-renders
  (and throws a clear error if the canvas isn't mounted).
- **`updateNode` shallow-merges**, so `position` is passed whole (never a partial axis), and `label` maps
  to `customLabel` — an empty string clears the override.

## Validation

The seam is exercised by the shipped locator agent: the always-present, right-docked `<AgentPanel>` is
wired to this binding, so a chat command like "move Fetch 10px right" flows agent → `updateNode` → the
canvas re-renders immediately, with no server write. That proves the two things that matter: external
(non-React) code reaching the live canvas, and frontend-only label/position edits.

## Known limitation

Reads are a **pull**: the desktop canvas is component-local `useState` in `WorkflowCanvas`, not a store,
so the binding can't subscribe to canvas changes — it re-reads on demand. Accepted for this slice.
