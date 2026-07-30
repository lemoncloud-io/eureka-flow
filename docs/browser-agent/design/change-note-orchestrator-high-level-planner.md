# Change note — orchestrator: high-level planner, specialist validates

> The **transition** from "the orchestrator pre-validates the block schema (checks a field exists / a value is
> allowed via `describe_block`) before delegating" to "the orchestrator delegates the user's **intent** and the
> **specialist** validates the schema and reports rejections." Same transition also **narrows the tested
> outcome matrix**: `partial` is no longer a test target (neither deterministic nor live). The clean end-state
> lives in the design docs ([harness-spec.md](./harness-spec.md) §8, [harness-scenarios.md](./harness-scenarios.md)).
> This page is the a→b how-to; delete it once the change has landed. Written 2026-07-30.

## Why

Two coupled goals from the user:

1. **Reduce the orchestrator's workload.** It should PLAN at a high level and delegate the user's intent, not
   descend into each block's schema. Telling the property agent "set temperature to 0.1 on `<id>`" should NOT
   require the orchestrator to first confirm the block has a `temperature` field, or that it isn't named `temp`,
   or that `0.1` is in range. The **specialist** already reads the schema (`describe_node`) and rejects/reports
   a bad value/type/unknown key — so the check belongs there, not duplicated one layer up. The orchestrator
   resolves only what the planner alone can and what a specialist cannot see from its own briefing: the
   **target** id, a vague **amount**, and **shared values** several specialists must agree on.
2. **Stop pinning `partial`.** On a mixed-validity ask (some parts valid, one bad) there is no single right
   outcome — the agent may reasonably refuse the whole request or apply the good parts and report the bad one.
   Pinning `partial` in an oracle asserts a judgement call the agent legitimately owns. So `partial` stays a
   production outcome (spec §2.6) but is no longer a scenario oracle, and the live outcome set is exactly
   `applied | refused | answered`.

The orchestrator keeps its read tools (`describe_node`, `catalog_search`, `describe_block`) — a planner needs
to see the flow to plan (understand it, settle a shared value). The change is **responsibility (the persona),
not capability (the tool surface)**: reading no longer _gates_ delegation on a field-level check.

## The delta (a → b)

1. **Persona** — [`orchestratorAgent.ts`](../../../libs/agent/src/agents/orchestratorAgent.ts)
   `ORCHESTRATOR_SYSTEM_PROMPT`:
    - Reframe from "resolve into concrete tasks" to "high-level PLANNER."
    - **Drop the `Value` bullet** ("check the block with `describe_block`; if the field/value is invalid,
      surface what the block accepts"). Replace with an explicit "**PLAN, do not micro-manage**" instruction:
      the specialist validates its own schema; do not check whether a field exists, how it is named, or whether
      a value is allowed — hand over the intent and let the specialist apply or reject+report.
    - **Drop the `Complete` bullet** ("pass concrete values; specialists do not fill in blanks") — superseded;
      specialists now own the schema-level detail.
    - Keep **Target**, **Amount**, and add **Shared values** (the column to align to; a just-added node's id
      threaded into later connect/configure tasks).
    - Keep "may read to PLAN, but reading is not doing the work"; keep act-before-report, no-permission-ask,
      one-bad-part-never-blocks-the-others, stop-when-done.

2. **Docs** —
    - [`harness-spec.md`](./harness-spec.md) §8: new bullet stating the planner-vs-validation split (target /
      amount / shared values resolved by the planner; schema validation owned by the specialist; a single-task
      bad-value ask is a specialist rejection that bubbles up to `refused`).
    - [`harness-scenarios.md`](./harness-scenarios.md): Coverage lists the **tested** outcomes as
      `applied | refused | answered`; `partial` documented as production-only, not a test target; deterministic
      `refused` cases are fully refused (no mix).

3. **Tests** —
    - [`integration.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.spec.ts): remove
      the three partial cases **P1, P2, P3**. Rescript **Q2** (invalid model) and **Q4** (unknown field) so the
      orchestrator delegates high-level to the `property` agent, the property agent does `describe_node` +
      attempts `set_properties` (rejected by the tool) + reports, and the orchestrator reports `refused`
      (`expectUnchanged` still holds — nothing lands). Q1/Q3 (target ambiguity / no such node) stay
      orchestrator-level refusals — target resolution is the planner's job.
    - [`integration.live.spec.ts`](../../../libs/agent/src/__tests__/harness/scenarios/integration.live.spec.ts):
      remove the **P2** partial case. Q2/Q4 stay `refused` — now on the strength of the specialist's rejection
      bubbling up rather than an orchestrator pre-check.

## Not changed

- The **tool surface** — the orchestrator keeps `list_nodes` / `describe_node` / `catalog_search` /
  `describe_block` / `list_agents` / `spawn`. No write tools (unchanged).
- The **specialist personas** — property/locator/node/edge already validate and report rejections rather than
  inventing values; they gain no new instruction.
- `partial` in the `TurnOutcome` type and `parseOutcome` — still a valid production outcome; only its use as a
  scenario oracle is removed.
- The per-agent deterministic + live suites (`locator.*`, `property.*`, `node.*`, `edge.*`) — untouched.
