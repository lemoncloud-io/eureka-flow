/**
 * Flow Role & Permission System
 *
 * Three-tier user roles for flow editor access control:
 * - Owner: Full CRUD (create, edit, save, run)
 * - Guest: Has API key, can view & run nodes, can move nodes locally, cannot save/upsert
 * - Anonymous: No API key, view-only
 */

export type FlowRole = 'owner' | 'guest' | 'anonymous';

export interface FlowPermissions {
    /** Add/delete nodes, change config, add connections */
    canEdit: boolean;
    /** Execute nodes */
    canRun: boolean;
    /** Move nodes on canvas (local only for guest) */
    canDragNodes: boolean;
    /** Save flow */
    canSave: boolean;
    /** Sync node data to server (upsert) */
    canUpsert: boolean;
    /** Create new flow, open flow list (authenticated users) */
    canCreate: boolean;
}

export const ROLE_PERMISSIONS: Record<FlowRole, FlowPermissions> = {
    owner: { canEdit: true, canRun: true, canDragNodes: true, canSave: true, canUpsert: true, canCreate: true },
    guest: { canEdit: false, canRun: true, canDragNodes: true, canSave: false, canUpsert: false, canCreate: true },
    anonymous: {
        canEdit: false,
        canRun: false,
        canDragNodes: false,
        canSave: false,
        canUpsert: false,
        canCreate: false,
    },
};

export const getPermissions = (role: FlowRole): FlowPermissions => ROLE_PERMISSIONS[role];
