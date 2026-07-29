# Edge agent

> **The connection specialist.** The edge agent **connects two nodes or disconnects an edge** —
> `connect_nodes({ sourceNodeId, sourcePortId, targetNodeId, targetPortId })` (add a validated connection) or
> `disconnect_edge({ edgeId })` (remove one connection) — applied straight to the live canvas. It is **spawned
> by the orchestrator**, never talked to directly: the orchestrator resolves which nodes and the edge to drop,
> and the edge agent validates and executes. It builds on the
> [shared agent architecture](../design/architecture.md); this page is its shipped-status summary —
> behavior and oracles are canonical in the harness docs + scenario specs below.

## Canonical specs

- **Persona** — `EDGE_SYSTEM_PROMPT` in
  [edgeAgent.ts](../../../libs/agent/src/agents/edgeAgent.ts): connect/disconnect-only scope,
  read-before-connect (`describe_node` for both endpoints' ports), and — the load-bearing rule — a rejected
  connection (unknown port, incompatible port types, would-create-cycle) is **reported, not worked around**;
  it never reroutes to a different port to force a link.
- **Behavior & oracles** — [harness-scenarios.md](../design/harness-scenarios.md): how the edits are
  verified (the oracle discipline) and the scenario specs it points to.
- **Tools & the turn loop** — [architecture.md](../design/architecture.md) and
  [harness-spec.md](../design/harness-spec.md) (the shared think/act loop, `ToolExecutor`, permissions).

## What it is

A connection specialist: it changes the **set of edges** on the canvas and nothing else — it never adds,
deletes, moves, or configures a node. **One** agent covers both directions because connect and disconnect
share the same reads (node ports, the current edge list) and the same grant — splitting them would add spawn
overhead with no accuracy gain.

- **`connect_nodes` validates, then links.** Before it writes, it checks that both nodes exist; both ports
  exist on their block schemas; the port **types are compatible** (`any` matches anything, else a
  case-insensitive type match); and the edge **would not create a cycle** (self-loops included). Only then
  does it apply `binding.addEdge(...)`. Connecting to an already-occupied **input** port **replaces** the edge
  there (single-input semantics, matching a user drag). It returns the new edge id.
- **`disconnect_edge` removes one edge by id.** The agent reads the edge list (`list_edges`) to resolve the
  edge the orchestrator means, then drops it.
- **A rejected connection is reported, not rerouted.** If the requested ports are incompatible, missing, or
  would cycle, the agent surfaces the reason (and the ports the block actually exposes) in its summary and
  does **not** substitute a different port or direction — the same discipline the property agent applies to a
  rejected config value. The orchestrator decides the fix; the specialist never guesses.

```ts
// connect_nodes adds ONE validated edge; returns its new id.
interface ConnectNodesArgs {
    sourceNodeId: string;
    sourcePortId: string; // an OUTPUT port on the source
    targetNodeId: string;
    targetPortId: string; // an INPUT port on the target
}
// disconnect_edge removes one existing edge.
interface DisconnectEdgeArgs {
    edgeId: string; // resolved id of the edge to remove
}
```

## Tools

| Tool              | Kind   | Notes                                                                                                                         |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `list_nodes`      | read   | `binding.readGraph()` → the node list, seeded into context each turn                                                          |
| `describe_node`   | read   | one node's block schema — its input/output ports and their types (read before connecting)                                     |
| `list_edges`      | read   | compact edge list: `edgeId`, `source:port → target:port` — the palette of edges to disconnect                                 |
| `connect_nodes`   | mutate | `ConnectNodesArgs`; validates ports + type-compat + no-cycle, then `binding.addEdge`; returns `{ edgeId }`; `canModifyCanvas` |
| `disconnect_edge` | mutate | `DisconnectEdgeArgs` → `binding.deleteEdge(id)`; requires `canModifyCanvas`                                                   |

Read tools come from the `tools/nodeTools.ts` read provider (`list_nodes` + `describe_node`); the edge read +
writes from the **edge** provider (`createEdgeToolProvider`, which owns `list_edges` + the validation). Both
writes require `canModifyCanvas` — flows defines it as "add/delete nodes, connect edges" (Owner + Editor),
the same capability the locator's move needs — gated at the executor against **both** the agent's grant and
the user's flow-role, so a viewer is denied. (Flows' `canEditStructure` is flow **metadata** — rename/publish,
Owner only — and is _not_ this capability.)

**Validation lives in the tool.** Port-type compatibility and cycle detection are domain rules, so they live
in `connect_nodes` (reusing the frontend graph utils `arePortTypesCompatible` + `wouldCreateCycle`), not in
the persona and not in the binding — that keeps them headless-testable and gives the agent a clean rejection
reason. `CanvasBinding.addEdge` is the thin mechanical seam: it applies the edit (including the single-input
replacement) and checkpoints, but does not re-judge whether the edge is sensible — the same split as config
validation living in `createNodeConfigToolProvider`, not in `updateNode`.

## Definition of done — verified behavior

The edge agent's contract. Each line is a scenario in code, not restated here (the code is the source of
truth). Agent-level, driving the agent directly over the shared `harness/fixtures`:

- **Connect (happy path)** — `connect_nodes` between compatible ports adds exactly one edge; the returned id
  names it; no other edge changes.
- **Reject incompatible types** — connecting a `string` output to a `number` input is refused and reported;
  no edge is added.
- **Reject cycle** — an edge that would close a loop (including a self-loop) is refused and reported; graph
  unchanged.
- **Reject unknown node / port** — a source/target node or port id that doesn't exist is refused; nothing is
  added; the summary names the ports the block actually exposes.
- **Replace on occupied input** — connecting to an input port that already has an edge replaces the old edge
  (one edge in, not two).
- **Disconnect** — `disconnect_edge({ edgeId })` removes exactly that edge and leaves the nodes in place.
- **Permission gate** — without `canModifyCanvas` (a viewer) both writes are denied and nothing changes.
- **Context** — the current node list is seeded into context each turn.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/edge.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/edge.spec.ts) — fake-gateway
  scripts driving the edge agent directly. Type-compat, cycle, unknown-port, and replace-on-occupied-input are
  also verified at the edge tool
  ([`__tests__/tools/edgeTools.spec.ts`](../../../libs/agent/src/__tests__/tools/edgeTools.spec.ts)); the
  permission gate at the executor — verified once, not duplicated here.
- **Live (key-gated, real LLM):**
  [`scenarios/edge.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/edge.live.spec.ts) —
  hands the edge agent a real gateway and checks the same oracles when the model chooses the calls.
- **Integration (orchestrator coordinating agents):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts)
  (+ `.live`) — the edge agent's cross-agent cases (wiring a newly-created node; a partial turn where the
  connection is rejected but a sibling edit lands) live there, not here.
