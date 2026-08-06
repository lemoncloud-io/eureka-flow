# Block agent (generic, per block type)

> **The block content specialist.** One agent per block type configures that block's nodes — **sets the fields
> of an existing node** (NOT add/delete/rename, which are the builder's) — applied straight to the live canvas.
> It is **addressed by block type**: the orchestrator spawns with `agentType` = the block's type (e.g. `buffer`,
> `output-preview`); if no named specialist is registered for that type, the sub-agent runner synthesizes a
> generic `BlockAgent(type)` from the catalog. It is **spawned by the orchestrator**, never talked to directly:
> the orchestrator resolves the target and the concrete values, and the block agent executes and validates. It
> builds on the [shared agent architecture](../design/architecture.md); behavior and oracles are canonical in the
> harness docs + scenario specs below.

## Canonical specs

- **Persona** — `blockAgentSystemPrompt(type, label)` in
  [blockAgent.ts](../../../libs/agent/src/agents/blockAgent.ts): single-block scope (handles ONLY its own
  type), config only (`set_properties` on an existing node), merge-only writes, and — the
  load-bearing rule — **never substitute a rejected value**; it reports the valid options and lets the
  orchestrator decide. It cannot add, delete, rename, move, or connect nodes — that is the [builder](./builder.md)'s
  job (it shapes the flow; the block agent tunes the nodes it places).
- **Addressing & the generic fallback** — [harness-spec.md §6](../design/harness-spec.md): `roster.get(type)`
  (a named specialist wins) `??` a generic `BlockAgent(type)` when `catalog.has(type)`.
- **Behavior & oracles** — [harness-scenarios.md](../design/harness-scenarios.md): the oracle discipline and
  the scenario specs it points to.

## What it is

A per-block content specialist, parameterized by `blockType`. It changes only the _content of an existing node
of its type_ — configuring its fields — and nothing else (adding, deleting, and labelling nodes are the
builder's, done as it composes the flow). Its reads are **type-scoped**: `search_nodes` returns only nodes of its
own type, and its per-turn context seeds only those + the block's config schema, so it never reasons over the
whole canvas.

- **`set_properties` merges.** It sends only the keys it changes; every other config key is preserved.
- **It maps the user's wording to the schema, then reports only a genuine reject.** Using the seeded schema it
  resolves the user's terms onto the block's real fields and allowed values (a field the user calls
  "temperature" may be named `temp` — set the one that matches; that mapping is the agent's job). Only a truly
  unknown field, or a value not in a select's enum / wrong type, is a reject — surfaced with the valid options,
  never substituted with a value of its own. The orchestrator decides the fix (keeps "ask, don't guess" there).
- **No add / delete / rename.** Creating, removing, wiring, moving, and labelling a node all belong to the
  [builder](./builder.md), which shapes the flow the block agent then tunes.
- **Type-scoped.** `search_nodes` and the seeded context show only its block type; a `buffer` agent never sees
  the generator or preview nodes.
- **Execute-only.** It cannot ask the user or see the conversation; its briefing is complete. It does what it
  can and reports the rest in a short summary — the only thing the orchestrator sees.

```ts
// A block agent closes over the ONE block type it manages.
interface BlockAgentDeps extends BaseAgentDeps {
    blockType: string; // e.g. 'buffer', 'output-preview', 'single-output-generator'
}
```

## Tools

| Tool             | Kind   | Notes                                                                                  |
| ---------------- | ------ | -------------------------------------------------------------------------------------- |
| `search_nodes`   | read   | search over this agent's block type (`query` matches id / label / type)                |
| `describe_node`  | read   | one node's schema + current config + a select's allowed options — read before writing  |
| `set_properties` | mutate | partial `config` **merged** over existing; catalog-validated; requires `canEditConfig` |

All three tools are listed as values and composed by `toolset` (`tools/toolset.ts`):
`toolset({ binding, catalog, searchType: type }, [SEARCH_NODES, DESCRIBE_NODE, SET_PROPERTIES])` — `searchType`
structurally bounds `search_nodes` to its own type, and `set_properties` is catalog-validated. Its grant is
just `canEditConfig` — the write is gated at the executor against **both** the agent's grant and the user's
flow-role (a viewer is denied).

## Definition of done — verified behavior

The generic block agent's contract, each a scenario in code (not restated here), driving the agent directly over
the shared `harness/fixtures`:

- **Configure (merge)** — `set_properties` sets a key and keeps the others; no stray keys.
- **Reject unknown key** — a config key the block does not define (and that maps to no real field) is refused;
  nothing invented; config unchanged; the rejection is reported.
- **Configure-only surface** — the offered tools are `search_nodes` / `describe_node` / `set_properties`; it
  carries no `add_node` / `delete_node` / `rename`.
- **Type-scoped reads** — `search_nodes` and the seeded context return ONLY the agent's block type; other types
  are invisible.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/blockAgent.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/blockAgent.spec.ts) —
  fake-gateway scripts driving a `BlockAgent(type)` directly: configure / reject / configure-only tool surface /
  the type-scoping proof.
- **Integration (orchestrator coordinating agents):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts)
  (+ `.live`) — a generic block agent addressed by its type does **content** there (A3b — set the buffer's delay
  via `buffer`). Labeling and structure — rename (A3), viewer-denied rename (R2), delete-and-rewire (A5) — are
  the [builder](./builder.md)'s.

> The named `single-output-generator` block specialist has its own spec: **[single-output-generator.md](./single-output-generator.md)**.
