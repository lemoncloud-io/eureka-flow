import { postToConnection } from '../adapters/aws/websocket-api';
import { connectionRepo } from '../repositories/connection-repository';
import { log } from '../utils/logger';

/**
 * WebSocket broadcast service.
 * Sends events to all connections subscribed to a flow's channel.
 * IMPORTANT: Failures must never throw or break the caller.
 */
export const wsService = {
    async broadcastToFlow(flowId: string, event: unknown): Promise<void> {
        try {
            const connections = await connectionRepo.listByChannel(flowId);
            for (const conn of connections) {
                try {
                    const success = await postToConnection(conn.connectionId, {
                        action: 'message',
                        data: event,
                        channel: flowId,
                        ts: new Date().toISOString(),
                    });
                    if (!success) {
                        // Stale connection — clean up silently
                        try {
                            await connectionRepo.delete(conn.connectionId);
                        } catch (cleanupErr) {
                            log.warn(`[ws-service] Failed to clean stale connection ${conn.connectionId}`, cleanupErr);
                        }
                    }
                } catch (sendErr) {
                    log.warn(`[ws-service] Failed to send to connection ${conn.connectionId}`, sendErr);
                }
            }
        } catch (err) {
            log.warn('[ws-service] broadcastToFlow error (non-fatal)', err);
        }
    },
};
