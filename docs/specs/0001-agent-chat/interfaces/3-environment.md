# 3 · Environment, Draft & CanvasBinding

> Part of the Agent Chat **[Component Interfaces](../component-interfaces.md)** · behavior in **[`workflow-logic.md`](../workflow-logic.md)**. The **turn-boundary machinery**: snapshot the live flow, fork a scratch copy (the *draft*), diff it, commit it. The **CanvasBinding** is the one seam to the real, React-owned canvas. The data these produce/consume (`FlowDiff`, `Plan`, `Baseline`, …) is defined in **[4-diff-plan-promote.md](4-diff-plan-promote.md)**.

---

## 3.1 Environment (turn-boundary ops — never LLM-callable)

Owns the draft store and the `CanvasBinding`; the only component that touches the draft or the live flow.

```ts
interface Environment {
  resolvePermissions(): FlowPermissions;
  snapshotBaseline(): Baseline;        // reads the live graph + computes baselineHash; does NOT fork
  fork(): void;                        // lazily materialize the draft from the baseline (first mutate)
  isForked(): boolean;
  diff(): FlowDiff;                    // draft vs baseline (empty if not forked)
  checkDrift(): DriftStatus;           // recompute live hash, compare to baselineHash
  promote(plan: Plan): Promise<PromoteResult>;
  switchToVersion(target: VersionSnapshot): Promise<void>; // the id-preserving revert toggle
  discardDraft(): void;

  surface<K extends ToolKind>(kind: K): SurfaceFor<K>; // read/mutate/execute backed here; meta from Skill Registry
}
```

(`Baseline`, `FlowDiff`, `DriftStatus`, `Plan`, `PromoteResult`, `VersionSnapshot` → [4-diff-plan-promote.md](4-diff-plan-promote.md); `SurfaceFor` → [2-tools.md](2-tools.md).)

The Orchestrator calls these at turn boundaries; the model never sees them. The Environment imports nothing from React — it reaches the live, React-owned canvas only through the `CanvasBinding`.

**Construction & ownership.** The interface above is the *public contract* (what the Orchestrator calls). The "owns the draft store and the `CanvasBinding`" relationship lives on the concrete class as **private, constructor-injected fields** — this is where the `binding: CanvasBinding` field you would expect actually sits (see [0-conventions.md § 0.3](0-conventions.md)):

```ts
class WorkspaceEnvironment implements Environment {
  private draft: Draft | null = null;         // null until fork() — lazy, on first mutate
  private baseline: Baseline | null = null;   // captured by snapshotBaseline()

  constructor(
    private readonly binding: CanvasBinding,   // injected from React at mount (the seam to the live canvas)
    private readonly registry: ToolRegistry,   // builds the read/mutate/execute surfaces
    private readonly runTracker: RunTracker,   // backs the execute surface
  ) {}

  // the interface's methods read those private fields, e.g.:
  //   snapshotBaseline() { this.baseline = hashOf(this.binding.readGraph()); ... }
  //   promote(plan)      { ... await this.binding.persist.createNode(...) ... }
}
```

They are `private` on purpose: locked decision #8 requires the Orchestrator to reach the canvas **only** through the Environment's methods. Exposing `binding` on the interface would let a caller do `env.binding.persist…` and bypass that boundary — so the ownership is real but hidden. Every interface in these files follows the same convention (methods = contract; collaborators = private injected fields on the implementing class).

## 3.2 Draft (the headless canvas store)

```ts
type CanvasStore = StoreApi<CanvasState>; // zustand/vanilla instance; CanvasState from useCanvasStore.ts:53

interface Draft {
  store: CanvasStore;   // built by createCanvasStore(); seeded via loadWorkflow({nodes, edges}, flowId)
  readGraph(): { nodes: NodeData[]; connections: Connection[] };
}

// additive store refactor (workflow-logic.md § The draft model):
//   const canvasStateCreator = (set, get) => ({ /* unchanged */ });
//   export const useCanvasStore   = create(canvasStateCreator);            // live singleton — untouched
//   export const createCanvasStore = () => createStore(canvasStateCreator); // headless draft
```

