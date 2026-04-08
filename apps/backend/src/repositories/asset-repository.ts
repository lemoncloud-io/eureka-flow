import { memDb } from '../adapters/aws/dynamodb';

import type { Asset } from '@flows/contracts';

const TABLE = 'assets';

export const assetRepo = {
    async put(asset: Asset): Promise<void> {
        memDb.put(TABLE, asset.assetId, asset as unknown as Record<string, unknown>);
    },

    async get(assetId: string): Promise<Asset | null> {
        return (memDb.get(TABLE, assetId) as unknown as Asset) ?? null;
    },

    async listByRun(runId: string): Promise<Asset[]> {
        const all = memDb.query(TABLE, item => (item as { runId?: string }).runId === runId) as unknown as Asset[];
        all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return all;
    },
};
