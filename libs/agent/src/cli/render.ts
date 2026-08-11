import pc from 'picocolors';

import type { Graph } from '../canvas';
import type { Message, SessionState } from '../session/session';

/**
 * {@link composeFrame} builds the two-pane frame purely from (state, graph, size, scroll offsets): left =
 * canvas JSON, right = chat transcript. Offsets count lines UP from the bottom (0 = live tail) and come back
 * CLAMPED, so the caller stores the corrected value. Purity keeps the layout + scroll math unit-testable and
 * the renderer swappable behind this one call; `terminal.ts` owns the readline line, paint, and scroll keys.
 */
export interface FrameOptions {
    columns: number;
    rows: number;
    /** Show raw tool args + tool-result JSON in the chat. */
    verbose?: boolean;
    /** A transient message shown in the CHAT header instead of the phase (meta-command feedback). */
    notice?: string;
    /** Lines scrolled up from the bottom in each pane (0 = live tail). Clamped and echoed back in {@link Frame}. */
    leftScroll?: number;
    rightScroll?: number;
    /** Which pane the scroll keys/commands currently drive — marked `‹scroll›` in its header. */
    activePane?: 'chat' | 'canvas';
}

export interface Frame {
    /** Everything above the input line: header, divider, then the two panes. */
    frame: string;
    /** The offsets actually used, clamped to each pane's range — the caller stores these back. */
    leftScroll: number;
    rightScroll: number;
}

/**
 * Terminal DISPLAY width of one code point — NOT `.length`. A row wider than the terminal soft-wraps its
 * tail onto the next line's first column (under the neighbouring pane), so every clip/pad/wrap below measures
 * columns: East-Asian and emoji code points take two, combining / zero-width marks take none, else one.
 */
