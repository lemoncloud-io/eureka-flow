# Open questions

> ⚠️ **Superseded on specifics — supporting material.** Predates the authoritative redesign; where they disagree, **[workflow-logic.md](workflow-logic.md)** (behavior) and **[component-interfaces.md](component-interfaces.md)** (shapes) win. Kept for context, not as an implementation source.

> Part of the [Agent Chat spec](README.md) · Prev: [Concerns](07-concerns.md)

1. **Stage 1 provider drivers:** which providers/models does `BrowserLlmGateway` ship with (OpenAI +
   Gemini to match the app; a Claude-class driver for best tool use?), and what key-scoping controls
   (spend cap, model allow-list) does each provider offer for the in-browser BYO key?
2. **Stage 2 trigger:** when do we build the proxy gateway, and should it live in `eureka-flows-api`
   (reusing the run/credit infra) so reasoning can move onto the Credit ledger? Can `agent-codex`'s
   server runtime be reused for it?
3. Panel placement & interaction: dockable side panel vs. floating — and mobile-editor support in v1
   or desktop-only?
4. Session retention policy: how many turns / how long to keep per-flow history in localStorage.
5. ~~Drift detection: is `FlowModel.seq` reliably bumped on every persisted change, or do we need a
   snapshot hash?~~ → **Resolved:** drift is a **content hash of the semantic projection**, not `seq`
   (`seq` is a WebSocket event-ordering number, not a save version). See
   [Drift](workflow-logic.md#concurrency--drift-owner--agent).

---

Prev: [Concerns](07-concerns.md) · Back to [index](README.md)
