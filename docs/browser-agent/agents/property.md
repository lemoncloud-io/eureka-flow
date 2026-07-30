# Property agent

> **⚠️ RETIRED (unregistered).** Superseded by the [block agent](./blockAgent.md), which owns a block's whole
> lifecycle (add · configure · rename · delete). The `property` agent is no longer in `DEFAULT_REGISTRATIONS`, so
> the orchestrator cannot spawn it; its module + `property.*` scenario suites stay in the tree (driven directly)
> until a later cleanup. This page is kept for reference. **`set_properties` / `rename` now belong to the block
> agent**, and its reject-and-report contract is inherited verbatim.

> **The config + rename specialist.** The property agent **sets config values on existing nodes and renames
> them** — `set_properties({ nodeId, config })` (only the changed keys, merged over the current config) or
> `rename({ nodeId, label })` (`''` clears the label) — applied straight to the live canvas. It is **spawned
> by the orchestrator**, never talked to directly: the orchestrator resolves the target node and the concrete
> values, and the property agent executes. It builds on the
> [shared agent architecture](../design/architecture.md); this page is its shipped-status summary —
> behavior and oracles are canonical in the harness docs + scenario specs below.

## Canonical specs

- **Persona** — `PROPERTY_SYSTEM_PROMPT` in
  [propertyAgent.ts](../../../libs/agent/src/agents/propertyAgent.ts): config/rename-only scope,
  merge-only writes, read-before-write (`describe_node`), and — the load-bearing rule — **never substitute a
  rejected value**; it reports the valid options and lets the orchestrator decide.
- **Behavior & oracles** — [harness-scenarios.md](../design/harness-scenarios.md): how we verify (the
  oracle discipline) and the scenario specs it points to.
- **Tools & the turn loop** — [architecture.md](../design/architecture.md) and
  [harness-spec.md](../design/harness-spec.md) (the shared think/act loop, `ToolExecutor`, permissions).

## What it is

A config/rename specialist: it changes a node's `config` (merged) and its `customLabel`, and nothing else —
it never moves, creates, deletes, or connects. It reads the block's schema + current config with
`describe_node` before writing, so it only sets real fields to allowed values.

- **`set_properties` merges.** It sends only the keys it is changing; every other config key is preserved
  (setting `model` keeps a pre-existing `temperature`). It never re-sends the whole config.
- **A rejected write is reported, not worked around.** If a write is rejected — a value not in a select's
  enum, a wrong type (a non-number for a number field), or an unknown config key — the agent surfaces the
  rejection and the valid options in its summary and does **not** substitute a value of its own. The
  orchestrator decides the fix; the specialist never guesses. (This keeps the "ask, don't guess" judgement in
  the orchestrator and makes a bad `topK` alongside a good `model` a clean reported failure.)
- **`rename`** sets `customLabel`; an empty string clears a custom label.
- **Execute-only.** It cannot ask the user and cannot see the conversation; its briefing is complete. It does
  what it can and reports the rest in a short summary — the only thing the orchestrator sees.

```ts
// set_properties merges a partial config; rename sets/clears the label.
interface SetPropertiesArgs {
    nodeId: string;
    config: Record<string, string>; // ONLY the keys to change — merged over the existing config
}
interface RenameArgs {
    nodeId: string;
    label: string; // '' clears the custom label
}
```

## Tools

| Tool             | Kind   | Notes                                                                                  |
| ---------------- | ------ | -------------------------------------------------------------------------------------- |
| `list_nodes`     | read   | `binding.readGraph()` → the node list, seeded into context each turn                   |
| `describe_node`  | read   | one node's schema + current config + a select's allowed options — read before writing  |
| `set_properties` | mutate | partial `config` **merged** over existing; catalog-validated; requires `canEditConfig` |
| `rename`         | mutate | set/clear `customLabel`; requires `canEditConfig`                                      |

Read tools come from the `tools/nodeTools.ts` read provider (`list_nodes` + `describe_node`); the writes from
its config provider (`createNodeConfigToolProvider`, catalog-validated). Both writes require `canEditConfig`,
gated at the executor against **both** the agent's grant and the user's flow-role — a viewer is denied
(integration scenario **R2**).

## Definition of done — verified behavior

The property agent's contract. Each line is a scenario in code, not restated here (the code is the source of
truth). Agent-level today, driving the agent directly over the shared `harness/fixtures`:

- **Merge** — `set_properties({ model })` on a node with `{ model, temperature }` keeps `temperature`; no
  stray keys.
- **Reject invalid value** — a value not in a select's enum is refused; the summary carries the valid
  options; config unchanged (no substitute).
- **Reject wrong type** — a non-number for a number field (`topK: "abc"`) is refused and reported; not
  applied. _(Verified once at the config tool + integration **P2** — not duplicated at the agent unit.)_
- **Reject unknown key** — a config key the block does not define is refused; nothing is invented or mapped
  onto a real field.
- **Rename / clear** — `rename(id, "Result")` sets the label; `rename(id, "")` clears it.
- **Permission gate** — without `canEditConfig` the write is denied and nothing changes. _(Verified once at
  the executor + integration **R2** — not duplicated at the agent unit.)_
- **Context** — the current node list is seeded into context each turn.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/property.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/property.spec.ts) —
  fake-gateway scripts driving the property agent directly: merge / reject-invalid / rename / context.
  Wrong-type rejection, unknown-key, and node-not-found are verified at the config tool
  ([`__tests__/tools/nodeTools.spec.ts`](../../../libs/agent/src/__tests__/tools/nodeTools.spec.ts)); the
  permission gate at the executor and integration **P2** / **R2** — verified once, not duplicated here.
- **Live (key-gated, real LLM):**
  [`scenarios/property.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/property.live.spec.ts)
  — hands the property agent a real gateway and checks the same oracles when the model chooses the calls.
- **Integration (orchestrator coordinating agents):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts)
  (+ `.live`) — the property agent's cross-agent cases (a partial turn with a good model + bad `topK`, an
  invalid value the orchestrator surfaces, a viewer denied) live there, not here.
