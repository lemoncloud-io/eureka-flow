# Agent Chat — Component Interfaces

> **Status:** The typed shape of every seam. Companion to **[`workflow-logic.md`](workflow-logic.md)** — **behavior there, shapes here.** This file is authoritative on _types_; when a shape and a described behavior disagree, `workflow-logic.md` wins and this file is the bug. The other numbered files in this folder are **stale** — do not reconcile against them.
>
> Every type below is either (a) an **existing codebase type**, reused as-is (§0.2), or (b) a **new agent type** proposed for `libs/agent/src`. New types are grounded: the § _Grounding map_ at the end pins each seam to the real primitive it wraps, with file references, so the design is directly implementable.

The scope mirrors `workflow-logic.md`: a **skeleton**. Nothing here introduces a capability the behavior spec doesn't already justify — no `auto_layout` tool, no `set_flow_metadata`, no cross-turn auto-approve. Those are deferred/rejected there and absent here.

---

## 0. Conventions

### 0.1 Branded ids

Ids are branded so the type system enforces the two invariants the turn logic depends on: **a run only targets a persisted node**, and **a temp id is never transmitted to the server**.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type FlowId = Brand<string, 'FlowId'>;
type ServerNodeId = Brand<string, 'ServerNodeId'>; // persisted; exists on the live/server flow
type TempNodeId = Brand<string, 'TempNodeId'>; // draft-local; absent from the baseline and the server
type NodeId = ServerNodeId | TempNodeId;
type EdgeId = Brand<string, 'EdgeId'>;
type PortId = Brand<string, 'PortId'>; // "nodeId:portName"
type RunId = Brand<string, 'RunId'>;
```

Consequences enforced at compile time:

- `run_node` / `get_node_runs` take **`ServerNodeId`** — a draft-only `TempNodeId` cannot be run or have live history read.
- The promote `idMap` is `Map<TempNodeId, ServerNodeId>`; edge endpoints are remapped `TempNodeId → ServerNodeId` **before** any write.

### 0.2 Reused codebase types (not redefined here)

These come from the flow layer and are used verbatim. New agent types reference them; they are **not** re-declared.

| Type                          | Where                                                                                                                  | Shape note                                                                                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NodeData`                    | `@lemoncloud/eureka-flows-api` (re-exported [`libs/flows/src/types/index.ts`](../../../libs/flows/src/types/index.ts)) | `{ id?, type, position:{x,y}, config?: Record<string,string>, customLabel?, … readonly status?, inputData?, outputData? }` — note **`config`** (not `data`) and **`status`** (not `state`).                         |
| `Connection`                  | canvas store field ([`useCanvasStore.ts:56`](../../../libs/flows/src/stores/useCanvasStore.ts#L56))                    | Effectively `EdgeData`: `{ id?, sourceNodeId, sourcePortId, targetNodeId, targetPortId, … }`. Store calls the collection `connections`, not `edges`.                                                                |
| `EdgeData`                    | `@lemoncloud/eureka-flows-api`                                                                                         | Four endpoint fields **all required**; identical field names to `Connection`.                                                                                                                                       |
| `DataPacket`                  | `@lemoncloud/eureka-flows-api`                                                                                         | `{ type: DataType, value?, timestamp? }`.                                                                                                                                                                           |
| `DataType`                    | re-exported `libs/flows/src/types`                                                                                     | `'text' \| 'image' \| 'number' \| 'json' \| 'any'`.                                                                                                                                                                 |
| `NodeState`                   | [`libs/flows/src/types/index.ts:150`](../../../libs/flows/src/types/index.ts#L150)                                     | `'IDLE'\|'READY'\|'RUNNING'\|'COMPLETED'\|'ERROR'`.                                                                                                                                                                 |
| `RunContext`                  | [`libs/flows/src/types/index.ts:819`](../../../libs/flows/src/types/index.ts#L819)                                     | `{ runId, nodeId, state:'RUNNING'\|'COMPLETED'\|'ERROR', startedAt?, completedAt?, traces:TraceEntry[], portUpdates:RunPortUpdate[], error? }` — **outputs are not a field**; per-port emissions are `portUpdates`. |
| `TraceEntry`                  | [`libs/flows/src/types/index.ts:194`](../../../libs/flows/src/types/index.ts#L194)                                     | `{ traceId?, seq, ts, stage?, message?, runId?, type?, data? }`.                                                                                                                                                    |
| `FlowPermissions`             | [`libs/flows/src/types/permissions.ts:16`](../../../libs/flows/src/types/permissions.ts#L16)                           | booleans: `canEditConfig, canModifyCanvas, canEditStructure, canRun, canSave, canDragNodes, canCreate`.                                                                                                             |
| `BlockDefinitionWithFrontend` | [`libs/flows/src/types/index.ts:230`](../../../libs/flows/src/types/index.ts#L230)                                     | base `BlockDefinition` + `isFrontend?`, `stereo?: 'input'\|'process'\|'output'`, `isRunnable?`.                                                                                                                     |
| `WorkflowState`               | `@lemoncloud/eureka-flows-api`                                                                                         | `{ nodes: NodeData[]; edges: EdgeData[] }` — the `loadWorkflow` payload.                                                                                                                                            |
| `PortDataResponse`            | `@lemoncloud/eureka-flows-api`                                                                                         | `{ id, nodeId, portId, direction, data:{ value, type, timestamp? } }` — what `getPortData` resolves to.                                                                                                             |

New agent types are proposed for `libs/agent/src` (`types.ts`, `gateway/`, `tools/`, `env/`), mirroring how `flows`/`socket` are structured.

### 0.3 How to read these interfaces (interface vs. class)

A TypeScript **`interface` is a contract, not a container** — it lists only the methods/properties a _caller_ may use (like an interface/abstract type in Java, C#, or Swift). It has **no fields and no implementation**. The real object is a **class** that `implements` the interface; the class is where state lives, held as **`private`, constructor-injected fields** (dependency injection).

So throughout this file, "component X **owns** Y" means: _the class implementing `X` holds `Y` as a private field, passed in when it is constructed._ The collaborator does **not** appear on the interface — that is intentional, so callers cannot reach around the contract. §2.1 shows a worked example (`Environment` owning the `CanvasBinding` and the draft).

---

## 1. Tool Interface

The seam between the Orchestrator and the flow world. Two sub-parts: the **Registry** (catalog) and the **Executor** (per-call choke-point), routing to a **kind-scoped surface**.

### 1.1 Tool kinds & names

```ts
type ToolKind = 'read' | 'mutate' | 'execute' | 'meta';

type ReadToolName = 'list_blocks' | 'get_flow' | 'get_node' | 'get_port_data' | 'get_node_runs';
type MutateToolName = 'add_node' | 'update_node_config' | 'delete_node' | 'connect' | 'disconnect';
type ExecuteToolName = 'run_node' | 'run_flow';
type MetaToolName = 'use_skill';
type ToolName = ReadToolName | MutateToolName | ExecuteToolName | MetaToolName;
```

> No `auto_layout`, no `set_flow_metadata` — deferred in `workflow-logic.md` (§ _Tool groups & targets_). The mutate surface is exactly these five.

### 1.2 Call & result

```ts
interface ToolCall {
    id: string; // provider-assigned tool_use id
    name: ToolName;
    args: unknown; // validated against the tool's JSON Schema before use
}

type ToolResult =
    | { toolCallId: string; ok: true; data?: unknown }
    | { toolCallId: string; ok: false; error: ToolError };

type ToolError =
    // a run blocked because the un-promoted draft affects its target (see §4.4)
    | { code: 'not_persisted'; pendingRunIntent: PendingRunIntent }
    | { code: 'permission_denied'; requires: keyof FlowPermissions }
    | { code: 'invalid_args'; detail: string }
    | { code: 'exec_error'; detail: string };
```

`data` is the compact value fed back to the model (e.g. the new node's `TempNodeId`, a playbook string, a `RunOutcome`).

### 1.3 Registry

```ts
interface ToolDefinition<K extends ToolKind = ToolKind> {
    name: ToolName;
    kind: K;
    description: string;
    params: JsonSchema; // exposed to the LLM as ToolDef.function.parameters
    requires?: keyof FlowPermissions; // permission flag checked by the Executor
    execute(args: unknown, surface: SurfaceFor<K>): Promise<ToolResult> | ToolResult;
    summarize(op: PlanOperation): string; // one-line human summary for the plan card (§3.3)
}

interface ToolRegistry {
    list(): ToolDefinition[];
    get(name: ToolName): ToolDefinition | undefined;
    toolDefs(): ToolDef[]; // LLM-facing defs (see §7.4)
    summarize(op: PlanOperation): string; // routes to the owning tool's summarize
}
```

Pure metadata + logic — the Registry imports nothing from React.

### 1.4 Executor & kind-scoped surfaces

The Executor is the single point where args are validated, permission is checked, and the call is routed to the surface for its kind.

```ts
interface ToolExecutor {
    // validate args → check `requires` against FlowPermissions → route by kind → ToolResult
    dispatch(call: ToolCall): Promise<ToolResult>;
}

interface ToolSurfaces {
    read: ReadCanvas; // §5 reads (Environment routes draft-vs-live)
    mutate: MutateSurface; // draft only; forks lazily on first call
    execute: ExecuteSurface; // live only; RunTracker-backed; affected-target precondition
    meta: MetaSurface; // Skill Registry
}
type SurfaceFor<K extends ToolKind> = ToolSurfaces[K];
```

```ts
// mutate — operates on the Draft's pure store actions; nothing persists (§2.2)
interface MutateSurface {
    addNode(input: { type: string; config?: Record<string, string>; label?: string }): { tempId: TempNodeId };
    updateNodeConfig(id: NodeId, patch: { config?: Record<string, string>; label?: string }): void;
    deleteNode(id: NodeId): void;
    connect(edge: EdgeEndpoints): { edgeId: EdgeId };
    disconnect(edgeId: EdgeId): void;
}

// execute — live only; each returns a finished result via RunTracker (§4)
interface ExecuteSurface {
    runNode(id: ServerNodeId): Promise<RunOutcome>;
    runFlow(nodeIds?: ServerNodeId[]): Promise<RunOutcome>;
}

// meta
interface MetaSurface {
    useSkill(name: string): { playbook: string };
}

interface EdgeEndpoints {
    sourceNodeId: NodeId;
    sourcePortId: PortId;
    targetNodeId: NodeId;
    targetPortId: PortId;
}
```

Notes that keep these honest against the code:

- **`addNode` takes no `position`.** The surface assigns a **deterministic default position** internally; it rides on the create body at promote (§3.3). The agent cannot see the canvas, so it never places or repositions.
- **`updateNodeConfig` carries `label`.** `{ config?, label? }` — `label` is a first-class semantic field, and `upsertNode` carries `customLabel`, so a rename round-trips (diff → op → commit). A `config` patch **replaces** the config object (store merge is shallow — [`useCanvasStore.ts:407`](../../../libs/flows/src/stores/useCanvasStore.ts#L407)), so the surface must merge onto the current config before setting.
- **`connect` returns a client `EdgeId`** (draft-local); real edge identity is settled by `upsertFlow` at promote.
- The **affected-target precondition** for `execute` is enforced by the Executor _before_ calling `ExecuteSurface` (§4.4) — a blocked call never reaches `runNode`/`runFlow`.

---

## 2. Environment, Draft, CanvasBinding

### 2.1 Environment (turn-boundary ops — never LLM-callable)

Owns the draft store and the `CanvasBinding`; the only component that touches the draft or the live flow.

```ts
interface Environment {
    resolvePermissions(): FlowPermissions;
    snapshotBaseline(): Baseline; // reads the live graph + computes baselineHash; does NOT fork
    fork(): void; // lazily materialize the draft from the baseline (first mutate)
    isForked(): boolean;
    diff(): FlowDiff; // draft vs baseline (empty if not forked)
    checkDrift(): DriftStatus; // recompute live hash, compare to baselineHash
    promote(plan: Plan): Promise<PromoteResult>;
    switchToVersion(target: VersionSnapshot): Promise<void>; // the id-preserving revert toggle (§3.5)
    discardDraft(): void;

    surface<K extends ToolKind>(kind: K): SurfaceFor<K>; // read/mutate/execute backed here; meta from Skill Registry
}
```

The Orchestrator calls these at turn boundaries; the model never sees them. The Environment imports nothing from React — it reaches the live, React-owned canvas only through the `CanvasBinding`.

**Construction & ownership.** The interface above is the _public contract_ (what the Orchestrator calls). The "owns the draft store and the `CanvasBinding`" relationship lives on the concrete class as **private, constructor-injected fields** — this is where the `binding: CanvasBinding` field you would expect actually sits (see §0.3):

```ts
class WorkspaceEnvironment implements Environment {
    private draft: Draft | null = null; // null until fork() — lazy, on first mutate
    private baseline: Baseline | null = null; // captured by snapshotBaseline()

    constructor(
        private readonly binding: CanvasBinding, // injected from React at mount (the seam to the live canvas)
        private readonly registry: ToolRegistry, // builds the read/mutate/execute surfaces
        private readonly runTracker: RunTracker // backs the execute surface
    ) {}

    // the interface's methods read those private fields, e.g.:
    //   snapshotBaseline() { this.baseline = hashOf(this.binding.readGraph()); ... }
    //   promote(plan)      { ... await this.binding.persist.createNode(...) ... }
}
```

They are `private` on purpose: locked decision #8 requires the Orchestrator to reach the canvas **only** through the Environment's methods. Exposing `binding` on the interface would let a caller do `env.binding.persist…` and bypass that boundary — so the ownership is real but hidden. Every interface in this file follows the same convention (methods = contract; collaborators = private injected fields on the implementing class).

### 2.2 Draft (the headless canvas store)

```ts
type CanvasStore = StoreApi<CanvasState>; // zustand/vanilla instance; CanvasState from useCanvasStore.ts:53

interface Draft {
    store: CanvasStore; // built by createCanvasStore(); seeded via loadWorkflow({nodes, edges}, flowId)
    readGraph(): { nodes: NodeData[]; connections: Connection[] };
}

// additive store refactor (workflow-logic.md § The draft model):
//   const canvasStateCreator = (set, get) => ({ /* unchanged */ });
//   export const useCanvasStore   = create(canvasStateCreator);        // live singleton — untouched
//   export const createCanvasStore = () => createStore(canvasStateCreator); // headless draft
```

The mutate surface drives the draft through the store's **existing pure actions** — `setNodes` (there is **no** `addNode` action; creation is `setNodes(prev => [...prev, node])`), `updateNodeData(id, Partial<NodeData>)`, `deleteNode(id)`, `addConnection`/`deleteConnection`, `loadWorkflow`. Because the actions are pure `set(...)` with no persistence attached to a headless instance, draft edits cannot leak to the server.

### 2.3 CanvasBinding (platform-specific, React-owned)

The seam that lets the non-React Environment reach the React-owned live canvas. Desktop wraps `WorkflowCanvasRef`; mobile wraps the live store. Injected at mount.

```ts
interface CanvasBinding {
    readGraph(): { nodes: NodeData[]; connections: Connection[] }; // live structural read
    persist: PersistOps; // awaited human persistence primitives
    reload(): Promise<void>; // loadFlow(flowId) → push into the live canvas
    flushAutosave(): Promise<void>; // await the owner's pending autosave to the server
    getConnectionId(): string | undefined; // LIVE getter — WS connection id (React state; changes on reconnect)
}
```

> `readGraph` returns `{ nodes, connections }`. The desktop adapter maps `WorkflowCanvasRef.getWorkflow()` (which returns `{ nodes, edges }` and **strips pending/unsaved edges** — [`WorkflowCanvas.tsx:728`](../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx#L728)) into `connections`; dropping pending edges is correct because they aren't persisted and so aren't part of the baseline the diff is computed against.

### 2.4 PersistOps (the awaited writes)

Every method is an **awaited server write** — never the debounced/fire-and-forget UI wrappers. This is the whole reason promote is correct (`workflow-logic.md` § Commit path).

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
    position: { x: number; y: number }; // required by createNodeAsync; the add_node default position
    config?: Record<string, string>;
    customLabel?: string;
    description?: string;
    autoExecutionEnabled?: boolean;
}

interface EdgeRecord {
    // = Connection/EdgeData with resolved server endpoints
    id?: EdgeId;
    sourceNodeId: ServerNodeId;
    sourcePortId: PortId;
    targetNodeId: ServerNodeId;
    targetPortId: PortId;
}
```

> **Why `createNode` is a wrapper, not a single call:** `createNodeAsync(tempId, body, onIdAssigned)` returns `void` (fire-and-forget) and hands back the server id through the required `onIdAssigned` callback; `waitForNodeId(tempId)` is the awaitable that resolves with the id and **rejects on failure but has no built-in timeout**. `persist.createNode` composes the two and wraps a timeout so a never-settling mutation can't hang promote.
> **Why `upsertEdges`/`delete*` await the raw API:** there is no react-query hook over `upsertFlow` — it's a plain `async` function, so the binding `await`s it directly. `updateNode` uses `useUpsertNodeMutation().mutateAsync`.

---

## 3. Diff · Plan · Promote · Drift

### 3.1 Semantic projection

The reviewable/diff-able/hash-able view. **Position, run state, `inputData`/`outputData`, timestamps, and `seq` are excluded.**

```ts
interface SemanticNode {
    id: NodeId;
    type: string;
    config: Record<string, string>;
    label?: string;
}
interface SemanticEdge {
    sourceNodeId: NodeId;
    sourcePortId: PortId;
    targetNodeId: NodeId;
    targetPortId: PortId; // the 4-tuple key
}
```

### 3.2 FlowDiff

```ts
interface FlowDiff {
    addedNodes: Array<{ tempId: TempNodeId; body: NodeCreateBody }>; // temp id + create body (incl. default position)
    removedNodes: ServerNodeId[];
    modifiedNodes: Array<{ id: ServerNodeId; config?: Record<string, string>; label?: string }>;
    addedEdges: SemanticEdge[];
    removedEdges: EdgeId[];
    isEmpty: boolean; // purely the semantic diff — there is no layout/position delta
    affects(target: RunTarget): boolean; // §4.4 affected-target test
}
```

> **No layout delta.** A new node's default position rides on its `add` op; existing nodes are never repositioned by the agent. So `isEmpty` is exactly the semantic diff, and there is no "layout-only turn."

### 3.3 Plan & operations (the diff _is_ the op set)

The operations are the diff lowered deterministically to an **ordered** list — not an agent-authored list. The agent supplies only `explanation`.

```ts
type PlanOperation =
    | { kind: 'disconnect'; edgeId: EdgeId }
    | { kind: 'delete_node'; nodeId: ServerNodeId }
    | { kind: 'add_node'; tempId: TempNodeId; body: NodeCreateBody } // position in body
    | { kind: 'update_node_config'; nodeId: ServerNodeId; config?: Record<string, string>; label?: string }
    | { kind: 'connect'; edge: SemanticEdge };

interface PlanStep {
    op: PlanOperation;
    summary: string;
} // summary via ToolRegistry.summarize(op)

interface Plan {
    id: string;
    explanation: string; // agent-authored NL; falls back to a mechanical diff summary
    operations: PlanOperation[]; // ORDERED, committed in this order (see below)
    steps: PlanStep[]; // human-facing card rows
    pendingRunIntent?: PendingRunIntent; // persisted with the plan (§4.5)
}
```

**Commit order** (`operations[]` is emitted in this order; teardown before build-up):
`disconnect` → `delete_node` → `add_node` → `update_node_config` → `connect`.
New-node positions travel in the `add_node` body — there is no separate reposition op.

### 3.4 Baseline, drift, promote result

```ts
interface Baseline {
    flowId: FlowId;
    graph: { nodes: NodeData[]; connections: Connection[] }; // live snapshot at S2 (binding.readGraph)
    hash: string; // content hash of the semantic projection
}

type DriftStatus = { drifted: false } | { drifted: true; baselineHash: string; liveHash: string };

type PromoteResult =
    | { ok: true; idMap: Map<TempNodeId, ServerNodeId>; pre: VersionSnapshot; post: VersionSnapshot }
    | { ok: false; error: string; abortedAt: PlanOperation }; // abort-on-rejection; next turn reconciles from live
```

`promote(plan)` (see `workflow-logic.md` § Commit path for the full contract) must, in order:

1. `flushAutosave()` (persist owner edits the drift hash ignores — e.g. a position drag — so the reload doesn't revert them);
2. open a **replay-spanning** self-echo suppression window (a flag, or re-stamp on every persist — _not_ a one-shot stamp; a multi-node build exceeds the 3 s self-echo window);
3. re-check drift, then replay `operations` one-at-a-time through `persist.*`, building the `idMap`; **any rejection aborts** (`ok:false`);
4. `reload()` only after every write lands; capture `pre`/`post` snapshots for the toggle.

Promote **does not** lock the canvas and **does not** run a post-replay drift re-check (it would be inert — the local hash isn't touched by the replay). v1 assumes single-editor for the few-second replay.

### 3.5 Version toggle (the revert)

Not native undo — an explicit, **id-preserving** switch between the two retained snapshots.

```ts
interface VersionSnapshot {
    which: 'pre-agent' | 'post-agent';
    graph: { nodes: NodeData[]; connections: Connection[] }; // server-authoritative
}
```

`switchToVersion(target)` computes `diff(current-live, target)` and commits it via `persist`:

- nodes only in current → `deleteNodes` (tombstone);
- nodes only in target → `upsertNodes` with the **full record under its original id** (the backend resurrects a tombstoned node — a new but supported use of `upsertFlow`);
- shared nodes whose config/label differ → `updateNode`.
  Then `reload()`. Because re-added nodes keep their **original id**, node ids are **stable across toggles**: edges re-key to existing ids (no id remap) and run history / saved port refs stay valid. The only ever-fresh id is a genuinely new node's _first_ creation at promote.

---

## 4. Runs

### 4.1 Target, request, outcome

```ts
type RunTarget = { kind: 'node'; nodeId: ServerNodeId } | { kind: 'flow'; nodeIds?: ServerNodeId[] }; // explicit ids override the block-stereotype dispatch set

interface RunRequest {
    target: RunTarget;
    flowId: FlowId;
    connectionId: string; // from binding.getConnectionId() at dispatch time
    dispatchSet: ServerNodeId[]; // what to kick off (node: [id]; flow: block-stereotype inputs, = Run All)
}

interface PortOutput {
    portId: PortId;
    type?: DataType;
    value: unknown;
}

interface RunResult {
    nodeId: ServerNodeId;
    state: 'COMPLETED' | 'ERROR';
    error?: string;
    outputs: PortOutput[]; // read via getPortData(portId, 'out', { flowId, runId }) on terminal
}

interface RunOutcome {
    results: RunResult[];
    timedOut: boolean; // 60 s POLL_TIMEOUT reached (there is no 'TIMEOUT' node state)
}
```

### 4.2 RunHandle & RunTracker

```ts
interface RunHandle {
    runIds(): Map<ServerNodeId, RunId>; // resolved as terminal events arrive
    done: Promise<RunOutcome>; // resolves on all-terminal or 60 s timeout
}

interface RunTracker {
    // dispatch: snapshot existing runIds per target → fire runNode/runFlow → attach store subscription
    //           → SYNCHRONOUS nodeRuns read (catches a fast/cached/direct-to-terminal run that finished
    //           before subscribe attached) → resolve when the wait set is terminal.
    dispatch(req: RunRequest): RunHandle;
}
```

- **Correlation:** the run's `RunId` is the first _new_ one to appear per target (robust to stale prior runs kept by `MAX_RUNS_PER_NODE`). Built on the existing `finalizeRun` → `nodeRuns` pipeline; there is no awaitable in the store, so `RunTracker` supplies one.
- **`run_flow` split:** the **dispatch set** is block-stereotype (`stereo === 'input' && autoExecutionEnabled !== false`, the same derivation as Run All), and the **wait set** is the nodes that actually enter `RUNNING`. Waiting on the dispatch set alone resolves early; waiting on all nodes stalls on untaken branches.

### 4.3 Connection id

Supplied by `binding.getConnectionId()` — a **live getter**, read at dispatch. The WS connection id is React state (`useWebSocketWorker` → `useInitFlowSocket`) that changes on reconnect and is **not** in any store, so a one-time snapshot would go stale and every run would time out.

### 4.4 Affected-target precondition (Executor-enforced)

Before an `execute` call reaches `ExecuteSurface`, the Executor tests `env.diff().affects(target)`:

```
run_flow          → blocked whenever  diff.isEmpty === false          (whole-flow behavior changed)
run_node(n)       → blocked iff  n ∈ diff.removedNodes ∪ modified ∪ added(temp)
                    (a node the draft did NOT touch dispatches immediately — legit troubleshooting)
```

A blocked call returns `{ ok:false, error:{ code:'not_persisted', pendingRunIntent } }` and **does not** consume the run gate; it dispatches only after promote.

### 4.5 PendingRunIntent

```ts
interface PendingRunIntent {
    tool: 'run_node' | 'run_flow';
    args: { nodeId?: NodeId; nodeIds?: NodeId[] }; // temp targets; remapped temp→real via the promote idMap
}
```

The **only** build-and-run auto-continue signal. **Persisted on the `AgentSession` alongside the Plan** so a reload at the plan gate doesn't silently drop the "…and run it" half. If the plan is rejected (or the turn ends with no promote), a queued intent is surfaced as a system note — never dropped.

---

## 5. Reads: snapshot & catalog

Routed per `workflow-logic.md` § Read targeting: **structural** reads hit the draft-if-forked-else-live; **runtime** reads always hit live.

```ts
interface ReadCanvas {
    listBlocks(): BlockCatalogEntry[]; // catalog
    getFlow(): FlowSnapshot; // structural: draft if forked, else live
    getNode(id: NodeId): NodeSnapshot | null; // structural
    getPortData(portId: PortId, direction: 'in' | 'out'): Promise<PortDataResponse>; // runtime: live
    getNodeRuns(id: ServerNodeId): RunContext[]; // runtime: live (draft resets run state)
}
```

```ts
interface FlowSnapshot {
    flowId: FlowId;
    permissions: Pick<FlowPermissions, 'canModifyCanvas' | 'canEditConfig' | 'canRun' | 'canEditStructure'>;
    nodes: NodeSnapshot[];
    edges: SemanticEdge[];
}

interface NodeSnapshot {
    id: NodeId;
    type: string; // block type slug (BlockDefinition.type, e.g. "input-text")
    label?: string; // customLabel
    config?: Record<string, string>;
    state?: NodeState;
    error?: string;
    inputs: Array<{ portId: PortId; type?: DataType; hasData: boolean }>;
    outputs: Array<{ portId: PortId; type?: DataType; hasData: boolean; preview?: string }>;
}

interface BlockCatalogEntry {
    // derived from blockRegistry (Record<string, BlockDefinitionWithFrontend>)
    type: string; // registry key
    label: string;
    description: string;
    stereo?: 'input' | 'process' | 'output';
    inputs: Array<{ id: string; type?: DataType; required?: boolean }>;
    outputs: Array<{ id: string; type?: DataType }>;
    configSchema?: ConfigField[]; // from BlockDefinition
    isFrontend?: boolean;
}
```

---

## 6. Orchestrator, phases, gates

### 6.1 Turn phase & gate

```ts
type TurnPhase =
    | { status: 'idle' }
    | { status: 'thinking' }
    | { status: 'awaiting_plan'; gate: Extract<Gate, { kind: 'plan' }> }
    | { status: 'awaiting_run'; gate: Extract<Gate, { kind: 'run' }> }
    | { status: 'promoting' } // committing; does NOT lock the owner's canvas in v1
    | { status: 'executing' }
    | { status: 'done' }
    | { status: 'error'; error: string };

type Gate = { kind: 'plan'; plan: Plan } | { kind: 'run'; request: RunRequest; summary: string };

type GateResolution =
    | { kind: 'plan'; decision: 'accept' | 'reject' }
    | { kind: 'run'; decision: 'confirm' | 'decline' };
```

There is exactly **one** pending gate at a time — the plan gate (finalize) and the run gate (in-loop) are time-disjoint within a turn, so they share the single slot embedded in an `awaiting_*` phase.

### 6.2 Orchestrator

The sole writer; owns the turn, the reasoning loop, and every gate. Imports nothing from Flow or React.

```ts
interface Orchestrator {
    send(text: string): Promise<void>; // S2: append user msg, resolve permissions, snapshot baseline, run loop, finalize
    resolvePending(resolution: GateResolution): void; // Panel → resume a gated turn
    abort(): void;
}
```

### 6.3 Supporting pure components

```ts
interface PromptBuilder {
    // pure: assembles the LLM request; structural snapshot only on the first iteration
    build(
        session: AgentSession,
        ctx: { snapshot?: FlowSnapshot; skillIndex: SkillIndexEntry[] }
    ): ChatCompletionRequest;
}

interface SkillRegistry {
    index(): SkillIndexEntry[]; // shown in the prompt
    get(name: string): string | undefined; // playbook text for use_skill
}
interface SkillIndexEntry {
    name: string;
    description: string;
}
```

The **Agent Panel** has no interface of its own: it emits `send` / `resolvePending` to the Orchestrator and renders purely from the persisted `AgentSession`.

---

## 7. Session, storage, streaming

### 7.1 Messages

```ts
type AgentRole = 'user' | 'assistant' | 'tool' | 'system';

interface AgentToolCall {
    id: string;
    name: ToolName;
    args: unknown;
    status: 'proposed' | 'executing' | 'succeeded' | 'failed';
}

interface AgentToolResult {
    toolCallId: string;
    ok: boolean;
    data?: unknown;
    error?: string;
}

interface AgentMessage {
    id: string;
    role: AgentRole;
    content?: string;
    toolCalls?: AgentToolCall[];
    toolResults?: AgentToolResult[];
    plan?: Plan; // assistant plan message → rehydrates the awaiting_plan gate on reload
    traces?: TraceEntry[]; // reasoning/tool traces (node-run traces stay in useCanvasStore)
    ts: number;
}
```

### 7.2 Session

```ts
interface AgentSession {
    id: string;
    flowId: FlowId;
    messages: AgentMessage[];
    phase: TurnPhase;
    pendingRunIntent?: PendingRunIntent; // turn-scoped; persisted so it survives a reload at the plan gate
    createdAt: number;
    updatedAt: number;
}
```

> **No `autoApprove`.** Cross-turn auto-approve was rejected (`workflow-logic.md` locked decision #1). Gating is per-plan (every time) and per-turn for runs (once), both expressed through `phase`/`Gate` — not a persisted toggle.

### 7.3 Storage

```ts
interface StorageInterface {
    load(flowId: FlowId): AgentSession | null;
    create(flowId: FlowId): AgentSession;
    save(session: AgentSession): void; // localStorage; called on every change (streaming, gates, status)
}
```

### 7.4 LLM Gateway (provider-neutral)

The only outbound LLM dependency. Canonical shape mirrors OpenAI chat-completions; provider drivers translate to Gemini etc. behind it.

```ts
interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: LlmToolCall[];
    tool_call_id?: string;
}
interface ToolDef {
    type: 'function';
    function: { name: string; description: string; parameters: JsonSchema };
}
interface LlmToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDef[];
    tool_choice?: 'auto' | 'none';
    stream?: boolean;
    temperature?: number;
}
interface ChatCompletionChunk {
    choices: [
        { delta: { content?: string; tool_calls?: LlmToolCall[] }; finish_reason?: 'stop' | 'tool_calls' | null },
    ];
}

interface LlmGateway {
    createChatCompletion(
        req: ChatCompletionRequest,
        opts?: { signal?: AbortSignal }
    ): AsyncIterable<ChatCompletionChunk>;
}
```

Implementations: `BrowserLlmGateway` (Stage 1, BYO key), `ProxyLlmGateway` (Stage 2), `SimulationGateway` (tests). Provider drivers (`OpenAiDriver`, `GeminiDriver`) live inside `BrowserLlmGateway`.

---

## 8. Grounding map (seam → real primitive)

Every non-pure seam wraps an existing primitive. This is what makes the design implementable without new backend work (the one backend _usage_ that is new — id-preserving re-add — is called out).

| Interface member                                                      | Wraps                                                                                                                 | Reference                                                                                                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createCanvasStore()`                                                 | `createStore(canvasStateCreator)` (`zustand/vanilla`, v5.0.10)                                                        | [`useCanvasStore.ts:171`](../../../libs/flows/src/stores/useCanvasStore.ts#L171)                                                                                               |
| `MutateSurface.*`                                                     | store pure actions: `setNodes`/`updateNodeData`/`deleteNode`/`addConnection`/`deleteConnection`                       | [`useCanvasStore.ts:193-441`](../../../libs/flows/src/stores/useCanvasStore.ts#L193-L441)                                                                                      |
| `Draft.readGraph` / `binding.readGraph` (mobile)                      | store `nodes` / `connections`                                                                                         | [`useCanvasStore.ts:55-56`](../../../libs/flows/src/stores/useCanvasStore.ts#L55-L56)                                                                                          |
| `binding.readGraph` (desktop)                                         | `WorkflowCanvasRef.getWorkflow()` → `{nodes, edges}` (pending edges stripped)                                         | [`WorkflowCanvas.tsx:728`](../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx#L728)                                                                        |
| `persist.createNode`                                                  | `createNodeAsync(tempId, body, onIdAssigned)` + `waitForNodeId(tempId)` (binding-wrapped timeout)                     | [`useNodeSync.ts:213`](../../../libs/flows/src/hooks/useNodeSync.ts#L213), [`:345`](../../../libs/flows/src/hooks/useNodeSync.ts#L345)                                         |
| `persist.updateNode`                                                  | `useUpsertNodeMutation().mutateAsync` → `upsertNode(id, flowId, body)` (carries `customLabel`)                        | [`useNodesQuery.ts:24`](../../../libs/flows/src/hooks/queries/useNodesQuery.ts#L24), [`api/nodes.ts:111`](../../../libs/flows/src/api/nodes.ts#L111)                           |
| `persist.upsertEdges` / `deleteEdges` / `deleteNodes` / `upsertNodes` | `await upsertFlow(flowId, { nodes, edges })`; tombstone `{ id: '#<id>' }`                                             | [`api/flows.ts:105`](../../../libs/flows/src/api/flows.ts#L105)                                                                                                                |
| `binding.reload`                                                      | `loadFlow(flowId)` → `canvasRef.loadWorkflow` / `store.loadWorkflow` (same as the socket `FlowUpdateMessage` handler) | [`api/flows.ts:48`](../../../libs/flows/src/api/flows.ts#L48), [`useSocketHandlers.ts:55`](../../../apps/web/src/app/features/flows/hooks/useSocketHandlers.ts#L55)            |
| `binding.flushAutosave`                                               | the owner autosave (desktop `FlowEditorPage` save / mobile `useMobileAutoSave`), awaited                              | § Commit path                                                                                                                                                                  |
| `binding.getConnectionId`                                             | `useInitFlowSocket` `connectionId` (React state from `useWebSocketWorker`)                                            | [`useWebSocketWorker.ts:28`](../../../libs/socket/src/hooks/useWebSocketWorker.ts#L28), [`useInitFlowSocket.ts:532`](../../../libs/socket/src/hooks/useInitFlowSocket.ts#L532) |
| `RunTracker.dispatch`                                                 | `runNode`/`runFlow(flowId, ids, { connection })` + `finalizeRun` → `nodeRuns`                                         | [`useCanvasStore.ts:312-334`](../../../libs/flows/src/stores/useCanvasStore.ts#L312-L334)                                                                                      |
| `ReadCanvas.getPortData`                                              | `getPortData(portId, direction, { flowId, runId })` → `PortDataResponse`                                              | [`api/nodes.ts:65`](../../../libs/flows/src/api/nodes.ts#L65)                                                                                                                  |
| `RunTracker` timeout                                                  | 60 s `POLL_TIMEOUT`                                                                                                   | [`useFlowExecution.ts`](../../../apps/web/src/app/features/process/hooks/useFlowExecution.ts)                                                                                  |
| drift hash / self-echo                                                | semantic projection hash; 3 s self-echo window; `FlowUpdateMessage` early trigger                                     | [`useInitFlowSocket.ts:399`](../../../libs/socket/src/hooks/useInitFlowSocket.ts#L399), [`socket types:59`](../../../libs/socket/src/types/index.ts#L59)                       |
| `BlockCatalogEntry`                                                   | `blockRegistry: Record<string, BlockDefinitionWithFrontend>`                                                          | [`useFlowsStore.ts:17`](../../../libs/flows/src/stores/useFlowsStore.ts#L17)                                                                                                   |

**Promote does not** use `syncNodeUpdate` (500 ms debounced — [`useNodeSync.ts:150`](../../../libs/flows/src/hooks/useNodeSync.ts#L150)) or `createEdgeAsync`'s success-only callback: both resolve _before_ the POST lands, so the mandatory reload would refetch pre-edit state and silently revert the agent's work.
