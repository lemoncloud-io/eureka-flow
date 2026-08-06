# Generator agent (`single-output-generator` specialist)

> **The AI text generator block specialist.** A [block agent](./blockAgent.md) for `single-output-generator`
> with the AI block's real knowledge baked into its persona. It configures generator nodes — **sets the model
> and sampling fields of an existing generator** (add/delete/rename are the builder's). It is **spawned by the
> orchestrator** with `agentType: 'single-output-generator'`, which resolves to this named specialist instead of
> a generic block agent. Behavior and oracles are canonical in the harness docs + scenario specs below.

## Canonical specs

- **Persona** — `SINGLE_OUTPUT_GENERATOR_SYSTEM_PROMPT` in
  [singleOutputGeneratorAgent.ts](../../../libs/agent/src/agents/singleOutputGeneratorAgent.ts): the same block-agent contract
  (config only — `set_properties`, not add/delete/rename — merge-only writes, reject + report, never invent)
  plus the generator's domain knowledge.
- **Base** — `createSingleOutputGeneratorAgent` is `createBlockAgent` fixed to `single-output-generator` with a
  persona/id/description override (same tools, grant, and type-scoped reads as the generic
  [block agent](./blockAgent.md)).
- **Behavior & oracles** — [harness-scenarios.md](../design/harness-scenarios.md).

## What it is

A `single-output-generator` block agent. Everything in [blockAgent.md](./blockAgent.md) holds; the specialist
adds the block's domain knowledge so the model configures it correctly:

- **`model` is a select** — set only a value the schema lists; never swap a requested model for a different one.
  The model implies the provider key needed at run time: a `gpt-*` model → an OpenAI key, every other
  (e.g. `gemini-*`) → a Gemini key.
- **`temperature` / `topK` / `topP`** tune sampling (higher temperature = more random).
- **`systemPrompt` vs `prompt`** — the standing instruction vs the per-run user prompt; kept distinct.
- **Map, then reject + report** — it first maps the user's wording onto the schema's real fields and values (a
  field the user calls "temperature" may be named `temp`). Only a truly unknown field, a wrong type, or a value
  outside a select (e.g. a model not in the enum) is refused and reported with the valid options — never
  substituted, and it never swaps the requested model for a different one.

## Tools

Identical to the [block agent](./blockAgent.md#tools): `search_nodes` (scoped to `single-output-generator`) +
`describe_node` + `set_properties` (configure only — no add/delete/rename, which the builder owns). Grant
`canEditConfig`, gated at the executor against the user's flow-role too.

## Definition of done — verified behavior

- **Configure (merge)** — `set_properties({ model })` on a pre-configured generator keeps its `temperature`.
- **Reject invalid model** — a model not in the enum is refused and reported; config unchanged (no substitute).
- **Type-scoped reads** — `search_nodes` returns only generator nodes.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/singleOutputGenerator.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/singleOutputGenerator.spec.ts) —
  merge / reject-bad-model / type-scoped reads.
- **Integration (orchestrator coordinating agents):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts)
  (+ `.live`) — set model (A2), invalid model → refused (Q2), unknown field → refused (Q4).
