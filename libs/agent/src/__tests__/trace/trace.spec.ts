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

    it('fanoutSink delivers each record to every sink', () => {
        const a = memorySink();
        const b = memorySink();
        createTracer(fanoutSink(a, b), () => 0).emit({ name: 'x' });
        expect(a.records).toHaveLength(1);
        expect(b.records).toHaveLength(1);
    });
});
