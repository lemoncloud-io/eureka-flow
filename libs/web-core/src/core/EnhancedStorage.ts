/**
 * Dual-storage adapter for @lemoncloud/lemon-web-core.
 * Credential keys persist to both sessionStorage and localStorage (survive refresh).
 * Non-credential keys go to sessionStorage only after first write.
 */
export class EnhancedStorage {
    private readonly sessionStorage: Storage;
    private readonly localStorage: Storage;
    private length: number;
    private initialSaveKeys: Set<string>;

    private readonly credentialKeys = [
        'account_id',
        'auth_id',
        'identity_id',
        'identity_pool_id',
        'identity_token',
        'access_key_id',
        'secret_key',
        'session_token',
        'expired_time',
        'kms_arn',
        'access_token',
        'host_key',
        'client_id',
    ];

    constructor() {
        this.sessionStorage = window.sessionStorage;
        this.localStorage = window.localStorage;
        this.length = this.sessionStorage.length;
        this.initialSaveKeys = new Set();
    }

    clear(): void {
        this.sessionStorage.clear();
        this.initialSaveKeys.clear();
        this.localStorage.clear();
    }

    getItem(key: string): string | null {
        const sessionValue = this.sessionStorage.getItem(key);
        if (sessionValue !== null) {
            return sessionValue;
        }

        const localValue = this.localStorage.getItem(key);
        if (localValue !== null) {
            if (this.isCredentialKey(key)) {
                this.sessionStorage.setItem(key, localValue);
                this.initialSaveKeys.add(key);
            }
            return localValue;
        }

        return null;
    }

    key(index: number): string | null {
        return this.sessionStorage.key(index);
    }

    removeItem(key: string): void {
        if (this.isCredentialKey(key)) {
            this.localStorage.removeItem(key);
        }

        this.sessionStorage.removeItem(key);
        this.initialSaveKeys.delete(key);
        this.length = this.sessionStorage.length;
    }

    setItem(key: string, value: string): void {
        this.sessionStorage.setItem(key, value);

        if (this.isCredentialKey(key)) {
            this.localStorage.setItem(key, value);
            this.initialSaveKeys.add(key);
        } else if (!this.initialSaveKeys.has(key)) {
            this.localStorage.setItem(key, value);
            this.initialSaveKeys.add(key);
        }

        this.length = this.sessionStorage.length;
    }

    private isCredentialKey(key: string): boolean {
        return this.credentialKeys.some(credKey => key.toLowerCase().includes(credKey.toLowerCase()));
    }
}
