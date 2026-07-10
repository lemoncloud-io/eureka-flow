# 4 · Diff · Plan · Promote · Drift

> Part of the Agent Chat **[Component Interfaces](../component-interfaces.md)** · behavior in **[`workflow-logic.md`](../workflow-logic.md)**. The data the [Environment](3-environment.md) produces and commits: the **diff** (what changed), the **plan** (the diff shown for approval), the **promote** result, and the **revert toggle**. Full behavior in `workflow-logic.md` §§ Plan lifecycle / Commit path / Concurrency & drift.

---

## 4.1 Semantic projection

The reviewable/diff-able/hash-able view of a node or edge. **Position, run state, `inputData`/`outputData`, timestamps, and `seq` are excluded.**

```ts
interface SemanticNode { id: NodeId; type: string; config: Record<string, string>; label?: string; }
interface SemanticEdge {
  sourceNodeId: NodeId; sourcePortId: PortId;
  targetNodeId: NodeId; targetPortId: PortId;   // the 4-tuple key
}
```

## 4.2 FlowDiff

```ts
interface FlowDiff {
  addedNodes:    Array<{ tempId: TempNodeId; body: NodeCreateBody }>; // temp id + create body (NodeCreateBody → 3-environment.md)
  removedNodes:  ServerNodeId[];
  modifiedNodes: Array<{ id: ServerNodeId; config?: Record<string, string>; label?: string }>;
  addedEdges:    SemanticEdge[];
  removedEdges:  EdgeId[];
  isEmpty: boolean;                    // purely the semantic diff — there is no layout/position delta
  affects(target: RunTarget): boolean; // the affected-target test (RunTarget → 5-runs.md)
}
```

> **No layout delta.** A new node's default position rides on its `add` op; existing nodes are never repositioned by the agent. So `isEmpty` is exactly the semantic diff, and there is no "layout-only turn."

## 4.3 Plan & operations (the diff *is* the op set)

The operations are the diff lowered deterministically to an **ordered** list — not an agent-authored list. The agent supplies only `explanation`.

```ts
type PlanOperation =
  | { kind: 'disconnect';          edgeId: EdgeId }
  | { kind: 'delete_node';         nodeId: ServerNodeId }
  | { kind: 'add_node';            tempId: TempNodeId; body: NodeCreateBody } // position in body
  | { kind: 'update_node_config';  nodeId: ServerNodeId; config?: Record<string, string>; label?: string }
  | { kind: 'connect';             edge: SemanticEdge };

interface PlanStep { op: PlanOperation; summary: string; } // summary via ToolRegistry.summarize(op)

interface Plan {
  id: string;
  explanation: string;              // agent-authored NL; falls back to a mechanical diff summary
  operations: PlanOperation[];      // ORDERED, committed in this order (see below)
  steps: PlanStep[];                // human-facing card rows
  pendingRunIntent?: PendingRunIntent; // persisted with the plan (PendingRunIntent → 5-runs.md)
}
```

**Commit order** (`operations[]` is emitted in this order; teardown before build-up):
`disconnect` → `delete_node` → `add_node` → `update_node_config` → `connect`.
New-node positions travel in the `add_node` body — there is no separate reposition op.

## 4.4 Baseline, drift, promote result

```ts
interface Baseline {
  flowId: FlowId;
  graph: { nodes: NodeData[]; connections: Connection[] }; // live snapshot at S2 (binding.readGraph)
  hash: string;                     // content hash of the semantic projection
}

type DriftStatus =
  | { drifted: false }
  | { drifted: true; baselineHash: string; liveHash: string };

type PromoteResult =
  | { ok: true;  idMap: Map<TempNodeId, ServerNodeId>; pre: VersionSnapshot; post: VersionSnapshot }
  | { ok: false; error: string; abortedAt: PlanOperation }; // abort-on-rejection; next turn reconciles from live
```

`promote(plan)` (full contract in `workflow-logic.md` § Commit path) must, in order:
1. `flushAutosave()` (persist owner edits the drift hash ignores — e.g. a position drag — so the reload doesn't revert them);
2. open a **replay-spanning** self-echo suppression window (a flag, or re-stamp on every persist — *not* a one-shot stamp; a multi-node build exceeds the 3 s self-echo window);
3. re-check drift, then replay `operations` one-at-a-time through `persist.*`, building the `idMap`; **any rejection aborts** (`ok:false`);
4. `reload()` only after every write lands; capture `pre`/`post` snapshots for the toggle.

Promote **does not** lock the canvas and **does not** run a post-replay drift re-check (it would be inert — the local hash isn't touched by the replay). v1 assumes single-editor for the few-second replay.

## 4.5 Version toggle (the revert)

Not native undo — an explicit, **id-preserving** switch between the two retained snapshots.

```ts
interface VersionSnapshot {
  which: 'pre-agent' | 'post-agent';
  graph: { nodes: NodeData[]; connections: Connection[] }; // server-authoritative
}
```

`Environment.switchToVersion(target)` computes `diff(current-live, target)` and commits it via `persist`:
- nodes only in current → `deleteNodes` (tombstone);
- nodes only in target → `upsertNodes` with the **full record under its original id** (the backend resurrects a tombstoned node — a new but supported use of `upsertFlow`);
- shared nodes whose config/label differ → `updateNode`.

Then `reload()`. Because re-added nodes keep their **original id**, node ids are **stable across toggles**: edges re-key to existing ids (no id remap) and run history / saved port refs stay valid. The only ever-fresh id is a genuinely new node's *first* creation at promote.

---

Prev: **[← 3 · Environment](3-environment.md)** · Next: **[5 · Runs →](5-runs.md)** · Back to the **[overview](../component-interfaces.md)**
