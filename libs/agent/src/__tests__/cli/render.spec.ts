import { describe, expect, it } from 'vitest';

import { composeFrame, stringWidth } from '../../cli/render';

import type { Graph } from '../../canvas';
import type { SessionState } from '../../session/session';

// eslint-disable-next-line no-control-regex
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

/** A graph whose JSON is far taller than the viewport, so the panes must scroll. */
const tallGraph = (): Graph => ({
    nodes: Array.from({ length: 30 }, (_, i) => ({
        id: `n${i}`,
        type: 'input-text',
        position: { x: i, y: i },
        config: {},
    })),
    edges: [],
});

const chatState = (n: number): SessionState => ({
    flowId: 'terminal',
    phase: 'done',
    messages: Array.from({ length: n }, (_, i) => ({
        id: `a${i}`,
        role: 'assistant' as const,
        content: `line ${i}`,
        ts: i,
    })),
});

const opts = { columns: 120, rows: 20 } as const; // bodyRows = 17

describe('composeFrame — scroll windowing', () => {
    it('a short graph fits, needs no scroll, and reports offset 0', () => {
        const f = composeFrame(null, { nodes: [], edges: [] }, opts);
        expect(f.leftScroll).toBe(0);
        expect(strip(f.frame)).toContain('"nodes": []');
        expect(strip(f.frame)).toContain('CANVAS');
    });

    it('a tall graph shows the BOTTOM at offset 0 (edges/close visible, top scrolled off)', () => {
        const f = composeFrame(null, tallGraph(), { ...opts, leftScroll: 0 });
        const text = strip(f.frame);
        expect(f.leftScroll).toBe(0);
        expect(text).toContain('"edges": []');
        expect(text).not.toContain('"nodes": ['); // the top line is off-screen at the tail
    });

    it('scrolling the canvas up reveals the TOP and clamps the offset', () => {
        const top = composeFrame(null, tallGraph(), { ...opts, leftScroll: 99999 });
        expect(top.leftScroll).toBeGreaterThan(0); // clamped to a real maximum, not the 99999 asked
        expect(strip(top.frame)).toContain('"nodes": ['); // top of the JSON now visible

        // Asking for even more doesn't move past the clamp (idempotent) — so PageDown returns predictably.
        const more = composeFrame(null, tallGraph(), { ...opts, leftScroll: top.leftScroll + 50 });
        expect(more.leftScroll).toBe(top.leftScroll);
    });

    it('scrolls the chat pane independently of the canvas', () => {
        const bottom = composeFrame(chatState(40), tallGraph(), { ...opts, rightScroll: 0 });
        expect(strip(bottom.frame)).toContain('line 39'); // newest visible at the tail
        expect(strip(bottom.frame)).not.toContain('line 0');

        const up = composeFrame(chatState(40), tallGraph(), { ...opts, rightScroll: 99999 });
        expect(up.rightScroll).toBeGreaterThan(0);
        expect(strip(up.frame)).toContain('line 0'); // oldest now visible
    });
});

describe('composeFrame — message rendering', () => {
    it('renders each role: user prefix, ⚙/✗ per tool call, and tool-result summaries', () => {
        const state: SessionState = {
            flowId: 'terminal',
            phase: 'done',
            messages: [
                { id: 'u1', role: 'user', content: 'add a text input', ts: 1 },
                {
                    id: 'a1',
                    role: 'assistant',
                    content: 'on it',
                    toolCalls: [
                        { id: 'c1', name: 'spawn', args: '{}', status: 'ok' },
                        { id: 'c2', name: 'add_node', args: '{}', status: 'error' },
                    ],
                    ts: 2,
                },
                { id: 't1', role: 'tool', toolCallId: 'c1', content: '{"summary":"added n1"}', ts: 3 },
                { id: 't2', role: 'tool', toolCallId: 'c2', content: '{"error":"boom"}', ts: 4 },
            ],
        };
        const text = strip(composeFrame(state, { nodes: [], edges: [] }, opts).frame);
        expect(text).toContain('› add a text input'); // user prefix
        expect(text).toContain('⚙ spawn'); // an ok tool call
        expect(text).toContain('✗ add_node'); // an errored tool call
        expect(text).toContain('→ added n1'); // summarize() pulls .summary out of the tool-result JSON
        expect(text).toContain('→ error: boom'); // …and .error
    });
});

describe('composeFrame — chat header & scroll marker', () => {
    const headerOf = (frame: string): string => strip(frame).split('\n')[0];

    it('surfaces phase:error in the header (Principle 6 — errors are shown, never swallowed)', () => {
        const f = composeFrame(
            { flowId: 'terminal', phase: 'error', error: 'boom', messages: [] },
            { nodes: [], edges: [] },
            opts
        );
        expect(headerOf(f.frame)).toContain('error: boom');
    });

    it('a notice replaces the phase label in the chat header', () => {
        const header = headerOf(
            composeFrame(chatState(1), { nodes: [], edges: [] }, { ...opts, notice: 'saved' }).frame
        );
        expect(header).toContain('saved');
        expect(header).not.toContain('done'); // the phase label it replaced
    });

    it('marks the active pane with ‹scroll› on its own side of the header', () => {
        const canvas = headerOf(composeFrame(null, { nodes: [], edges: [] }, { ...opts, activePane: 'canvas' }).frame);
        const [left, right] = canvas.split('CHAT');
        expect(left).toContain('‹scroll›');
        expect(right).not.toContain('‹scroll›');

        const chat = headerOf(composeFrame(null, { nodes: [], edges: [] }, { ...opts, activePane: 'chat' }).frame);
        expect(chat.split('CHAT')[1]).toContain('‹scroll›');
    });
});

describe('composeFrame — wide characters never overflow the row', () => {
    it('stringWidth counts East-Asian + emoji as 2, combining marks as 0', () => {
        expect(stringWidth('abc')).toBe(3);
        expect(stringWidth('가나')).toBe(4); // Hangul syllables: 2 columns each
        expect(stringWidth('🚀')).toBe(2); // astral emoji
        expect(stringWidth('é')).toBe(1); // 'é' is one column (a combining mark would add zero)
    });

    it('keeps every rendered row within the terminal width — wide chars in BOTH panes', () => {
        // Each Hangul/emoji glyph is 2 display columns but 1 UTF-16 unit, so a `.length`-based clip lets a
        // line occupy ~2× its budget and wrap its tail under the neighbouring pane — the reported bug.
        const wide = `${'가나다라마바사아자차카타파하 '.repeat(6)}${'🚀🎉✅❌ '.repeat(6)}`.trim();
        const state: SessionState = {
            flowId: 'terminal',
            phase: 'done',
            messages: [{ id: 'a', role: 'assistant', content: wide, ts: 1 }],
        };
        // LEFT pane too: a node whose config carries Korean + emoji, serialized into the canvas JSON.
        const graph: Graph = {
            nodes: [{ id: 'n0', type: 'input-text', position: { x: 0, y: 0 }, config: { label: wide } }],
            edges: [],
        };

        const frame = strip(composeFrame(state, graph, opts).frame);
        for (const line of frame.split('\n')) {
            expect(stringWidth(line)).toBeLessThanOrEqual(opts.columns); // no row exceeds the terminal
        }
        expect(frame).toContain('가나다라마바사'); // chat content (right pane) still rendered
        expect(frame).toContain('input-text'); // canvas JSON (left pane) still rendered
    });
});
