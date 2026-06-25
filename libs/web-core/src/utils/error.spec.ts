import { describe, expect, it } from 'vitest';

import { classify403Body, isPermissionDeniedResponse } from './error';

describe('classify403Body', () => {
    it('classifies a 200-wrapped permission-denied envelope', () => {
        expect(classify403Body('403 NOT ALLOWED - session is missing @assertAccess(flow/1003380)')).toBe(
            'permission_denied'
        );
    });

    it('classifies a 200-wrapped auth-error envelope', () => {
        expect(classify403Body('403 FORBIDDEN - invalid api key')).toBe('auth_error');
    });

    it('returns null for a successful flow object that merely contains 403/forbidden text', () => {
        const flow = {
            id: '1003380',
            updatedAt: 1782286234706,
            nodes: [
                {
                    id: '210024',
                    input: { prompt: 'Do not include elements explicitly forbidden by request.' },
                },
            ],
        };
        expect(classify403Body(flow)).toBeNull();
    });

    it('returns null when 403 is not at the start of the envelope', () => {
        expect(classify403Body('error: upstream returned 403 FORBIDDEN')).toBeNull();
    });

    it('returns null for null/empty bodies', () => {
        expect(classify403Body(null)).toBeNull();
        expect(classify403Body('')).toBeNull();
    });
});

describe('isPermissionDeniedResponse', () => {
    it('detects permission-denied envelope strings', () => {
        expect(isPermissionDeniedResponse('403 NOT ALLOWED - ...')).toBe(true);
    });

    it('ignores object payloads containing the marker as content', () => {
        expect(isPermissionDeniedResponse({ id: '1', name: 'not allowed list' })).toBe(false);
    });
});
