import { describe, expect, it } from 'vitest';

import { createToolExecutor } from '../../tools/toolExecutor';

import type { AgentConfig } from '../../agent';
import type { ToolDef } from '../../llm/llmGateway';
import type { ToolCall, ToolProvider, ToolResult } from '../../tools/toolTypes';

const echoDef: ToolDef = {
    name: 'echo',
    description: 'echo',
    parameters: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
};

const mutateDef: ToolDef = {
    name: 'do_mutate',
    description: 'needs canModifyCanvas',
    requires: 'canModifyCanvas',
    parameters: { type: 'object', properties: {} },
};

const makeProvider = (defs: ToolDef[], run?: (call: ToolCall) => ToolResult): ToolProvider => ({
    listTools: () => defs,
    dispatch: (call: ToolCall) =>
        run ? run(call) : { toolCallId: call.id, ok: true, data: { echoed: (call.args as { msg: string }).msg } },
});

const makeAgent = (tools: ToolProvider[], grant: AgentConfig['grant'] = {}): AgentConfig => ({
    id: 'test',
    description: 'test',
    systemPrompt: '',
    tools,
    grant,
});

const call = (name: string, args: unknown): ToolCall => ({ id: 'c1', name, args });

describe('createToolExecutor', () => {
    it('unions tool defs across an agent’s providers', async () => {
        const executor = createToolExecutor();
        const agent = makeAgent([makeProvider([echoDef]), makeProvider([mutateDef])], { canModifyCanvas: true });
        const names = (await executor.listTools(agent)).map(t => t.name);
        expect(names).toEqual(['echo', 'do_mutate']);
    });

    it('routes a call to the owning provider and returns its data', async () => {
        const executor = createToolExecutor();
        const agent = makeAgent([makeProvider([echoDef])]);
        const result = await executor.dispatch(agent, call('echo', { msg: 'hi' }));
        expect(result).toEqual({ toolCallId: 'c1', ok: true, data: { echoed: 'hi' } });
    });

    it('errors on an unknown tool', async () => {
        const executor = createToolExecutor();
        const result = await executor.dispatch(makeAgent([makeProvider([echoDef])]), call('nope', {}));
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/unknown tool/);
    });

    it('rejects args that fail schema validation before dispatching', async () => {
        const executor = createToolExecutor();
        let ran = false;
        const provider = makeProvider([echoDef], c => {
            ran = true;
            return { toolCallId: c.id, ok: true };
        });
        const result = await executor.dispatch(makeAgent([provider]), call('echo', { msg: 123 }));
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/invalid args/);
        expect(ran).toBe(false);
    });

    it('denies a tool whose required capability is not granted', async () => {
        const executor = createToolExecutor();
        const agent = makeAgent([makeProvider([mutateDef], c => ({ toolCallId: c.id, ok: true }))], {});
        const result = await executor.dispatch(agent, call('do_mutate', {}));
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/permission denied/);
    });

    it('allows a required-capability tool when granted', async () => {
        const executor = createToolExecutor();
        const agent = makeAgent([makeProvider([mutateDef], c => ({ toolCallId: c.id, ok: true, data: 'done' }))], {
            canModifyCanvas: true,
        });
        const result = await executor.dispatch(agent, call('do_mutate', {}));
        expect(result).toEqual({ toolCallId: 'c1', ok: true, data: 'done' });
    });

    it('wraps a thrown provider error into a ToolResult', async () => {
        const executor = createToolExecutor();
        const provider = makeProvider([echoDef], () => {
            throw new Error('boom');
        });
        const result = await executor.dispatch(makeAgent([provider]), call('echo', { msg: 'x' }));
        expect(result).toEqual({ toolCallId: 'c1', ok: false, error: 'boom' });
    });
});