const charWidth = (cp: number): number => {
    if (
        (cp >= 0x0300 && cp <= 0x036f) || // combining diacritical marks
        (cp >= 0x200b && cp <= 0x200f) || // zero-width space / joiner / marks
        (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
        cp === 0xfeff
    ) {
        return 0;
    }
    if (
        (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
        (cp >= 0x2600 && cp <= 0x27bf) || // misc symbols + dingbats (emoji presentation)
        (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals … Yi (ideographs, kana, jamo)
        (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
        (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
        (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
        (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
        (cp >= 0xffe0 && cp <= 0xffe6) || // fullwidth signs
        (cp >= 0x1f000 && cp <= 0x1fbff) || // emoji, pictographs, symbols
        (cp >= 0x20000 && cp <= 0x3fffd) // CJK extension B and beyond
    ) {
        return 2;
    }
    return 1;
};

/** Total display width (columns) of `s` — the count clip/pad/wrap and the layout must respect. */
export const stringWidth = (s: string): number => {
    let w = 0;
    for (const ch of s) w += charWidth(ch.codePointAt(0) ?? 0);
    return w;
};

/** Truncate `s` to at most `width` display columns, marking any cut with a `…` (itself one column). */
const clip = (s: string, width: number): string => {
    if (stringWidth(s) <= width) return s;
    let out = '';
    let w = 0;
    for (const ch of s) {
        const cw = charWidth(ch.codePointAt(0) ?? 0);
        if (w + cw > width - 1) break; // keep one column for the ellipsis
        out += ch;
        w += cw;
    }
    return `${out}…`;
};

/** Pad `s` with spaces to exactly `width` display columns. */
const padEnd = (s: string, width: number): string => s + ' '.repeat(Math.max(0, width - stringWidth(s)));

/** Wrap plain text to `width` display columns, hard-breaking overlong runs; preserves blank lines. */
const wrap = (text: string, width: number): string[] => {
    const out: string[] = [];
    for (const paragraph of text.split('\n')) {
        if (paragraph === '') {
            out.push('');
            continue;
        }
        let line = '';
        let w = 0;
        for (const ch of paragraph) {
            const cw = charWidth(ch.codePointAt(0) ?? 0);
            if (w + cw > width) {
                out.push(line);
                line = '';
                w = 0;
            }
            line += ch;
            w += cw;
        }
        out.push(line);
    }
    return out;
};

/** A scroll window over `lines`: `scroll` lines up from the bottom, `bodyRows` tall. Clamps `scroll`. */
const windowOf = <T>(
    lines: T[],
    bodyRows: number,
    scroll: number
): { slice: T[]; scroll: number; above: number; below: number } => {
    const maxScroll = Math.max(0, lines.length - bodyRows);
    const s = Math.min(Math.max(0, Math.floor(scroll)), maxScroll);
    const end = lines.length - s;
    const start = Math.max(0, end - bodyRows);
    return { slice: lines.slice(start, end), scroll: s, above: start, below: lines.length - end };
};

/** A right-pane line as plain text + the colour applied after clipping (so clip math stays on plain text). */
interface ChatLine {
    text: string;
    color: (s: string) => string;
}

/** Pull the human-readable bit out of a tool-result JSON string (spawn summary / error), else the raw. */
const summarize = (content: string | undefined): string => {
    if (!content) return '';
    try {
        const parsed = JSON.parse(content) as { summary?: unknown; error?: unknown };
        if (typeof parsed.summary === 'string') return parsed.summary;
        if (typeof parsed.error === 'string') return `error: ${parsed.error}`;
    } catch {
        // not JSON — fall through to the raw string
    }
    return content;
};

const messageLines = (message: Message, width: number, verbose: boolean): ChatLine[] => {
    const lines: ChatLine[] = [];
    if (message.role === 'user') {
        for (const l of wrap(message.content ?? '', width - 2)) lines.push({ text: `› ${l}`, color: pc.cyan });
    } else if (message.role === 'assistant') {
        if (message.content) {
            const color = message.toolCalls ? pc.dim : (s: string) => s;
            for (const l of wrap(message.content, width)) lines.push({ text: l, color });
        }
        for (const tc of message.toolCalls ?? []) {
            const errored = tc.status === 'error';
            lines.push({ text: `${errored ? '✗' : '⚙'} ${tc.name}`, color: errored ? pc.red : pc.dim });
            if (verbose) for (const l of wrap(`   ${tc.args}`, width)) lines.push({ text: l, color: pc.dim });
        }
    } else if (message.role === 'tool') {
        const body = verbose ? (message.content ?? '') : summarize(message.content).replace(/\s+/g, ' ');
        for (const l of wrap(`  → ${body}`, width)) lines.push({ text: l, color: pc.dim });
    }
    return lines;
};

const phaseLabel = (state: SessionState | null): string => {
    if (!state) return '';
    switch (state.phase) {
        case 'thinking':
            return pc.yellow('…thinking');
        case 'done':
            return pc.green('done');
        case 'error':
            return pc.red(`error: ${state.error ?? 'unknown'}`);
        default:
            return pc.dim('idle');
    }
};

/** `▲N` above / `▼N` below when a pane has off-screen lines — the scroll affordance. */
const scrollTag = (above: number, below: number): string => {
    const parts = [above > 0 ? `▲${above}` : '', below > 0 ? `▼${below}` : ''].filter(Boolean);
    return parts.length ? ` ${parts.join(' ')}` : '';
};

export const composeFrame = (state: SessionState | null, graph: Graph, options: FrameOptions): Frame => {
    const cols = Math.max(40, options.columns);
    const bodyRows = Math.max(4, options.rows - 3); // 2 header rows + 1 input line reserved
    const leftW = Math.max(24, Math.floor(cols * 0.45));
    const rightW = Math.max(20, cols - leftW - 4); // -3 for the separator, -1 trailing margin: a full line must
    // not sit on the terminal's last column, or a pending-wrap folds its tail under the left pane
    const sep = pc.dim(' │ ');

    const graphAll = JSON.stringify(graph, null, 2).split('\n');
    const left = windowOf(graphAll, bodyRows, options.leftScroll ?? 0);

    const chatAll: ChatLine[] = [];
    for (const m of state?.messages ?? []) chatAll.push(...messageLines(m, rightW, !!options.verbose));
    const right = windowOf(chatAll, bodyRows, options.rightScroll ?? 0);

    const rows: string[] = [];
    const mark = (active: boolean): string => (active ? ' ‹scroll›' : ''); // plain: the left title is width-clipped
    const leftTitle = `CANVAS${scrollTag(left.above, left.below)}${mark(options.activePane === 'canvas')} · ${graph.nodes.length}n ${graph.edges.length}e`;
    const chatStatus = options.notice ? pc.magenta(options.notice) : phaseLabel(state);
    rows.push(
        pc.bold(padEnd(clip(leftTitle, leftW), leftW)) +
            sep +
            pc.bold(`CHAT${scrollTag(right.above, right.below)}${mark(options.activePane === 'chat')}  ${chatStatus}`)
    );
    rows.push(pc.dim('─'.repeat(leftW)) + pc.dim('─┼─') + pc.dim('─'.repeat(rightW)));
    for (let i = 0; i < bodyRows; i += 1) {
        const leftCell = pc.dim(padEnd(clip(left.slice[i] ?? '', leftW), leftW));
        const rightLine = right.slice[i];
        rows.push(leftCell + sep + (rightLine ? rightLine.color(clip(rightLine.text, rightW)) : ''));
    }
    return { frame: rows.join('\n'), leftScroll: left.scroll, rightScroll: right.scroll };
};
