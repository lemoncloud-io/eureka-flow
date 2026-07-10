# Concerns

> ⚠️ **Superseded on specifics — supporting material.** Predates the authoritative redesign; where they disagree, **[workflow-logic.md](workflow-logic.md)** (behavior) and **[component-interfaces.md](component-interfaces.md)** (shapes) win. Kept for context, not as an implementation source.

> Part of the [Agent Chat spec](README.md) · Prev: [Testing strategies](06-testing.md) · Next: [Open questions →](08-open-questions.md)

- **Naming collision.** `agent-codex` is an existing **block**; this feature is a **meta-agent** that
  builds/operates flows. Pick a distinct user-facing name (e.g. "Flow Assistant") to avoid confusion,
  and keep the code namespace `@flows/agent` clearly scoped to the meta-agent.
- **Key in browser — `localStorage` (Stage 1).** The direct gateway stores a BYO provider key in
  `localStorage` (matching how the existing flow API key is stored, `web-core`'s
  `apiKey.ts`/`EnhancedStorage`). This is a deliberate, accepted **dev/self-host / early-ship** trade;
  Stage 2 (proxy gateway) removes it, and the `LlmGateway` seam makes that migration a drop-in (NFR-7).
  The concrete risks of `localStorage` specifically:
    - **At rest, persistent.** The key survives refreshes, tab closes, and browser restarts, and is
      shared across all tabs of the origin — a wide time window in which it can be read.
    - **XSS = full key theft.** Any cross-site-scripting hole (or malicious browser extension) can read
      `localStorage` and exfiltrate the key. This is **amplified** here because the agent renders
      untrusted content — LLM output, node config, and other users' flow text — an active injection
      surface. A successful prompt-injection that reaches an XSS sink hands over the key.
    - **Visible in devtools / not origin-isolated beyond same-origin.** Anyone with the machine can read
      it via DevTools → Application → Local Storage.
    - **Broad, expensive credential.** Unlike the scoped, revocable flow API key, a raw provider key can
      run up real charges until manually rotated, with no per-session scoping.
    - **No automatic expiry.** It stays until explicitly cleared.

    Required mitigations for Stage 1: use a **spend-capped, model-restricted** provider key (bounds blast
    radius); **clear the key on sign-out** and expose a "remove key" control; **never log it** (no
    console/telemetry/trace); apply a strict **CSP** to reduce the XSS surface; and show the user an
    explicit "your key is stored in this browser" disclosure. Treat this as **not production-grade** —
    document it as such and gate the wider (multi-tenant/hosted) rollout on Stage 2.

- **Cost & abuse.** Every turn is one or more LLM calls; a chatty agent burns tokens/credits fast.
  Needs a per-turn iteration cap (EC-8), a snapshot-size budget (NFR-4), and clear cost surfacing.
  Note the split: _execution_ is metered on the Credit ledger (reused); _reasoning_ is billed by the
  gateway's provider in Stage 1 (FR-18) and is **not** on the ledger until Stage 2.
- **Mutation safety.** Mid-turn, agent edits touch only the **headless Draft** and never persist. At
  **promote** they are committed through the **same human persistence primitives** the UI uses
  (`createNodeAsync`/`upsertNode`/`upsertFlow`), and promote first **flushes the owner's pending
  autosave** so the mandatory reload can't revert un-hashed owner edits (e.g. a position drag). Verify
  promoted edits respect the Editor **session overlay** / permission model (never mutate the base flow)
  exactly as human saves do (ADR-0002).
- **Concurrency scope.** v1 handles only **owner + own agent** simultaneity (EC-5). The draft forks
  **once**, so live edits during the turn never corrupt it; drift is guarded at promote by a **semantic
  content-hash** check (not `seq`) at the plan gate and re-checked immediately before the replay, with
  abort-on-rejection as the second net. A transient owner-lock for the multi-second replay is
  **deferred** under the single-editor assumption (see
  [Drift](workflow-logic.md#concurrency--drift-owner--agent)). **Multi-user / co-Editor** simultaneous
  editing on one flow is **out of scope for v1** — no locking or CRDT is specified.
- **Prompt injection via flow content.** Node labels/config/output text become model context. Treat
  it as untrusted: the model must never be able to expand its tool set beyond the fixed catalog. In
  Stage 1 this is sharper because a successful injection could target the in-browser key — another
  reason to cap/scope it and to prioritize Stage 2.
- **Model choice vs current providers.** The app's AI blocks use OpenAI/Gemini, so those are the first
  provider drivers. But reliable multi-tool orchestration is best served by a top-tier tool-calling
  model (recommend latest Claude) — which may mean adding a driver for a provider the app doesn't use
  today. Each driver must faithfully map the canonical tool-calling format to its provider's native one.
- **Determinism / reproducibility.** Generated flows vary run-to-run. The plan gate (FR-16), the eval
  harness, and `SimulationGateway` (for tests) mitigate; users should not expect byte-identical output.
- **Scope of v1 vs Phase 2.** Autonomous/server-orchestrated runs, multi-flow operations, and
  agent-authored blocks are explicitly deferred (see Non-goals) to keep v1 shippable.

---

Prev: [Testing strategies](06-testing.md) · Next: [Open questions →](08-open-questions.md)
