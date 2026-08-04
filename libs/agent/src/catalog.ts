import type { JsonSchema } from './llm/llmGateway';

/** One block type's full schema — returned by `catalog_search` (per hit) and `describe_node`, and validated by `set_properties`. */
export interface BlockSchema {
    type: string;
    label: string;
    stereo?: 'input' | 'process' | 'output';
    /** One-line capability, for the search shortlist. */
    summary?: string;
    config: JsonSchema;
    inputs: { portId: string; type?: string }[];
    outputs: { portId: string; type?: string }[];
}

/** The block catalog behind `catalog_search` (search returns full schemas) + `describe_node` and config validation; the browser builds it over `blockRegistry`, the headless eval from a fixture ({@link createFixtureCatalog}). */
export interface CatalogLookup {
    has(type: string): boolean;
    schema(type: string): BlockSchema | undefined;
    /** Search the catalog; each match is that block's FULL schema (type, label, ports, config), best match first. */
    search(query: string): BlockSchema[];
}

/** Build a {@link CatalogLookup} over a fixed set of block schemas. */
export const createCatalogLookup = (blocks: BlockSchema[]): CatalogLookup => {
    const byType = new Map<string, BlockSchema>();
    for (const block of blocks) {
        byType.set(block.type, block);
    }

    return {
        has: (type: string) => byType.has(type),
        schema: (type: string) => byType.get(type),
        search: (query: string): BlockSchema[] => {
            const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
            if (terms.length === 0) {
                return blocks;
            }
            const scored = blocks
                .map(block => {
                    const haystack = `${block.type} ${block.label} ${block.summary ?? ''}`.toLowerCase();
                    const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
                    return { block, score };
                })
                .filter(entry => entry.score > 0)
                .sort((a, b) => b.score - a.score);
            return scored.map(entry => entry.block);
        },
    };
};
