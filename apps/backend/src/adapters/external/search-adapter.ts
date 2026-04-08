/**
 * Search adapter — interface-only stub.
 * TODO Phase 4+: Replace with real Naver Search / Serper API calls.
 *
 * The search-block uses Claude to generate realistic structured data for now.
 * When a real API is integrated, swap the implementation here without
 * changing the block logic.
 */

export interface SearchResult {
    title: string;
    url: string;
    source: string;
    snippet: string;
}

export const searchAdapter = {
    /**
     * Search for articles/news related to a query.
     * Currently returns empty — Claude generates the data in search-block.
     */
    async search(query: string, limit = 5): Promise<SearchResult[]> {
        // Unused params acknowledged; will be used when real API is wired
        void query;
        void limit;
        return [];
    },
};
