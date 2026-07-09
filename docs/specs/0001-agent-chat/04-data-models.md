# Data models & interfaces

> Part of the [Agent Chat spec](README.md) · Prev: [Architecture & design](03-architecture.md) · Next: [Data flow & lifecycle →](05-data-flow.md)

## Data models / schemas

> **Types are authoritative in [`component-interfaces.md`](component-interfaces.md).** This file is a
> higher-level, readable view; where a shape here and one there disagree, component-interfaces wins.
> Branded ids (`FlowId`/`ServerNodeId`/`TempNodeId`/…) are elided here for readability — see §0.1 there.

New client types (proposed, in `libs/agent/src/types.ts`). They reuse existing `DataPacket`,
`NodeData`, `EdgeData`, `BlockDefinitionWithFrontend`, `TraceEntry`, `FlowPermissions`.

```ts
export type AgentRole = 'user' | 'assistant' | 'tool' | 'system';

// Turn phase — the two gates are embedded here (there is no auto-approve; LD-1).
// Canonical union: component-interfaces.md §6.1.
export type TurnPhase =
    | { status: 'idle' }
    | { status: 'thinking' }
    | { status: 'awaiting_plan'; gate: PlanGate } // plan gate — Accept / Reject the whole plan
    | { status: 'awaiting_run'; gate: RunGate } // run gate — Confirm / Decline (once per turn)
    | { status: 'promoting' } // committing; does NOT lock the owner's canvas in v1
    | { status: 'executing' }
    | { status: 'done' }
    | { status: 'error'; error: string };

export interface AgentToolCall {
    id: string; // provider-assigned tool_use id
    name: AgentToolName; // must be a member of the catalog
    args: unknown; // validated against the tool's JSON Schema before use
    status: 'proposed' | 'executing' | 'succeeded' | 'failed';
}

export interface AgentToolResult {
    toolCallId: string;
    ok: boolean;
    data?: unknown; // compact result surfaced back to the model
    error?: string;
}

export interface AgentMessage {
    id: string;
    role: AgentRole;
    content?: string; // natural-language text
    toolCalls?: AgentToolCall[]; // assistant turns that request tools
    toolResults?: AgentToolResult[]; // tool turns
    plan?: Plan; // assistant plan message → rehydrates the awaiting_plan gate on reload
    traces?: TraceEntry[]; // session-level reasoning/tool traces (NFR-9); node-run traces stay in useCanvasStore
    ts: number;
}

export interface AgentSession {
    id: string;
    flowId: string;
    messages: AgentMessage[];
    phase: TurnPhase; // status + any pending gate
    pendingRunIntent?: PendingRunIntent; // turn-scoped; persisted so it survives a reload at the plan gate
    createdAt: number;
    updatedAt: number;
}
```

**Flow snapshot** sent to the model (compact, NFR-4):

```ts
export interface FlowSnapshot {
    flowId: string;
    permissions: Pick<FlowPermissions, 'canModifyCanvas' | 'canEditConfig' | 'canRun' | 'canEditStructure'>;
    nodes: Array<{
        id: string;
        type: string; // block type slug
        label?: string; // customLabel
        config?: Record<string, string>;
        state?: NodeState; // IDLE|READY|RUNNING|COMPLETED|ERROR
        error?: string;
        // port io summarized, not inlined:
        inputs: Array<{ portId: string; type?: DataType; hasData: boolean }>;
        outputs: Array<{ portId: string; type?: DataType; hasData: boolean; preview?: string }>;
    }>;
    // edges are the semantic 4-tuple (no client id) — see SemanticEdge, component-interfaces.md §3.1/§5:
    edges: Array<Pick<EdgeData, 'sourceNodeId' | 'sourcePortId' | 'targetNodeId' | 'targetPortId'>>;
}
```

> **No flow `name`/description in the snapshot** — those live on `useFlowsStore`, not the canvas store,
> and `set_flow_metadata` is deferred. Mirrors the authoritative `FlowSnapshot` (§5).

**Block catalog** given to the model is derived from `blockRegistry`, one entry per block type:
`{ type, label, description, stereo, inputs[{id,type,required}], outputs[{id,type}], configSchema, isFrontend }`.

## Interfaces / contracts

**Tools are exposed to the agent (the LLM) only — never to the user.** Users do not invoke tools;
they interact through (a) the normal interactive canvas / DetailPanel and (b) **Accept/Reject** on the
agent's end-of-turn **plan** (and **Confirm/Decline** on a run) in the chat panel. Agent mutate tools
drive the **same store reducer actions** the human canvas uses — but on a **headless Draft instance**,
so the agent does not get a private mutation path (NFR-1) and nothing persists until promote. "Edit"
in the goals refers to the **mutate** group below, not a user-facing action.

