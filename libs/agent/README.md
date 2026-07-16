# @flows/agent

In-browser flow agents. The first concrete agent is the **locator agent**: it moves an
existing node on the canvas from a plain-language request ("nudge the Fetch node 10px to
the right", "put Email at x=100, y=100").

Spec: [`docs/specs/0002-locator-agent/SPEC.md`](../../docs/specs/0002-locator-agent/SPEC.md)
(builds on [`0001-agent-chat`](../../docs/specs/0001-agent-chat/SPEC.md)).

## What's here

| Piece                            | File                          | Role                                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CanvasBinding` / `Graph` / `XY` | `src/canvas/canvasBinding.ts` | The one seam to the live canvas. The app supplies `createDesktopCanvasBinding`; tests use `createInMemoryCanvasBinding`.                                                                                                                                            |
| `LlmGateway`                     | `src/llm/llmGateway.ts`       | The one outbound LLM dependency. Ships `createFakeGateway` (tests) and `createGeminiLlmGateway` (text-only Gemini over the HTTP port); the app adds an offline dev command gateway (`createCommandLlmGateway`), with a backend-proxied production gateway deferred. |
| `ToolExecutor`                   | `src/tools/toolExecutor.ts`   | The single choke-point per tool call: validate args → check the agent's grant → route by name → provider.                                                                                                                                                           |
| Canvas tools                     | `src/canvas/canvasTools.ts`   | Shared canvas tool provider: `createCanvasToolProvider` (`list_nodes` + `move_node`, applied straight through the binding — no draft).                                                                                                                              |
| Move semantics                   | `src/canvas/moveSemantics.ts` | Pure position math: direction→delta, relative/absolute, 20px default.                                                                                                                                                                                               |
| Base agent                       | `src/agents/baseAgent.ts`     | `BaseAgent` — the generic think/act turn loop shared by every agent. Subclasses supply an `AgentConfig` (persona + tools + grant) and an optional per-turn context hook.                                                                                            |
| Locator agent                    | `src/agents/locatorAgent.ts`  | `LocatorAgent extends BaseAgent`: adds the canvas tool provider + persona and seeds the live node list. Applies moves live, ends on the model's confirmation.                                                                                                       |
| Session                          | `src/session/session.ts`      | `SessionState` the panel renders from + in-memory `Storage`.                                                                                                                                                                                                        |

## Design notes

- **No draft, no approval gate** (spec §2.2). `move_node` applies immediately via the
  `CanvasBinding`; the agent is the sole editor of the canvas (spec §2.1).
- **Permissions are enforced, not skipped.** The executor checks each tool's `requires`
  against the agent's grant; the locator is granted `canModifyCanvas`, so its moves pass.
  The session-role ceiling of spec 0001 is not wired yet.
- **Node environment.** The core is DOM-free — the whole turn runs headless against
  `createInMemoryCanvasBinding` + `createFakeGateway`.

## Test

```sh
npx nx test @flows/agent          # vitest, environment: node
npx nx typecheck @flows/agent
npx nx lint @flows/agent
```
