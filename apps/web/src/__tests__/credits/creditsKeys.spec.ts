import { describe, expect, it } from 'vitest';

import { creditsKeys } from '@flows/shared';

describe('creditsKeys', () => {
    it('should expose a stable root namespace', () => {
        expect(creditsKeys.all).toEqual(['credits']);
    });

    it('should fold the apiKey into the balance key so wallets cache independently', () => {
        expect(creditsKeys.balance('key-a')).toEqual(['credits', 'balance', 'key-a']);
        expect(creditsKeys.balance('key-a')).not.toEqual(creditsKeys.balance('key-b'));
    });

    it('should build the transactions key with apiKey + "all" filter by default', () => {
        expect(creditsKeys.transactions('key-a')).toEqual(['credits', 'transactions', 'key-a', 'all']);
    });

    it('should produce different keys for different filters', () => {
        const all = creditsKeys.transactions('key-a', 'all');
        const use = creditsKeys.transactions('key-a', 'use');
        expect(all).not.toEqual(use);
    });

    it('should fold the filter into the key', () => {
        expect(creditsKeys.transactions('key-a', 'use')).toEqual(['credits', 'transactions', 'key-a', 'use']);
    });
});
