import { API_KEY_PROVIDERS } from '@flows/contracts';

import { settingsRepo } from '../repositories/settings-repository';
import { log } from '../utils/logger';

import type { ApiKeyInfo, ApiKeyProvider, ApiKeyVerifyResponse } from '@flows/contracts';

// ============================================================================
// ENV var mapping per provider
// ============================================================================

const ENV_MAP: Record<ApiKeyProvider, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    nanobanana: 'NANOBANANA_API_KEY',
    openai: 'OPENAI_API_KEY',
    elevenlabs: 'ELEVENLABS_API_KEY',
    naver: 'NAVER_CLIENT_ID',
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Mask an API key for safe display.
 * - Keys >= 10 chars: show first 4 + mask middle + last 4 (e.g. sk-a****7f3a)
 * - Keys < 10 chars:  show first 2 + ****
 */
export const maskKey = (raw: string): string => {
    if (raw.length >= 10) {
        const first = raw.slice(0, 4);
        const last = raw.slice(-4);
        return `${first}****${last}`;
    }
    const first = raw.slice(0, 2);
    return `${first}****`;
};

const getRawKey = (provider: ApiKeyProvider): string | null => {
    // Priority: stored record > env var
    const record = settingsRepo.getKey(provider);
    if (record?.encryptedKey) return record.encryptedKey;

    const envKey = process.env[ENV_MAP[provider]];
    return envKey || null;
};

// ============================================================================
// Verify helpers (real HTTP calls, 5s timeout)
// ============================================================================

const withTimeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
};

const verifyAnthropic = async (key: string): Promise<{ valid: boolean; message?: string }> => {
    try {
        const signal = withTimeout(5000);
        const res = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            signal,
        });
        if (res.ok) return { valid: true };
        const body = await res.json().catch(() => ({}));
        return {
            valid: false,
            message: (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`,
        };
    } catch (err) {
        return { valid: false, message: err instanceof Error ? err.message : 'Request failed' };
    }
};

const verifyNanobanana = async (key: string): Promise<{ valid: boolean; message?: string }> => {
    try {
        const signal = withTimeout(5000);
        const res = await fetch('https://api.nanobanana.io/health', {
            headers: { Authorization: `Bearer ${key}` },
            signal,
        });
        if (res.ok) return { valid: true };
        return { valid: false, message: `HTTP ${res.status}` };
    } catch (err) {
        return { valid: false, message: err instanceof Error ? err.message : 'Request failed' };
    }
};

const verifyOpenAI = async (key: string): Promise<{ valid: boolean; message?: string }> => {
    try {
        const signal = withTimeout(5000);
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
            signal,
        });
        if (res.ok) return { valid: true };
        const body = await res.json().catch(() => ({}));
        return {
            valid: false,
            message: (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`,
        };
    } catch (err) {
        return { valid: false, message: err instanceof Error ? err.message : 'Request failed' };
    }
};

const verifyElevenLabs = async (key: string): Promise<{ valid: boolean; message?: string }> => {
    try {
        const signal = withTimeout(5000);
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
            headers: { 'xi-api-key': key },
            signal,
        });
        if (res.ok) return { valid: true };
        const body = await res.json().catch(() => ({}));
        return {
            valid: false,
            message: (body as { detail?: { message?: string } | string }).detail
                ? typeof (body as { detail?: string }).detail === 'string'
                    ? (body as { detail: string }).detail
                    : ((body as { detail: { message?: string } }).detail?.message ?? `HTTP ${res.status}`)
                : `HTTP ${res.status}`,
        };
    } catch (err) {
        return { valid: false, message: err instanceof Error ? err.message : 'Request failed' };
    }
};

const verifyNaver = async (_key: string): Promise<{ valid: boolean; message?: string }> => {
    // Naver: noop — if key is present, consider valid
    return { valid: true, message: 'Naver key accepted (presence check only)' };
};

const VERIFY_FN: Record<ApiKeyProvider, (key: string) => Promise<{ valid: boolean; message?: string }>> = {
    anthropic: verifyAnthropic,
    nanobanana: verifyNanobanana,
    openai: verifyOpenAI,
    elevenlabs: verifyElevenLabs,
    naver: verifyNaver,
};

// ============================================================================
// Service
// ============================================================================

export const settingsService = {
    /** Return masked info for all known providers */
    async getAll(): Promise<ApiKeyInfo[]> {
        return API_KEY_PROVIDERS.map(provider => {
            const record = settingsRepo.getKey(provider);
            if (record) {
                return {
                    provider,
                    configured: true,
                    maskedKey: record.maskedKey,
                    status: record.status,
                    lastVerifiedAt: record.lastVerifiedAt,
                };
            }
            // Fall back to env var
            const envKey = process.env[ENV_MAP[provider]];
            if (envKey) {
                return {
                    provider,
                    configured: true,
                    maskedKey: maskKey(envKey),
                    status: 'unverified' as const,
                    lastVerifiedAt: null,
                };
            }
            return {
                provider,
                configured: false,
                maskedKey: null,
                status: 'missing' as const,
                lastVerifiedAt: null,
            };
        });
    },

    /** Store a new API key. Never log the raw key. */
    async putKey(provider: ApiKeyProvider, apiKey: string): Promise<void> {
        const masked = maskKey(apiKey);
        log.info(`settings: storing key for provider`, { provider, maskedKey: masked });
        settingsRepo.putKey(provider, apiKey, masked);
    },

    /** Remove a stored key */
    async deleteKey(provider: ApiKeyProvider): Promise<void> {
        log.info(`settings: deleting key for provider`, { provider });
        settingsRepo.deleteKey(provider);
    },

    /** Verify a key by making a real lightweight HTTP call to the provider */
    async verifyKey(provider: ApiKeyProvider): Promise<ApiKeyVerifyResponse> {
        const now = new Date().toISOString();
        const rawKey = getRawKey(provider);

        if (!rawKey) {
            return { provider, valid: false, status: 'missing', checkedAt: now, message: 'No API key configured' };
        }

        log.info(`settings: verifying key for provider`, { provider });

        let result: { valid: boolean; message?: string };
        try {
            result = await VERIFY_FN[provider](rawKey);
        } catch (err) {
            result = {
                valid: false,
                message: err instanceof Error ? err.message : 'Unexpected error during verification',
            };
        }

        const newStatus = result.valid ? 'active' : 'invalid';

        // Only update stored record if one exists (don't store env-only keys)
        const stored = settingsRepo.getKey(provider);
        if (stored) {
            settingsRepo.updateStatus(provider, newStatus, now);
        }

        log.info(`settings: verify result`, { provider, valid: result.valid, status: newStatus });

        return {
            provider,
            valid: result.valid,
            status: newStatus,
            checkedAt: now,
            ...(result.message ? { message: result.message } : {}),
        };
    },

    /** Get raw key for internal adapter use. Priority: stored > env. */
    getKeyForProvider(provider: ApiKeyProvider): string | null {
        return getRawKey(provider);
    },
};
