import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

import { TableNames, USE_REAL_DYNAMO, getDocClient, memDb } from '../adapters/aws/dynamodb';
import { generateNumericId } from '../utils/id-generator';

export interface FlowRecord {
    id: string;
    name?: string;
    state?: string;
    stereo?: string;
    description?: string;
    nodes: unknown[];
    edges: unknown[];
    channelId?: string;
    createdAt: string;
    updatedAt: string;
}

const TABLE = TableNames.flows;

// ============================================================================
// Repository — auto-selects DynamoDB or in-memory based on environment
// ============================================================================

export const flowRepo = {
    async get(id: string): Promise<FlowRecord | null> {
        if (!USE_REAL_DYNAMO) {
            return (memDb.get(TABLE, id) as FlowRecord) ?? null;
        }
        const result = await getDocClient().send(new GetCommand({ TableName: TABLE, Key: { id } }));
        return (result.Item as FlowRecord) ?? null;
    },

    async put(record: FlowRecord): Promise<void> {
        if (!USE_REAL_DYNAMO) {
            memDb.put(TABLE, record.id, record as unknown as Record<string, unknown>);
            return;
        }
        await getDocClient().send(new PutCommand({ TableName: TABLE, Item: record }));
    },

    async scan(): Promise<FlowRecord[]> {
        if (!USE_REAL_DYNAMO) {
            return memDb.scan(TABLE) as FlowRecord[];
        }
        const result = await getDocClient().send(new ScanCommand({ TableName: TABLE }));
        return (result.Items || []) as FlowRecord[];
    },

    async save(id: string, nodes: unknown[], edges: unknown[]): Promise<FlowRecord> {
        const now = new Date().toISOString();

        if (id === '0') {
            // Create new flow
            const record: FlowRecord = {
                id: generateNumericId(),
                name: 'Untitled Flow',
                state: 'draft',
                nodes,
                edges,
                channelId: generateNumericId(),
                createdAt: now,
                updatedAt: now,
            };
            await this.put(record);
            return record;
        }

        // Update existing or create with given id
        const existing = await this.get(id);
        const record: FlowRecord = {
            id,
            name: existing?.name ?? 'Untitled Flow',
            state: existing?.state ?? 'draft',
            stereo: existing?.stereo,
            description: existing?.description,
            nodes,
            edges,
            channelId: existing?.channelId ?? generateNumericId(),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        await this.put(record);
        return record;
    },

    async updateMeta(id: string, fields: { name?: string }): Promise<FlowRecord | null> {
        const existing = await this.get(id);
        if (!existing) return null;

        const updated: FlowRecord = {
            ...existing,
            ...fields,
            updatedAt: new Date().toISOString(),
        };
        await this.put(updated);
        return updated;
    },
};
