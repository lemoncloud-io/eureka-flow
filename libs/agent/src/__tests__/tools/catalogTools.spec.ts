import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { CATALOG_SEARCH, CATALOG_TOOLS } from '../../tools/catalogTools';
import { toolset } from '../../tools/toolset';
import { createFixtureCatalog } from '../harness/fixtures';

import type { ToolCall, ToolProvider, ToolResult } from '../../tools/types';

const call = (name: string, args: unknown): ToolCall => ({ id: `c-${name}`, name, args });
const run = async (provider: ToolProvider, name: string, args: unknown): Promise<ToolResult> =>
    provider.dispatch(call(name, args));

describe('catalog tools — catalog_search (full schema per hit)', () => {
    const catalog = createFixtureCatalog();
    // catalog_search reads only the catalog; the binding is an unused-but-required piece of the shared deps bag.
    const cat = (): ToolProvider => toolset({ binding: createInMemoryCanvasBinding(), catalog }, CATALOG_TOOLS);

    it('returns matching block types WITH their full schema — ports and config fields inlined', async () => {
        const res = await run(cat(), 'catalog_search', { query: 'delay' });
        expect(res.ok).toBe(true);
        if (res.ok) {
            const data = res.data as {
                hits: { type: string; inputs?: unknown[]; outputs?: unknown[]; config?: unknown }[];
            };
            const buffer = data.hits.find(h => h.type === 'buffer');
            expect(buffer).toBeDefined();
            // The whole schema is inlined now — this is exactly what folding describe_block in bought us:
            // no second round-trip to read a type's ports/fields.
            expect(buffer?.inputs).toBeDefined();
            expect(buffer?.outputs).toBeDefined();
            expect(buffer?.config).toBeDefined();
        }
    });

    it('an empty query returns the whole catalog (each entry a full schema)', async () => {
        const res = await run(cat(), 'catalog_search', { query: '' });
        expect(res.ok).toBe(true);
        if (res.ok) {
            const data = res.data as { hits: { type: string }[] };
            expect(data.hits.length).toBeGreaterThan(0);
        }
    });

    it('catalog_search is the only catalog tool — describe_block was folded in and is now unknown', async () => {
        expect(CATALOG_TOOLS.map(t => t.def.name)).toEqual(['catalog_search']);
        expect(CATALOG_SEARCH.def.name).toBe('catalog_search');
        const res = await run(cat(), 'describe_block', { type: 'single-output-generator' });
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.error).toMatch(/unknown tool/);
    });
});
