import type { Agent } from '../agent';
import type { BaseAgentDeps } from './baseAgent';

// No per-registration grant: a specialist is bounded by its tools + its own fixed grant; the user's
// flow-role permissions are the runtime ceiling enforced at the executor (R2).

/** A compact directory entry — what `list_agents` returns: a spawn key + one-line capability. */
export interface AgentCard {
    type: string;
    summary: string;
}

/** Base deps the runner forwards to a specialist factory for one sub-turn; the child's grant is fixed in its own constructor, not supplied here. */
export type SpecialistTurnDeps = BaseAgentDeps;

/** One specialist registration — everything `list_agents` and `spawn` need; `create` builds the concrete agent bound to the live canvas. */
export interface AgentRegistration {
    /** Spawn key, e.g. 'locator'. */
    type: string;
    /** The one-line capability that becomes the {@link AgentCard}. */
    summary: string;
    /** Build the concrete specialist agent for one sub-turn, bound to the live canvas. */
    create(deps: SpecialistTurnDeps): Agent;
}

/** The agent registry backing `list_agents` and `spawn`; discovered at runtime, so adding a specialist needs no prompt change. */
export interface AgentRoster {
    /** Backs `list_agents` (compact). */
    list(): AgentCard[];
    /** `spawn` validates `agentType` against this. */
    has(type: string): boolean;
    /** The full registration — used by the sub-agent runner to build the child. */
    get(type: string): AgentRegistration | undefined;
}

/** Build an {@link AgentRoster} over a set of registrations. */
export const createAgentRoster = (registrations: AgentRegistration[]): AgentRoster => {
    const byType = new Map<string, AgentRegistration>();
    for (const reg of registrations) {
        byType.set(reg.type, reg);
    }
    return {
        list: () => registrations.map(reg => ({ type: reg.type, summary: reg.summary })),
        has: (type: string) => byType.has(type),
        get: (type: string) => byType.get(type),
    };
};
