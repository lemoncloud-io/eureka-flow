import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createWireLog } from '../../cli/wireLog';

import type { CanvasBinding } from '../../canvas';
import type { Chunk, LlmGateway } from '../../llm/llmGateway';
import type { Message, SessionState } from '../../session/session';
import type { HttpPort } from '@flows/engine';

const tmpFile = (name: string): string => join(mkdtempSync(join(tmpdir(), 'wirelog-')), name);
const readLog = (path: string): string => readFileSync(path, 'utf8');

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const out: Chunk[] = [];
    for await (const chunk of stream) out.push(chunk);
    return out;
};

const gatewayOf = (chunks: Chunk[]): LlmGateway => ({
    capabilities: { toolCalls: true },
    chat: () =>
        (async function* () {
            for (const chunk of chunks) yield chunk;
        })(),
});

const sessionWith = (messages: Message[]): SessionState => ({ flowId: 'terminal', phase: 'thinking', messages });

const bindingStub = (): CanvasBinding => {
    let seq = 0;
    return {
        readGraph: () => ({ nodes: [], edges: [] }),
        addNode: () => ({ id: `node-${(seq += 1)}` }),
        addEdge: () => ({ id: `edge-${(seq += 1)}` }),
        updateNode: () => undefined,
        deleteNode: () => undefined,
        deleteEdge: () => undefined,
    };
};

describe('createWireLog', () => {
    it('truncates the file on creation, so each run is a clean record', () => {
        const path = tmpFile('a.log');
        writeFileSync(path, 'STALE CONTENT FROM A PREVIOUS RUN');
        createWireLog(path);
        const log = readLog(path);
        expect(log).not.toContain('STALE CONTENT');
        expect(log).toContain('cleared');
    });

    it('logs one token-accounting line per model call, tagged with the agent, and passes chunks through', async () => {
        const path = tmpFile('b.log');
        const wire = createWireLog(path);
        const inner = gatewayOf([{ text: 'hi' }, { usage: { totalTokens: 42, cachedTokens: 10 }, done: true }]);

        const chunks = await drain(
            wire.gateway(inner).chat({ messages: [], tools: [{ name: 'spawn', description: '', parameters: {} }] })
        );

        expect(chunks.map(c => c.text ?? '').join('')).toBe('hi'); // transparent
        // `spawn` in the toolset ⇒ orchestrator; the token usage is the real-backend proof.
        expect(readLog(path)).toContain('⟐ #1 orchestrator · in=? out=? total=42 cached=10');
    });

    it('marks a fake gateway (no usage) as no backend call', async () => {
        const path = tmpFile('c.log');
        const wire = createWireLog(path);
        await drain(wire.gateway(gatewayOf([{ text: 'fake' }, { done: true }])).chat({ messages: [], tools: [] }));
        expect(readLog(path)).toContain('no backend call (fake gateway)');
    });

    it('logs a model error and rethrows it (never swallows a failed call)', async () => {
        const path = tmpFile('d.log');
        const wire = createWireLog(path);
        // An async iterable that rejects on first iteration — a failed stream, without an empty generator.
        const boom: LlmGateway = {
            chat: () => ({
                [Symbol.asyncIterator]: (): AsyncIterator<Chunk> => ({
                    next: (): Promise<IteratorResult<Chunk>> => Promise.reject(new Error('network down')),
                }),
            }),
        };
        await expect(drain(wire.gateway(boom).chat({ messages: [], tools: [] }))).rejects.toThrow('network down');
        expect(readLog(path)).toContain('✗ #1 agent error: network down');
    });

    it('logs the session transcript as chat turns, incrementally, naming each tool result', () => {
        const path = tmpFile('e.log');
        const wire = createWireLog(path);
        const state = sessionWith([{ id: 'u1', role: 'user', content: 'add a node', ts: 1 }]);
        wire.chat(state);
        state.messages.push({
            id: 'a1',
            role: 'assistant',
            toolCalls: [{ id: 'c1', name: 'add_node', args: '{"type":"input-text"}', status: 'ok' }],
            ts: 2,
        });
        state.messages.push({ id: 't1', role: 'tool', toolCallId: 'c1', content: '{"summary":"added n1"}', ts: 3 });
        state.messages.push({ id: 'a2', role: 'assistant', content: 'Done — added the node.', ts: 4 });
        wire.chat(state);

        const log = readLog(path);
        expect(log).toContain('» user: add a node');
        expect(log).toContain('⚙ add_node {"type":"input-text"}');
        expect(log).toContain('↳ add_node → {"summary":"added n1"}'); // tool result named from the preceding call
        expect(log).toContain('assistant: Done — added the node.');
        expect(log.match(/» user: add a node/g)).toHaveLength(1); // logged once, not re-logged on the second call
    });

    it('restarts the chat transcript when the session is reset (message count drops)', () => {
        const path = tmpFile('f.log');
        const wire = createWireLog(path);
        wire.chat(
            sessionWith([
                { id: 'u1', role: 'user', content: 'first', ts: 1 },
                { id: 'a1', role: 'assistant', content: 'reply', ts: 2 },
            ])
        );
        wire.chat(sessionWith([{ id: 'u2', role: 'user', content: 'after reset', ts: 3 }])); // shorter ⇒ new session
        expect(readLog(path)).toContain('» user: after reset');
    });

    it('logs canvas mutations with their results and never logs readGraph', () => {
        const path = tmpFile('g.log');
        const wire = createWireLog(path);
        const canvas = wire.binding(bindingStub());

        canvas.readGraph();
        const { id: n1 } = canvas.addNode('input-text', { x: 100, y: 100 });
        canvas.updateNode(n1, { label: 'Text Input' });
        canvas.updateNode(n1, { position: { x: 400, y: 100 } });
        const { id: e1 } = canvas.addEdge({
            sourceNodeId: n1,
            sourcePortId: 'out',
            targetNodeId: 'n2',
            targetPortId: 'in',
        });
        canvas.deleteEdge(e1);
        canvas.deleteNode(n1);

        const log = readLog(path);
        expect(log).not.toContain('readGraph');
        expect(log).toContain(`+ node input-text ${n1} @(100,100)`);
        expect(log).toContain(`~ node ${n1} rename "Text Input"`);
        expect(log).toContain(`~ node ${n1} move (400,100)`);
        expect(log).toContain(`+ edge ${n1}:out → n2:in ${e1}`);
        expect(log).toContain(`- edge ${e1}`);
        expect(log).toContain(`- node ${n1}`);
    });

    it('logs a rejected canvas mutation and rethrows (e.g. the engine refusing a cycle)', () => {
        const path = tmpFile('h.log');
        const wire = createWireLog(path);
        const canvas = wire.binding({
            ...bindingStub(),
            addEdge: () => {
                throw new Error('would create a cycle');
            },
        });
        expect(() =>
            canvas.addEdge({ sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' })
        ).toThrow('cycle');
        expect(readLog(path)).toContain('✗ edge rejected: would create a cycle');
    });

    it('logs flow-API requests + responses and passes the response through', async () => {
        const path = tmpFile('i.log');
        const wire = createWireLog(path);
        const inner: HttpPort = { request: async <T>() => ({ status: 200, data: { list: [1, 2, 3] } as T }) };

        const res = await wire.httpPort(inner).request({ method: 'GET', path: '/blocks/0/list' });

        expect(res.status).toBe(200);
        expect((res.data as { list: number[] }).list).toEqual([1, 2, 3]);
        const log = readLog(path);
        expect(log).toContain('→ HTTP #1 GET /blocks/0/list');
        expect(log).toContain('← HTTP #1 200 GET /blocks/0/list');
    });
});
