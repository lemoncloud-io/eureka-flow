# CanvasBinding — implementation notes (desktop)

> Detail companion to **[SPEC.md](SPEC.md) §6.5**. The **contract** is the source of truth in the SPEC;
> this file is *how* the desktop binding is built and the first slice that validates it. Desktop only.

## Contract (from the SPEC)

```ts
interface CanvasBinding {
  readGraph(): Graph;                                          // live structural read
  updateNode(id, patch: { label?; position? }): void;         // one node, immediate, frontend-only
  swapFlow(graph): void;                                       // replace the whole flow at once (a draft)
}
```

- `updateNode` is the **first slice** — a direct, immediate edit of one node.
- `swapFlow` is used later, to apply a whole agent draft.

## Grounded primitives

| Need | Primitive | Where |
| --- | --- | --- |
| read nodes | `WorkflowCanvasRef.getWorkflow()` → `{ nodes, edges }` | `WorkflowCanvas.tsx:89` |
| edit one node (immediate) | `WorkflowCanvasRef.updateNode(id, Partial<NodeData>)` — local `setNodes`, no server call | `WorkflowCanvas.tsx:101` |
| the name field | `NodeData.customLabel` (rendered as `customLabel || definition.label`) | `NodeBlock.tsx:513` |
| position | `NodeData.position` (`{ x, y }`) | `types/index.ts:420` |
| the ref to reach | `canvasRef` on the editor page; canvas mounted at `:695` | `FlowEditorPage.tsx:62` |
| dev-only gate | `showDevTools` | `FlowEditorPage.tsx:183` |

**Precedent:** `useSocketHandlers` already writes to the canvas through this ref (`updateNode` /
`loadWorkflow`), so the seam is proven — the panel is the same pattern with a click instead of a socket
message.

## Desktop impl (sketch)

Lives in the web app (it wraps `WorkflowCanvasRef`, so it's app-side, not `libs/agent`).

```ts
export const makeDesktopCanvasBinding = (ref: RefObject<WorkflowCanvasRef | null>): CanvasBinding => {
  const canvas = () => {
    if (!ref.current) throw new Error('CanvasBinding: canvas not mounted');
    return ref.current;
  };
  return {
    readGraph: () => {
      const wf = canvas().getWorkflow();           // WorkflowState is { nodes, edges }
      return { nodes: wf.nodes, connections: wf.edges }; // Graph calls the collection `connections`
    },
    updateNode: (id, patch) => {
      const updates: Partial<NodeData> = {};
      if (patch.label !== undefined) updates.customLabel = patch.label || undefined;
      if (patch.position) updates.position = patch.position;
      canvas().updateNode(id, updates);            // local re-render, no server write
    },
    swapFlow: graph => { void canvas().loadWorkflow(graph); }, // later
  };
};
```

## First slice (validation)

A dev-only **node-list panel**: lists the nodes (`readGraph`), click one, edit its name + X/Y →
`updateNode` → the change shows on the canvas immediately. Gate it with `showDevTools` and render it
beside `<WorkflowCanvas>` in `FlowEditorPage`, sharing the page's `canvasRef`.

**Goal:** prove the seam (external code ↔ live canvas) and frontend-only label/position edits before
building the draft / agent.

## Known limitation

Reads are a **pull**: the desktop canvas is component-local `useState`, not a store, so the panel can't
subscribe to canvas changes — it re-reads on demand (a Refresh action). Accepted for this slice.
