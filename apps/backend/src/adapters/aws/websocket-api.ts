import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

import { log } from '../../utils/logger';

let wsClient: ApiGatewayManagementApiClient | null = null;

export const initWsClient = (endpoint: string) => {
    wsClient = new ApiGatewayManagementApiClient({ endpoint });
};

export const postToConnection = async (connectionId: string, data: unknown): Promise<boolean> => {
    if (!wsClient) {
        log.warn('WebSocket client not initialized');
        return false;
    }
    try {
        await wsClient.send(
            new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: Buffer.from(JSON.stringify(data)),
            })
        );
        return true;
    } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 410) {
            log.info(`Stale connection: ${connectionId}`);
            return false; // connection gone — caller should clean up
        }
        log.error(`Failed to post to ${connectionId}`, err);
        return false;
    }
};
