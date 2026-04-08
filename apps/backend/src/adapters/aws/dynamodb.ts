import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const STAGE = process.env.STAGE || 'local';
const USE_REAL_DYNAMO = !!process.env.DYNAMODB_ENDPOINT || STAGE !== 'local';

// ============================================================================
// Real DynamoDB client (for dev/prod or when DYNAMODB_ENDPOINT is set)
// ============================================================================

let _docClient: DynamoDBDocumentClient | null = null;

export const getDocClient = (): DynamoDBDocumentClient => {
    if (!_docClient) {
        const client = new DynamoDBClient({
            region: process.env.AWS_REGION || 'ap-northeast-2',
            ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}),
        });
        _docClient = DynamoDBDocumentClient.from(client, {
            marshallOptions: { removeUndefinedValues: true },
        });
    }
    return _docClient;
};

// ============================================================================
// File-based store (for local dev without Docker/DynamoDB Local)
// serverless-offline runs each handler in a separate invocation,
// so in-memory Maps don't persist between calls. File-based does.
// ============================================================================

const DATA_DIR = join(process.cwd(), '.local-db');

const ensureDir = () => {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
};

const tablePath = (tableName: string) => join(DATA_DIR, `${tableName}.json`);

const readTable = (tableName: string): Record<string, Record<string, unknown>> => {
    ensureDir();
    const p = tablePath(tableName);
    if (!existsSync(p)) return {};
    try {
        return JSON.parse(readFileSync(p, 'utf-8'));
    } catch {
        return {};
    }
};

const writeTable = (tableName: string, data: Record<string, Record<string, unknown>>) => {
    ensureDir();
    writeFileSync(tablePath(tableName), JSON.stringify(data, null, 2));
};

export const memDb = {
    get(tableName: string, key: string): Record<string, unknown> | undefined {
        return readTable(tableName)[key];
    },

    put(tableName: string, key: string, item: Record<string, unknown>): void {
        const data = readTable(tableName);
        data[key] = item;
        writeTable(tableName, data);
    },

    delete(tableName: string, key: string): void {
        const data = readTable(tableName);
        delete data[key];
        writeTable(tableName, data);
    },

    scan(tableName: string): Record<string, unknown>[] {
        return Object.values(readTable(tableName));
    },

    query(tableName: string, filterFn: (item: Record<string, unknown>) => boolean): Record<string, unknown>[] {
        return this.scan(tableName).filter(filterFn);
    },
};

// ============================================================================
// Table names
// ============================================================================

export const TableNames = {
    flows: process.env.FLOWS_TABLE || 'eureka-flows-backend-flows-local',
    connections: process.env.CONNECTIONS_TABLE || 'eureka-flows-backend-connections-local',
} as const;

export { USE_REAL_DYNAMO };
