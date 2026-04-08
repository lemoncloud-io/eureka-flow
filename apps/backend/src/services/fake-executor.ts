import { runRepo } from '../repositories/run-repository';

/**
 * Fake executor — simulates flow execution without real API calls.
 * Computes topological order from parentNodeIds and steps through nodes
 * synchronously, marking each RUNNING → COMPLETED.
 */

// ============================================================================
// Topological sort (Kahn's algorithm)
// ============================================================================

function topologicalSort(nodes: { nodeId: string; parentNodeIds: string[] }[]): string[][] {
    // Returns waves (levels) of nodeIds that can run in parallel
    const inDegree = new Map<string, number>();
    const children = new Map<string, string[]>();
    const nodeIds = new Set(nodes.map(n => n.nodeId));

    for (const node of nodes) {
        if (!inDegree.has(node.nodeId)) inDegree.set(node.nodeId, 0);
        if (!children.has(node.nodeId)) children.set(node.nodeId, []);

        for (const parentId of node.parentNodeIds) {
            if (!nodeIds.has(parentId)) continue; // ignore missing parents
            inDegree.set(node.nodeId, (inDegree.get(node.nodeId) ?? 0) + 1);
            if (!children.has(parentId)) children.set(parentId, []);
            children.get(parentId)!.push(node.nodeId);
        }
    }

    const waves: string[][] = [];
    let queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);

    while (queue.length > 0) {
        waves.push(queue);
        const nextQueue: string[] = [];
        for (const id of queue) {
            for (const childId of children.get(id) ?? []) {
                const newDeg = (inDegree.get(childId) ?? 0) - 1;
                inDegree.set(childId, newDeg);
                if (newDeg === 0) nextQueue.push(childId);
            }
        }
        queue = nextQueue;
    }

    return waves;
}

// ============================================================================
// Fake executor
// ============================================================================

export const fakeExecutor = {
    /**
     * Execute a single node: PENDING/RUNNING state gate then mark COMPLETED.
     */
    async executeNode(runId: string, nodeId: string): Promise<void> {
        const now = new Date().toISOString();

        await runRepo.updateRunNodeStatus(runId, nodeId, 'RUNNING', {
            startedAt: now,
            progress: 0,
        });

        // No artificial delay — synchronous fake execution
        await runRepo.updateRunNodeStatus(runId, nodeId, 'COMPLETED', {
            completedAt: new Date().toISOString(),
            progress: 100,
        });
    },

    /**
     * Execute an entire run:
     * 1. Set run RUNNING
     * 2. Topological sort by parentNodeIds
     * 3. Execute wave-by-wave, stop if CANCELLED
     * 4. Set run COMPLETED (or CANCELLED if interrupted)
     */
    async executeRun(runId: string): Promise<void> {
        const now = new Date().toISOString();

        const runResult = await runRepo.updateRunStatus(runId, 'RUNNING', { startedAt: now });
        if (!runResult.ok) return; // already cancelled or invalid

        const allNodes = await runRepo.listRunNodes(runId);
        const waves = topologicalSort(allNodes.map(n => ({ nodeId: n.nodeId, parentNodeIds: n.parentNodeIds })));

        for (const wave of waves) {
            for (const nodeId of wave) {
                // Check if run was cancelled between waves
                const run = await runRepo.getRun(runId);
                if (run?.status === 'CANCELLED') return;

                const node = await runRepo.getRunNode(runId, nodeId);
                if (!node || node.status === 'CANCELLED') continue;

                await this.executeNode(runId, nodeId);
            }
        }

        // Verify run wasn't cancelled during last wave
        const finalRun = await runRepo.getRun(runId);
        if (finalRun?.status === 'CANCELLED') return;

        await runRepo.updateRunStatus(runId, 'COMPLETED', {
            completedAt: new Date().toISOString(),
        });
    },
};
