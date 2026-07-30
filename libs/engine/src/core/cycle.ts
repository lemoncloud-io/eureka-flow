import type { EdgeData } from '@lemoncloud/eureka-flows-api';

/**
 * Check if adding a new connection would create a cycle in the workflow graph.
 *
 * Algorithm: DFS from target node to check if source node is reachable.
 * If target can reach source through existing connections, adding source → target
 * would create a cycle.
 *
 * Time Complexity: O(n + m) where n = nodes, m = edges
 * Space Complexity: O(n) for visited set and adjacency list
 *
 * @param connections - Current connections in the workflow
 * @param newSourceNodeId - Source node of the proposed new connection
 * @param newTargetNodeId - Target node of the proposed new connection
 * @returns true if adding this connection would create a cycle
 *
 * @example
 * // A → B exists, checking if B → A would create cycle
 * wouldCreateCycle([{ sourceNodeId: 'A', targetNodeId: 'B' }], 'B', 'A') // true
 *
 * @example
 * // A → B → C exists, checking if C → A would create cycle
 * wouldCreateCycle([
 *   { sourceNodeId: 'A', targetNodeId: 'B' },
 *   { sourceNodeId: 'B', targetNodeId: 'C' }
 * ], 'C', 'A') // true
 */
export const wouldCreateCycle = (
    connections: EdgeData[],
    newSourceNodeId: string,
    newTargetNodeId: string
): boolean => {
    // Self-loop is always a cycle
    if (newSourceNodeId === newTargetNodeId) return true;

    // Build adjacency list (source → [targets])
    const adjacencyList = new Map<string, string[]>();
    for (const conn of connections) {
        const neighbors = adjacencyList.get(conn.sourceNodeId);
        if (neighbors) {
            neighbors.push(conn.targetNodeId);
        } else {
            adjacencyList.set(conn.sourceNodeId, [conn.targetNodeId]);
        }
    }

    // DFS: Check if we can reach source from target through existing connections
    // If yes, adding source → target would complete a cycle
    const visited = new Set<string>();
    const stack = [newTargetNodeId];

    while (stack.length > 0) {
        const node = stack.pop();
        if (node === undefined) break;

        // Found a path from target back to source - cycle detected!
        if (node === newSourceNodeId) return true;

        // Skip already visited nodes
        if (visited.has(node)) continue;
        visited.add(node);

        // Add all neighbors to stack
        const neighbors = adjacencyList.get(node);
        if (neighbors) {
            stack.push(...neighbors);
        }
    }

    return false;
};
