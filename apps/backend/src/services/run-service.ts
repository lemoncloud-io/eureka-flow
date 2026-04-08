import { queue } from '../adapters/aws/queue';
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
     * 4. Persist Run (QUEUED) + RunNode records (all PENDING)
     * 5. Send EXECUTE_RUN queue message (async; local mode runs inline)
     * 6. Return the latest run state (COMPLETED in local, QUEUED in prod)
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

        // Persist RunNode records (all PENDING)
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

        // Enqueue execution — local mode runs inline (sync), prod sends to SQS
        await queue.send({
            type: 'EXECUTE_RUN',
            runId,
            executionId: generateNumericId(),
            timestamp: now,
        });

        // Return the latest run state (COMPLETED in local after inline execution)
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
     * 1. FAILED → PENDING (retryCount incremented in repo)
     * 2. If run was FAILED, transition back to RUNNING
     * 3. Send EXECUTE_NODE queue message
     * 4. Return latest state
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

        // If run is FAILED, bring it back to RUNNING so execution can continue
        const run = await runRepo.getRun(runId);
        if (run?.status === 'FAILED') {
            const runResult = await runRepo.updateRunStatus(runId, 'RUNNING', {
                startedAt: run.startedAt ?? new Date().toISOString(),
            });
            if (!runResult.ok) {
                console.warn(`[run-service] retryNode: could not set run back to RUNNING — ${runResult.error}`);
            }
        }

        // Enqueue single-node execution
        await queue.send({
            type: 'EXECUTE_NODE',
            runId,
            nodeId,
            executionId: generateNumericId(),
            timestamp: new Date().toISOString(),
        });

        // After inline execution (local mode), check if all nodes are now done
        const allNodes = await runRepo.listRunNodes(runId);
        const allDone = allNodes.every(
            n => n.status === 'COMPLETED' || n.status === 'SKIPPED' || n.status === 'CANCELLED'
        );
        const anyFailed = allNodes.some(n => n.status === 'FAILED');

        const latestRun = await runRepo.getRun(runId);
        if (latestRun?.status === 'RUNNING') {
            if (anyFailed) {
                await runRepo.updateRunStatus(runId, 'FAILED', {
                    finalOutputSummary: { retriedNodeId: nodeId, outcome: 'still-failed' },
                });
            } else if (allDone) {
                await runRepo.updateRunStatus(runId, 'COMPLETED', {
                    completedAt: new Date().toISOString(),
                });
            }
        }

        return { ok: true };
    },
};
