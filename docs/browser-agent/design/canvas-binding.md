# CanvasBinding — implementation notes (desktop)

> Detail companion to **[SPEC.md](SPEC.md) §6.5**. The **contract** now lives in code
> (`libs/agent/src/canvas/canvasBinding.ts`, owned by `@flows/agent`); this file is _how_ the desktop
> binding wraps the live canvas. Desktop only. The shipped implementation is
> [`createDesktopCanvasBinding.ts`](../../../apps/web/src/app/features/flows/utils/createDesktopCanvasBinding.ts).

## Contract (from `@flows/agent`)

```ts
type Graph = { nodes: NodeData[]; edges: EdgeData[] }; // the live canvas shape, normalized

interface CanvasBinding {
    readGraph(): Graph; // live structural read
    updateNode(id, patch: { label?; position? }): void; // one node, immediate, frontend-only
    swapFlow(graph): void; // replace the whole flow at once (a draft)
}
```

- `readGraph` + `updateNode` are what the locator agent uses (find a node, move it).
- `swapFlow` exists for the fuller flow-edit agent (the design spec) and is part of the shared contract.

## Grounded primitives

| Need                      | Primitive                                                                                | Where                          |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| read nodes                | `WorkflowCanvasRef.getWorkflow()` → `{ nodes, edges }`                                   | `WorkflowCanvas.tsx:91`        |
| edit one node (immediate) | `WorkflowCanvasRef.updateNode(id, Partial<NodeData>)` — local `setNodes`, no server call | `WorkflowCanvas.tsx:103`       |
| swap the whole flow       | `WorkflowCanvasRef.loadWorkflow({ nodes, edges })` — the draft, on apply                 | `WorkflowCanvas.tsx:93`        |
| the name field            | `NodeData.customLabel`, falling back to the block's `definition.label`                   | `NodeBlock.tsx:513`            |
| position                  | `NodeData.position` (`{ x, y }`)                                                         | `@lemoncloud/eureka-flows-api` |
| the ref to reach          | `canvasRef` on the editor page; `<WorkflowCanvas>` mounted at `:710`                     | `FlowEditorPage.tsx:64`        |

**Precedent:** `useSocketHandlers` already writes to the canvas through this ref
(`loadWorkflow` / `updateNodeFromServer`), so the seam is proven — the agent is the same pattern with a
tool call instead of a socket message.

## Desktop impl

Lives in the web app (it wraps `WorkflowCanvasRef`, so it's app-side, not `libs/agent`). It reads
`ref.current` lazily on every call, so it stays valid across canvas re-renders.

```ts
export const createDesktopCanvasBinding = (ref: RefObject<WorkflowCanvasRef | null>): CanvasBinding => {
    const canvas = () => {
        if (!ref.current) throw new Error('CanvasBinding: canvas is not mounted');
        return ref.current;
    };
    return {
        readGraph: () => {
            const wf = canvas().getWorkflow(); // WorkflowState is { nodes, edges }
            return { nodes: wf.nodes ?? [], edges: wf.edges ?? [] };
        },
        updateNode: (id, patch) => {
            // updateNode shallow-merges, so pass nested objects whole — never a partial position.
            const updates: Partial<NodeData> = {};
            if (patch.label !== undefined) updates.customLabel = patch.label || undefined; // '' clears the override
            if (patch.position) updates.position = patch.position;
            canvas().updateNode(id, updates); // local re-render, no server write
        },
        swapFlow: graph => {
            void canvas().loadWorkflow({ nodes: graph.nodes, edges: graph.edges });
        },
    };
};
```

## Validation

The seam is exercised by the shipped **locator agent**: the always-present, right-docked
`<AgentPanel>` (`FlowEditorPage.tsx:929`) is wired to this binding, so a chat command like "move Fetch
10px right" flows agent → `updateNode` → the canvas re-renders immediately, with no server write. This
proves the two things that matter: external (non-React) code reaching the live canvas, and
frontend-only label/position edits.

## Known limitation

Reads are a **pull**: the desktop canvas is component-local `useState` in `WorkflowCanvas`, not a
store, so the binding can't subscribe to canvas changes — it re-reads on demand. Accepted for this
slice.
