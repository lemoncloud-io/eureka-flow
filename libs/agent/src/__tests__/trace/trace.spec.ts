import { describe, expect, it } from 'vitest';

import { NoopTracer, createTracer } from '../../trace/createTracer';
import { fanoutSink, jsonlSink, memorySink, redactingSink } from '../../trace/sinks';

describe('createTracer', () => {
    it('stamps merged child context onto every event; child keys win on clash', () => {
        const sink = memorySink();
        const tracer = createTracer(sink, () => 1)
            .child({ runId: 'r', turn: 0 })
            .child({ turn: 1 });

        tracer.emit({ name: 'x', fields: { a: 1 } });

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0]).toEqual({
            ts: 1,
            name: 'x',
            level: 'debug',
            context: { runId: 'r', turn: 1 },
            fields: { a: 1 },
        });
    });

    it('uses the injected clock for ts (deterministic)', () => {
        const sink = memorySink();
        createTracer(sink, () => 1000).emit({ name: 'x' });
        expect(sink.records[0].ts).toBe(1000);
    });

    it('defaults level to debug and fields to {}', () => {
        const sink = memorySink();
        createTracer(sink, () => 0).emit({ name: 'x' });
        expect(sink.records[0].level).toBe('debug');
        expect(sink.records[0].fields).toEqual({});
    });

    it('does not mutate a parent tracer when a child is derived', () => {
        const sink = memorySink();
        const parent = createTracer(sink, () => 0).child({ runId: 'r' });
        parent.child({ turn: 9 });
        parent.emit({ name: 'x' });
        expect(sink.records[0].context).toEqual({ runId: 'r' });
    });
});

describe('NoopTracer', () => {
    it('emits nothing and its children emit nothing', () => {
        expect(() => {
            NoopTracer.emit({ name: 'x' });
            NoopTracer.child({ runId: 'r' }).emit({ name: 'y' });
        }).not.toThrow();
    });
});

describe('sinks', () => {
    it('memorySink preserves write order', () => {
        const sink = memorySink();
        const tracer = createTracer(sink, () => 0);
        tracer.emit({ name: 'a' });
        tracer.emit({ name: 'b' });
        expect(sink.records.map(r => r.name)).toEqual(['a', 'b']);
    });

    it('jsonlSink writes one valid JSON line per record', () => {
        const lines: string[] = [];
        createTracer(
            jsonlSink(l => lines.push(l)),
            () => 7
        ).emit({ name: 'x', fields: { a: 1 } });
        expect(lines).toHaveLength(1);
        expect(lines[0].endsWith('\n')).toBe(true);
        expect(JSON.parse(lines[0])).toMatchObject({ ts: 7, name: 'x', fields: { a: 1 } });
    });

    it('redactingSink redacts secret-looking keys in context and fields, leaving others intact', () => {
        const inner = memorySink();
        const tracer = createTracer(redactingSink(inner), () => 0).child({ apiKey: 'sk-123', runId: 'r' });
        tracer.emit({ name: 'llm.request', fields: { model: 'x', authorization: 'Bearer y' } });

        const rec = inner.records[0];
        expect(rec.context.apiKey).toBe('[redacted]');
        expect(rec.context.runId).toBe('r');
        expect(rec.fields.authorization).toBe('[redacted]');
        expect(rec.fields.model).toBe('x');
    });

    it('redactingSink recurses into arrays so secret keys nested in array elements are redacted', () => {
        const inner = memorySink();
        const tracer = createTracer(redactingSink(inner), () => 0);
        // The shape baseAgent emits for `message` events: fields.toolCalls is an array of { name, args }.
        tracer.emit({
            name: 'tool.call',
            fields: { toolCalls: [{ name: 'http', args: { url: 'u', apiKey: 'sk-1' } }] },
        });

        const toolCalls = inner.records[0].fields.toolCalls as Array<{ name: string; args: Record<string, unknown> }>;
        expect(toolCalls[0].args.apiKey).toBe('[redacted]');
        expect(toolCalls[0].args.url).toBe('u');
        expect(toolCalls[0].name).toBe('http');
    });

    it('redactingSink recurses deep enough to redact a secret in a graph-snapshot node config', () => {
        const inner = memorySink();
        const tracer = createTracer(redactingSink(inner), () => 0);
        // The shape baseAgent emits for turn.start/turn.done: fields.graph = { nodes:[{ id, type, config }], edges }.
        tracer.emit({
            name: 'turn.start',
            fields: { graph: { nodes: [{ id: 'n1', type: 'http', config: { apiKey: 'sk-live-xyz' } }], edges: [] } },
        });

        const graph = inner.records[0].fields.graph as { nodes: Array<{ config: Record<string, unknown> }> };
        expect(graph.nodes[0].config.apiKey).toBe('[redacted]');
    });

    it('redactingSink FAILS CLOSED at the depth bound — a secret nested past it is dropped, never emitted verbatim', () => {
        const inner = memorySink();
        const tracer = createTracer(redactingSink(inner), () => 0);
        // Far deeper than MAX_DEPTH (the count is deliberately way past it, so this holds if the bound moves):
        // the redactor stops scanning here, so the subtree must not survive the cut.
        let payload: Record<string, unknown> = { apiKey: 'sk-SECRET' };
        for (let i = 0; i < 40; i++) payload = { nest: payload };
        tracer.emit({ name: 'x', fields: payload });

        const emitted = JSON.stringify(inner.records[0]);
        expect(emitted).not.toContain('sk-SECRET');
        expect(emitted).toContain('[depth-limited]');
    });

    it('redactingSink survives a self-referential array — the depth bound catches cycles through arrays too', () => {
        const inner = memorySink();
        const tracer = createTracer(redactingSink(inner), () => 0);
        const cyclic: unknown[] = [];
        cyclic.push(cyclic); // arrays must cost a depth level, or this recurses until RangeError

        expect(() => tracer.emit({ name: 'x', fields: { cyclic } })).not.toThrow();
        expect(JSON.stringify(inner.records[0])).toContain('[depth-limited]');
    });

    it('fanoutSink delivers each record to every sink', () => {
        const a = memorySink();
        const b = memorySink();
        createTracer(fanoutSink(a, b), () => 0).emit({ name: 'x' });
        expect(a.records).toHaveLength(1);
        expect(b.records).toHaveLength(1);
    });
});
