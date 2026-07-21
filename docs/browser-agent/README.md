# Browser Agent — docs

In-browser flow agents for the Eureka Flow editor: chat agents that read your flow and edit it for you.
The DOM-free core is `@flows/agent` (`libs/agent`); the editor wiring lives in
`apps/web/src/app/features/flows/` (panel, hooks, desktop binding, command gateway).

## Architecture at a glance

You talk to the **Panel**; one **Agent** owns the turn and is the only writer. It runs a think/act loop
— ask the **LlmGateway**, run tool calls through the one **ToolExecutor** (which checks permissions),
repeat until the model is done — and reaches the live canvas through a single seam, the
**CanvasBinding**. The persisted **SessionState** is what the Panel renders from.

```
Panel → Agent → LlmGateway (think)
              → ToolExecutor → tools → CanvasBinding → live canvas (act)
              → SessionState → Panel (render)
```

The full model — components, the turn loop, interfaces, permissions — is in
[design/architecture.md](design/architecture.md).

## What's here

**[design/](design/)** — the shared architecture.

- [architecture.md](design/architecture.md) — the shared model every agent is built from (read this first).
- [canvas-binding.md](design/canvas-binding.md) — the desktop CanvasBinding implementation notes.

**[agents/](agents/)** — the concrete agents.

- [locator/SPEC.md](agents/locator/SPEC.md) — the **first shipped agent**: moves a node by chat, applied
  live. One doc covering behavior and what shipped.

**[foundations/](foundations/)** — shared infrastructure, both built.

- [environment.md](foundations/environment.md) — the runtime capability boundary (storage / trace / time /
  cancellation).
- [llm-gateway.md](foundations/llm-gateway.md) — the `LlmGateway` contract + Gemini provider + HTTP port.

## Reading order

New here? Read **[design/architecture.md](design/architecture.md)** (the shared model), then the shipped
slice **[agents/locator/SPEC.md](agents/locator/SPEC.md)**; for the shared infra, the two
**[foundations/](foundations/)** docs. Package overview: [`libs/agent/README.md`](../../libs/agent/README.md).
