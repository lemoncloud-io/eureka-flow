import { memDb } from '../adapters/aws/dynamodb';

import type { Trace } from '@flows/contracts';

const TABLE = 'traces';

export const traceRepo = {
    async put(trace: Trace): Promise<void> {
        memDb.put(TABLE, trace.traceId, trace as unknown as Record<string, unknown>);
    },

    async listByRun(runId: string): Promise<Trace[]> {
        const all = memDb.query(TABLE, item => (item as { runId?: string }).runId === runId) as unknown as Trace[];
        all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        return all;
    },

    async listByRunNode(runId: string, nodeId: string): Promise<Trace[]> {
        const all = memDb.query(
            TABLE,
            item =>
                (item as { runId?: string }).runId === runId && (item as { runNodeId?: string }).runNodeId === nodeId
        ) as unknown as Trace[];
        all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        return all;
    },
};
