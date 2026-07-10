# 5 · Runs

> Part of the Agent Chat **[Component Interfaces](../component-interfaces.md)** · behavior in **[`workflow-logic.md`](../workflow-logic.md)**. Runs kick off asynchronously and finish over the socket; **RunTracker** turns that into a single awaitable so the [execute tool](2-tools.md) returns a finished result. Full behavior in `workflow-logic.md` §§ Run tracking / Build-and-run.

---

## 5.1 Target, request, outcome

```ts
type RunTarget =
  | { kind: 'node'; nodeId: ServerNodeId }
  | { kind: 'flow'; nodeIds?: ServerNodeId[] }; // explicit ids override the block-stereotype dispatch set

interface RunRequest {
  target: RunTarget;
  flowId: FlowId;
  connectionId: string;        // from binding.getConnectionId() at dispatch time
  dispatchSet: ServerNodeId[]; // what to kick off (node: [id]; flow: block-stereotype inputs, = Run All)
}

interface PortOutput { portId: PortId; type?: DataType; value: unknown; }

interface RunResult {
  nodeId: ServerNodeId;
  state: 'COMPLETED' | 'ERROR';
  error?: string;
  outputs: PortOutput[];  // read via getPortData(portId, 'out', { flowId, runId }) on terminal
}

interface RunOutcome {
  results: RunResult[];
  timedOut: boolean;      // 60 s POLL_TIMEOUT reached (there is no 'TIMEOUT' node state)
}
```

## 5.2 RunHandle & RunTracker

```ts
interface RunHandle {
  runIds(): Map<ServerNodeId, RunId>; // resolved as terminal events arrive
  done: Promise<RunOutcome>;          // resolves on all-terminal or 60 s timeout
}

interface RunTracker {
  // dispatch: snapshot existing runIds per target → fire runNode/runFlow → attach store subscription
  //           → SYNCHRONOUS nodeRuns read (catches a fast/cached/direct-to-terminal run that finished
  //           before subscribe attached) → resolve when the wait set is terminal.
  dispatch(req: RunRequest): RunHandle;
}
```

- **Correlation:** the run's `RunId` is the first *new* one to appear per target (robust to stale prior runs kept by `MAX_RUNS_PER_NODE`). Built on the existing `finalizeRun` → `nodeRuns` pipeline; there is no awaitable in the store, so `RunTracker` supplies one.
- **`run_flow` split:** the **dispatch set** is block-stereotype (`stereo === 'input' && autoExecutionEnabled !== false`, the same derivation as Run All), and the **wait set** is the nodes that actually enter `RUNNING`. Waiting on the dispatch set alone resolves early; waiting on all nodes stalls on untaken branches.

(`RunContext`, the terminal states, and the 60 s timeout are grounded in [0-conventions.md § 0.4](0-conventions.md#04-grounding-map-seam--real-primitive).)

## 5.3 Connection id

Supplied by `binding.getConnectionId()` — a **live getter**, read at dispatch. The WS connection id is React state (`useWebSocketWorker` → `useInitFlowSocket`) that changes on reconnect and is **not** in any store, so a one-time snapshot would go stale and every run would time out.

## 5.4 Affected-target precondition (Executor-enforced)

Before an `execute` call reaches the [ExecuteSurface](2-tools.md), the Executor tests `env.diff().affects(target)`:

```
run_flow          → blocked whenever  diff.isEmpty === false          (whole-flow behavior changed)
run_node(n)       → blocked iff  n is added (temp) or modified in the draft
                    (untouched node → dispatches immediately, legit mid-build troubleshooting;
                     a draft-removed node is NOT blocked — queueing it would run what promote deletes)
```

A blocked call returns `{ ok:false, error:{ code:'not_persisted', pendingRunIntent } }` and **does not** consume the run gate; it dispatches only after promote.

## 5.5 PendingRunIntent

```ts
interface PendingRunIntent {
  tool: 'run_node' | 'run_flow';
  args: { nodeId?: NodeId; nodeIds?: NodeId[] }; // temp targets; remapped temp→real via the promote idMap
}
```

The **only** build-and-run auto-continue signal. **Persisted on the [`AgentSession`](6-session-gateway.md) alongside the Plan** so a reload at the plan gate doesn't silently drop the "…and run it" half. If the plan is rejected (or the turn ends with no promote), a queued intent is surfaced as a system note — never dropped.

---

Prev: **[← 4 · Diff · Plan · Promote](4-diff-plan-promote.md)** · Next: **[6 · Session & Gateway →](6-session-gateway.md)** · Back to the **[overview](../component-interfaces.md)**
