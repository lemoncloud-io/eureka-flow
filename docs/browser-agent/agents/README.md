# Agents

The roster the orchestrator discovers at runtime (via `list_agents`) and delegates to. The orchestrator itself
is not a specialist — it coordinates these; its own model (loop, spawn, addressing) is in the
[harness docs](../design/harness-spec.md). Agents come in two kinds:

- **Block agents — one per block type**, configuring that block's nodes (set fields on an existing node — NOT
  add/delete/rename, which the builder owns). The orchestrator routes each node's **content** (config) to them,
  addressing one by putting the **block's type** in `spawn`'s `agentType`. A named specialist (registered) wins;
  otherwise the sub-agent runner synthesizes a **generic `BlockAgent(type)`** from the catalog — so any block
  type is covered without a new registration or prompt edit.
- **The composition builder** — one capable specialist the orchestrator hands the whole **structure** to (add ·
  wire · label · lay out); it carries the full editing toolset **plus `use_skill`** and builds the (sub-)flow
  itself, pulling a progressively-disclosed playbook for the how-to. Its spec: [builder.md](./builder.md).

**The roster realizes the shipped HYBRID design**
([architecture.md · the hybrid writer layer](../design/architecture.md#the-hybrid-writer-layer)): the
orchestrator hands the whole **structure** to the **builder** (which uses `use_skill`) and fans each node's
**content** out to the **block agents** in parallel — same orchestrator + foundation throughout. This design was
chosen by comparing two earlier candidates (pure fan-out vs one all-doing builder) head-to-head in the
[eval-benchmark](../design/eval-benchmark.md);
[context-strategy-and-composition.md](../design/context-strategy-and-composition.md) records the findings. The
rows below cover the shipped roster.

## Roster & coverage

| Agent                       | Kind            | Capability                                                                                             | Grant                               | SPEC                                                       | Deterministic                                                                                                                  | Live                                                                                               |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **block agent** (per type)  | block (generic) | configure a node of its type (add/delete/label are the builder's)                                      | `canEditConfig`                     | [blockAgent.md](./blockAgent.md)                           | [`scenarios/blockAgent.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/blockAgent.spec.ts)                       | —                                                                                                  |
| **single-output-generator** | block (named)   | AI text generator — configures a generator (model/provider knowledge)                                  | `canEditConfig`                     | [single-output-generator.md](./single-output-generator.md) | [`scenarios/singleOutputGenerator.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/singleOutputGenerator.spec.ts) | —                                                                                                  |
| **builder**                 | composition     | builds/extends a multi-block flow from a plan (add · wire · configure · label · lay out) + `use_skill` | `canModifyCanvas` + `canEditConfig` | [builder.md](./builder.md)                                 | [`scenarios/builder.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/builder.spec.ts)                             | [`builder.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/builder.live.spec.ts) |

Block-agent live coverage is exercised through the integration live suite (the model spawns block agents by
type); a dedicated `blockAgent.live`/`singleOutputGenerator.live` can be added when it earns its keep.

Integration — the orchestrator coordinating multiple agents — is verified once, across the whole roster:

| Suite           | Covers                                                                                                                               | Deterministic                                                                                              | Live                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **integration** | orchestrator resolves → delegates → aggregates (the applied/refused/answered matrix; `partial` is a production outcome but untested) | [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts) | [`integration.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.live.spec.ts) |

## Adding an agent — the coverage checklist

Every specialist has the **same shape**, so "what is tested for agent X" is always answerable from two files.
To add one:

1. **A SPEC** at `agents/<type>.md` with a **Definition of done — verified behavior** section — concise,
   pointing to code, never restating the tests.
2. **Two scenario files** at `libs/agent/src/__tests__/harness/scenarios/<type>.spec.ts` (deterministic,
   always runs) and `<type>.live.spec.ts` (real LLM, key-gated), driving the agent **directly** over the
   shared `fixtures.ts` — the agent's definition of done, without the orchestrator.
3. **A row in the roster table above.**

Its cross-agent behavior (how the orchestrator delegates to it alongside others) goes in the shared
`scenarios/integration.spec.ts`, not the per-agent files. A missing row, SPEC, or DoD section is a visible
gap. The runtime roster is [`registrations.ts`](../../../libs/agent/src/agents/registrations.ts) — keep this
table in step with it.

**A new BLOCK type usually needs NO new agent** — the generic [block agent](./blockAgent.md) covers it from the
catalog (only add a named specialist, like [single-output-generator.md](./single-output-generator.md), when a block earns block-specific
prompt knowledge). The checklist above is for a genuinely new agent — a named block specialist. (A new
**operation** is not its own agent: it is a tool value on the agent that should carry it — the builder for
graph shape, a block agent for config.)

## How verification works

The oracle discipline (exact vs relational; well-formedness ≠ correctness) and the deterministic-vs-live split
are described once in [design/harness-scenarios.md](../design/harness-scenarios.md); behavior & the turn loop
in [design/harness-spec.md](../design/harness-spec.md).
