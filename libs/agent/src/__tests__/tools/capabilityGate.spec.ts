import { describe, expect, it } from 'vitest';

import { CATALOG_TOOLS } from '../../tools/catalogTools';
import { EDGE_TOOLS } from '../../tools/edgeTools';
import { NODE_TOOLS } from '../../tools/nodeTools';

/**
 * The gate invariant, checked rather than remembered.
 *
 * The `CanvasBinding` enforces no permissions of its own (the old coarse `canModifyCanvas` gate in the
 * desktop binding is gone) — every gate now lives in the `ToolExecutor`, keyed on `ToolDef.requires`.
 * `requires` is optional, so a future write tool that forgets it would reach `binding.updateNode` /
 * `addNode` / `deleteNode` / `addEdge` / `deleteEdge` completely ungated. This test makes that a build
 * failure: every canvas tool must declare a capability unless it is a known read.
 */
describe('every canvas tool declares the capability it needs', () => {
    // The reads that legitimately mutate nothing, so they carry no `requires`. Adding a name here is a
    // deliberate act (it must show up in review); forgetting `requires` on a *write* tool is not — it
    // simply omits the key, which is exactly what this test refuses to let pass silently.
    const READ_ONLY = new Set([
        'list_nodes',
        'describe_node',
        'search_nodes',
        'get_graph',
        'list_edges',
        'catalog_search',
    ]);

    it('a write tool without `requires` fails the build', () => {
        const defs = [...NODE_TOOLS, ...EDGE_TOOLS, ...CATALOG_TOOLS].map(tool => tool.def);

        // Sanity: the bundles actually exposed tools, so an empty list can't pass this vacuously.
        expect(defs.length).toBeGreaterThan(0);

        for (const def of defs) {
            if (READ_ONLY.has(def.name)) {
                expect(def.requires, `read tool ${def.name} should not need a capability`).toBeUndefined();
            } else {
                expect(def.requires, `write tool ${def.name} must declare a required capability`).toBeDefined();
            }
        }
    });
});
