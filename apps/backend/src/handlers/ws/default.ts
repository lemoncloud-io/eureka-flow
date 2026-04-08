import { log } from '../../utils/logger';

import type { APIGatewayProxyResult } from 'aws-lambda';

export const main = async (event: {
    requestContext: { connectionId: string };
    body?: string;
}): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId;
    let parsed: unknown;
    try {
        parsed = event.body ? JSON.parse(event.body) : {};
    } catch {
        parsed = {};
    }

    const action = (parsed as Record<string, unknown>)?.action;

    if (action === 'ping') {
        log.info(`WS ping from ${connectionId}`);
        // TODO: Post pong back via API Gateway Management API
    }

    return { statusCode: 200, body: '' };
};
