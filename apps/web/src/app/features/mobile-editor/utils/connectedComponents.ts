import { topologicalSort } from './topologicalSort';

import type { GraphNode } from '@flows/flows';
import type { EdgeData } from '@lemoncloud/eureka-flows-api';

export interface NodeGroup {
    /** Unique key for the group (first node id) */
    id: string;
    /** Node IDs in topological order within this group */
    nodeIds: string[];
    /** Whether this group has more than one node */
    isMultiNode: boolean;
}

/**
 * Detect connected components in the node graph (undirected).
 * Returns groups of connected nodes, each topologically sorted internally.
 * Groups are sorted by the min position.y of their root nodes.
 */
export const findConnectedComponents = (nodes: GraphNode[], connections: EdgeData[]): NodeGroup[] => {
    if (nodes.length === 0) return [];

    const nodeIds = new Set(nodes.map(n => n.id));
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Build undirected adjacency list
    const adjacency = new Map<string, Set<string>>();
    for (const id of nodeIds) {
        adjacency.set(id, new Set());
    }
    for (const conn of connections) {
        if (!nodeIds.has(conn.sourceNodeId) || !nodeIds.has(conn.targetNodeId)) continue;
        adjacency.get(conn.sourceNodeId)!.add(conn.targetNodeId);
        adjacency.get(conn.targetNodeId)!.add(conn.sourceNodeId);
    }

    // BFS to find connected components
    const visited = new Set<string>();
    const components: Set<string>[] = [];

    for (const id of nodeIds) {
        if (visited.has(id)) continue;

        const component = new Set<string>();
        const queue = [id];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            component.add(current);

            for (const neighbor of adjacency.get(current) ?? []) {
                if (!visited.has(neighbor)) {
                    queue.push(neighbor);
                }
            }
        }

        components.push(component);
    }

    // For each component, get nodes and connections, then topological sort
    const groups: NodeGroup[] = components.map(componentIds => {
        const groupNodes = nodes.filter(n => componentIds.has(n.id));
        const groupConnections = connections.filter(
            c => componentIds.has(c.sourceNodeId) && componentIds.has(c.targetNodeId)
        );
        const sorted = topologicalSort(groupNodes, groupConnections);

        return {
            id: sorted[0],
            nodeIds: sorted,
            isMultiNode: sorted.length > 1,
        };
    });

    // Sort groups by the min position.y of their first (root) node
    groups.sort((a, b) => {
        const aY = nodeMap.get(a.nodeIds[0])?.position?.y ?? 0;
        const bY = nodeMap.get(b.nodeIds[0])?.position?.y ?? 0;
        return aY - bY;
    });

    return groups;
};
