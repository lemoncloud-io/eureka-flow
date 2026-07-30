# Node agent

> **⚠️ RETIRED (unregistered).** Superseded by the [block agent](./blockAgent.md), which owns a block's whole
> lifecycle (add · configure · rename · delete). The `node` agent is no longer in `DEFAULT_REGISTRATIONS`, so the
> orchestrator cannot spawn it; its module + `node.*` scenario suites stay in the tree (driven directly) until a
> later cleanup. This page is kept for reference. **`add_node` / `delete_node` now belong to the block agent.**

> **The add/delete specialist.** The node agent **adds a node to the canvas or deletes one** —
> `add_node({ type, position })` (create with the block's default config) or `delete_node({ nodeId })` (remove
> the node; its edges cascade away) — applied straight to the live canvas. It is **spawned by the
> orchestrator**, never talked to directly: the orchestrator resolves the block type, the position, and the
> target node, and the node agent executes. It builds on the
> [shared agent architecture](../design/architecture.md); this page is its shipped-status summary —
> behavior and oracles are canonical in the harness docs + scenario specs below.

## Canonical specs

- **Persona** — `NODE_SYSTEM_PROMPT` in
  [nodeAgent.ts](../../../libs/agent/src/agents/nodeAgent.ts): add/delete-only scope, **defaults-only
  creation** (it never sets config — that is the [property agent](./property.md)), **no auto-wiring** (it
  never connects — that is the [edge agent](./edge.md)), and — the load-bearing rule — it never invents a
  block `type` or a `position`; the orchestrator supplies both.
- **Behavior & oracles** — [harness-scenarios.md](../design/harness-scenarios.md): how the edits are
  verified (the oracle discipline) and the scenario specs it points to.
- **Tools & the turn loop** — [architecture.md](../design/architecture.md) and
  [harness-spec.md](../design/harness-spec.md) (the shared think/act loop, `ToolExecutor`, permissions).

## What it is

An add/delete specialist: it changes the **set of nodes** on the canvas and nothing else — it never moves,
configures, renames, or connects. It reads the block catalog with `catalog_search` / `describe_block` to
confirm a type the orchestrator named is real, then creates or deletes.

- **`add_node` creates with defaults.** It places one node of a given `type` at a given `position`, seeded
  with the block's `defaultConfig` (so every required config key is already valid). It sets **no** non-default
  config and adds **no** edge — those are the property and edge specialists (see
  [Composition](#composition)). It returns the new node's id so the orchestrator can hand it to them.
- **`delete_node` removes one node and cascades its edges.** Deleting a node also drops every connection
  touching it (the canvas store does this in one update); the agent never hand-deletes edges first. Its
  summary names the edges that went with it.
- **It never invents a `type` or a `position`.** A task with no concrete block type or no position is a
  malformed briefing it reports, not a node it guesses — the same discipline the locator applies to a missing
  move amount. `add_node` is a single synchronous `CanvasBinding.addNode(type, position)` — checkpointed for
  undo like a user drop.

```ts
// add_node creates one node with the block's default config; returns its new id.
interface AddNodeArgs {
    type: string; // block type, confirmed against the catalog
    position: XY; // absolute canvas coords supplied by the orchestrator (no auto-placement)
}
// delete_node removes one node; its edges cascade away.
interface DeleteNodeArgs {
    nodeId: string; // resolved id of the node to remove
}
```

## Tools

| Tool             | Kind   | Notes                                                                                               |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `list_nodes`     | read   | `binding.readGraph()` → the node list, seeded into context each turn                                |
| `describe_node`  | read   | one node's schema + current config — used to confirm a delete target                                |
| `catalog_search` | read   | compact lexical shortlist over the block catalog — confirm a named type is real                     |
| `describe_block` | read   | one block type's full schema — confirm the type before creating                                     |
| `add_node`       | mutate | `AddNodeArgs` → `binding.addNode(type, position)`; returns `{ nodeId }`; requires `canModifyCanvas` |
| `delete_node`    | mutate | `DeleteNodeArgs` → `binding.deleteNode(id)` (edges cascade); requires `canModifyCanvas`             |

Read tools come from the `tools/nodeTools.ts` read provider (`list_nodes` + `describe_node`) and the catalog
provider (`catalog_search` + `describe_block`); the writes from the node **structure** provider
(`createNodeStructureToolProvider`). Both writes require `canModifyCanvas` — flows defines it as "add/delete
nodes, connect edges" (Owner + Editor), the same capability the locator's move needs — gated at the executor
against **both** the agent's grant and the user's flow-role, so a viewer is denied. (Flows' `canEditStructure`
is flow **metadata** — rename/publish, Owner only — and is _not_ this capability.)

## Composition

The node agent deliberately does **only** add/delete, so "add a Gemini node set to `gemini-2.5-pro` and wire
it after Fetch" is not one agent's job — the orchestrator composes it: spawn **node** → `add_node` returns the
new id; then spawn **edge** (connect Fetch → new id) and **property** (set config on the new id) concurrently,
since those touch disjoint concerns and each write is a synchronous atomic edit. This keeps config validation
in the property agent and edge validation in the edge agent, neither duplicated in the creator. See
[harness-spec.md §8](../design/harness-spec.md).

## Definition of done — verified behavior

The node agent's contract. Each line is a scenario in code, not restated here (the code is the source of
truth). Agent-level, driving the agent directly over the shared `harness/fixtures`:

- **Add with defaults** — `add_node({ type, position })` appends one node of that type at that position, with
  config equal to the block's `defaultConfig`; the returned id names the new node; no edges are created.
- **Reject unknown type** — a `type` not in the catalog is refused and reported; nothing is added.
- **Delete + cascade** — `delete_node({ nodeId })` removes the node **and** every edge that referenced it; the
  summary names the dropped edges.
- **Reject missing node** — `delete_node` on an id not on the canvas is refused; the graph is unchanged.
- **No config, no wiring** — the agent never sets non-default config and never adds an edge, even when the
  briefing mentions them (those parts are reported as out of scope).
- **Permission gate** — without `canModifyCanvas` (a viewer) both writes are denied and nothing changes.
- **Context** — the current node list is seeded into context each turn.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/node.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/node.spec.ts) — fake-gateway
  scripts driving the node agent directly. Unknown-type and missing-node rejection are also verified at the
  structure tool ([`__tests__/tools/nodeTools.spec.ts`](../../../libs/agent/src/__tests__/tools/nodeTools.spec.ts));
  the permission gate at the executor — verified once, not duplicated here.
- **Live (key-gated, real LLM):**
  [`scenarios/node.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/node.live.spec.ts) —
  hands the node agent a real gateway and checks the same oracles when the model chooses the calls.
- **Integration (orchestrator coordinating agents):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts)
  (+ `.live`) — the node agent's cross-agent cases (the add → wire → configure composition; a partial turn
  where the node lands but the requested wire is rejected) live there, not here.
