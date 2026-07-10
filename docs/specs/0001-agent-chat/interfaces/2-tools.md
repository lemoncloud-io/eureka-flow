# 2 · Tool Interface

> Part of the Agent Chat **[Component Interfaces](../component-interfaces.md)** · behavior in **[`workflow-logic.md`](../workflow-logic.md)**. How the **LLM acts, mid-loop.** The model emits tool calls; one Executor runs each and routes it to the right kind-scoped surface.

Two sub-parts: the **Registry** (the catalog of tools) and the **Executor** (the per-call choke-point). The Executor routes to one of four **surfaces** by the tool's `kind`.

---

## 2.1 Tool kinds & names

```ts
type ToolKind = 'read' | 'mutate' | 'execute' | 'meta';

type ReadToolName    = 'list_blocks' | 'get_flow' | 'get_node' | 'get_port_data' | 'get_node_runs';
type MutateToolName  = 'add_node' | 'update_node_config' | 'delete_node' | 'connect' | 'disconnect';
type ExecuteToolName = 'run_node' | 'run_flow';
type MetaToolName    = 'use_skill';
type ToolName = ReadToolName | MutateToolName | ExecuteToolName | MetaToolName;
```

> No `auto_layout`, no `set_flow_metadata` — deferred in `workflow-logic.md` (§ *Tool groups & targets*). The mutate surface is exactly these five.

## 2.2 Call & result

```ts
interface ToolCall {
  id: string;          // provider-assigned tool_use id
  name: ToolName;
  args: unknown;       // validated against the tool's JSON Schema before use
}

type ToolResult =
  | { toolCallId: string; ok: true;  data?: unknown }
  | { toolCallId: string; ok: false; error: ToolError };

type ToolError =
  // a run blocked because the un-promoted draft affects its target (see 5-runs.md § affected-target)
  | { code: 'not_persisted';     pendingRunIntent: PendingRunIntent } // PendingRunIntent → 5-runs.md
  | { code: 'permission_denied'; requires: keyof FlowPermissions }
  | { code: 'invalid_args';      detail: string }
  | { code: 'exec_error';        detail: string };
```

