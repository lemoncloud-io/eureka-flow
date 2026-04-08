import { memDb } from '../adapters/aws/dynamodb';

import type { ApiKeyProvider } from '@flows/contracts';

/**
 * Settings repository — persists API key records per provider.
 * Table: 'settings', keyed by provider name.
 *
 * Record shape is intentionally opaque to callers — raw key is NEVER returned.
 * For local dev: encryptedKey == raw key (no real encryption).
 * For prod: swap encryptedKey with KMS/Secrets Manager at this layer.
 */

const TABLE = 'settings';

export interface SettingsRecord {
    provider: ApiKeyProvider;
    encryptedKey: string; // abstraction point — swap with KMS in prod
    maskedKey: string;
    status: 'active' | 'invalid' | 'unverified';
    lastVerifiedAt: string | null;
    updatedAt: string;
}

export const settingsRepo = {
    getKey(provider: ApiKeyProvider): SettingsRecord | null {
        return (memDb.get(TABLE, provider) as unknown as SettingsRecord) ?? null;
    },

    putKey(provider: ApiKeyProvider, encryptedKey: string, maskedKey: string): void {
        const now = new Date().toISOString();
        const existing = settingsRepo.getKey(provider);
        const record: SettingsRecord = {
            provider,
            encryptedKey,
            maskedKey,
            status: 'unverified',
            lastVerifiedAt: existing?.lastVerifiedAt ?? null,
            updatedAt: now,
        };
        memDb.put(TABLE, provider, record as unknown as Record<string, unknown>);
    },

    deleteKey(provider: ApiKeyProvider): void {
        memDb.delete(TABLE, provider);
    },

    listAll(): SettingsRecord[] {
        return memDb.scan(TABLE) as unknown as SettingsRecord[];
    },

    /** Update status and lastVerifiedAt after a verify call */
    updateStatus(provider: ApiKeyProvider, status: 'active' | 'invalid', lastVerifiedAt: string): void {
        const existing = settingsRepo.getKey(provider);
        if (!existing) return;
        const record: SettingsRecord = {
            ...existing,
            status,
            lastVerifiedAt,
            updatedAt: new Date().toISOString(),
        };
        memDb.put(TABLE, provider, record as unknown as Record<string, unknown>);
    },
};
