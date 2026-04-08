import { log } from '../../utils/logger';

import type { APIGatewayProxyResult } from 'aws-lambda';

/**
 * WebSocket $connect handler.
 * Stores connectionId + subscribed channels in ConnectionsTable.
 * TODO: Implement in Phase 3C.
 */
export const main = async (event: {
    requestContext: { connectionId: string };
    queryStringParameters?: Record<string, string>;
}): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;
    const channels = event.queryStringParameters?.channels || '';
    log.info(`WS $connect: ${connectionId}, channels: ${channels}`);

    // TODO: Store in ConnectionsTable
    return { statusCode: 200, body: 'Connected' };
};
