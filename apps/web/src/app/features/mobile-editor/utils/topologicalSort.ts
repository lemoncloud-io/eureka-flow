import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * Topological sort of nodes using Kahn's algorithm.
 * Nodes with no incoming edges come first.
 * Tiebreaker: position.y (preserves desktop vertical order).
 * Disconnected nodes are appended at the end.
 */
export const topologicalSort = (nodes: NodeData[], connections: EdgeData[]): string[] => {
    if (nodes.length === 0) return [];

    const nodeIds = new Set(nodes.map(n => n.id));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    const positionY = new Map<string, number>();

    for (const node of nodes) {
        inDegree.set(node.id, 0);
        adjacency.set(node.id, []);
        positionY.set(node.id, node.position?.y ?? 0);
    }

    for (const conn of connections) {
        if (!nodeIds.has(conn.sourceNodeId) || !nodeIds.has(conn.targetNodeId)) continue;
        adjacency.get(conn.sourceNodeId)!.push(conn.targetNodeId);
        inDegree.set(conn.targetNodeId, (inDegree.get(conn.targetNodeId) ?? 0) + 1);
    }

    // Collect nodes with zero in-degree, sorted by position.y
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id);
    }
    queue.sort((a, b) => (positionY.get(a) ?? 0) - (positionY.get(b) ?? 0));

    const result: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        result.push(nodeId);

        const neighbors = adjacency.get(nodeId) ?? [];
        const readyNeighbors: string[] = [];

        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0 && !visited.has(neighbor)) {
                readyNeighbors.push(neighbor);
            }
        }

        // Sort newly ready neighbors by position.y before adding
        readyNeighbors.sort((a, b) => (positionY.get(a) ?? 0) - (positionY.get(b) ?? 0));
        queue.push(...readyNeighbors);
    }

    // Append any remaining nodes (cycles or disconnected)
    for (const node of nodes) {
        if (!visited.has(node.id)) {
            result.push(node.id);
        }
    }

    return result;
};
