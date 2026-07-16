/**
 * The capabilities a tool can require and an agent can be granted.
 *
 * This is a local, dependency-free mirror of the flow editor's `FlowPermissions`
 * (`libs/flows`) — the locator agent needs only the capability *names* to gate its
 * tools, not the flow lib's role-derivation. When this folds into the flow-edit agent
 * (spec 0001) these align with `FlowPermissions` keys.
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
