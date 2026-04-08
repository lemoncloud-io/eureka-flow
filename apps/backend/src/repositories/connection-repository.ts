import { memDb } from '../adapters/aws/dynamodb';

const TABLE = 'connections';

export interface Connection {
    connectionId: string;
    flowId: string;
    channels: string[];
    connectedAt: string;
    ttl: number;
}

export const connectionRepo = {
    async put(conn: Connection): Promise<void> {
        memDb.put(TABLE, conn.connectionId, conn as unknown as Record<string, unknown>);
    },

    async delete(connectionId: string): Promise<void> {
        memDb.delete(TABLE, connectionId);
    },

    async listByChannel(channel: string): Promise<Connection[]> {
        return memDb.query(TABLE, item => {
            const channels = (item as { channels?: string[] }).channels;
            return Array.isArray(channels) && channels.includes(channel);
        }) as unknown as Connection[];
    },

    async listAll(): Promise<Connection[]> {
        return memDb.scan(TABLE) as unknown as Connection[];
    },
};
