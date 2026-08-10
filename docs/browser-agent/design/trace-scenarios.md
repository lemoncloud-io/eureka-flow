# Observability — scenarios & oracles

Verification for [trace-spec.md](./trace-spec.md) / [trace-interfaces.md](./trace-interfaces.md). Assumes `environment/` is removed.

## Test strategy

- **Pyramid.** The core (`createTracer`, sinks, `redact`, projectors, decorators) is pure/synchronous → almost all coverage is fast unit tests. A handful of integration tests drive real multi-agent runs through a `memorySink` and assert the projected views.
- **FIRST / determinism.** Inject `now` (fixed counter), `nextSpawnId` (counter), and `memorySink` → every run is reproducible and the record list is directly assertable. No wall-clock, no IO, no order flakiness.
- **Oracle style.** Assert on `memorySink.records` (the append-only truth) and on projector outputs — never on log strings.

## Unit — the core

| #   | Given / When                                                                    | Oracle (Then)                                                                                  |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| U1  | `createTracer(sink).child({runId:'r'}).child({turn:1}).emit({name:'x'})`        | one record; `context = { runId:'r', turn:1 }`; child-key wins on clash                         |
| U2  | `NoopTracer.emit(...)` and `NoopTracer.child({...}).emit(...)`                  | `sink` never written; `child()` returns a no-op tracer                                         |
| U3  | `createTracer(sink, () => 1000).emit({name:'x'})`                               | `record.ts === 1000` (clock injected, deterministic)                                           |
| U4  | `memorySink()` after N writes                                                   | `records.length === N`, in write order                                                         |
| U5  | `jsonlSink(collect)` write                                                      | `collect` gets exactly `JSON.stringify(record) + "\n"`, one call per record                    |
| U6  | `redactingSink(inner)` write of a record with `fields.apiKey` / `context.token` | inner receives `'[redacted]'` for those; non-secret fields intact; original record not mutated |
| U7  | `fanoutSink(a, b)` write / flush                                                | both `a` and `b` receive the record / flush                                                    |

## Unit — the seams (decorators + executor)

| #   | Given / When                                                                                            | Oracle                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `tracingGateway(fakeGw, () => tracer).chat(req)` drained                                                | `llm.request` before, `llm.response` after; `llm.response.fields.usage` = the gateway's usage; every chunk re-yielded unchanged (pass-through) |
| S2  | `tracingCanvasBinding(fakeBinding, () => tracer).addNode('http', xy)`                                   | inner `addNode` called once; one `canvas.mutate {op:'addNode', nodeId}`; returned id is inner's                                                |
| S3  | same, `readGraph()`                                                                                     | pass-through, **no** event emitted                                                                                                             |
| S4  | executor `dispatch` of a tool that succeeds / fails                                                     | `tool.call` then `tool.result` with matching `toolCallId`; `ok` reflects the result; never throws                                              |
| S5  | decorator built with `() => holder.current`; advance `holder.current = t.child({turn:2})` between calls | the later event carries `turn:2` — context advances without re-wrapping                                                                        |

## Unit — projectors (pure, over a fixed record list)

| #   | Given a hand-written `TraceRecord[]`                                               | Oracle                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | orchestrator + one builder, interleaved                                            | `toTraceTree` → root `orchestrator` with one child `builder#1` nested by `flowPath`; file order preserved                                                                                                    |
| P2  | a builder's `message` records (user, assistant+toolCalls, tool, assistant)         | `toTranscripts` → one `AgentTranscript`; `chat` in `user → assistant(+toolCalls) → tool → assistant` order; `tool` paired to its call by `toolCallId`; **no raw id appears in `text`**                       |
| P3  | root `turn.start` graph `{nodes:[]}` + final root `turn.done` graph `{nodes:[n9]}` | `toGraphDiff` → `addedNodes:[{id:'n9',type:…}]` (self-describing, not just an id), others empty; an added/removed edge carries its four endpoints; `before`/`after` intact                                   |
| P4  | records from two agents with **distinct** `gen_ai.agent.id`                        | `toTranscripts` → two transcripts; nothing merged                                                                                                                                                            |
| P5  | two turns on one root (`run-1` empty→[a], `run-2` [a]→[a,b])                       | `toGraphDiff(records)` (no runId) → cumulative `addedNodes:[a,b]`, `runId:'session'`; `toGraphDiff(records,'run-2')` → just `[b]`; `createAgentTrace.project().diff = { cumulative, perTurn:[run-1,run-2] }` |

## Integration — real runs through `memorySink`

Drive the actual agents (offline binding, fake/stubbed gateway) with an injected `memorySink`, fixed `now`, fixed `nextSpawnId`.

| #   | Given / When                                                             | Oracle                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | orchestrator handles a request that spawns one builder which adds a node | records project to: a 2-node trace tree, two non-empty transcripts, and a `GraphDiff` whose `addedNodes` (id + type) matches the binding mutation; every record carries `runId` + `flowPath`                                 |
| I2  | **concurrent same-type fan-out** — one step spawns two `builder`s        | two distinct `gen_ai.agent.id` (`builder#…`), two separate transcripts; each `llm.*`/`tool.*`/`canvas.mutate` attributed to the correct instance despite interleaving; root `GraphDiff` = union of both children's mutations |
| I3  | a child turn throws                                                      | `turn.error` emitted for that agent; `agent.return.ok === false`; the run still produces a well-formed record stream (tracing never masks or raises)                                                                         |
| I4  | default deps (no `tracer` passed)                                        | run completes; zero records (NoopTracer) — proves tracing is fully optional and side-effect-free                                                                                                                             |

## Non-goals (not asserted here)

- No test of file IO, localStorage, or a real trace-viewer import (sinks are injected; `write` is a stub).
- No timing/duration assertions beyond "field present" (`durationMs` uses the injected clock; values are not oracles).
- No span/tree-duration semantics (deferred).
