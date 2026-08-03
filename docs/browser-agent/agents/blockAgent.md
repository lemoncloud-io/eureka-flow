# Block agent (generic, per block type)

> **The block lifecycle specialist.** One agent per block type owns that block end-to-end — **add · configure ·
> rename · delete** a node of its type — applied straight to the live canvas. It is **addressed by block type**:
> the orchestrator spawns with `agentType` = the block's type (e.g. `buffer`, `output-preview`); if no named
> specialist is registered for that type, the sub-agent runner synthesizes a generic `BlockAgent(type)` from the
> catalog. It is **spawned by the orchestrator**, never talked to directly: the orchestrator resolves the target
> and the concrete values, and the block agent executes and validates. It builds on the
> [shared agent architecture](../design/architecture.md); behavior and oracles are canonical in the harness docs
>
> - scenario specs below.

## Canonical specs

- **Persona** — `blockAgentSystemPrompt(type, label)` in
  [blockAgent.ts](../../../libs/agent/src/agents/blockAgent.ts): single-block scope (handles ONLY its own
  type), full lifecycle (add / set_properties / rename / delete), merge-only config writes, and — the
  load-bearing rule — **never substitute a rejected value**; it reports the valid options and lets the
  orchestrator decide. It cannot move or connect nodes (those are the [locator](./locator.md) / [edge](./edge.md)
  operation agents).
- **Addressing & the generic fallback** — [harness-spec.md §6](../design/harness-spec.md): `roster.get(type)`
  (a named specialist wins) `??` a generic `BlockAgent(type)` when `catalog.has(type)`.
- **Behavior & oracles** — [harness-scenarios.md](../design/harness-scenarios.md): the oracle discipline and
  the scenario specs it points to.

## What it is

A per-block lifecycle specialist, parameterized by `blockType`. It changes everything that is _about one node of
its type_ — creating it, configuring it, renaming it, deleting it — and nothing else. Its reads are
**type-scoped**: `search_nodes` returns only nodes of its own type, and its per-turn context seeds only those +
the block's config schema, so it never reasons over the whole canvas.

- **`add_node` creates the node, optionally configured.** It places one node of its type at a given `position`
  with the block's `defaultConfig`, and takes an optional `config` to set non-default values in the **same
  call** — so a configured new node is one tool call (not add-then-set), and still one block-agent sub-turn.
- **`set_properties` merges.** It sends only the keys it changes; every other config key is preserved.
- **It maps the user's wording to the schema, then reports only a genuine reject.** Using the seeded schema it
  resolves the user's terms onto the block's real fields and allowed values (a field the user calls
  "temperature" may be named `temp` — set the one that matches; that mapping is the agent's job). Only a truly
  unknown field, or a value not in a select's enum / wrong type, is a reject — surfaced with the valid options,
  never substituted with a value of its own. The orchestrator decides the fix (keeps "ask, don't guess" there).
- **`rename`** sets `customLabel` (`''` clears it); **`delete_node`** removes the node (its edges cascade).
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

| Tool             | Kind   | Notes                                                                                      |
| ---------------- | ------ | ------------------------------------------------------------------------------------------ |
| `search_nodes`   | read   | search over this agent's block type (`query` matches id / label / type)                    |
| `describe_node`  | read   | one node's schema + current config + a select's allowed options — read before writing      |
| `add_node`       | mutate | create one node of its type; optional initial `config` in the same call; `canModifyCanvas` |
| `set_properties` | mutate | partial `config` **merged** over existing; catalog-validated; requires `canEditConfig`     |
| `rename`         | mutate | set/clear `customLabel`; requires `canEditConfig`                                          |
| `delete_node`    | mutate | remove the node; its edges cascade; requires `canModifyCanvas`                             |

Reads come from the type-scoped search provider (`createNodeSearchToolProvider(binding, catalog, { type })`,
`tools/nodeTools.ts`); the writes from the structure provider (`createNodeStructureToolProvider`, add/delete)
and the config provider (`createNodeConfigToolProvider`, catalog-validated). Its grant is `canModifyCanvas` +
`canEditConfig` — each write gated at the executor against **both** the agent's grant and the user's flow-role
(a viewer is denied — integration scenario **R2**).

## Definition of done — verified behavior

The generic block agent's contract, each a scenario in code (not restated here), driving the agent directly over
the shared `harness/fixtures`:

- **Add** — `add_node` creates a node of its type at the given position with default config; given `config`,
  those values are set in the same call.
- **Configure (merge)** — `set_properties` sets a key and keeps the others; no stray keys.
- **Reject unknown key** — a config key the block does not define (and that maps to no real field) is refused;
  nothing invented; config unchanged; the rejection is reported.
- **Rename / delete** — `rename` sets/clears the label; `delete_node` removes the node and its edges cascade.
- **Type-scoped reads** — `search_nodes` and the seeded context return ONLY the agent's block type; other types
  are invisible.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/blockAgent.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/blockAgent.spec.ts) —
  fake-gateway scripts driving a `BlockAgent(type)` directly: add / configure / reject / rename / delete / the
  type-scoping proof.
- **Integration (orchestrator coordinating agents):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts)
  (+ `.live`) — a generic block agent addressed by type (A3 rename via `output-preview`, A5 delete via `buffer`,
  R2 viewer-denied rename) lives there.

> The named `single-output-generator` block specialist has its own spec: **[generator.md](./generator.md)**.
> The retired operation-split agents it replaces are **[node.md](./node.md)** (add/delete) and
> **[property.md](./property.md)** (config/rename), kept for reference until a later cleanup.
