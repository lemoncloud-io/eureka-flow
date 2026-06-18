/**
 * Flow Role & Permission System
 *
 * Four user roles, derived from the server's two booleans (`hasOwned`, `isEditable`)
 * plus apiKey presence (public mode):
 * - Owner: created the flow (sid+uid match). Structural edits, config, metadata, run.
 * - Editor: same workspace (sid), not owner. Config edit (saved to a per-user session
 *   overlay) + run. No structural edits, no rename/publish.
 * - Viewer: signed-in, no edit permission. Run a public flow only.
 * - Anonymous: no session. View a public flow only.
 *
 * See CONTEXT.md "Access model" and docs/adr/0002-flow-permission-model.md.
 */

export type FlowRole = 'owner' | 'editor' | 'viewer' | 'anonymous';

export interface FlowPermissions {
    /** Edit any node's config values (Owner direct, Editor via session overlay) */
    canEditConfig: boolean;
    /** Structural change: add/delete nodes & edges, move, connect, and flow metadata (rename/publish). Owner only. */
    canEditStructure: boolean;
    /** Execute nodes */
    canRun: boolean;
    /** Persist edits (Owner = direct, Editor = session overlay) */
    canSave: boolean;
    /** Move nodes on canvas (local for non-owners) */
    canDragNodes: boolean;
    /** Create new flow, open flow list (any authenticated user) */
    canCreate: boolean;
}

export const ROLE_PERMISSIONS: Record<FlowRole, FlowPermissions> = {
    owner: {
        canEditConfig: true,
        canEditStructure: true,
        canRun: true,
        canSave: true,
        canDragNodes: true,
        canCreate: true,
    },
    editor: {
        canEditConfig: true,
        canEditStructure: false,
        canRun: true,
        canSave: true,
        canDragNodes: true,
        canCreate: true,
    },
    viewer: {
        canEditConfig: false,
        canEditStructure: false,
        canRun: true,
        canSave: false,
        canDragNodes: false,
        canCreate: true,
    },
    anonymous: {
        canEditConfig: false,
        canEditStructure: false,
        canRun: false,
        canSave: false,
        canDragNodes: false,
        canCreate: false,
    },
};

export const getPermissions = (role: FlowRole): FlowPermissions => ROLE_PERMISSIONS[role];

/**
 * Derive the flow role from access facts.
 * - Public mode (no apiKey, viewing a flow) ⇒ anonymous, regardless of server flags.
 * - Otherwise: owner (hasOwned) → editor (isEditable) → viewer.
 */
export const deriveRole = ({
    isPublicMode,
    hasOwned,
    isEditable,
}: {
    isPublicMode: boolean;
    hasOwned: boolean;
    isEditable: boolean;
}): FlowRole => {
    if (isPublicMode) return 'anonymous';
    if (hasOwned) return 'owner';
    if (isEditable) return 'editor';
    return 'viewer';
};
