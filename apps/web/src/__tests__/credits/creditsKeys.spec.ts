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

    it('should build the transactions key with apiKey + empty params by default', () => {
        expect(creditsKeys.transactions('key-a')).toEqual(['credits', 'transactions', 'key-a', {}]);
    });

    it('should produce different keys for different params', () => {
        const pageOne = creditsKeys.transactions('key-a', { page: 0, limit: 24 });
        const pageTwo = creditsKeys.transactions('key-a', { page: 1, limit: 24 });
        expect(pageOne).not.toEqual(pageTwo);
    });

    it('should fold params into the key', () => {
        expect(creditsKeys.transactions('key-a', { stereo: 'use' })).toEqual([
            'credits',
            'transactions',
            'key-a',
            { stereo: 'use' },
        ]);
    });
});
