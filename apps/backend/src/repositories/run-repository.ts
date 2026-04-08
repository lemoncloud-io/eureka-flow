import { memDb } from '../adapters/aws/dynamodb';

import type { Run, RunNode } from '@flows/contracts';

type RunStatus = Run['status'];
type RunNodeStatus = RunNode['status'];

const RUNS_TABLE = 'runs';
const RUN_NODES_TABLE = 'run-nodes';

// ============================================================================
// State transition validation
// ============================================================================

const VALID_RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
    QUEUED: ['RUNNING', 'CANCELLED'],
    RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
};

const VALID_NODE_TRANSITIONS: Record<RunNodeStatus, RunNodeStatus[]> = {
    PENDING: ['RUNNING', 'CANCELLED'],
    RUNNING: ['COMPLETED', 'FAILED', 'CANCELLED'],
    COMPLETED: [],
    FAILED: ['PENDING'], // retry only
    SKIPPED: [],
    CANCELLED: [],
};

// ============================================================================
// Repository
// ============================================================================

export const runRepo = {
    // ── Run CRUD ──────────────────────────────────────────────────────────────

    async putRun(run: Run): Promise<void> {
        memDb.put(RUNS_TABLE, run.runId, run as unknown as Record<string, unknown>);
    },

    async getRun(runId: string): Promise<Run | null> {
        return (memDb.get(RUNS_TABLE, runId) as unknown as Run) ?? null;
    },

    async listByFlow(flowId: string): Promise<Run[]> {
        const all = memDb.query(
            RUNS_TABLE,
            item => (item as { flowId?: string }).flowId === flowId
        ) as unknown as Run[];
        all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
        return all;
    },

    // ── RunNode CRUD ──────────────────────────────────────────────────────────

    async putRunNode(node: RunNode): Promise<void> {
        const key = `${node.runId}#${node.nodeId}`;
        memDb.put(RUN_NODES_TABLE, key, node as unknown as Record<string, unknown>);
    },

    async getRunNode(runId: string, nodeId: string): Promise<RunNode | null> {
        const key = `${runId}#${nodeId}`;
        return (memDb.get(RUN_NODES_TABLE, key) as unknown as RunNode) ?? null;
    },

    async listRunNodes(runId: string): Promise<RunNode[]> {
        const all = memDb.query(
            RUN_NODES_TABLE,
            item => (item as { runId?: string }).runId === runId
        ) as unknown as RunNode[];
        return all;
    },

    // ── Conditional status updates ────────────────────────────────────────────

    async updateRunStatus(
        runId: string,
        newStatus: RunStatus,
        extra?: Partial<Pick<Run, 'startedAt' | 'completedAt' | 'finalOutputSummary'>>
    ): Promise<{ ok: true; run: Run } | { ok: false; error: string }> {
        const run = await this.getRun(runId);
        if (!run) return { ok: false, error: `Run ${runId} not found` };

        const allowed = VALID_RUN_TRANSITIONS[run.status];
        if (!allowed.includes(newStatus)) {
            return {
                ok: false,
                error: `Invalid transition: Run ${runId} status ${run.status} → ${newStatus}`,
            };
        }

        const updated: Run = { ...run, ...extra, status: newStatus };
        await this.putRun(updated);
        return { ok: true, run: updated };
    },

    async updateRunNodeStatus(
        runId: string,
        nodeId: string,
        newStatus: RunNodeStatus,
        extra?: Partial<
            Pick<RunNode, 'progress' | 'startedAt' | 'completedAt' | 'outputPayload' | 'errorCode' | 'errorMessage'>
        >
    ): Promise<{ ok: true; node: RunNode } | { ok: false; error: string }> {
        const node = await this.getRunNode(runId, nodeId);
        if (!node) return { ok: false, error: `RunNode ${runId}#${nodeId} not found` };

        const allowed = VALID_NODE_TRANSITIONS[node.status];
        if (!allowed.includes(newStatus)) {
            return {
                ok: false,
                error: `Invalid transition: RunNode ${nodeId} status ${node.status} → ${newStatus}`,
            };
        }

        const updated: RunNode = {
            ...node,
            ...extra,
            status: newStatus,
            updatedAt: new Date().toISOString(),
            // reset retryCount bookkeeping on retry (FAILED → PENDING)
            ...(newStatus === 'PENDING' && node.status === 'FAILED' ? { retryCount: node.retryCount + 1 } : {}),
        };
        await this.putRunNode(updated);
        return { ok: true, node: updated };
    },
};
