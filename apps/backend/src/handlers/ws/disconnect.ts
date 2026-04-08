import { log } from '../../utils/logger';

import type { APIGatewayProxyResult } from 'aws-lambda';

export const main = async (event: { requestContext: { connectionId: string } }): Promise<APIGatewayProxyResult> => {
    log.info(`WS $disconnect: ${event.requestContext.connectionId}`);
    // TODO: Remove from ConnectionsTable
    return { statusCode: 200, body: 'Disconnected' };
};
