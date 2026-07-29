# Flow-agent harness — interfaces

> The **new** TypeScript surface for the harness (move / config / rename). Specialists edit the **live
> `CanvasBinding` directly** via `updateNode`. Types in `code font` with no declaration here (`Graph`, `XY`,
> `NodeData`, `EdgeData`, `ToolProvider`, `AgentGrant`, `BaseAgent`, `FakeScriptStep`, …) are **reused
> as-is** from `@flows/agent` / `@flows/flows` / `@lemoncloud/eureka-flows-api`.
>
> Behavior & the loop: **[harness-spec.md](./harness-spec.md)**. How we verify: **[harness-scenarios.md](./harness-scenarios.md)**. Last updated 2026-07-28.

---

## UML — the new surface at a glance

```mermaid
classDiagram
    direction LR

    %% ── live canvas · tools · catalog ─────────────────────────────
    class CanvasBinding {
        <<reused · config-widened>>
        +readGraph() Graph
        +updateNode(id, NodePatch) void
    }
    class ToolProvider {
        <<reused>>
        +listTools() List~ToolDef~
        +dispatch(call) ToolResult
    }
    class CatalogLookup {
        <<interface>>
        +has(type) boolean
        +schema(type) BlockSchema
        +search(query) List~CatalogHit~
    }

    %% ── delegation · spawn + roster ───────────────────────────────
    class BaseAgent { <<reused>> }
    class SubAgentRunner {
        <<interface>>
        +fanOut(specs, binding) List~SpawnChildResult~
    }
    class SpawnChildSpec {
        +task string
        +agentType string
    }
    class AgentRoster {
        <<interface>>
        +list() List~AgentCard~
        +has(type) boolean
        +get(type) AgentRegistration
    }
    class AgentRegistration {
        +type string
        +summary string
        +create(SpecialistTurnDeps) Agent
    }
    class AgentCard {
        +type string
        +summary string
    }

    %% ── eval entry · outcome ──────────────────────────────────────
    class runScenario { <<fn>> }
    class TurnResult {
        +outcome TurnOutcome
        +graph Graph
        +committed boolean
        +live CanvasBinding
    }
    class TurnOutcome {
        <<union>>
        applied
        partial
        answered
        refused
    }

    ToolProvider ..> CanvasBinding : node read/move/config edit live
    ToolProvider ..> CatalogLookup : catalog_search · describe_block · describe_node
    ToolProvider ..> AgentRoster : list_agents reads
    ToolProvider ..> SubAgentRunner : spawn delegates to

    SubAgentRunner ..> BaseAgent : spawns bounded sub-turns
    SubAgentRunner ..> SpawnChildSpec : takes
    SubAgentRunner ..> CanvasBinding : shares live binding · barrier-join
    SubAgentRunner ..> AgentRoster : resolves agentType
    AgentRoster "1" --> "*" AgentCard : lists
    AgentRoster "1" --> "*" AgentRegistration : holds (get)

    runScenario ..> TurnResult : returns
    TurnResult --> TurnOutcome
```

## 1 · The edit space

The harness emits three kinds of node edit, each applied **directly to the live canvas** via
`CanvasBinding.updateNode` (§6):

- **move** `{ nodeId, position: XY }` — absolute result position (`updateNode({ position })`).
- **set_properties** `{ nodeId, config }` — merged over the node's existing config (`updateNode({ config })`).
- **rename** `{ nodeId, label }` — `''` clears the override (`updateNode({ label })`).

Capability per edit: `set_properties` / `rename` → `canEditConfig`; `move` → `canModifyCanvas` — enforced by
each tool's `requires` gate in the executor.

## 2 · Reads reflect the live canvas

Specialists and the orchestrator edit the **live `CanvasBinding` directly** via `updateNode`, and reads
(`list_nodes` / `describe_node`) reflect the live canvas including edits made this turn.

## 3 · Tools

