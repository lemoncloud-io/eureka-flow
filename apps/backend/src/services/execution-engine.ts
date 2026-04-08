import { blockExecutor } from './block-executor';
import { traceService } from './trace-service';
import { wsService } from './websocket-service';
import { runRepo } from '../repositories/run-repository';

/**
 * Execution engine — handles async run/node execution.
 * Replaces fake-executor with proper idempotency + cancel propagation.
 *
 * Called by the queue adapter (local: inline; prod: Lambda/SQS worker).
 */

// ============================================================================
// Topological sort (Kahn's algorithm) — waves of parallel-executable nodes
// ============================================================================

export function computeWaves(nodes: { nodeId: string; parentNodeIds: string[] }[]): string[][] {
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
// Execution engine
// ============================================================================

export const executionEngine = {
    /**
     * Handle EXECUTE_RUN queue message.
     *
     * Idempotency: if run is already RUNNING/COMPLETED/FAILED/CANCELLED, skip.
     * Flow:
     *   1. QUEUED → RUNNING (conditional; bail if fails)
     *   2. Compute waves from topological sort
     *   3. Execute wave by wave — check cancel between each wave
     *   4. If any node FAILED: mark remaining PENDING as SKIPPED, run → FAILED
     *   5. After all waves pass: run → COMPLETED
     */
    async handleRunExecution(runId: string, _executionId: string): Promise<void> {
        const run = await runRepo.getRun(runId);
        if (!run) {
            console.warn(`[execution-engine] handleRunExecution: run ${runId} not found — skipping`);
            return;
        }

        // Idempotency: only start from QUEUED
        if (run.status !== 'QUEUED') {
            console.info(
                `[execution-engine] handleRunExecution: run ${runId} already ${run.status} — skipping (idempotent)`
            );
            return;
        }

        // QUEUED → RUNNING
        const startResult = await runRepo.updateRunStatus(runId, 'RUNNING', {
            startedAt: new Date().toISOString(),
        });
        if (!startResult.ok) {
            console.warn(`[execution-engine] handleRunExecution: transition failed — ${startResult.error}`);
            return;
        }

        // Broadcast run.started + record trace
        try {
            await wsService.broadcastToFlow(run.flowId, {
                type: 'run.started',
                runId,
                flowId: run.flowId,
                status: 'RUNNING',
                timestamp: Date.now(),
            });
        } catch {
            /* non-fatal */
        }
        try {
            await traceService.record(runId, null, 'STATUS', 'Run started');
        } catch {
            /* non-fatal */
        }

        const allNodes = await runRepo.listRunNodes(runId);
        const waves = computeWaves(allNodes.map(n => ({ nodeId: n.nodeId, parentNodeIds: n.parentNodeIds })));

        let hasFailed = false;

        for (const wave of waves) {
            // Check cancellation before each wave
            const currentRun = await runRepo.getRun(runId);
            if (currentRun?.status === 'CANCELLED') {
                console.info(`[execution-engine] run ${runId} cancelled — stopping before wave`);
                return;
            }

            // Execute all nodes in this wave (serially in local mode; parallel in prod via separate messages)
            for (const nodeId of wave) {
                const nodeCheck = await runRepo.getRunNode(runId, nodeId);
                if (!nodeCheck || nodeCheck.status === 'CANCELLED') continue;

                await this.handleNodeExecution(runId, nodeId, _executionId);

                // Check if this node failed
                const nodeAfter = await runRepo.getRunNode(runId, nodeId);
                if (nodeAfter?.status === 'FAILED') {
                    hasFailed = true;
                }
            }

            if (hasFailed) break;
        }

        // Re-check cancellation
        const finalRun = await runRepo.getRun(runId);
        if (finalRun?.status === 'CANCELLED') return;

        if (hasFailed) {
            // Mark all remaining PENDING nodes as SKIPPED
            const remainingNodes = await runRepo.listRunNodes(runId);
            for (const node of remainingNodes) {
                if (node.status === 'PENDING') {
                    // PENDING → SKIPPED: not a defined transition, so we do a direct put
                    await runRepo.putRunNode({
                        ...node,
                        status: 'SKIPPED',
                        updatedAt: new Date().toISOString(),
                    });
                }
            }

            const failedNode = (await runRepo.listRunNodes(runId)).find(n => n.status === 'FAILED');
            const failedNodeId = failedNode?.nodeId ?? 'unknown';
            await runRepo.updateRunStatus(runId, 'FAILED', {
                finalOutputSummary: {
                    failedNodeId,
                    failedAt: new Date().toISOString(),
                },
            });

            // Broadcast run.failed + record trace
            try {
                await wsService.broadcastToFlow(run.flowId, {
                    type: 'run.failed',
                    runId,
                    flowId: run.flowId,
                    status: 'FAILED',
                    failedNodeId,
                    timestamp: Date.now(),
                });
            } catch {
                /* non-fatal */
            }
            try {
                await traceService.record(runId, null, 'STATUS', `Run failed at node ${failedNodeId}`);
            } catch {
                /* non-fatal */
            }
            return;
        }

        await runRepo.updateRunStatus(runId, 'COMPLETED', {
            completedAt: new Date().toISOString(),
        });

        // Broadcast run.completed + record trace
        try {
            await wsService.broadcastToFlow(run.flowId, {
                type: 'run.completed',
                runId,
                flowId: run.flowId,
                status: 'COMPLETED',
                timestamp: Date.now(),
            });
        } catch {
            /* non-fatal */
        }
        try {
            await traceService.record(runId, null, 'STATUS', 'Run completed');
        } catch {
            /* non-fatal */
        }
    },

    /**
     * Handle EXECUTE_NODE queue message.
     *
     * Idempotency: if node is already RUNNING/COMPLETED/FAILED/CANCELLED/SKIPPED, skip.
     * Flow:
     *   1. PENDING → RUNNING (conditional; bail if fails)
     *   2. Execute block logic (fake for now)
     *   3. RUNNING → COMPLETED with outputPayload
     *   4. On error: RUNNING → FAILED with errorCode/errorMessage
     */
    async handleNodeExecution(runId: string, nodeId: string, _executionId: string): Promise<void> {
        const node = await runRepo.getRunNode(runId, nodeId);
        if (!node) {
            console.warn(`[execution-engine] handleNodeExecution: node ${runId}#${nodeId} not found — skipping`);
            return;
        }

        // Idempotency: only execute PENDING nodes
        if (node.status !== 'PENDING') {
            console.info(
                `[execution-engine] handleNodeExecution: node ${nodeId} already ${node.status} — skipping (idempotent)`
            );
            return;
        }

        // PENDING → RUNNING
        const startResult = await runRepo.updateRunNodeStatus(runId, nodeId, 'RUNNING', {
            startedAt: new Date().toISOString(),
            progress: 0,
        });
        if (!startResult.ok) {
            console.warn(`[execution-engine] handleNodeExecution: transition failed — ${startResult.error}`);
            return;
        }

        // Broadcast node.started + record trace
        const runForNode = await runRepo.getRun(runId);
        if (runForNode) {
            try {
                await wsService.broadcastToFlow(runForNode.flowId, {
                    type: 'node.started',
                    runId,
                    nodeId,
                    status: 'RUNNING',
                    timestamp: Date.now(),
                });
            } catch {
                /* non-fatal */
            }
        }
        try {
            await traceService.record(runId, nodeId, 'STATUS', `Node ${nodeId} started`);
        } catch {
            /* non-fatal */
        }

        try {
            const { output, durationMs } = await blockExecutor.execute(node.blockType, node.inputPayload ?? null);

            await runRepo.updateRunNodeStatus(runId, nodeId, 'COMPLETED', {
                completedAt: new Date().toISOString(),
                progress: 100,
                outputPayload: { ...output, durationMs },
            });

            // Broadcast node.completed + record trace
            if (runForNode) {
                try {
                    await wsService.broadcastToFlow(runForNode.flowId, {
                        type: 'node.completed',
                        runId,
                        nodeId,
                        status: 'COMPLETED',
                        timestamp: Date.now(),
                    });
                } catch {
                    /* non-fatal */
                }
            }
            try {
                await traceService.record(runId, nodeId, 'STATUS', `Node ${nodeId} completed`);
            } catch {
                /* non-fatal */
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`[execution-engine] node ${nodeId} failed:`, errorMessage);

            await runRepo.updateRunNodeStatus(runId, nodeId, 'FAILED', {
                errorCode: 'EXECUTION_ERROR',
                errorMessage,
            });

            // Broadcast node.failed + record trace
            if (runForNode) {
                try {
                    await wsService.broadcastToFlow(runForNode.flowId, {
                        type: 'node.failed',
                        runId,
                        nodeId,
                        status: 'FAILED',
                        errorCode: 'EXECUTION_ERROR',
                        errorMessage,
                        timestamp: Date.now(),
                    });
                } catch {
                    /* non-fatal */
                }
            }
            try {
                await traceService.record(runId, nodeId, 'ERROR', `Node ${nodeId} failed: ${errorMessage}`);
            } catch {
                /* non-fatal */
            }
        }
    },
};
