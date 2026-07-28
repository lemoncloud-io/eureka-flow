import type { FlowPermissions } from '@flows/flows';

/** The canvas-relevant subset of {@link FlowPermissions}; `satisfies` fails the build if a name drifts. */
const CAPABILITIES = [
    'canModifyCanvas',
    'canEditConfig',
    'canEditStructure',
    'canRun',
] as const satisfies readonly (keyof FlowPermissions)[];

/** The capabilities a tool can require and an agent can be granted. */
export type Capability = (typeof CAPABILITIES)[number];

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

/** Project the flow editor's {@link FlowPermissions} onto the agent grant (the Capability subset). */
export const toAgentGrant = (permissions: FlowPermissions): AgentGrant =>
    Object.fromEntries(CAPABILITIES.map(key => [key, permissions[key]])) as AgentGrant;