```ts
// Tool convention: a `list_*` / `*_search` tool returns a COMPACT shape (ids + labels, no config/schema);
// a paired `describe_*` returns the FULL detail for ONE item. Lists stay cheap; detail is pulled on demand.

// NODE READ — over the live CanvasBinding: list_nodes (compact) + describe_node (its detail companion).
// ONE provider, carried by every node-reading agent (locator, property, orchestrator).
declare function createNodeReadToolProvider(binding: CanvasBinding, catalog: CatalogLookup): ToolProvider;
//   list_nodes()              → { nodes: NodeLocation[] }        // COMPACT: id, type, label, position — reuses listNodeLocations
//   describe_node({ nodeId }) → { type, currentConfig, schema }  // DETAIL: current config + block schema + a select's options

// CATALOG — search (compact) + describe_block (detail). Never dumps the catalog.
declare function createCatalogToolProvider(catalog: CatalogLookup): ToolProvider;
interface CatalogSearchInput {
    query: string;
}
interface DescribeBlockInput {
    type: string;
}
interface CatalogHit {
    type: string;
    label: string;
    summary: string;
}
//   catalog_search({ query }) → { hits: CatalogHit[] }  // COMPACT: lexical shortlist (type, label, summary)
//   describe_block({ type })  → { schema: BlockSchema } // DETAIL: one block's full schema (fields + a select's enum)

// NODE MOVE (write: position) — LOCATOR carries this over the live binding:
declare function createNodeMoveToolProvider(binding: CanvasBinding): ToolProvider;
//   move_node({ nodeId, by | to })  // sync dispatch validates, then binding.updateNode({ position })
//                                    // applies the move straight to the live canvas.

// NODE CONFIG (write: config/label) — PROPERTY carries this over the live binding (reads via node read above).
declare function createNodeConfigToolProvider(binding: CanvasBinding, catalog: CatalogLookup): ToolProvider;
//   set_properties({ nodeId, config }) → binding.updateNode({ config }) // MERGED; rejects bad value/type/unknown key/missing node
//   rename({ nodeId, label })          → binding.updateNode({ label })  // '' clears the label; rejects missing node

// DISCOVER — orchestrator only. The roster is a registry (data), never enumerated in the persona.
declare function createAgentDirectoryToolProvider(roster: AgentRoster): ToolProvider; // §4
//   list_agents() → { agents: AgentCard[] } // COMPACT: each specialist's type + one-line capability

// DELEGATE — orchestrator only.
declare function createSpawnToolProvider(runner: SubAgentRunner, binding: CanvasBinding): ToolProvider; // §4
// NO grant arg — each child runs under its OWN fixed grant; the user's permissions gate it at the executor.
```

## 4 · `spawn` — sub-agents over the live binding

```ts
interface SpawnChildSpec {
    task: string; // COMPLETE briefing by value (no transcript inheritance; can't ask the user)
    agentType: string; // roster key → persona + tool provider. Required.
    // NO grant — a child's capabilities are DEVELOPER-defined (its OWN fixed grant, set in its constructor);
    // the user's permissions bound it at the executor. The main agent (an LLM) cannot request or widen a grant.
}
interface SpawnChildResult {
    ok: boolean;
    summary: string;
}

interface SubAgentRunner {
    // BARRIER fan-out: spawn every spec concurrently as a bounded sub-turn sharing the live `binding`,
    // AWAIT ALL, and return the gathered results together (they re-enter the orchestrator transcript in
    // one batch). A child that throws → { ok:false } (never rejects). Each edit is a synchronous atomic
    // `updateNode`, so concurrent children never corrupt the canvas. No grant argument: each child runs
    // under its OWN fixed grant, and the user's `userPermissions` (a runner-level input) gate each tool.
    // resolves each spec.agentType via the roster (below) to build the child's tool provider.
    fanOut(specs: SpawnChildSpec[], binding: CanvasBinding): Promise<SpawnChildResult[]>;
}
interface SpawnInput {
    children: SpawnChildSpec[];
} // non-empty (at least one child)
type SpawnResult = { children: SpawnChildResult[] };

// Grants are TWO layers and neither is set at spawn: (1) each agent's OWN fixed grant, declared by the
// developer in its constructor (locator {canModifyCanvas}, property {canEditConfig}); (2) `userPermissions`,
// the flow-role ceiling the FRONTEND derives (@flows/flows `getPermissions(role)` → `toAgentGrant`) and
// threads in. The executor gates each required-capability tool on BOTH. No `clampGrant`, no `roleGrant`.
```

The **roster is a registry** — the data behind `list_agents` and the lookup `spawn` validates against. The
orchestrator discovers it at runtime and names no agent in its persona; a new specialist is one added entry
(+ card), no prompt change.

```ts
interface AgentCard {
    type: string;
    summary: string;
} // COMPACT directory entry: spawn key + one-line capability

// One specialist registration — everything both list_agents and spawn need, so registering an agent
// is a one-liner with NO prompt edit. There is NO per-registration grant: a specialist is bounded by the
// tools it carries + its OWN fixed grant (set in its constructor), with the user ceiling enforced at the
// executor. `create` builds the specialist's OWN BaseAgent subclass (LocatorAgent / PropertyAgent) — no
// generic shell; each is a concrete agent, so `create` just forwards the base deps below.
type SpecialistTurnDeps = BaseAgentDeps; // exactly the shared per-turn deps — no extra fields
// = { gateway, storage, flowId, maxIterations?, binding, catalog, userPermissions } where:
//   binding        — the LIVE canvas the child reads and edits directly
//   catalog        — block schemas behind read/config validation
//   userPermissions — the user's flow-role ceiling (viewer ⇒ no edits — R2); the child's OWN grant is
//                     fixed in its constructor, NOT supplied here
interface AgentRegistration {
    type: string; // spawn key, e.g. 'locator' — also the AgentCard.type
    summary: string; // the one-line capability the card shows
    create(deps: SpecialistTurnDeps): Agent; // build the concrete specialist agent, bound to the live canvas
}
interface AgentRoster {
    list(): AgentCard[]; // backs list_agents (compact)
    has(type: string): boolean; // spawn validates agentType against this
    get(type: string): AgentRegistration | undefined; // the full registration — the runner builds the child from it
}
declare function createAgentRoster(registrations: AgentRegistration[]): AgentRoster;

// the roster's entries (type · the concrete agent `create` builds):
{
    type: 'locator';
} // create → createLocatorAgent({ binding, catalog, … })  — carries move_node
{
    type: 'property';
} // create → createPropertyAgent({ binding, catalog, … }) — carries set_properties + rename
```

