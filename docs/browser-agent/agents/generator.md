# Generator agent (`single-output-generator` specialist)

> **The AI text generator block specialist.** A [block agent](./blockAgent.md) for `single-output-generator`
> with the AI block's real knowledge baked into its persona. It owns the generator's whole lifecycle — **add ·
> configure · rename · delete** — and, being a block agent, **adds and configures in one sub-turn**. It is
> **spawned by the orchestrator** with `agentType: 'single-output-generator'`, which resolves to this named
> specialist instead of a generic block agent. Behavior and oracles are canonical in the harness docs + scenario
> specs below.

## Canonical specs

- **Persona** — `GENERATOR_SYSTEM_PROMPT` in
  [generatorAgent.ts](../../../libs/agent/src/agents/generatorAgent.ts): the same block-agent contract
  (full lifecycle, merge-only writes, reject + report, never invent) plus the generator's domain knowledge.
- **Base** — `createGeneratorAgent` is `createBlockAgent` fixed to `single-output-generator` with a
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
- **Reject + report** — a model outside the enum (or any bad value/type/unknown key) is refused and reported
  with the valid options; it never substitutes its own value.
- **Add + configure in one turn** — "add a generator and set its model" is a single sub-turn (the block-ownership
  payoff), not a node+property compose.

## Tools

Identical to the [block agent](./blockAgent.md#tools): `search_nodes` (scoped to `single-output-generator`) +
`describe_node`; `add_node` / `set_properties` / `rename` / `delete_node`. Grant `canModifyCanvas` +
`canEditConfig`, gated at the executor against the user's flow-role too.

## Definition of done — verified behavior

- **Add + configure in one sub-turn** — `add_node` then `set_properties({ model })` on the new node, in one
  turn; the added generator carries the configured model.
- **Configure existing (merge)** — `set_properties({ model })` on a pre-configured generator keeps its
  `temperature`.
- **Reject invalid model** — a model not in the enum is refused and reported; config unchanged (no substitute).
- **Type-scoped reads** — `search_nodes` returns only generator nodes.

Where these live:

- **Deterministic (always runs):**
  [`scenarios/generator.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/generator.spec.ts) —
  add+configure-in-one-turn / merge / reject-bad-model / type-scoped reads.
- **Integration (orchestrator coordinating agents):**
  [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts)
  (+ `.live`) — set model (A2), add + configure + wire (A6, the collapse), invalid model → refused (Q2),
  unknown field → refused (Q4).
