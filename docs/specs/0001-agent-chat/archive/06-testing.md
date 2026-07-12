# Testing strategies

> ⚠️ **Superseded on specifics — supporting material.** Predates the authoritative redesign; where they disagree, **[workflow-logic.md](workflow-logic.md)** (behavior) and **[component-interfaces.md](component-interfaces.md)** (shapes) win. Kept for context, not as an implementation source.

> Part of the [Agent Chat spec](README.md) · Prev: [Data flow & lifecycle](05-data-flow.md) · Next: [Concerns →](07-concerns.md)

- **Unit (Vitest, existing runner):**
    - Tool executor: each tool routes to the correct kind-scoped surface (mutate → Draft; structural
      read → draft-if-forked-else-live; runtime read → live; run → RunTracker); permission gate rejects
      when the flag is false; arg-schema validation rejects malformed args (NFR-7); the affected-target
      precondition blocks a run whose target the un-promoted draft changed (returns `not_persisted` and
      records a `pendingRunIntent`).
    - Snapshot / Prompt Builder: large port payloads summarized/omitted; shape matches `FlowSnapshot`;
      the structural snapshot is included only on the first iteration.
    - Connection validation: rejects incompatible `DataType` links and dangling refs (NFR-2, EC-3).
    - Orchestrator: iteration cap enforced across in-turn re-entry (EC-8); drift (semantic content-hash)
      detected at the plan gate and re-checked before replay → notify + replan, never promote (EC-5);
      the run gate asks once per turn (first dispatchable run) and is preserved across a mid-turn re-arm.
- **Draft / plan / promote (Environment):**
    - Draft isolation: mutations on the headless Draft never persist and never touch the live canvas; the
      draft forks lazily on the first mutate and is discarded at turn end.
    - The diff **is** the op set: the Draft-vs-baseline diff lowers deterministically to the ordered
      `operations[]` — presented ≡ applied, no reconcile.
    - Promote replays **one op at a time**, teardown → build-up, resolving each `tempId → serverId`
      before an edge references it; uses the **awaited** primitives so the post-commit reload does not
      revert edits; any write rejection aborts (no partial-commit continue).
    - Version toggle: switching pre ⇄ post re-adds tombstoned nodes by their **original id**, so ids,
      edges, and run history stay valid (FR-17).
    - `pendingRunIntent` survives a reload at the plan gate (persisted with the Plan).
- **Store/integration:** drive `useAgentStore` + a headless Draft together — a simulated tool-call
  stream builds a valid diff that promotes to a loadable, runnable **live** graph; the version toggle
  reverts promoted changes id-preservingly (FR-17).
- **Gateway/simulation tests:** drive the loop with `SimulationGateway` (NFR-10) for deterministic,
  token-free runs; assert the request the orchestrator builds (messages/tools/snapshot) and that
  tool results are fed back into the next call correctly. Verify all three adapters satisfy the
  `LlmGateway` contract identically (swap-safety for Stage 2).
- **Socket integration:** feed synthetic node/trace/port events through `useInitFlowSocket` and assert
  **RunTracker** resolves `run_node`/`run_flow` on terminal state — including a fast/cached run caught
  by the synchronous `nodeRuns` read, and the `run_flow` dispatch-set vs wait-set split — and times out
  at the 60 s `POLL_TIMEOUT`.
- **E2E (happy paths for US-1..US-7):** generate → run (US-1); edit/extend an existing flow (US-2);
  troubleshoot an injected ERROR node (US-3); run-and-report (US-4); multi-turn config refine (US-5);
  read-only Q&A as a **Viewer**, asserting no mutation tools fire (US-6); **build-and-run in one
  prompt** — a draft-blocked run records a `pendingRunIntent`, Accept promotes, and the turn
  auto-continues into the run gate (US-7). Assert post-promote on-canvas nodes/edges and reported
  outputs.
- **Permission matrix:** Owner/Editor/Viewer/Anonymous each get the correct tool subset (FR-15, EC-4).
- **Eval harness (agent quality):** a fixture set of NL prompts → expected block graphs, scored for
  validity (loads + runs) and intent match. Run in CI as a non-blocking quality gate; guards against
  model/prompt regressions.

---

Prev: [Data flow & lifecycle](05-data-flow.md) · Next: [Concerns →](07-concerns.md)