## 5 · Catalog types

Read by `catalog_search` / `describe_block`, `describe_node`, and `set_properties` validation.

```ts
interface CatalogLookup {
    has(type: string): boolean;
    schema(type: string): BlockSchema | undefined;
    search(query: string): CatalogHit[];
}
interface BlockSchema {
    type: string;
    label: string;
    stereo?: 'input' | 'process' | 'output';
    config: JsonSchema; // required fields + a select's `enum`
    inputs: { portId: string; type?: string }[];
    outputs: { portId: string; type?: string }[];
}
```

## 6 · The `CanvasBinding` seam

```ts
// SHIPPED — the whole seam between (non-React) agent code and the React-owned live canvas.
// `updateNode` is widened to carry config, so one method applies every edit the harness emits — move →
// position · rename → label · set_properties → config — straight to the live canvas.
interface CanvasBinding {
    readGraph(): Graph; // live structural read of the current canvas graph
    updateNode(id: string, patch: NodePatch): void; // SYNCHRONOUS, applied immediately (frontend-only)
}
interface NodePatch {
    label?: string; // '' / falsy clears a custom label
    position?: XY; // replaces the node's position whole
    config?: Record<string, string>; // MERGED over the node's existing config
}
```

## 7 · `TurnOutcome` — the eval's parsed outcome shape

```ts
type TurnOutcome =
    | { status: 'applied'; summary: string } // ALL intended changes landed
    | {
          status: 'partial';
          summary: string; // SOME landed, SOME could not (partial-commit)
          applied: string[];
          failed: { task: string; reason: string }[];
      }
    | { status: 'answered'; answer: string } // pure Q&A, no edits
    | { status: 'refused'; reason: string }; // nothing landed — couldn't act, OR needs a decision from the user (reason carries any question)

// `TurnOutcome` is the EVAL's parse target (§8): the shape `runScenario` parses the orchestrator's
// re-asked outcome into for the oracle — it is NOT produced in production. The production loop just
// stops when the model emits a message with no tool calls (a plain-text turn; see harness-spec.md); the
// app renders the transcript. There is no finish tool and no sink to read.
```

## 8 · Eval entry

```ts
interface TurnResult {
    outcome: TurnOutcome; // parsed from the eval's test-only re-ask via `parseOutcome()` (lenient extract + validate; `refused` fallback if unparseable). Production neither produces nor parses this
    graph: Graph; // live graph AFTER the turn — the direct-edit oracle (specialists edit the live canvas)
    committed: boolean; // did the live graph change this turn (⇔ something landed)
    live: CanvasBinding; // test affordance: read the live binding directly
}
interface ScenarioInput {
    objective: string;
    initialGraph: Graph;
    userPermissions?: AgentGrant; // TEST-CONVENIENCE override: fail-closed (required) lives at `BaseAgentDeps` + production; the harness defaults to full edit { canModifyCanvas, canEditConfig } for happy-path, and R2 passes {} (viewer)
    script?: FakeScript; // per-agent fake-gateway scripts; OMIT for a real-model run
    mode?: 'parallel' | 'serial'; // sub-agent dispatch order (parallel fan-out vs serial)
    catalog?: CatalogLookup; // catalog override; defaults to the fixture catalog
}
declare function runScenario(input: ScenarioInput): Promise<TurnResult>;

// One fake gateway per agent (keyed by agentType) — see impl-notes for why.
type FakeScript = Record<string, FakeScriptStep[]>; // 'orchestrator' | 'locator' | 'property' → scripted turns
```

**Test-only re-ask + honest errors.** The orchestrator ends its turn with a plain-text reply (production is
fine with that — the app renders the transcript), but the oracle needs a structured `TurnOutcome`. So after
the turn, `runScenario` sends **one** follow-up asking the orchestrator to return the turn's outcome as a JSON
object matching `TurnOutcome`, then `parseOutcome()` parses it (lenient extract + validate; a `refused`
fallback if unparseable). This re-ask + parse lives **only in the eval** — the production loop never re-asks
and never parses an outcome. `runScenario` also **surfaces a turn error** (a thrown gateway/loop failure,
which `BaseAgent.send` records as `phase: 'error'` without rethrowing) by inspecting the session state and
throwing when `phase === 'error'`, so a real failure shows up as an eval `ERROR` (with the reason) instead of
masquerading as a `refused`.

---

Behavior & the loop: **[harness-spec.md](./harness-spec.md)**. How we verify: **[harness-scenarios.md](./harness-scenarios.md)**.
