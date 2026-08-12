import type { TraceProjections } from './agentTrace';
import type { EdgeChange, GraphDiff, NodeChange, TraceNode } from './project';

/**
 * Render the three projections of one captured run to plain text — the shared surface for any node caller
 * (the scenario harness and the terminal both print this). Nothing truncates: a trace is for reading the
 * WHOLE conversation, so every message/arg prints verbatim.
 */
const asText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

/** Prefix every physical line of a (possibly multi-line) block, so a long untrimmed message stays inside its turn. */
const gutter = (text: string, prefix: string): string[] => text.split('\n').map(line => `${prefix}${line}`);

// 1/3 · one chat per agent instance. A continuous `┃` gutter groups each agent's block; numbered `[n] ROLE`
// headers with a blank gutter line between them make each user/assistant/tool turn its own visible unit.
const renderTranscripts = (p: TraceProjections, out: string[]): void => {
    out.push('', '════════════ trace · 1/3 · TRANSCRIPTS (chat per agent instance) ════════════');
    if (!p.transcripts.length) {
        out.push('  (no records)');
        return;
    }
    for (const t of p.transcripts) {
        out.push('', `┏━ agent: ${t.agentType || '(root)'} · ${t.agentId}`);
        t.chat.forEach((e, i) => {
            out.push('┃'); // blank gutter line separates one turn from the next
            const label = e.role === 'tool' ? `TOOL ◂ (result of ${e.toolCallId ?? '?'})` : `${e.role.toUpperCase()} ▸`;
            out.push(`┃ [${i + 1}] ${label}`);
            if (e.text) out.push(...gutter(e.text, '┃     '));
            for (const c of e.toolCalls ?? []) out.push(...gutter(`→ calls ${c.name}(${asText(c.args)})`, '┃     '));
        });
        out.push(`┗━ end: ${t.agentType || '(root)'} · ${t.agentId}`);
    }
};

// 2/3 · the agent call forest (who spawned whom) — one tree per orchestrator instance/epoch, each node
// tagged with its model + per-event-type record counts.
const renderForest = (p: TraceProjections, out: string[]): void => {
    out.push('', '════════════ trace · 2/3 · TRACE FOREST (who spawned whom) ════════════');
    const walk = (n: TraceNode, d: number): void => {
        const counts = new Map<string, number>();
        for (const r of n.records) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
        const summary = [...counts].map(([k, v]) => `${k}×${v}`).join(' ');
        const model = n.model ? ` [${n.model}]` : '';
        out.push(
            `  ${'  '.repeat(d)}▸ ${n.agentType || '(root)'} · ${n.agentId}${model}  [${n.records.length}: ${summary}]`
        );
        n.children.forEach(c => walk(c, d + 1));
    };
    if (p.trees.length) p.trees.forEach(t => walk(t, 0));
    else out.push('  (no records)');
};

// One graph delta — names WHICH nodes/edges were added/removed/changed (node type + edge endpoints), not just counts.
const renderOneDiff = (heading: string, d: GraphDiff, out: string[]): void => {
    const nodeLine = (sign: string, n: NodeChange): string => `    ${sign} node ${n.id} (${n.type || '?'})`;
    const edgeLine = (sign: string, e: EdgeChange): string =>
        `    ${sign} edge ${e.id || '?'}: ${e.sourceNodeId}:${e.sourcePortId} → ${e.targetNodeId}:${e.targetPortId}`;
    const rows = [
        ...d.addedNodes.map(n => nodeLine('+', n)),
        ...d.removedNodes.map(n => nodeLine('-', n)),
        ...d.changedNodes.map(n => nodeLine('~', n)),
        ...d.addedEdges.map(e => edgeLine('+', e)),
        ...d.removedEdges.map(e => edgeLine('-', e)),
    ];
    out.push(
        `${heading}  totals: ${d.before.nodes.length}n/${d.before.edges.length}e → ${d.after.nodes.length}n/${d.after.edges.length}e`
    );
    // An unsettled turn has no closing snapshot: say the delta is unknown rather than claim nothing changed.
    out.push(
        ...(rows.length ? rows : [d.settled ? '    (no structural change)' : '    (turn in flight — delta unknown)'])
    );
};

// 3/3 · the canvas delta — the cumulative whole-session delta on top, then one delta per turn.
const renderDiff = (p: TraceProjections, out: string[]): void => {
    out.push('', '════════════ trace · 3/3 · GRAPH DIFF (canvas before → after) ════════════');
    if (!p.diff.cumulative) {
        out.push('  (no diff)');
        return;
    }
    renderOneDiff('  cumulative (whole session) ·', p.diff.cumulative, out);
    for (const turn of p.diff.perTurn) renderOneDiff(`  ${turn.runId} ·`, turn, out);
};

/** The three projections rendered to one plain-text block (transcripts, then forest, then graph diff). */
export const renderProjections = (p: TraceProjections): string => {
    const out: string[] = [];
    renderTranscripts(p, out);
    renderForest(p, out);
    renderDiff(p, out);
    return out.join('\n');
};
