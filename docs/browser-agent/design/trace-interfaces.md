# Observability — interfaces

Exact types for [trace-spec.md](./trace-spec.md). TypeScript, `libs/agent/src`. Assumes `environment/` is removed.

## 1. The port — what the agent core depends on

```ts
// trace/tracer.ts

/** Correlation fields bound onto every event. OTel-GenAI-aligned names for portability. */
export interface TraceContext {
    runId?: string; // one per user request (root key)
    'gen_ai.agent.name'?: string; // persona TYPE: 'orchestrator' | 'builder' | block type
    'gen_ai.agent.id'?: string; // INSTANCE: 'orchestrator' (singleton) | 'builder#3' (per spawn)
    flowPath?: string; // instance-id tree, e.g. 'run-42:builder#3'
    turn?: number; // think/act loop index
    [k: string]: unknown; // open for event-specific extension
}

/** A structured event. `ts`, and the bound context, are added downstream — not by the caller. */
export interface TraceEvent {
    name: string; // 'tool.call' | 'llm.response' | ...
    level?: 'debug' | 'info' | 'warn' | 'error'; // default 'debug'
    fields?: Record<string, unknown>; // event-specific payload
}

/** What agents hold. Two methods — bind context once, emit many. */
export interface Tracer {
    emit(event: TraceEvent): void;
    child(context: TraceContext): Tracer; // returns a NEW tracer stamping `context` on every event
}
```

## 2. The adapter boundary — where a finalized line goes

```ts
// trace/sink.ts

/** One log line: event + fully-merged context + timestamp. Immutable once written. */
export interface TraceRecord {
    ts: number;
    name: string;
    level: string;
    context: TraceContext; // accumulated across child() calls
    fields: Record<string, unknown>;
}

export interface TraceSink {
    write(record: TraceRecord): void; // synchronous append — order is authoritative
    flush?(): void;
}
```

## 3. The factory + the Null Object

```ts
// trace/createTracer.ts
import type { Tracer, TraceContext } from './tracer';
import type { TraceSink } from './sink';

export const createTracer = (
    sink: TraceSink,
    now: () => number = Date.now, // the ONLY thing tracing needed from the old environment
    context: TraceContext = {}
): Tracer => ({
    emit: ({ name, level = 'debug', fields = {} }) => sink.write({ ts: now(), name, level, context, fields }),
    child: extra => createTracer(sink, now, { ...context, ...extra }), // immutable; child wins on key clash
});

/** Default for every `tracer` dep — does nothing, and its children do nothing. */
export const NoopTracer: Tracer = { emit: () => {}, child: () => NoopTracer };
```

## 4. Sinks — composable adapters

```ts
// trace/sinks.ts
export const memorySink = (): TraceSink & { records: TraceRecord[] } => {
    const records: TraceRecord[] = [];
    return { records, write: r => records.push(r) };
};

export const jsonlSink = (write: (line: string) => void): TraceSink => ({
    write: r => write(JSON.stringify(r) + '\n'),
});

export const redactingSink = (inner: TraceSink): TraceSink => ({
    write: r => inner.write(redact(r)), // sanitize once, at the boundary
    flush: () => inner.flush?.(),
});

export const fanoutSink = (...sinks: TraceSink[]): TraceSink => ({
    write: r => sinks.forEach(s => s.write(r)),
    flush: () => sinks.forEach(s => s.flush?.()),
});
```

```ts
// trace/redact.ts
/** Deep-copy of a record with secret-looking keys ('key'|'token'|'secret'|'password'|...) → '[redacted]'. */
export const redact = (record: TraceRecord): TraceRecord;
```

## 5. Decorators — instrument the two outside-world seams

Both take a `() => Tracer` **accessor** (not a fixed tracer) so per-turn context advances without re-wrapping — mirroring the `() => signalHolder.current` idiom already in `orchestratorAgent.ts`.

```ts
// llm/tracingGateway.ts
export const tracingGateway = (inner: LlmGateway, getTracer: () => Tracer): LlmGateway;
//   emits llm.request { model, messageCount } before, llm.response { model, durationMs, usage } after.

// canvas/tracingCanvasBinding.ts
export const tracingCanvasBinding = (inner: CanvasBinding, getTracer: () => Tracer): CanvasBinding;
//   each mutating method: apply on inner, then emit canvas.mutate { op, nodeId? , edgeId? }.
//   readGraph passes straight through.
```

## 6. Executor — emit around the single dispatch choke point

