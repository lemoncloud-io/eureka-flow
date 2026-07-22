import { describe, expect, it } from 'vitest';

import { effectiveCapabilities, toAgentGrant } from '../permissions';

import type { FlowPermissions } from '@flows/flows';

// Inline fixtures (type-only import, so the DOM-dependent @flows/flows barrel never loads in the node env).
const owner: FlowPermissions = {
    canEditConfig: true,
    canModifyCanvas: true,
    canEditStructure: true,
    canRun: true,
    canSave: true,
    canDragNodes: true,
    canCreate: true,
};
const viewer: FlowPermissions = {
    canEditConfig: false,
    canModifyCanvas: false,
    canEditStructure: false,
    canRun: true,
    canSave: false,
    canDragNodes: false,
    canCreate: true,
};

describe('toAgentGrant', () => {
    it('projects the four canvas-relevant FlowPermissions onto the grant (owner → all true)', () => {
        expect(toAgentGrant(owner)).toEqual({
            canModifyCanvas: true,
            canEditConfig: true,
            canEditStructure: true,
            canRun: true,
        });
    });

    it("carries a viewer's denials through: canvas editing off, run still on", () => {
        const grant = toAgentGrant(viewer);
        expect(grant.canModifyCanvas).toBe(false);
        expect(grant.canRun).toBe(true);
        // so the executor denies move_node (requires canModifyCanvas) for a viewer
        expect(effectiveCapabilities(grant).has('canModifyCanvas')).toBe(false);
    });

    it('drops the non-Capability FlowPermissions keys (canSave / canDragNodes / canCreate)', () => {
        expect(Object.keys(toAgentGrant(owner)).sort()).toEqual([
            'canEditConfig',
            'canEditStructure',
            'canModifyCanvas',
            'canRun',
        ]);
    });
});
