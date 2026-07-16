# Browser Agent — docs

In-browser flow agents for the Eureka Flow editor: chat agents that read your flow and edit it for
you. The DOM-free core is `@flows/agent` (`libs/agent`); the editor wiring lives in
`apps/web/src/app/features/flows/` (panel, hooks, desktop binding, command gateway).

## Architecture at a glance

You talk to the **Panel**; one **Agent** owns the turn and is the only writer. It runs a think/act
loop — ask the **LlmGateway**, run tool calls through the one **ToolExecutor** (which checks
permissions), repeat until the model is done — and reaches the live canvas through a single seam, the
**CanvasBinding**. The persisted **SessionState** is what the Panel renders from.

```
Panel → Agent → LlmGateway (think)
              → ToolExecutor → tools → CanvasBinding → live canvas (act)
              → SessionState → Panel (render)
```

- **One agent per turn today.** A router to pick among several agents is deferred until a second agent exists.
- **Two apply models.** The locator agent applies changes **live** through the binding; the fuller
  flow-edit agent (design) edits a hidden **draft** and swaps it in only on your approval.
- **Shared foundations.** Every agent runs on `BaseAgent` (the turn loop), the `LlmGateway` contract,
  and the Agent Environment (storage / trace / time / cancellation).

## What's here

**[design/](design/)** — the overall agent-chat design (the architecture above, in full).

- [SPEC.md](design/SPEC.md) — the formal spec · [overview.md](design/overview.md) — friendly tour with
  diagrams · [canvas-binding.md](design/canvas-binding.md) — the canvas seam, desktop impl.

**[foundations/](foundations/)** — shared infrastructure, both built.

- [environment.md](foundations/environment.md) — the runtime capability boundary (storage / trace / time /
  cancellation) · [llm-gateway.md](foundations/llm-gateway.md) — the `LlmGateway` contract + Gemini provider.

**[agents/](agents/)** — the concrete agents.

- [locator/](agents/locator/) — **first shipped agent**, moves a node by chat:
  [SPEC.md](agents/locator/SPEC.md) · [IMPLEMENTATION.md](agents/locator/IMPLEMENTATION.md).

## Reading order

New here? Read this page, then **[agents/locator/](agents/locator/)** (the concrete shipped slice:
[SPEC](agents/locator/SPEC.md) → [IMPLEMENTATION](agents/locator/IMPLEMENTATION.md)), then
**[design/](design/)** for the fuller design it fits into, then the two **[foundations/](foundations/)**.
Package overview: [`libs/agent/README.md`](../../libs/agent/README.md).