`data` is the compact value fed back to the model (e.g. the new node's `TempNodeId`, a playbook string, a `RunOutcome`).

## 2.3 Registry

```ts
interface ToolDefinition<K extends ToolKind = ToolKind> {
  name: ToolName;
  kind: K;
  description: string;
  params: JsonSchema;                 // exposed to the LLM as ToolDef.function.parameters
  requires?: keyof FlowPermissions;   // permission flag checked by the Executor
  execute(args: unknown, surface: SurfaceFor<K>): Promise<ToolResult> | ToolResult;
  summarize(op: PlanOperation): string; // one-line human summary for the plan card (PlanOperation → 4-diff-plan-promote.md)
}

interface ToolRegistry {
  list(): ToolDefinition[];
  get(name: ToolName): ToolDefinition | undefined;
  toolDefs(): ToolDef[];                // LLM-facing defs (ToolDef → 6-session-gateway.md)
  summarize(op: PlanOperation): string; // routes to the owning tool's summarize
}
```

Pure metadata + logic — the Registry imports nothing from React.

## 2.4 Executor & the four surfaces

The Executor is the single point where args are validated, permission is checked, and the call is routed to the surface for its kind.

```ts
interface ToolExecutor {
  // validate args → check `requires` against FlowPermissions → route by kind → ToolResult
  dispatch(call: ToolCall): Promise<ToolResult>;
}

interface ToolSurfaces {
  read:    ReadCanvas;      // reads (the Environment routes draft-vs-live internally)
  mutate:  MutateSurface;   // draft only; forks lazily on first call
  execute: ExecuteSurface;  // live only; RunTracker-backed; affected-target precondition
  meta:    MetaSurface;     // Skill Registry
}
type SurfaceFor<K extends ToolKind> = ToolSurfaces[K];
```

> **Why four surfaces and not one big Executor?** The four kinds hit **different targets under different rules** (read → draft *or* live; mutate → draft only; execute → live + `RunTracker`; meta → skills). Giving each tool only its kind's surface means a `read` tool literally cannot call `runNode` — the compiler enforces the boundary. `SurfaceFor<K>` is just the type that maps `kind → surface`.

### read — `ReadCanvas`

Routed per `workflow-logic.md` § Read targeting: **structural** reads hit the draft-if-forked-else-live; **runtime** reads always hit live.

```ts
interface ReadCanvas {
  listBlocks(): BlockCatalogEntry[];                 // catalog
  getFlow(): FlowSnapshot;                           // structural: draft if forked, else live
  getNode(id: NodeId): NodeSnapshot | null;          // structural
  getPortData(portId: PortId, direction: 'in' | 'out'): Promise<PortDataResponse>; // runtime: live
  getNodeRuns(id: ServerNodeId): RunContext[];       // runtime: live (draft resets run state)
}
```

### mutate — `MutateSurface`

Operates on the [Draft](3-environment.md)'s pure store actions; nothing persists.

```ts
interface MutateSurface {
  addNode(input: { type: string; config?: Record<string, string>; label?: string }): { tempId: TempNodeId };
  updateNodeConfig(id: NodeId, patch: { config?: Record<string, string>; label?: string }): void;
  deleteNode(id: NodeId): void;
  connect(edge: EdgeEndpoints): { edgeId: EdgeId };
  disconnect(edgeId: EdgeId): void;
}

interface EdgeEndpoints {
  sourceNodeId: NodeId; sourcePortId: PortId;
  targetNodeId: NodeId; targetPortId: PortId;
}
```

- **`addNode` takes no `position`.** The surface assigns a **deterministic default position** internally; it rides on the create body at promote. The agent cannot see the canvas, so it never places or repositions.
- **`updateNodeConfig` carries `label`.** `label` is a first-class semantic field, and `upsertNode` carries `customLabel`, so a rename round-trips. A `config` patch **replaces** the config object (store merge is shallow), so the surface must merge onto the current config before setting.

### execute — `ExecuteSurface`

Live only; each returns a *finished* result via the [RunTracker](5-runs.md).

```ts
interface ExecuteSurface {
  runNode(id: ServerNodeId): Promise<RunOutcome>;         // RunOutcome → 5-runs.md
  runFlow(nodeIds?: ServerNodeId[]): Promise<RunOutcome>;
}
```

The **affected-target precondition** is enforced by the Executor *before* calling this surface (see [5-runs.md § affected-target](5-runs.md)); a blocked call never reaches `runNode`/`runFlow`.

### meta — `MetaSurface`

```ts
interface MetaSurface {
  useSkill(name: string): { playbook: string };
}
```

---

## 2.5 Read-result shapes

What the `read` surface returns.

```ts
interface FlowSnapshot {
  flowId: FlowId;
  permissions: Pick<FlowPermissions, 'canModifyCanvas' | 'canEditConfig' | 'canRun' | 'canEditStructure'>;
  nodes: NodeSnapshot[];
  edges: SemanticEdge[];            // SemanticEdge → 4-diff-plan-promote.md
}

interface NodeSnapshot {
  id: NodeId;
  type: string;                     // block type slug (BlockDefinition.type, e.g. "input-text")
  label?: string;                   // customLabel
  config?: Record<string, string>;
  state?: NodeState;
  error?: string;
  inputs:  Array<{ portId: PortId; type?: DataType; hasData: boolean }>;
  outputs: Array<{ portId: PortId; type?: DataType; hasData: boolean; preview?: string }>;
}

interface BlockCatalogEntry {       // derived from blockRegistry (Record<string, BlockDefinitionWithFrontend>)
  type: string;                     // registry key
  label: string;
  description: string;
  stereo?: 'input' | 'process' | 'output';
  inputs:  Array<{ id: string; type?: DataType; required?: boolean }>;
  outputs: Array<{ id: string; type?: DataType }>;
  configSchema?: ConfigField[];     // from BlockDefinition
  isFrontend?: boolean;
}
```

---

Prev: **[← 1 · Orchestrator](1-orchestrator.md)** · Next: **[3 · Environment →](3-environment.md)** · Back to the **[overview](../component-interfaces.md)**
