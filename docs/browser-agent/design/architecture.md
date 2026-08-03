# Agent architecture — the shared model

The parts every in-browser flow agent is built from, described once. The concrete
[locator agent](../agents/locator.md) references this page instead of restating it; its own doc
covers only what it _adds_.

The DOM-free core is `@flows/agent` (`libs/agent`); the editor wiring lives in
`apps/web/src/app/features/flows/`. Last updated 2026-08-02.

## At a glance

You talk to the **Panel**; the **orchestrator Agent** owns the turn. It coordinates rather than edits —
it carries no write tools of its own, and delegates every edit to **specialist agents** it spawns, which
are the actual writers. Every agent — orchestrator and specialist alike — runs the same think/act loop:
ask the **LlmGateway**, run tool calls through the one **ToolExecutor** (which checks permissions), repeat
until the model is done. All of them reach the live canvas through a single shared seam, the
**CanvasBinding**, editing it directly. The persisted **SessionState** is what the Panel renders from.

**One foundation, two strategies for the writer layer.** The orchestrator and every primitive on this page
are identical however the editing gets done; what varies is the **roster of specialists** the orchestrator
can `spawn` into. The two rosters are the comparable designs the [eval-benchmark](eval-benchmark.md) scores
head-to-head (see [Two strategies](#two-strategies-over-the-shared-foundation) below and
[harness-spec.md §6](harness-spec.md)):

- **Strategy 1 — fan-out to simple specialists.** The orchestrator decomposes the request and spawns
  narrow, single-purpose agents (one **block agent** per block type; the **locator** and **edge** operation
  agents). No skills.
- **Strategy 2 — one capable builder.** The orchestrator plans and hands the whole plan to a single
  **builder** that carries the full editing toolset **plus on-demand `use_skill` playbooks** and builds the
  flow itself, spawning nothing.

This page describes the shared primitives both strategies are built from; the spawn / roster / runner
topology is in [harness-spec.md](harness-spec.md) and [harness-interfaces.md](harness-interfaces.md) §4.

```
Panel → Agent → LlmGateway (think)
              → ToolExecutor → tools → CanvasBinding → live canvas (act)
              → SessionState → Panel (render)
```

```mermaid
flowchart TD
    User([You]) -->|message| Panel[Agent Panel]
    Panel -->|send| Agent[Agent]
    Agent -->|writes state| Store[(SessionState)]
    Store -->|renders| Panel
    Agent -->|think| LLM[LlmGateway]
    Agent -->|act, within its grant| Tools[ToolExecutor]
    Tools -->|read / mutate| Bind[CanvasBinding]
    Bind -->|the real flow| Live[(Live canvas)]
```

The little loop on the left — **Panel → Agent → store → Panel** — is one-way. The Panel only sends
commands and renders what's in the store; it never touches the flow itself.

## Two strategies over the shared foundation

Everything else on this page is **identical whichever editing strategy is in play** — the same
orchestrator persona and tools, the same `BaseAgent` loop, the same `ToolExecutor` and two-gate
permissions, the same `CanvasBinding`. A strategy is selected entirely by **which specialists the
`AgentRoster` exposes** for the orchestrator to `spawn` into; nothing about the orchestrator itself
changes. In practice you flip between them by what you register — expose the **builder** to run Strategy 2,
or leave it out and register the **block + operation** agents to run Strategy 1. They are the two designs
the [eval-benchmark](eval-benchmark.md) compares on correctness.

### Strategy 1 — fan-out to simple specialists (no skills)

The orchestrator decomposes the request into per-target tasks and spawns a **narrow specialist** for each:
one **block agent per block type** (owns add · configure · rename · delete of its own type, reads
type-scoped) plus the **locator** (move) and **edge** (connect / disconnect) operation agents. Independent
tasks fan out concurrently and barrier-join; dependent ones are sequenced. No agent loads a skill.

```mermaid
flowchart TD
    Panel[Agent Panel] --> Orch["Orchestrator — plan · route · coordinate<br/>(no write tools)"]
    Orch -->|"spawn · fan-out · barrier-join"| R1
    subgraph R1["Roster · Strategy 1 — narrow specialists"]
        direction LR
        BA["BlockAgent(type) ×N<br/>add · configure · rename · delete"]
        LOC["locator<br/>move"]
        EDG["edge<br/>connect · disconnect"]
    end
    BA -->|"add_node · set_properties · rename · delete_node"| Bind
    LOC -->|move_node| Bind
    EDG -->|"connect_nodes · disconnect_edge"| Bind
    Bind[("CanvasBinding<br/>live canvas")]
    Orch -. "reads · list_nodes / describe_node" .-> Bind
```

### Strategy 2 — one capable builder with skills (no fan-out)

The orchestrator **plans the whole build and hands it to a single `builder`** as one complete briefing. The
builder carries the **full editing toolset** (read · catalog · add / delete · config · connect / disconnect
· move) **plus `use_skill`**, and realizes the flow itself — add · wire · configure · lay out — pulling an
on-demand **playbook** ([`SEED_SKILLS`](skills.md)) for the how-to. It is a **leaf**: it spawns nothing.

```mermaid
flowchart TD
    Panel[Agent Panel] --> Orch["Orchestrator — plan · hand off<br/>(no write tools)"]
    Orch -->|"spawn one · the plan is the briefing"| B["builder — full editing toolset<br/>(leaf · no spawn)"]
    B <-->|"use_skill · index always in context, body on demand"| SK[["SEED_SKILLS · playbooks<br/>build-linear-pipeline · configure-generator · validate-and-repair"]]
    B -->|"add_node · connect_nodes · set_properties · move_node …"| Bind[("CanvasBinding<br/>live canvas")]
    Orch -. reads .-> Bind
```

### Same foundation, different writer layer

|                          | Strategy 1 · fan-out                                | Strategy 2 · builder                                  |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------- |
| **Orchestrator**         | plan · route · coordinate — no write tools          | plan · hand off — no write tools (**the same agent**) |
| **Writers**              | many narrow specialists (block ×N · locator · edge) | one builder                                           |
| **Skills**               | none                                                | `use_skill` over `SEED_SKILLS` (builder only)         |
| **Spawns per turn**      | one per task (fan-out, barrier-join)                | one (the builder)                                     |
| **Composition lives in** | the **orchestrator** (decompose + coordinate)       | the **builder** (it composes the whole flow)          |
| **Selected by**          | roster exposes the block + operation agents         | roster exposes the builder                            |

Both write the **same live `CanvasBinding`** through the **same tools** under the **same two-gate
permission model**, so the foundation below is unchanged and only the roster differs. Which design wins is
an empirical question the [eval-benchmark](eval-benchmark.md) answers, not a fixed choice.

## Principles

- **One agent owns the turn; the writers are its specialists.** "Agent" means a single capability (a
  persona + its tools + its permissions). The Panel talks straight to the orchestrator, which owns the
  turn but coordinates rather than edits — it holds no write tools and delegates each edit to a
  specialist agent it spawns. The specialists are the writers; each is still a single capability.
- **Permissions are two gates, both fail-closed.** Every mutate tool declares the capability it needs;
  the executor runs it only if BOTH allow it — the agent's own fixed grant (what it was built to do) and
  the user's flow-role permissions (`userPermissions`, the runtime ceiling). An agent can never do more
  than its grant allows, and no agent can exceed the current user's role.
- **One seam to the canvas.** All reads and writes of the live flow go through the `CanvasBinding`; the
  turn loop itself never touches the DOM.

## Components

| Component         | Role                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agent Panel**   | Chat UI. Emits `send`; renders purely from the session store. No logic.                                                                                          |
| **Agent**         | Runs the think/act loop, configured with a persona + tools + a grant. The orchestrator owns the turn and delegates edits to specialists (the writers) it spawns. |
| **LlmGateway**    | The one outbound LLM dependency, behind one interface so it can be swapped (Generate API, fake, Gemini).                                                         |
| **ToolExecutor**  | One engine for the session: route a call by name → validate args → gate on BOTH the agent's grant and the user's flow-role → dispatch → result.                  |
| **CanvasBinding** | The single seam to the real graph, over the `FlowEngine` that owns it: read it, patch a node, add/delete nodes and edges.                                        |
| **SessionStore**  | Loads/creates/saves the `SessionState` the Panel renders from, keyed by `flowId`.                                                                                |

### The pieces (UML)

These primitives are the **reused foundation** — identical under both strategies, and (relative to
`develop`, where `@flows/agent` does not exist) the layer everything else is built on. The strategy-specific
pieces (`spawn` / roster / the specialists / the builder / skills) sit _above_ this and are detailed in
[harness-interfaces.md §4](harness-interfaces.md#4--spawn--sub-agents-over-the-live-binding).

```mermaid
classDiagram
    class Agent {
        <<runs the turn; orchestrator delegates edits to specialists>>
        +send(text) Promise
        +abort()
    }
    class AgentConfig {
        +id
        +systemPrompt
        +tools ToolProvider[]
        +grant AgentGrant
    }
    class LlmGateway {
        <<thinking>>
        +capabilities
        +chat(req, opts) AsyncIterable~Chunk~
    }
    class ToolExecutor {
        <<one engine — acting agent + user permissions passed in>>
        +listTools(agent) ToolDef[]
        +dispatch(agent, call, userPermissions) ToolResult
    }
    class ToolProvider {
        <<a source of tools>>
        +listTools() ToolDef[]
        +dispatch(call) ToolResult
    }
    class CanvasBinding {
        <<door to the live canvas>>
        +readGraph() Graph
        +updateNode(id, patch)
        +addNode(type, position) NewNode
        +deleteNode(id)
        +addEdge(spec) NewEdge
        +deleteEdge(id)
    }
    class SessionStore {
        +load(flowId)
        +create(flowId)
        +save(state)
    }
    Agent --> AgentConfig : configured by
    Agent --> LlmGateway : think
    Agent --> ToolExecutor : act
    Agent --> SessionStore : persist SessionState
    AgentConfig --> ToolProvider : tools
    ToolExecutor --> ToolProvider : routes to
    ToolProvider --> CanvasBinding : canvas tools wrap
```

## The turn (think/act loop)

The generic loop is written once, in `BaseAgent` (`libs/agent/src/agents/baseAgent.ts`); a concrete
agent supplies only its `AgentConfig` and, optionally, per-turn context messages recomputed each
iteration.

```mermaid
sequenceDiagram
    actor User
    participant Panel as Agent Panel
    participant Agent
    participant LLM as LlmGateway
    participant Tools as ToolExecutor
    participant Canvas as CanvasBinding

    User->>Panel: message
    Panel->>Agent: send(text)
    loop think and act (bounded by an iteration cap)
        Agent->>LLM: chat(prompt + context + history + tool defs)
        LLM-->>Agent: tool call(s) and/or text
        Agent->>Tools: dispatch(agent, call, userPermissions)
        Tools->>Canvas: read / mutate (within both gates)
        Canvas-->>Tools: applied
        Tools-->>Agent: ToolResult
    end
    LLM-->>Agent: final text
    Agent-->>Panel: SessionState (done) → render
```

Not shown in the diagram: the turn moves through phases `idle → thinking → done`, ending in `error` on a
gateway failure or on exceeding the iteration cap. `abort()` cancels the in-flight gateway stream, but
work already applied stays applied; and a `send` arriving while a turn is in flight is ignored — a single
active turn.

## Interfaces

The provider-neutral contracts as they ship in `@flows/agent`.

```ts
// ── Agent — runs the turn (orchestrator delegates edits to specialists) ──────
interface Agent {
    send(text: string): Promise<void>; // append user msg → run the whole turn
    abort(): void; // cancel the in-flight stream; applied work stays applied
}
// What varies between capabilities.
interface AgentConfig {
    id: string;
    description: string; // what it handles
    systemPrompt: string; // persona / instructions
    tools: ToolProvider[]; // its tool sources; the executor unions + routes across them
    grant: AgentGrant; // the capabilities it is allowed to use
}

// ── Permissions ──────────────────────────────────────────────────────────────
type Capability = 'canModifyCanvas' | 'canEditConfig' | 'canEditStructure' | 'canRun'; // compile-guarded subset of keyof FlowPermissions
type AgentGrant = Partial<Record<Capability, boolean>>; // absent/false = denied. Both gates are an AgentGrant: an agent's fixed grant, and the user's flow-role permissions (derived from FlowPermissions via toAgentGrant())

// ── LlmGateway — the one outbound LLM dependency ─────────────────────────────
interface LlmGateway {
    readonly capabilities?: LlmGatewayCapabilities; // absent = unspecified (don't assume tool support)
    chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk>;
}
interface LlmGatewayCapabilities {
    readonly toolCalls: boolean;
}
interface ChatRequest {
    messages: ChatMessage[];
    tools: ToolDef[];
    stream?: boolean;
}
interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    toolCalls?: { id: string; name: string; args: string }[]; // args = the raw JSON string
    toolCallId?: string;
}
interface ToolDef {
    name: string;
    description: string;
    parameters: JsonSchema;
    requires?: Capability; // the capability this tool needs; reads omit it
}
interface Chunk {
    text?: string;
    toolCall?: { id: string; name: string; argsDelta: string };
    done?: boolean;
    usage?: { inputTokens?: number; outputTokens?: number }; // emitted with the final chunk when reported
}

// ── ToolExecutor & tools ─────────────────────────────────────────────────────
interface ToolCall {
    id: string;
    name: string;
    args: unknown; // already parsed from the model's raw JSON
}
type ToolResult = { toolCallId: string; ok: true; data?: unknown } | { toolCallId: string; ok: false; error: string };

// A ToolProvider is one source of tools — it lists them and runs them. Maps 1:1
// to an MCP server (listTools ↔ tools/list, dispatch ↔ tools/call).
interface ToolProvider {
    listTools(): ToolDef[] | Promise<ToolDef[]>;
    dispatch(call: ToolCall): ToolResult | Promise<ToolResult>;
}
// ONE executor for the session — a single engine, not reimplemented per agent.
// The acting agent (its tools + grant) is passed in each call.
interface ToolExecutor {
    listTools(agent: AgentConfig): Promise<ToolDef[]>; // the agent's providers' tools, unioned
    // route by name → validate → gate on BOTH the agent's grant and userPermissions (the flow-role ceiling) → run
    dispatch(agent: AgentConfig, call: ToolCall, userPermissions: AgentGrant): Promise<ToolResult>;
}

// ── CanvasBinding — the one door to the live canvas ──────────────────────────
type Graph = WorkflowState; // the live canvas shape ({ nodes, edges }), aliased from @lemoncloud/eureka-flows-api
interface CanvasBinding {
    readGraph(): Graph; // live structural read
    // patch one node, applied immediately (frontend-only): move → position · rename → label · set_properties → config
    updateNode(id: string, patch: { label?: string; position?: XY; config?: Record<string, string> }): void;
    // structural edits, each applied immediately, checkpointed, gated on canModifyCanvas:
    addNode(type: string, position: XY): { id: string }; // create with the block's defaultConfig; returns the new id
    deleteNode(id: string): void; // remove the node + cascade its edges
    addEdge(spec: { sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }): {
        id: string;
    };
    deleteEdge(id: string): void;
}

// ── Session — what the Panel renders from ────────────────────────────────────
type AgentPhase = 'idle' | 'thinking' | 'done' | 'error';
interface SessionState {
    flowId: string;
    messages: Message[];
    phase: AgentPhase;
    error?: string; // set when phase === 'error'
}
interface SessionStore {
    load(flowId: string): SessionState | null;
    create(flowId: string): SessionState;
    save(state: SessionState): void;
}
```

## ToolExecutor & permissions

There is **one `ToolExecutor` for the session** — a single engine, not subclassed per agent. The acting
agent and the user's permissions are passed in (`dispatch(agent, call, userPermissions)`), and the
executor reads that agent's `tools` (to route) and `grant` (to gate). Per-agent behavior is therefore
_data the same code reads_, not new code.

`dispatch(agent, call, userPermissions)` is the single choke-point per tool call: **route by name** →
**validate** `args` against the tool's JSON Schema → **check permission** → return a `ToolResult`. It
never throws; a denied or invalid call returns `{ ok: false, error }` and changes nothing.

Tools come from **providers**, and an agent can compose several — its `tools` is a list. Each provider
lists and runs its own tools; the executor unions their `listTools()` for the model and builds a
`name → provider` index so `dispatch` routes each call. A provider holds no agent-specific state, so one
provider can back several agents; each agent's `grant` decides what it may actually call.

**Permission is two gates, per-tool.** Each tool declares the capability it needs via `ToolDef.requires`
(reads omit it). A required-capability call runs only if that capability is enabled in **both** the
agent's fixed `grant` (what the developer built the agent to do) **and** `userPermissions` (the current
user's flow-role ceiling, projected from `FlowPermissions` via `toAgentGrant`). Both are fail-closed:
`userPermissions` is always supplied, so a viewer (`{}`) is denied even where a specialist grants itself
the capability. The same tool can thus be callable for one agent/user and denied for another.

## CanvasBinding — the seam

The single door between the agent core and the graph on screen, injected at mount. It wraps the
**`FlowEngine`** that owns the graph, so one binding serves every runtime — the desktop editor, the
mobile editor, the tutorial and a headless Node run — and nothing in it is React-aware.

- `readGraph()` — the live `{ nodes, edges }`, straight from `engine.getGraph()`. Not from
  `useCanvasStore`: that projection pauses mid-drag, leaving it behind on committed edits and ahead
  on uncommitted preview coordinates at once.
- `updateNode(id, patch)` — one node's label / position / config, frontend-only, applied through
  `engine.transact`, so the edit is undoable like a user drag and is part of what the next save
  sends. No server call at the moment of the edit. `config` is merged; `position` replaces whole.
- `addNode` / `deleteNode` / `addEdge` / `deleteEdge` — the structural edits, each one `engine.transact`
  call (one undo step, part of the next save). `addNode`/`addEdge` return the new id; `deleteNode`
  cascades the node's edges (`ops.removeNodes`). Semantic validation (block type exists; ports exist,
  are type-compatible, won't cycle; the target input is free) lives in the tools, so the binding just
  applies — `ops.connect` never has an existing edge to displace.

It does **not** check permissions — the `ToolExecutor` above it already gates each tool on the
capability that tool requires, and a second coarser gate here could only fail silently.

The implementation and the primitives it wraps are in [canvas-binding.md](canvas-binding.md).

## Session & storage

`SessionState` is the whole persisted turn state; the Panel is a pure function of it. `SessionStore`
loads/creates a session keyed by `flowId` and `save`s at each turn step — after the user message, after
the fully-collected assistant reply, after each tool result, and on phase transitions. The gateway
stream is drained in full before the reply is persisted; text is not saved token-by-token. The render
loop is one-way: Panel emits commands → the Agent writes `SessionState` → store → Panel re-renders.

`@flows/agent` ships an in-memory `SessionStore` via `createInMemorySessionStore` (the default for tests
and Node runs); in the browser, `useAgentSession` builds a `SessionStore` whose writes and hydration
persist through the Agent Environment's storage port (localStorage), so a transcript survives a reload.

## Grounding (what already exists)

Every seam wraps a primitive already in the repo, which is what makes an agent implementable without new
backend work.

| Seam                     | Wraps                                                                                                                                                                                                                                                      | Where                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `readGraph` (live)       | `engine.getGraph()` → `{ nodes, edges }` (the engine, not the store — the store's projection pauses mid-drag)                                                                                                                                              | `libs/agent/src/canvas/engineCanvasBinding.ts` |
| `updateNode`             | `engine.transact(label, ops => ops.updateNode(id, patch))` — one call, one undo step; history is the transaction                                                                                                                                           | `libs/agent/src/canvas/engineCanvasBinding.ts` |
| `addNode` / `deleteNode` | `engine.transact(label, ops => ops.addNode(...))` (engine seeds defaults, returns the id) / `ops.removeNodes([id])` (drops the node **and** cascades its edges)                                                                                            | `libs/agent/src/canvas/engineCanvasBinding.ts` |
| `addEdge` / `deleteEdge` | `engine.transact(label, ops => ops.connect(spec))` (returns the new edge id; refuses cycle / incompatible ports) / `ops.disconnect([id])`                                                                                                                  | `libs/agent/src/canvas/engineCanvasBinding.ts` |
| permissions              | `FlowPermissions` (7 flags; structural edits use `canModifyCanvas` = "add/delete nodes, connect edges"); the agent's `Capability` is a compile-guarded subset, and the user's `userPermissions` are derived from the flow's permissions via `toAgentGrant` | `libs/flows/.../types/permissions.ts`          |
| node shape               | `NodeData` (`id`, `type`, `position`, `customLabel`)                                                                                                                                                                                                       | `@lemoncloud/eureka-flows-api`                 |

New agent code lives in `libs/agent/src`, mirroring how `flows`/`socket` are structured.

## Shared foundations

Two subsystems under `@flows/agent` back any agent and are documented separately:

- **Agent Environment** — the runtime capability boundary (storage / trace / time / cancellation):
  [foundations/environment.md](../foundations/environment.md).
- **LlmGateway providers** — the contract plus the Gemini provider and HTTP port:
  [foundations/llm-gateway.md](../foundations/llm-gateway.md).
