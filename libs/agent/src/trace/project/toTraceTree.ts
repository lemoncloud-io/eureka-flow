import type { TraceRecord } from '../sink';
import type { TraceNode } from './types';

/** Parent flowPath = everything before the last ':' segment; null for a root (no ':'). */
const parentPath = (flowPath: string): string | null => {
    const i = flowPath.lastIndexOf(':');
    return i === -1 ? null : flowPath.slice(0, i);
};

/**
 * Project the record stream into the agent call tree: one {@link TraceNode} per instance (flowPath),
 * nested by flowPath prefix, records kept in emission (file) order. Returns the root, or null if empty.
 * If several roots exist (multiple runs in one stream) the first-seen root is returned.
 */
export const toTraceTree = (records: TraceRecord[]): TraceNode | null => {
    const nodes = new Map<string, TraceNode>();

    for (const record of records) {
        const flowPath = String(record.context.flowPath ?? '');
        if (!flowPath) continue; // context-less lifecycle records (e.g. web agent.run.*) are not agent nodes
        let node = nodes.get(flowPath);
        if (!node) {
            node = {
                agentType: String(record.context['gen_ai.agent.name'] ?? ''),
                agentId: String(record.context['gen_ai.agent.id'] ?? flowPath),
                flowPath,
                records: [],
                children: [],
            };
            nodes.set(flowPath, node);
        }
        node.records.push(record);
    }

    // Map iterates in first-insertion order, so this preserves emission order without a parallel array.
    let root: TraceNode | null = null;
    for (const node of nodes.values()) {
        const parentFlowPath = parentPath(node.flowPath);
        const parent = parentFlowPath !== null ? nodes.get(parentFlowPath) : undefined;
        if (parent) {
            parent.children.push(node);
        } else if (!root) {
            root = node;
        }
    }
    return root;
};
