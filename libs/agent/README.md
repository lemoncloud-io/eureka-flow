# @flows/agent

In-browser flow agents. The entry point is the **orchestrator agent**: it owns the turn,
reads the canvas, and delegates every edit to specialists — the **locator** (moves an
existing node from a plain-language request, e.g. "nudge the Fetch node 10px to the right",
"put Email at x=100, y=100") and the **property** specialist (rename / config edits). The
orchestrator carries no write tools of its own; the specialists write through the shared
`CanvasBinding`.

Design: [`design/harness-spec.md`](../../docs/browser-agent/design/harness-spec.md) +
[`design/harness-interfaces.md`](../../docs/browser-agent/design/harness-interfaces.md) (builds on
[`design/architecture.md`](../../docs/browser-agent/design/architecture.md)); the `locator` specialist also
has its own [SPEC](../../docs/browser-agent/agents/locator.md).

## What's here

| Piece                            | File                              | Role                                                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CanvasBinding` / `Graph` / `XY` | `src/canvas/canvasBinding.ts`     | The one seam to the graph on screen. `createEngineCanvasBinding(engine)` wraps the `FlowEngine` that owns it — the same binding on desktop, mobile, tutorial and headless; tests use `createInMemoryCanvasBinding`.                                    |
| `LlmGateway`                     | `src/llm/llmGateway.ts`           | The one outbound LLM dependency. Ships `createFakeGateway` (tests) and `createGeminiLlmGateway` (tool-capable Gemini over the HTTP port, function-calling); the app wires the backend-proxied `createGenerateApiLlmGateway` (tool-capability pending). |
| `ToolExecutor`                   | `src/tools/toolExecutor.ts`       | The single choke-point per tool call: route by name → validate args → gate on BOTH the agent's grant and the user's flow-role → dispatch to the provider.                                                                                              |
| Tool providers                   | `src/tools/`                      | Providers classified by type + operation, applied straight through the binding (no draft): node read/move/config (`nodeTools`), block catalog (`catalogTools`), and the agent directory + `spawn` (`spawnTools`).                                      |
| Move semantics                   | `src/canvas/moveSemantics.ts`     | Pure position math: direction→delta, relative/absolute. (A vague "nudge" resolves to a concrete step in the orchestrator, not here.)                                                                                                                   |
| Base agent                       | `src/agents/baseAgent.ts`         | `BaseAgent` — the generic think/act turn loop shared by every agent. Subclasses supply an `AgentConfig` (persona + tools + grant) and an optional per-turn context hook.                                                                               |
| Specialists                      | `src/agents/`                     | `LocatorAgent` (node read + move) and `PropertyAgent` (node read + config/rename) — each `extends BaseAgent`, applies edits live, ends on the model's confirmation.                                                                                    |
| Orchestrator                     | `src/agents/orchestratorAgent.ts` | The main agent: reads the canvas, discovers the specialist roster, and delegates every edit via `spawn`; ends the turn with a plain-text message (there is no `finish` tool — the eval re-asks for the outcome).                                       |
| Session                          | `src/session/session.ts`          | `SessionState` the panel renders from + in-memory `SessionStore` (`createInMemorySessionStore`).                                                                                                                                                       |

The package also hosts the shared subsystems used across agents, each its own module: the **HTTP port**
(`src/http/`), **storage** (`src/storage/`) and **tracing** (`src/trace/`). See
[llm-gateway.md](../../docs/browser-agent/design/llm-gateway.md) and
[trace-spec.md](../../docs/browser-agent/design/trace-spec.md).

## Design notes

- **No draft, no approval gate.** `move_node` applies immediately via the `CanvasBinding`;
  the move is checkpointed on the canvas undo stack, like a user drag.
- **Permissions are enforced, not skipped.** A required-capability tool runs only if BOTH
  gates allow it: the agent's FIXED grant (what it was built to do) and the user's flow-role
  permissions (projected from the live `FlowPermissions` via `toAgentGrant`). A viewer's
  permissions are empty, so a viewer's `move_node` / `rename` is denied even though the
  specialist grants itself the capability.
- **Node environment.** The core is DOM-free — the whole turn runs headless against
  `createInMemoryCanvasBinding` + `createFakeGateway`.

## Test

```sh
npx nx test @flows/agent          # vitest, environment: node
npx nx typecheck @flows/agent
npx nx lint @flows/agent
```
