# Browser Agent — docs

In-browser flow agents for the Eureka Flow editor: chat agents that read your flow and edit it for you.
The DOM-free core is `@flows/agent` (`libs/agent`), including the `CanvasBinding` over the `FlowEngine`
that owns the graph; the editor wiring lives in `apps/web/src/app/features/flows/` (panel, hooks,
generate-API gateway).

## Architecture at a glance

You talk to the **Panel**, which drives the **orchestrator** — the main agent that owns the turn. The
orchestrator runs a think/act loop — ask the **LlmGateway**, run tool calls through the one
**ToolExecutor** (which checks permissions), repeat until the model is done — but carries no write tools
of its own: it delegates edits by spawning **specialist** sub-agents (locator = move, property =
config/rename) that reach the live canvas through a single shared seam, the **CanvasBinding**. The
persisted **SessionState** is what the Panel renders from.

```
Panel → Orchestrator → LlmGateway (think)
                     → spawn → Specialists (locator / property)
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

The **orchestrator** is the entry agent the Panel talks to; it delegates every edit to two specialists —
the **locator** (move) and the **property** (config/rename) — which it spawns over the shared
CanvasBinding. The orchestrator and property models are covered in the design docs (start with
[architecture.md](design/architecture.md)); the locator has its own SPEC:

- [locator.md](agents/locator.md) — the **locator specialist** (move): a thin shipped-status
  page; its behavior is specified canonically in the harness docs (`design/harness-*`).

**[foundations/](foundations/)** — shared infrastructure, both built.

- [environment.md](foundations/environment.md) — the runtime capability boundary (storage / trace / time /
  cancellation).
- [llm-gateway.md](foundations/llm-gateway.md) — the `LlmGateway` contract + Gemini provider + HTTP port.

## Reading order

New here? Read **[design/architecture.md](design/architecture.md)** (the shared model, including the
orchestrator that owns the turn), then the locator specialist it spawns,
**[agents/locator.md](agents/locator.md)**; for the shared infra, the two
**[foundations/](foundations/)** docs. Package overview: [`libs/agent/README.md`](../../libs/agent/README.md).
