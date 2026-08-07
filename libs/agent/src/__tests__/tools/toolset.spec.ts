import { describe, expect, it } from 'vitest';

import { toolset } from '../../tools/toolset';

import type { CanvasTool, CanvasToolDeps } from '../../tools/toolset';
import type { ToolCall } from '../../tools/types';

// A trivial tool value whose handler echoes a fixed payload — enough to prove composition + routing without
// touching a real canvas. `build` ignores the deps.
const tool = (name: string, data: unknown): CanvasTool => ({
    def: { name, description: name, parameters: { type: 'object', properties: {} } },
    build: () => (c: ToolCall) => ({ toolCallId: c.id, ok: true as const, data }),
});
const deps = {} as CanvasToolDeps; // the sample tools ignore deps
const call = (name: string): ToolCall => ({ id: `c-${name}`, name, args: {} });

const A = tool('a', 'A');
const B = tool('b', 'B');

describe('toolset', () => {
    it('exposes ONLY the tools it was given, in order', async () => {
        const provider = toolset(deps, [B, A]);
        expect((await provider.listTools()).map(d => d.name)).toEqual(['b', 'a']);
    });

    it('routes dispatch to the right tool’s handler', async () => {
        const provider = toolset(deps, [A, B]);
        expect(await provider.dispatch(call('a'))).toEqual({ toolCallId: 'c-a', ok: true, data: 'A' });
        expect(await provider.dispatch(call('b'))).toEqual({ toolCallId: 'c-b', ok: true, data: 'B' });
    });

    it('returns unknown-tool for a tool it does not carry', async () => {
        const provider = toolset(deps, [A]);
        const res = await provider.dispatch(call('c'));
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.error).toMatch(/unknown tool/);
    });

    it('throws on a duplicate tool name in one toolset (a wiring mistake)', () => {
        expect(() => toolset(deps, [A, tool('a', 'dup')])).toThrow(/duplicate tool "a"/);
    });

    // The point of selecting by VALUE (identity): you reference imported tool consts, never strings. A deleted
    // tool is an unresolved import at every use — caught by the compiler/linter/IDE — so there is no stale-name
    // class of bug to test for. This @ts-expect-error is the type guard: a non-CanvasTool value cannot be listed.
    it('only accepts CanvasTool values (a non-tool is a type error)', () => {
        // @ts-expect-error — a bare string is not a CanvasTool, so it cannot be composed into a toolset.
        expect(() => toolset(deps, ['not-a-tool'])).toThrow();
    });
});
