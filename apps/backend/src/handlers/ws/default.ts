import { initWsClient, postToConnection } from '../../adapters/aws/websocket-api';
import { log } from '../../utils/logger';

import type { APIGatewayProxyResult } from 'aws-lambda';

/**
 * WebSocket $default handler.
 * Handles ping messages and responds with pong.
 */
export const main = async (event: {
    requestContext: { connectionId: string; domainName?: string; stage?: string };
    body?: string;
}): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;

    // Initialize the WS client from the event context
    if (event.requestContext.domainName && event.requestContext.stage) {
        const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
        initWsClient(endpoint);
    }

    let parsed: unknown;
    try {
        parsed = event.body ? JSON.parse(event.body) : {};
    } catch {
        parsed = {};
    }

    const action = (parsed as Record<string, unknown>)?.action;

    if (action === 'ping') {
        log.info(`WS ping from ${connectionId}`);
        try {
            await postToConnection(connectionId, {
                action: 'pong',
                ts: new Date().toISOString(),
            });
        } catch (err) {
            log.warn(`WS pong failed for ${connectionId}`, err);
        }
    }

    return { statusCode: 200, body: '' };
};
