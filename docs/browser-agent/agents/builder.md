# Builder agent (composition specialist)

> **The composition specialist — the flow's structural writer in the shipped [hybrid](../design/architecture.md#the-hybrid-writer-layer).** The orchestrator plans the whole structure and **spawns** the Builder
> (`agentType: 'builder'`) with the plan; the Builder **builds the whole (sub-)flow itself** on the live canvas —
> add · wire · configure · label · lay out — using the full editing toolset and **`use_skill`** for the how-to. A **leaf**
> sub-turn (no `spawn`, no nesting). Its code is [builderAgent.ts](../../../libs/agent/src/agents/builderAgent.ts); the
> harness model is canonical in [design/harness-spec.md §6/§8](../design/harness-spec.md).

## Canonical specs

- **Persona** — `BUILDER_SYSTEM_PROMPT` in [builderAgent.ts](../../../libs/agent/src/agents/builderAgent.ts): it receives a complete plan and
  executes it (it does **not** plan or coordinate — that is the orchestrator's job); build in dependency order,
  wire adjacent stages (one edge per input, no cycle), lay out left-to-right, name nodes to match their role
  (`rename`, using the default label `add_node` returns), configure against the real schema, **reject + report**
  an invalid value/field/connection (never substitute or force), and read the graph back to repair before finishing.
- **Base** — `createBuilderAgent(deps)` builds a `BaseAgent` subclass over the shared per-turn deps
  (`BuilderAgentDeps = BaseAgentDeps`); grant `canModifyCanvas` + `canEditConfig`, gated at the executor against
  the user's flow-role too (a viewer is denied).
- **Registration** — `type: 'builder'` in [registrations.ts](../../../libs/agent/src/agents/registrations.ts); discovered via `list_agents`,
  so the orchestrator routes to it with **no persona edit** (the card summary is the routing signal).

## What it is

The broadest specialist: it changes the flow as a _whole_ rather than one node or one operation. Given a plan it
reads the canvas + catalog, composes the nodes, wires them, configures them, names them, lays them out, then
validates and repairs — all in one sub-turn — returning a summary to the orchestrator (its edits are already on
the live canvas). Domain specifics (the linear-pipeline shape, the generator's model↔provider map, the well-formedness
checklist) live in **playbooks** it loads on demand, not in the persona — so the persona stays lean while the
Builder can build many kinds of flow.

## Tools

The full editing surface, **listed as tool values and composed by `toolset`** (`tools/toolset.ts`), plus
`use_skill`:

| Group      | Tools                                            |
| ---------- | ------------------------------------------------ |
| Read       | `list_nodes`, `describe_node`                    |
| Graph read | `get_graph` (pull the whole canvas on demand)    |
| Catalog    | `catalog_search`                                 |
| Structure  | `add_node`, `delete_node`                        |
| Config     | `set_properties`                                 |
| Label      | `rename`                                         |
| Edge       | `list_edges`, `connect_nodes`, `disconnect_edge` |
| Layout     | `move_node`                                      |

One `toolset({ binding, catalog }, [ …all of the above… ])` call yields the Builder's tool provider (each tool
selected by identity, no strings); `use_skill` (over `SEED_SKILLS`) is wired alongside it.

Grant `canModifyCanvas` + `canEditConfig`. As a long-lived agent the Builder uses **lifetime-matched context**:
it seeds the starting canvas — its nodes (`renderNodeContext`) **and their wiring** (`renderEdgeContext`) —
**once** into its first user message (`initialUserPreamble`), then pulls fresh state on demand via `get_graph`,
so its growing transcript stays a cacheable prefix
([design/context-strategy-and-composition.md](../design/context-strategy-and-composition.md)). Seeding the edges
is what makes an already-occupied input visible, so the Builder frees it before reusing it rather than
discovering the conflict through a rejected connect (occupancy is a fact of the edge set, never of a node). The
catalog is pulled on demand (`catalog_search` — a hit carries the type's full schema), and a playbook's body only
when the Builder loads it. Progressive disclosure needs no extra wiring — the `use_skill` index rides its tool
description ([design/skills.md](../design/skills.md)).

## Definition of done — verified behavior

- **Builds a flow** — from a plan on an empty canvas, `add_node` (config inline where set) + `connect_nodes`
  produce the right block types wired in dependency order; the post-turn graph matches the expected **shape**.
- **Configures as it builds** — a generator added with its `model` carries that model (add + configure in one).
- **Validate-and-repair** — given a flow with a dangling required input, it wires the input rather than leaving
  it unconnected.
- **Reject + report** — an invalid value / unknown field / rejected connection is reported, never substituted or
  forced (the specialist-reject contract, shared with the block agent).
- **Carries the full toolset + `use_skill`** — the offered tools include the read/graph-read/config/rename/
  structure/edge/move/catalog set and `use_skill`; loading `build-linear-pipeline` brings its instructions into context.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/builder.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/builder.spec.ts) — drives `createBuilderAgent`
  directly over the shared `harness/fixtures`: build-a-pipeline / reject+report / tool surface / persona /
  skill load.
- **Live (real Gemini, `RUN_LIVE`-gated):**
  [`scenarios/builder.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/builder.live.spec.ts) — the model builds a
  pipeline (graph shape checked, skill selection observed) and repairs a dangling generator input.
- **Integration (orchestrator → builder):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts) (A7) — the orchestrator
  plans a build and delegates the whole thing to one `builder` spawn.
