import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS, deriveRole, getPermissions } from './permissions';

import type { FlowRole } from './permissions';

describe('deriveRole', () => {
    it('is anonymous in public mode regardless of server flags', () => {
        expect(deriveRole({ isPublicMode: true, hasOwned: true, isEditable: true })).toBe('anonymous');
        expect(deriveRole({ isPublicMode: true, hasOwned: false, isEditable: false })).toBe('anonymous');
    });

    it('is owner when hasOwned', () => {
        expect(deriveRole({ isPublicMode: false, hasOwned: true, isEditable: true })).toBe('owner');
    });

    it('is editor when editable but not owner', () => {
        expect(deriveRole({ isPublicMode: false, hasOwned: false, isEditable: true })).toBe('editor');
    });

    it('is viewer when signed-in but not editable', () => {
        expect(deriveRole({ isPublicMode: false, hasOwned: false, isEditable: false })).toBe('viewer');
    });
});

describe('ROLE_PERMISSIONS', () => {
    it('owner can do everything', () => {
        expect(ROLE_PERMISSIONS.owner).toEqual({
            canEditConfig: true,
            canModifyCanvas: true,
            canEditStructure: true,
            canRun: true,
            canSave: true,
            canDragNodes: true,
            canCreate: true,
        });
    });

    it('editor edits config + saves (overlay), but no structure', () => {
        const editor = ROLE_PERMISSIONS.editor;
        expect(editor.canEditConfig).toBe(true);
        expect(editor.canSave).toBe(true);
        expect(editor.canRun).toBe(true);
        expect(editor.canEditStructure).toBe(false);
    });

    it('viewer runs only, never edits or saves', () => {
        const viewer = ROLE_PERMISSIONS.viewer;
        expect(viewer.canRun).toBe(true);
        expect(viewer.canEditConfig).toBe(false);
        expect(viewer.canEditStructure).toBe(false);
        expect(viewer.canSave).toBe(false);
    });

    it('anonymous can do nothing', () => {
        const anon = ROLE_PERMISSIONS.anonymous;
        expect(Object.values(anon).every(v => v === false)).toBe(true);
    });
});

describe('getPermissions', () => {
    it('returns the permission set for each role', () => {
        (['owner', 'editor', 'viewer', 'anonymous'] as FlowRole[]).forEach(role => {
            expect(getPermissions(role)).toBe(ROLE_PERMISSIONS[role]);
        });
    });
});