**Tool catalog** (the agent's only capabilities). Tools fall into four kinds — **read**, **mutate**,
**execute**, and **meta**. Read tools require nothing beyond a session; mutate tools require
`canModifyCanvas` (or `canEditConfig` for `update_node_config`); execute tools require `canRun`.
**Gating:** reads and `use_skill` are ungated; **mutate** tools are gated once, by the **plan gate at
turn finalize** (they only touch the Draft mid-turn); **execute** tools are gated by the **run gate**
(once per turn). There are **no** `auto_layout` or `set_flow_metadata` tools in v1 — both are deferred
(see [Tool groups & targets](workflow-logic.md#tool-groups--targets)).

| Tool                 | Kind · requires            | Target                                            | Grounding                                                                 |
| -------------------- | -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| `list_blocks`        | read · —                   | Block Registry                                    | `useFlowsStore.blockRegistry` (catalog view)                              |
| `get_flow`           | read · —                   | **Draft if forked, else Live**                    | `FlowSnapshot`                                                            |
| `get_node`           | read · —                   | **Draft if forked, else Live**                    | `NodeSnapshot` from canvas `NodeData`                                     |
| `get_node_runs`      | read · —                   | **Live only**                                     | `useCanvasStore.nodeRuns[id]` → `RunContext[]`                            |
| `get_port_data`      | read · —                   | **Live only**                                     | `getPortData(portId, 'in'\|'out', {flowId, runId})`                       |
| `add_node`           | mutate · `canModifyCanvas` | **Draft** (forks lazily)                          | draft `setNodes`; default position rides the create body at promote       |
| `update_node_config` | mutate · `canEditConfig`   | **Draft**                                         | draft `updateNodeData(id, {config?, label?})`; merges onto current config |
| `delete_node`        | mutate · `canModifyCanvas` | **Draft**                                         | draft `deleteNode(id)`                                                    |
| `connect`            | mutate · `canModifyCanvas` | **Draft**                                         | draft `addConnection(conn)` (+ validate port types)                       |
| `disconnect`         | mutate · `canModifyCanvas` | **Draft**                                         | draft `deleteConnection(edgeId)`                                          |
| `run_node`           | execute · `canRun`         | **Live only** — persisted id, unaffected by draft | RunTracker → `runNode`                                                    |
| `run_flow`           | execute · `canRun`         | **Live only** — requires empty diff               | RunTracker → `runFlow(flowId, nodeIds, {connection})`                     |
| `use_skill`          | meta · —                   | Skill Registry                                    | playbook text                                                             |

Mid-turn, mutate tools only touch the headless Draft — no server calls. At **promote** the accumulated
diff is committed to the live flow **one operation at a time** through the **awaited** human
persistence primitives — not a batched whole-flow `upsertFlow`, since each create must resolve its
server id before an edge references it. See [the commit path](workflow-logic.md#the-commit-path-promote).

**LLM gateway interface** — the agent's only outbound LLM dependency. It is **universal and
provider-agnostic**: the orchestrator codes to this one contract and never knows which LLM answered.
The canonical request/response shape **mirrors OpenAI chat-completions** (a good de-facto standard that
tool-calling maps onto cleanly) — but that is the _interface shape_, not a provider lock-in; provider
drivers translate to/from Gemini etc. Defined in `libs/agent/src/gateway/`:

```ts
// Canonical shape (mirrors OpenAI chat-completions; provider-neutral at this layer).
// `LlmToolCall` is the wire tool-call — distinct from the agent-side `ToolCall` (component-interfaces §1.2).
interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: LlmToolCall[];
    tool_call_id?: string;
}
interface ToolDef {
    type: 'function';
    function: { name: string; description: string; parameters: JsonSchema };
}
interface LlmToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}
interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDef[];
    tool_choice?: 'auto' | 'none';
    stream?: boolean;
    temperature?: number;
}
interface ChatCompletionChunk {
    choices: [
        { delta: { content?: string; tool_calls?: LlmToolCall[] }; finish_reason?: 'stop' | 'tool_calls' | null },
    ];
}

/** The one interface the orchestrator depends on. */
interface LlmGateway {
    createChatCompletion(
        req: ChatCompletionRequest,
        opts?: { signal?: AbortSignal }
    ): AsyncIterable<ChatCompletionChunk>;
}

/** Internal to BrowserLlmGateway: one per provider. Not seen by the orchestrator. */
interface ProviderDriver {
    /** Adapts the canonical request to the provider's native API and normalizes the response back. */
    createChatCompletion(
        req: ChatCompletionRequest,
        opts?: { signal?: AbortSignal }
    ): AsyncIterable<ChatCompletionChunk>;
}
```

- **Two layers, both swappable:**
    - **Transport (implements `LlmGateway`):** `BrowserLlmGateway` (**Stage 1** — selects a `ProviderDriver`
      by the request's `model`/provider and calls the provider API directly with the `localStorage` key;
      zero backend), `ProxyLlmGateway` (**Stage 2** — authenticates to a proxy with the existing flow API
      key; the proxy holds the provider key, routes providers, and may meter on the Credit ledger; key
      never in the browser), `SimulationGateway` (scripted, no network/key — NFR-10).
    - **Provider drivers (`ProviderDriver`, inside `BrowserLlmGateway`):** `OpenAiDriver`, `GeminiDriver` —
      the per-LLM normalization logic. The only external dependency is each **provider's API**; we build
      the drivers. (In Stage 2 this normalization moves server-side into the proxy.)
- The agent's tool catalog maps directly onto the canonical `tools[]` / `tool_calls` — no custom wire
  format; each driver maps that to its provider's native tool-calling.
- **Reasoning traces** are produced by the orchestrator as `TraceEntry` items on `AgentMessage.traces`
  in `useAgentStore`, reusing the `TraceEntry` format + timeline UI of `agent-codex` (NFR-9); node-run
  traces remain in `useCanvasStore`.
- **Model:** a strong tool-calling model is required. Recommend a latest Claude model (e.g. Opus/Sonnet)
  where the endpoint supports it; the interface is provider-neutral.

---

Prev: [Architecture & design](03-architecture.md) · Next: [Data flow & lifecycle →](05-data-flow.md)
