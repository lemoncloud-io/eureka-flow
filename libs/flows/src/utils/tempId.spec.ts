import { describe, expect, it } from 'vitest';

import { TEMP_ID_PREFIXES, generateTempId, isTempId } from './tempId';

describe('isTempId', () => {
    it('recognizes every prefix generateTempId can produce', () => {
        TEMP_ID_PREFIXES.forEach(prefix => {
            expect(isTempId(`${prefix}1781682294849_gcbcm`)).toBe(true);
        });
    });

    it('treats server-assigned IDs as not temporary', () => {
        expect(isTempId('1006037')).toBe(false);
        expect(isTempId('node-1006037')).toBe(false);
    });

    it('is false for empty or undefined IDs', () => {
        expect(isTempId('')).toBe(false);
        expect(isTempId(undefined)).toBe(false);
    });
});

describe('generateTempId', () => {
    // Regression: a 'node_' temp ID was not detected as temp, so a config edit on a
    // not-yet-persisted node was POSTed to /nodes/:id/upsert → 404 (saveNode not found).
    it('produces IDs that isTempId detects for every prefix', () => {
        (['temp', 'edge', 'node'] as const).forEach(prefix => {
            const id = generateTempId(prefix);
            expect(id.startsWith(`${prefix}_`)).toBe(true);
            expect(isTempId(id)).toBe(true);
        });
    });

    it('defaults to the temp_ prefix', () => {
        expect(generateTempId().startsWith('temp_')).toBe(true);
    });
});
