import { beforeEach, describe, expect, it } from 'vitest';

import {
    TEMP_ID_PREFIXES,
    __resetTempIdRegistry,
    generateTempId,
    isTempId,
    isUnresolvedTempId,
    markTempIdResolved,
    resolveTempId,
} from './tempId';

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

describe('session temp-ID registry', () => {
    beforeEach(() => {
        __resetTempIdRegistry();
    });

    it('marks IDs generated this session as unresolved until the server assigns an ID', () => {
        const id = generateTempId('node');
        expect(isUnresolvedTempId(id)).toBe(true);

        markTempIdResolved(id, '2001234');
        expect(isUnresolvedTempId(id)).toBe(false);
    });

    // Regression: temp-format IDs leaked into POST /flows/:id/save and were persisted as
    // canonical server IDs. Prefix checks then misclassified those loaded nodes as temp and
    // silently skipped every per-entity sync (config upsert, delete, position).
    it('treats temp-format IDs loaded from the server (not generated this session) as resolved', () => {
        expect(isUnresolvedTempId('node_1782955209543_c7usd')).toBe(false);
        expect(isTempId('node_1782955209543_c7usd')).toBe(true);
    });

    it('is false for server IDs, empty, and undefined', () => {
        expect(isUnresolvedTempId('1006037')).toBe(false);
        expect(isUnresolvedTempId('')).toBe(false);
        expect(isUnresolvedTempId(undefined)).toBe(false);
    });

    it('resolveTempId maps a resolved temp ID to its server ID and passes others through', () => {
        const id = generateTempId('node');
        expect(resolveTempId(id)).toBe(id);

        markTempIdResolved(id, '2001234');
        expect(resolveTempId(id)).toBe('2001234');
        expect(resolveTempId('1006037')).toBe('1006037');
    });
});
