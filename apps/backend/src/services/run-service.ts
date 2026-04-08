import { fakeExecutor } from './fake-executor';
import { flowRepo } from '../repositories/flow-repository';
import { runRepo } from '../repositories/run-repository';
import { generateNumericId } from '../utils/id-generator';

import type { Run, RunNode } from '@flows/contracts';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse flow edges to build parentNodeIds for each node.
 * Edge format: { source: string, target: string, ... }
 */
function buildParentMap(nodeIds: string[], edges: Array<Record<string, unknown>>): Map<string, string[]> {
    const parentMap = new Map<string, string[]>(nodeIds.map(id => [id, []]));

    for (const edge of edges) {
        const source = edge['source'] as string | undefined;
        const target = edge['target'] as string | undefined;
        if (source && target && parentMap.has(target)) {
            parentMap.get(target)!.push(source);
        }
    }

    return parentMap;
}

// ============================================================================
// Run service
// ============================================================================

export const runService = {
    /**
     * Create a new run for a flow:
     * 1. Load the flow
     * 2. Build an immutable snapshot of nodes/edges
     * 3. Compute DAG parentNodeIds for each node
     * 4. Persist Run + RunNode records (all PENDING)
     * 5. Synchronously trigger the fake executor
     */
    async createRun(
        flowId: string,
        triggerSource = 'MANUAL'
    ): Promise<{ ok: true; run: Run } | { ok: false; error: string; status: number }> {
        const flow = await flowRepo.get(flowId);
        if (!flow) return { ok: false, error: `Flow ${flowId} not found`, status: 404 };

        const now = new Date().toISOString();
        const runId = generateNumericId();

        const snapshotNodes = (flow.nodes ?? []) as Array<Record<string, unknown>>;
        const snapshotEdges = (flow.edges ?? []) as Array<Record<string, unknown>>;

        // Persist the Run record (QUEUED)
        const run: Run = {
            runId,
            flowId,
            runType: 'FULL_FLOW',
            status: 'QUEUED',
            triggerSource,
            flowSnapshot: { nodes: snapshotNodes, edges: snapshotEdges },
            createdAt: now,
        };
        await runRepo.putRun(run);

        // Build DAG
        const nodeIds = snapshotNodes.map(n => (n['id'] ?? n['nodeId']) as string).filter(Boolean);
        const parentMap = buildParentMap(nodeIds, snapshotEdges);

        // Persist RunNode records
        for (const node of snapshotNodes) {
            const nodeId = (node['id'] ?? node['nodeId']) as string;
            if (!nodeId) continue;

            const runNode: RunNode = {
                runId,
                nodeId,
                blockType: (node['type'] ?? node['blockType'] ?? 'unknown') as string,
                label: ((node['data'] as Record<string, unknown>)?.['label'] as string) ?? nodeId,
                status: 'PENDING',
                progress: 0,
                retryCount: 0,
                parentNodeIds: parentMap.get(nodeId) ?? [],
                updatedAt: now,
            };
            await runRepo.putRunNode(runNode);
        }

        // Fire fake executor synchronously
        await fakeExecutor.executeRun(runId);

        // Return the latest run state
        const latest = await runRepo.getRun(runId);
        return { ok: true, run: latest ?? run };
    },

    /**
     * Cancel a run:
     * - Only QUEUED or RUNNING runs can be cancelled
     * - All PENDING/RUNNING nodes are set to CANCELLED
     */
    async cancelRun(runId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
        const run = await runRepo.getRun(runId);
        if (!run) return { ok: false, error: `Run ${runId} not found`, status: 404 };

        if (run.status !== 'QUEUED' && run.status !== 'RUNNING') {
            return { ok: false, error: `Run is already ${run.status}`, status: 409 };
        }

        // Cancel all active nodes first
        const nodes = await runRepo.listRunNodes(runId);
        for (const node of nodes) {
            if (node.status === 'PENDING' || node.status === 'RUNNING') {
                await runRepo.updateRunNodeStatus(runId, node.nodeId, 'CANCELLED');
            }
        }

        // Cancel the run
        await runRepo.updateRunStatus(runId, 'CANCELLED');
        return { ok: true };
    },

    /**
     * Retry a failed node:
     * - Only FAILED nodes can be retried
     * - Reset to PENDING (retryCount incremented in repo)
     * - Re-execute via fake executor
     */
    async retryNode(
        runId: string,
        nodeId: string,
        _reason?: string
    ): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
        const node = await runRepo.getRunNode(runId, nodeId);
        if (!node) return { ok: false, error: `RunNode ${runId}#${nodeId} not found`, status: 404 };

        if (node.status !== 'FAILED') {
            return { ok: false, error: `Node is ${node.status}, only FAILED nodes can be retried`, status: 409 };
        }

        // FAILED → PENDING (retryCount incremented inside updateRunNodeStatus)
        const result = await runRepo.updateRunNodeStatus(runId, nodeId, 'PENDING');
        if (!result.ok) return { ok: false, error: result.error, status: 409 };

        // Re-execute the node
        await fakeExecutor.executeNode(runId, nodeId);
        return { ok: true };
    },
};
