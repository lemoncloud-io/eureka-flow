import { connectionRepo } from '../../repositories/connection-repository';
import { log } from '../../utils/logger';

import type { APIGatewayProxyResult } from 'aws-lambda';

/**
 * WebSocket $disconnect handler.
 * Removes the connection record from the store.
 */
export const main = async (event: { requestContext: { connectionId: string } }): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;

    try {
        await connectionRepo.delete(connectionId);
        log.info(`WS $disconnect: ${connectionId}`);
    } catch (err) {
        log.error(`WS $disconnect: failed to remove connection ${connectionId}`, err);
    }

    return { statusCode: 200, body: 'Disconnected' };
};
