import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../catalog';
import { createEdgeToolProvider } from '../../tools/edgeTools';
import {
    createNodeConfigToolProvider,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
    createNodeStructureToolProvider,
} from '../../tools/nodeTools';

import type { CanvasBinding } from '../../canvas/canvasBinding';
import type { CatalogLookup } from '../../catalog';
import type { ToolProvider } from '../../tools/types';

/**
 * The gate invariant, checked rather than remembered.
 *
 * The `CanvasBinding` enforces no permissions of its own (the old coarse `canModifyCanvas` gate in the
 * desktop binding is gone) — every gate now lives in the `ToolExecutor`, keyed on `ToolDef.requires`.
 * `requires` is optional, so a future write tool that forgets it would reach `binding.updateNode` /
 * `addNode` / `deleteNode` / `addEdge` / `deleteEdge` completely ungated. This test makes that a build
 * failure: any tool from a binding-backed provider must declare a capability unless it is a known read.
 */
describe('every binding-backed tool declares the capability it needs', () => {
    // The reads that legitimately mutate nothing, so they carry no `requires`. Adding a name here is a
    // deliberate act (it must show up in review); forgetting `requires` on a *write* tool is not — it
    // simply omits the key, which is exactly what this test refuses to let pass silently.
    const READ_ONLY = new Set(['list_nodes', 'describe_node', 'list_edges']);

    const bindingBackedProviders = (binding: CanvasBinding, catalog: CatalogLookup): ToolProvider[] => [
        createEdgeToolProvider(binding, catalog),
        createNodeReadToolProvider(binding, catalog),
        createNodeMoveToolProvider(binding),
        createNodeConfigToolProvider(binding, catalog),
        createNodeStructureToolProvider(binding, catalog),
    ];

    it('a write tool without `requires` fails the build', async () => {
        const providers = bindingBackedProviders(createInMemoryCanvasBinding(), createCatalogLookup([]));
        const defs = (await Promise.all(providers.map(p => p.listTools()))).flat();

        // Sanity: the providers actually exposed tools, so an empty list can't pass this vacuously.
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
