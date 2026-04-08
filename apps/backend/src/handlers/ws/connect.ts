import { connectionRepo } from '../../repositories/connection-repository';
import { log } from '../../utils/logger';

import type { APIGatewayProxyResult } from 'aws-lambda';

/**
 * WebSocket $connect handler.
 * Stores connectionId + subscribed channels (flowIds) in the connections store.
 * Query params: ?x-api-key=...&channels=flowId1,flowId2
 */
export const main = async (event: {
    requestContext: { connectionId: string };
    queryStringParameters?: Record<string, string>;
}): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;
    const channelsParam = event.queryStringParameters?.channels ?? '';
    const channels = channelsParam
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

    // Use the first channel as the primary flowId (or empty string if none)
    const flowId = channels[0] ?? '';

    const now = new Date().toISOString();
    const ttlSeconds = 24 * 60 * 60; // 24 hours
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;

    try {
        await connectionRepo.put({ connectionId, flowId, channels, connectedAt: now, ttl });
        log.info(`WS $connect: ${connectionId}, channels: ${channels.join(',')}`);
    } catch (err) {
        log.error(`WS $connect: failed to store connection ${connectionId}`, err);
        // Still return 200 — API Gateway requires it
    }

    return { statusCode: 200, body: 'Connected' };
};
