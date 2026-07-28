import { describe, expect, it } from 'vitest';

import { createCatalogToolProvider } from '../../tools/catalogTools';
import { createFixtureCatalog } from '../harness/fixtures';

import type { ToolCall, ToolProvider, ToolResult } from '../../tools/types';

const call = (name: string, args: unknown): ToolCall => ({ id: `c-${name}`, name, args });
const run = async (provider: ToolProvider, name: string, args: unknown): Promise<ToolResult> =>
    provider.dispatch(call(name, args));

describe('catalog tool provider — catalog_search / describe_block', () => {
    const catalog = createFixtureCatalog();

    it('describe_block returns one block schema; unknown type errors', async () => {
        const cat = createCatalogToolProvider(catalog);
        const ok = await run(cat, 'describe_block', { type: 'single-output-generator' });
        expect(ok.ok).toBe(true);
        const bad = await run(cat, 'describe_block', { type: 'no-such-block' });
        expect(bad.ok).toBe(false);
    });

    it('catalog_search shortlists by query', async () => {
        const cat = createCatalogToolProvider(catalog);
        const res = await run(cat, 'catalog_search', { query: 'delay' });
        expect(res.ok).toBe(true);
        if (res.ok) {
            const data = res.data as { hits: { type: string }[] };
            expect(data.hits.map(h => h.type)).toContain('buffer');
        }
    });
});
