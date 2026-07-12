# 0 · Conventions & grounding (reference)

> Part of the Agent Chat **[Component Interfaces](../component-interfaces.md)** · behavior in **[`workflow-logic.md`](../workflow-logic.md)**. This is a **reference** file — read it when a type or a convention in another file is unfamiliar, not front-to-back.

---

## 0.1 Branded ids

Ids are branded so the type system enforces the two invariants the turn logic depends on: **a run only targets a persisted node**, and **a temp id is never transmitted to the server**.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type FlowId       = Brand<string, 'FlowId'>;
type ServerNodeId = Brand<string, 'ServerNodeId'>; // persisted; exists on the live/server flow
type TempNodeId   = Brand<string, 'TempNodeId'>;   // draft-local; absent from the baseline and the server
type NodeId       = ServerNodeId | TempNodeId;
type EdgeId       = Brand<string, 'EdgeId'>;
type PortId       = Brand<string, 'PortId'>;        // "nodeId:portName"
type RunId        = Brand<string, 'RunId'>;
```

Consequences enforced at compile time:
- `run_node` / `get_node_runs` take **`ServerNodeId`** — a draft-only `TempNodeId` cannot be run or have live history read.
- The promote `idMap` is `Map<TempNodeId, ServerNodeId>`; edge endpoints are remapped `TempNodeId → ServerNodeId` **before** any write.

## 0.2 Reused codebase types (not redefined anywhere in these files)

These come from the flow layer and are used verbatim. New agent types reference them; they are **not** re-declared.

| Type | Where | Shape note |
|---|---|---|
| `NodeData` | `@lemoncloud/eureka-flows-api` (re-exported [`libs/flows/src/types/index.ts`](../../../../libs/flows/src/types/index.ts)) | `{ id?, type, position:{x,y}, config?: Record<string,string>, customLabel?, … readonly status?, inputData?, outputData? }` — note **`config`** (not `data`) and **`status`** (not `state`). |
| `Connection` | canvas store field ([`useCanvasStore.ts:56`](../../../../libs/flows/src/stores/useCanvasStore.ts#L56)) | Effectively `EdgeData`: `{ id?, sourceNodeId, sourcePortId, targetNodeId, targetPortId, … }`. Store calls the collection `connections`, not `edges`. |
| `EdgeData` | `@lemoncloud/eureka-flows-api` | Four endpoint fields **all required**; identical field names to `Connection`. |
| `DataPacket` | `@lemoncloud/eureka-flows-api` | `{ type: DataType, value?, timestamp? }`. |
| `DataType` | re-exported `libs/flows/src/types` | `'text' \| 'image' \| 'number' \| 'json' \| 'any'`. |
| `NodeState` | [`libs/flows/src/types/index.ts:150`](../../../../libs/flows/src/types/index.ts#L150) | `'IDLE'\|'READY'\|'RUNNING'\|'COMPLETED'\|'ERROR'`. |
| `RunContext` | [`libs/flows/src/types/index.ts:819`](../../../../libs/flows/src/types/index.ts#L819) | `{ runId, nodeId, state:'RUNNING'\|'COMPLETED'\|'ERROR', startedAt?, completedAt?, traces:TraceEntry[], portUpdates:RunPortUpdate[], error? }` — **outputs are not a field**; per-port emissions are `portUpdates`. |
| `TraceEntry` | [`libs/flows/src/types/index.ts:194`](../../../../libs/flows/src/types/index.ts#L194) | `{ traceId?, seq, ts, stage?, message?, runId?, type?, data? }`. |
| `FlowPermissions` | [`libs/flows/src/types/permissions.ts:16`](../../../../libs/flows/src/types/permissions.ts#L16) | booleans: `canEditConfig, canModifyCanvas, canEditStructure, canRun, canSave, canDragNodes, canCreate`. |
| `BlockDefinitionWithFrontend` | [`libs/flows/src/types/index.ts:230`](../../../../libs/flows/src/types/index.ts#L230) | base `BlockDefinition` + `isFrontend?`, `stereo?: 'input'\|'process'\|'output'`, `isRunnable?`. |
| `WorkflowState` | `@lemoncloud/eureka-flows-api` | `{ nodes: NodeData[]; edges: EdgeData[] }` — the `loadWorkflow` payload. |
| `PortDataResponse` | `@lemoncloud/eureka-flows-api` | `{ id, nodeId, portId, direction, data:{ value, type, timestamp? } }` — what `getPortData` resolves to. |

New agent types are proposed for `libs/agent/src` (`types.ts`, `gateway/`, `tools/`, `env/`), mirroring how `flows`/`socket` are structured.

## 0.3 How to read these interfaces (interface vs. class)

A TypeScript **`interface` is a contract, not a container** — it lists only the methods/properties a *caller* may use (like an interface/abstract type in Java, C#, or Swift). It has **no fields and no implementation**. The real object is a **class** that `implements` the interface; the class is where state lives, held as **`private`, constructor-injected fields** (dependency injection).

So throughout these files, "component X **owns** Y" means: *the class implementing `X` holds `Y` as a private field, passed in when it is constructed.* The collaborator does **not** appear on the interface — that is intentional, so callers cannot reach around the contract. [3-environment.md](3-environment.md) shows a worked example (`Environment` owning the `CanvasBinding` and the draft).

---

## 0.4 Grounding map (seam → real primitive)

Every non-pure seam wraps an existing primitive. This is what makes the design implementable without new backend work (the one backend *usage* that is new — id-preserving re-add — is called out).

| Interface member | Wraps | Reference |
|---|---|---|
| `createCanvasStore()` | `createStore(canvasStateCreator)` (`zustand/vanilla`, v5.0.10) | [`useCanvasStore.ts:171`](../../../../libs/flows/src/stores/useCanvasStore.ts#L171) |
| `MutateSurface.*` | store pure actions: `setNodes`/`updateNodeData`/`deleteNode`/`addConnection`/`deleteConnection` | [`useCanvasStore.ts:193-441`](../../../../libs/flows/src/stores/useCanvasStore.ts#L193-L441) |
| `Draft.readGraph` / `binding.readGraph` (mobile) | store `nodes` / `connections` | [`useCanvasStore.ts:55-56`](../../../../libs/flows/src/stores/useCanvasStore.ts#L55-L56) |
| `binding.readGraph` (desktop) | `WorkflowCanvasRef.getWorkflow()` → `{nodes, edges}` (pending edges stripped) | [`WorkflowCanvas.tsx:728`](../../../../apps/web/src/app/features/flows/components/WorkflowCanvas.tsx#L728) |
| `persist.createNode` | `createNodeAsync(tempId, body, onIdAssigned)` + `waitForNodeId(tempId)` (binding-wrapped timeout) | [`useNodeSync.ts:213`](../../../../libs/flows/src/hooks/useNodeSync.ts#L213), [`:345`](../../../../libs/flows/src/hooks/useNodeSync.ts#L345) |
| `persist.updateNode` | `useUpsertNodeMutation().mutateAsync` → `upsertNode(id, flowId, body)` (carries `customLabel`) | [`useNodesQuery.ts:24`](../../../../libs/flows/src/hooks/queries/useNodesQuery.ts#L24), [`api/nodes.ts:111`](../../../../libs/flows/src/api/nodes.ts#L111) |
| `persist.upsertEdges` / `deleteEdges` / `deleteNodes` / `upsertNodes` | `await upsertFlow(flowId, { nodes, edges })`; tombstone `{ id: '#<id>' }` | [`api/flows.ts:105`](../../../../libs/flows/src/api/flows.ts#L105) |
| `binding.reload` | `loadFlow(flowId)` → `canvasRef.loadWorkflow` / `store.loadWorkflow` (same as the socket `FlowUpdateMessage` handler) | [`api/flows.ts:48`](../../../../libs/flows/src/api/flows.ts#L48), [`useSocketHandlers.ts:55`](../../../../apps/web/src/app/features/flows/hooks/useSocketHandlers.ts#L55) |
| `binding.flushAutosave` | the owner autosave (desktop `FlowEditorPage` save / mobile `useMobileAutoSave`), awaited | [`workflow-logic.md` § Commit path](../workflow-logic.md#the-commit-path-promote) |
| `binding.getConnectionId` | `useInitFlowSocket` `connectionId` (React state from `useWebSocketWorker`) | [`useWebSocketWorker.ts:28`](../../../../libs/socket/src/hooks/useWebSocketWorker.ts#L28), [`useInitFlowSocket.ts:532`](../../../../libs/socket/src/hooks/useInitFlowSocket.ts#L532) |
| `RunTracker.dispatch` | `runNode`/`runFlow(flowId, ids, { connection })` + `finalizeRun` → `nodeRuns` | [`useCanvasStore.ts:312-334`](../../../../libs/flows/src/stores/useCanvasStore.ts#L312-L334) |
| `ReadCanvas.getPortData` | `getPortData(portId, direction, { flowId, runId })` → `PortDataResponse` | [`api/nodes.ts:65`](../../../../libs/flows/src/api/nodes.ts#L65) |
| `RunTracker` timeout | 60 s `POLL_TIMEOUT` | [`useFlowExecution.ts`](../../../../apps/web/src/app/features/process/hooks/useFlowExecution.ts) |
| drift hash / self-echo | semantic projection hash; 3 s self-echo window; `FlowUpdateMessage` early trigger | [`useInitFlowSocket.ts:399`](../../../../libs/socket/src/hooks/useInitFlowSocket.ts#L399), [`socket types:59`](../../../../libs/socket/src/types/index.ts#L59) |
| `BlockCatalogEntry` | `blockRegistry: Record<string, BlockDefinitionWithFrontend>` | [`useFlowsStore.ts:17`](../../../../libs/flows/src/stores/useFlowsStore.ts#L17) |

**Promote does not** use `syncNodeUpdate` (500 ms debounced — [`useNodeSync.ts:150`](../../../../libs/flows/src/hooks/useNodeSync.ts#L150)) or `createEdgeAsync`'s success-only callback: both resolve *before* the POST lands, so the mandatory reload would refetch pre-edit state and silently revert the agent's work.

---

← Back to the **[overview](../component-interfaces.md)**
