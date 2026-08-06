import type { EdgeData } from '@lemoncloud/eureka-flows-api';

/**
 * Pure, DOM-free edge-validation rules — the single source of truth shared by the headless edge tools
 * (`edgeTools.ts`) and the React canvas (`apps/web` re-exports these from `@flows/agent`, so there
 * is one implementation, not two that can drift). Mirrors `moveSemantics.ts`: no imports beyond a type.
 */

/**
 * Are two port data-types compatible for a connection? `any` (or an absent type) on either side is a
 * wildcard; otherwise a case-insensitive equality. Matches the interactive canvas's rule.
 */
export const arePortTypesCompatible = (sourceType: string | undefined, targetType: string | undefined): boolean => {
    const source = sourceType ?? 'any';
    const target = targetType ?? 'any';
    if (source === 'any' || target === 'any') {
        return true;
    }
    return source.toLowerCase() === target.toLowerCase();
};

/**
 * Would adding `sourceNodeId → targetNodeId` close a cycle in `edges`? A self-loop is always a cycle;
 * otherwise DFS from the target and report whether the source is reachable through existing edges (so the
 * new edge would complete a loop). O(n + m).
 */
export const wouldCreateCycle = (edges: EdgeData[], sourceNodeId: string, targetNodeId: string): boolean => {
    if (sourceNodeId === targetNodeId) {
        return true;
    }
    // Adjacency: source → [targets].
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
        const neighbors = adjacency.get(edge.sourceNodeId);
        if (neighbors) {
            neighbors.push(edge.targetNodeId);
        } else {
            adjacency.set(edge.sourceNodeId, [edge.targetNodeId]);
        }
    }
    const visited = new Set<string>();
    const stack: string[] = [targetNodeId];
    while (stack.length > 0) {
        const node = stack.pop();
        if (node === undefined) {
            break;
        }
        if (node === sourceNodeId) {
            return true;
        }
        if (visited.has(node)) {
            continue;
        }
        visited.add(node);
        const neighbors = adjacency.get(node);
        if (neighbors) {
            stack.push(...neighbors);
        }
    }
    return false;
};
