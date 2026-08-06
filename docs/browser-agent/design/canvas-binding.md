# CanvasBinding — the engine binding

> How the agent reaches the graph on screen. The **contract** lives in code
> (`libs/agent/src/canvas/canvasBinding.ts`) and is summarized in
> [architecture.md](architecture.md#canvasbinding--the-seam); this page is the _how_. Shipped
> implementation: [`engineCanvasBinding.ts`](../../../libs/agent/src/canvas/engineCanvasBinding.ts). Last updated 2026-08-02.

`readGraph` + `updateNode` + the structural primitives (`addNode` / `deleteNode` / `addEdge` / `deleteEdge`)
are the whole contract, shared by the orchestrator and its specialists. A
[block agent](../agents/blockAgent.md) uses `updateNode` to rename (`label`) and set config (`config`); the
[builder](../agents/builder.md) uses all of them — `updateNode` to move (`position`),
`addNode` / `deleteNode` to create or remove nodes, and `addEdge` / `deleteEdge` to wire them. So
the contract is a node patch (`NodePatch` = `{ label?, position?, config? }`) plus four structural
primitives — `addNode`/`addEdge` return the new id, `deleteNode` cascades the node's edges.

## One binding, every runtime

The binding wraps the **`FlowEngine`** that owns the graph, so there is nothing platform-specific
left in it and it lives in `libs/agent` rather than in the web app. The same
`createEngineCanvasBinding(engine)` serves the desktop editor, the mobile editor, the mobile
tutorial and a headless Node run.

It replaced a desktop-only binding built over `WorkflowCanvasRef`. That shape had three problems
the engine makes unnecessary:

- **It could not reach the mobile editor.** Mobile has no `WorkflowCanvas`, so an agent could
  never edit a mobile flow — even after mobile got an engine of its own.
- **It forced a hole in the canvas component's API.** `WorkflowCanvasRef.updateNode` existed
  solely for the agent, and hard-coded the history label `'agent:move'` even for a rename.
- **Undo was a side-effect of the UI layer** (see `docs/engine/DESIGN.md` §3), so a headless run
  had no history at all.

## Grounded primitives

| Need                      | Primitive                                                                                                                                                                              | Where                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| read nodes                | `engine.getGraph()` → `{ nodes, edges }`                                                                                                                                               | `engineCanvasBinding.ts`       |
| edit one node (immediate) | `engine.transact(label, ops => ops.updateNode(id, patch))` — one call, one undo step                                                                                                   | `engineCanvasBinding.ts`       |
| add a node                | `engine.transact(label, ops => ops.addNode({ type, position }))` — the engine seeds `{ ...defaultConfig }` and returns the new id                                                      | `engineCanvasBinding.ts`       |
| delete a node             | `ops.removeNodes([id])` — drops the node **and** every edge touching it (cascade) in one transaction                                                                                   | `engineCanvasBinding.ts`       |
| add / delete an edge      | `ops.connect(spec)` (returns the id; refuses cycle / incompatible ports / duplicate) / `ops.disconnect([id])`                                                                          | `engineCanvasBinding.ts`       |
| connection validity       | `arePortTypesCompatible(sourceType, targetType)` + `wouldCreateCycle(edges, source, target)` (self-loops included), in the engine core and shared by the `edge` tool and `ops.connect` | `libs/engine/src/core/`        |
| the name field            | `NodeData.customLabel`, falling back to the block's definition label                                                                                                                   | `NodeBlock.tsx`                |
| position                  | `NodeData.position` (`{ x, y }`)                                                                                                                                                       | `@lemoncloud/eureka-flows-api` |
| the engine to reach       | the `engine` the screen owns, passed to `<FlowAgentPanel engine={engine} />`                                                                                                           | `FlowEditorPage.tsx`           |

## Three things the source makes concrete

- **Reads come from the engine, not from `useCanvasStore`.** The store is a one-way projection
  (`useEngineMirror`) that **pauses during a drag or resize**, so it can be behind on committed
  edits and ahead on uncommitted preview coordinates at the same time. `getGraph()` is neither.
  A write is visible to the next read within the same turn.

- **`config` is merged, `position` is replaced whole.** `ops.updateNode` replaces `config`
  wholesale, so the binding merges over the node's current config first — otherwise a
  `temperature` set earlier in a turn vanishes when a later call sets the `model`. `label` maps to
  `customLabel`, and `''` clears the override.

- **The write is an edit, never runtime.** It goes through `engine.transact`, so it checkpoints for
  undo exactly like a user drag and travels in the next save body. Contrast `engine.applyRuntime`,
  which carries run state outside history and is dropped by `toSnapshot` — an agent edit must never
  take that path. The history label follows what the patch or structural edit touched:
  `agent:move` / `agent:rename` / `agent:config` / `agent:add-node` / `agent:delete-node` /
  `agent:add-edge` / `agent:delete-edge`.

- **Structural writes are one transaction each**, so an add / delete is undoable like a user action.
  `deleteNode` leans on `ops.removeNodes`, which drops the node **and** cascades its edges in one
  update, so the binding never hand-removes edges first. `addNode`/`addEdge` return the new id the
  agent references next — the engine seeds `addNode` defaults from the block registry. `addEdge`
  forwards to `ops.connect` as a plain append: the `edge` tool has already rejected an occupied
  target input, so `ops.connect` never has an existing edge to displace here.

## Permissions live in the executor, not here

The binding does **not** check permissions, and that is deliberate. The engine has no idea who is
asking ("`canModifyCanvas` is a question about a person"), and the caller that does know is the
`ToolExecutor`, which already gates every tool twice — the agent's fixed grant and the user's
flow-role ceiling — keyed on the capability that tool actually requires (`canModifyCanvas` to move,
`canEditConfig` to rename or configure).

A second, coarser gate inside the binding could only fail _silently_. The desktop ref did exactly
that (`if (!permissions.canModifyCanvas) return;`), so a denied edit was reported to the user as
done. Now a refused edit is a tool error the model can read, and an unknown node id throws
`EngineError('NODE_NOT_FOUND')` out of `ops.updateNode` rather than becoming a no-op.

## Validation

Covered by [`engineCanvasBinding.spec.ts`](../../../libs/agent/src/__tests__/canvas/engineCanvasBinding.spec.ts)
against a real `createFlowEngine()` — config merge, label clear, undo per edit, the per-patch
history label, runtime fields surviving an edit, and the loud failure on a bad id.

End to end: in a DEV build, once the flow has an id, `FlowEditorPage` mounts `FlowAgentPanel`, which
builds this binding over the page's engine and drives the orchestrator (which spawns its specialists),
handing the transcript to the pure right-docked `<AgentPanel>` view. A
chat command like "move Fetch 10px right" flows agent → `updateNode` → `engine.transact` → the mirror
→ the canvas re-renders, with no server write.

The panel is still `import.meta.env.DEV`-gated, matching the `/dev/agent-harness` route — not because
the gateway is an offline parser (it is now the backend-proxied `createGenerateApiLlmGateway`), but
because that gateway's generate receiver does not exist in the socket layer yet, so the panel is
wired rather than functional end to end.

> **Mobile is one line away, not wired.** `MobileFlowEditorPage` holds an engine, so mounting
> `<FlowAgentPanel engine={engine} …/>` there is all the binding needs. What is missing is a mobile
> chat surface — the shipped panel is a fixed-width right-docked column, which is not a mobile
> layout — so that is left as a UI decision rather than assumed.
