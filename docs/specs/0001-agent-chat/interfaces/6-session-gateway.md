# 6 · Session, storage & gateway

> Part of the Agent Chat **[Component Interfaces](../component-interfaces.md)** · behavior in **[`workflow-logic.md`](../workflow-logic.md)**. The passive supporting cast: what gets **persisted** (the session), how (`StorageInterface`), and the one **outbound LLM** dependency (`LlmGateway`).

---

## 6.1 Messages

```ts
type AgentRole = 'user' | 'assistant' | 'tool' | 'system';

interface AgentToolCall {
  id: string;
  name: ToolName;                   // ToolName → 2-tools.md
  args: unknown;
  status: 'proposed' | 'executing' | 'succeeded' | 'failed';
}

interface AgentToolResult { toolCallId: string; ok: boolean; data?: unknown; error?: string; }

interface AgentMessage {
  id: string;
  role: AgentRole;
  content?: string;
  toolCalls?: AgentToolCall[];
  toolResults?: AgentToolResult[];
  plan?: Plan;                      // assistant plan message → rehydrates the awaiting_plan gate on reload (Plan → 4-diff-plan-promote.md)
  traces?: TraceEntry[];            // reasoning/tool traces (node-run traces stay in useCanvasStore)
  ts: number;
}
```

## 6.2 Session

```ts
interface AgentSession {
  id: string;
  flowId: FlowId;
  messages: AgentMessage[];
  phase: TurnPhase;                    // TurnPhase → 1-orchestrator.md
  pendingRunIntent?: PendingRunIntent; // turn-scoped; persisted so it survives a reload at the plan gate (→ 5-runs.md)
  createdAt: number;
  updatedAt: number;
}
```

> **No `autoApprove`.** Cross-turn auto-approve was rejected (`workflow-logic.md` locked decision #1). Gating is per-plan (every time) and per-turn for runs (once), both expressed through `phase`/`Gate` — not a persisted toggle.

## 6.3 Storage

```ts
interface StorageInterface {
  load(flowId: FlowId): AgentSession | null;
  create(flowId: FlowId): AgentSession;
  save(session: AgentSession): void; // localStorage; called on every change (streaming, gates, status)
}
```

## 6.4 LLM Gateway (provider-neutral)

The only outbound LLM dependency. Canonical shape mirrors OpenAI chat-completions; provider drivers translate to Gemini etc. behind it.

```ts
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}
interface ToolDef  { type: 'function'; function: { name: string; description: string; parameters: JsonSchema }; }
interface LlmToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; }

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: 'auto' | 'none';
  stream?: boolean;
  temperature?: number;
}
interface ChatCompletionChunk {
  choices: [{ delta: { content?: string; tool_calls?: LlmToolCall[] }; finish_reason?: 'stop' | 'tool_calls' | null }];
}

interface LlmGateway {
  createChatCompletion(req: ChatCompletionRequest, opts?: { signal?: AbortSignal }): AsyncIterable<ChatCompletionChunk>;
}
```

Implementations: `BrowserLlmGateway` (Stage 1, BYO key), `ProxyLlmGateway` (Stage 2), `SimulationGateway` (tests). Provider drivers (`OpenAiDriver`, `GeminiDriver`) live inside `BrowserLlmGateway`.

---

Prev: **[← 5 · Runs](5-runs.md)** · Back to the **[overview](../component-interfaces.md)** · Reference: **[0 · Conventions & grounding](0-conventions.md)**
