import type { FlowPermissions } from '@flows/flows';

/** Resolves to `T`, but fails to compile unless every member of `T` is assignable to `U`. */
type Subset<T extends U, U> = T;

/**
 * The capabilities a tool can require and an agent can be granted: the canvas-relevant subset of
 * the flow editor's {@link FlowPermissions}. The `Subset` guard fails the build if any of these
 * names drifts from `FlowPermissions`, so the two stay in sync without a hand-maintained mirror.
 */
export type Capability = Subset<
    'canModifyCanvas' | 'canEditConfig' | 'canEditStructure' | 'canRun',
    keyof FlowPermissions
>;

/** What an agent is allowed to do. Absent/false capabilities are denied. */
export type AgentGrant = Partial<Record<Capability, boolean>>;

/** The set of capabilities actually enabled in a grant. */
export const effectiveCapabilities = (grant: AgentGrant): Set<Capability> => {
    const set = new Set<Capability>();
    (Object.keys(grant) as Capability[]).forEach(key => {
        if (grant[key]) {
            set.add(key);
        }
    });
    return set;
};
