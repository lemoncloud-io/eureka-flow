import { randomUUID } from 'crypto';

import { traceRepo } from '../repositories/trace-repository';
import { log } from '../utils/logger';

import type { Trace } from '@flows/contracts';

/**
 * Trace recording service.
 * Records execution-level debug data per run/node.
 * Failures are logged but never propagated to callers.
 */
export const traceService = {
    async record(
        runId: string,
        nodeId: string | null,
        traceType: Trace['traceType'],
        message: string,
        data?: unknown
    ): Promise<void> {
        try {
            const trace: Trace = {
                traceId: randomUUID(),
                runId,
                runNodeId: nodeId ?? undefined,
                traceType,
                message,
                data: data !== undefined ? (data as Record<string, unknown>) : undefined,
                occurredAt: new Date().toISOString(),
            };
            await traceRepo.put(trace);
        } catch (err) {
            log.warn('[trace-service] Failed to record trace (non-fatal)', err);
        }
    },
};
