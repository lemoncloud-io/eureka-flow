/**
 * The capabilities a tool can require and an agent can be granted.
 *
 * Deliberately a small, dependency-free mirror of the capability names in the flow editor's
 * `FlowPermissions` (`libs/flows`): the agent core stays standalone — it never imports `libs/flows`
 * — and needs only the names to gate its tools, not the flow lib's role-derivation. This is the
 * single source of these names for the agent; keep them in sync with `FlowPermissions` by hand.
 */
export type Capability = 'canModifyCanvas' | 'canEditConfig' | 'canEditStructure' | 'canRun';

/** What an agent is allowed to do. Absent/false capabilities are denied. */
export type AgentGrant = Partial<Record<Capability, boolean>>;

/** The set of capabilities that are actually enabled in a grant. */
export const effectiveCapabilities = (grant: AgentGrant): Set<Capability> => {
    const set = new Set<Capability>();
    (Object.keys(grant) as Capability[]).forEach(key => {
        if (grant[key]) {
            set.add(key);
        }
    });
    return set;
};