```ts
// tools/toolExecutor.ts  (createToolExecutor gains one dep)
interface ToolExecutorDeps { registry: /* unchanged */; tracer?: () => Tracer }   // default () => NoopTracer
// dispatch(agent, call, userPermissions):
//   tracer().emit({ name: 'tool.call',   fields: { toolCallId: call.id, name: call.name, args: call.args } })
//   const result = await entry.provider.dispatch(call)
//   tracer().emit({ name: 'tool.result', fields: { toolCallId: call.id, ok: result.ok, durationMs, data?, error? } })
```

## 7. Injection into agents

```ts
// agents/baseAgent.ts — BaseAgentDeps gains:
    tracer?: Tracer;   // identity-bound by the spawner; default NoopTracer

// BaseAgent constructor (self-wrap, once):
//   this.identity = deps.tracer ?? NoopTracer;
//   this.turn = { current: this.identity };            // holder — mirrors signalHolder
//   const get = () => this.turn.current;
//   this.gateway  = tracingGateway(deps.gateway, get);
//   this.binding  = tracingCanvasBinding(deps.binding, get);
//   this.executor = deps.executor ?? createToolExecutor({ registry, tracer: get });

// agents/subAgentRunner.ts — SubAgentRunnerDeps gains:
    tracer?: Tracer;                     // parent tracer; default NoopTracer
    nextSpawnId?: () => number;          // injected, run-monotonic; default a closure counter

// runOne(spec, binding, signal, parentTracer):
//   const agentId = `${spec.agentType}#${nextSpawnId()}`;
//   const childTracer = parentTracer.child({
//       'gen_ai.agent.name': spec.agentType, 'gen_ai.agent.id': agentId,
//       flowPath: `${flowId}:${agentId}` });
//   parentTracer.emit({ name: 'agent.spawn', level: 'info', fields: { agentType: spec.agentType, task: spec.task } });
//   const child = registration.create({ ...deps, tracer: childTracer });
//   ... run ...
//   parentTracer.emit({ name: 'agent.return', level: 'info', fields: { agentType: spec.agentType, ok, summary } });
```

## 8. Event vocabulary

Context (§1) is on every record; the table lists each event's `fields`.

| `name`                     | level       | `fields`                                            |
| -------------------------- | ----------- | --------------------------------------------------- |
| `llm.request`              | debug       | `model`, `messageCount`                             |
| `llm.response`             | debug       | `model`, `durationMs`, `usage`, `toolCallCount`     |
| `tool.call`                | debug       | `toolCallId`, `name`, `args`                        |
| `tool.result`              | debug       | `toolCallId`, `ok`, `durationMs`, `data?`, `error?` |
| `message`                  | debug       | `role`, `content`, `toolCalls?`, `toolCallId?`      |
| `canvas.mutate`            | debug       | `op`, `nodeId?`, `edgeId?`                          |
| `agent.spawn`              | info        | `agentType`, `task`                                 |
| `agent.return`             | info        | `agentType`, `ok`, `summary`                        |
| `turn.start`               | debug       | `turn`, `graph?` (root only)                        |
| `turn.step`                | debug       | `turn`                                              |
| `turn.done` / `turn.error` | debug/error | `turn`, `graph?` (root only), `error?`              |

## 9. Projectors — pure, read-time

```ts
// trace/project/*.ts — input is TraceRecord[]; nothing runs during a turn.
export interface TraceNode { agentType: string; agentId: string; flowPath: string; records: TraceRecord[]; children: TraceNode[]; }

export interface ChatEntry {          // role-labelled, tool calls inline; ids stay behind as keys
    role: 'user' | 'assistant' | 'tool';
    text: string;
    toolCalls?: Array<{ name: string; args: unknown }>;
    toolCallId?: string;
}
export interface AgentTranscript { agentType: string; agentId: string; flowPath: string; chat: ChatEntry[]; }

export interface GraphDiff { runId: string; before: Graph; after: Graph;
    addedNodes: string[]; removedNodes: string[]; changedNodes: string[]; addedEdges: string[]; removedEdges: string[]; }

export const toTraceTree   = (records: TraceRecord[]): TraceNode;               // nest by flowPath prefix; keep file order
export const toTranscripts = (records: TraceRecord[]): AgentTranscript[];       // ONE per gen_ai.agent.id; fold `message` records
export const toGraphDiff   = (records: TraceRecord[], runId: string): GraphDiff; // ROOT turn.start vs final root turn.done
```