The [mutate surface](2-tools.md) drives the draft through the store's **existing pure actions** — `setNodes` (there is **no** `addNode` action; creation is `setNodes(prev => [...prev, node])`), `updateNodeData(id, Partial<NodeData>)`, `deleteNode(id)`, `addConnection`/`deleteConnection`, `loadWorkflow`. Because the actions are pure `set(...)` with no persistence attached to a headless instance, draft edits cannot leak to the server.

## 3.3 CanvasBinding (platform-specific, React-owned)

The seam that lets the non-React Environment reach the React-owned live canvas. Desktop wraps `WorkflowCanvasRef`; mobile wraps the live store. Injected at mount.

```ts
interface CanvasBinding {
  readGraph(): { nodes: NodeData[]; connections: Connection[] }; // live structural read
  persist: PersistOps;                    // awaited human persistence primitives (§3.4)
  reload(): Promise<void>;                // loadFlow(flowId) → push into the live canvas
  flushAutosave(): Promise<void>;         // await the owner's pending autosave to the server
  getConnectionId(): string | undefined;  // LIVE getter — WS connection id (React state; changes on reconnect)
}
```

> `readGraph` returns `{ nodes, connections }`. The desktop adapter maps `WorkflowCanvasRef.getWorkflow()` (which returns `{ nodes, edges }` and **strips pending/unsaved edges** — [`WorkflowCanvas.tsx:728`](../../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx#L728)) into `connections`; dropping pending edges is correct because they aren't persisted and so aren't part of the baseline the diff is computed against.

## 3.4 PersistOps (the awaited writes)

Every method is an **awaited server write** — never the debounced/fire-and-forget UI wrappers. This is the whole reason promote is correct (`workflow-logic.md` § Commit path). Each maps to a real primitive — see the [grounding map](0-conventions.md#04-grounding-map-seam--real-primitive).

```ts
interface PersistOps {
  // create: createNodeAsync (fire-and-forget + onIdAssigned) THEN waitForNodeId; the binding adds a timeout.
  createNode(tempId: TempNodeId, body: NodeCreateBody): Promise<ServerNodeId>;

  // config/label: mutateAsync over upsertNode (carries customLabel).
  updateNode(id: ServerNodeId, patch: { config?: Record<string, string>; customLabel?: string }): Promise<void>;

  // added edges: awaited upsertFlow (endpoints already remapped temp→real).
  upsertEdges(edges: EdgeRecord[]): Promise<void>;

  // removed edges: awaited upsertFlow tombstones { id: '#<id>' }.
  deleteEdges(edgeIds: EdgeId[]): Promise<void>;

  // removed nodes: awaited upsertFlow tombstones (server cascades their edges).
  deleteNodes(ids: ServerNodeId[]): Promise<void>;

  // full-record upsert under an EXISTING id — used by the revert toggle to re-add a
  // tombstoned node by its ORIGINAL id (backend resurrects it). NOT used by first-promote.
  upsertNodes(records: NodeData[]): Promise<void>;
}

interface NodeCreateBody {
  type: string;
  position: { x: number; y: number };  // required by createNodeAsync; the add_node default position
  config?: Record<string, string>;
  customLabel?: string;
  description?: string;
  autoExecutionEnabled?: boolean;
}

interface EdgeRecord {                  // = Connection/EdgeData with resolved server endpoints
  id?: EdgeId;
  sourceNodeId: ServerNodeId; sourcePortId: PortId;
  targetNodeId: ServerNodeId; targetPortId: PortId;
}
```

> **Why `createNode` is a wrapper, not a single call:** `createNodeAsync(tempId, body, onIdAssigned)` returns `void` (fire-and-forget) and hands back the server id through the required `onIdAssigned` callback; `waitForNodeId(tempId)` is the awaitable that resolves with the id and **rejects on failure but has no built-in timeout**. `persist.createNode` composes the two and wraps a timeout so a never-settling mutation can't hang promote.
> **Why `upsertEdges`/`delete*` await the raw API:** there is no react-query hook over `upsertFlow` — it's a plain `async` function, so the binding `await`s it directly. `updateNode` uses `useUpsertNodeMutation().mutateAsync`.

---

Prev: **[← 2 · Tools](2-tools.md)** · Next: **[4 · Diff · Plan · Promote →](4-diff-plan-promote.md)** · Back to the **[overview](../component-interfaces.md)**
