# Agents

The specialist roster the orchestrator discovers at runtime (via `list_agents`) and delegates to. The
orchestrator itself is not a specialist — it coordinates these. Each specialist has one SPEC (its persona,
tools, and definition of done) and its own scenario suite.

## Roster & coverage

| Agent        | Capability                   | Grant             | SPEC                         | Deterministic                                                                                        | Live                                                                                                 |
| ------------ | ---------------------------- | ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **locator**  | moves one existing node      | `canModifyCanvas` | [locator.md](./locator.md)   | [`scenarios/locator.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/locator.spec.ts)   | [`locator.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/locator.live.spec.ts)   |
| **property** | sets config values + renames | `canEditConfig`   | [property.md](./property.md) | [`scenarios/property.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/property.spec.ts) | [`property.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/property.live.spec.ts) |

Integration — the orchestrator coordinating multiple agents — is verified once, across the whole roster:

| Suite           | Covers                                                                                       | Deterministic                                                                                              | Live                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **integration** | orchestrator resolves → delegates → aggregates (the applied/partial/refused/answered matrix) | [`scenarios/integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts) | [`integration.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.live.spec.ts) |

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

## How verification works

The oracle discipline (exact vs relational; well-formedness ≠ correctness) and the deterministic-vs-live split
are described once in [design/harness-scenarios.md](../design/harness-scenarios.md); behavior & the turn loop
in [design/harness-spec.md](../design/harness-spec.md).
