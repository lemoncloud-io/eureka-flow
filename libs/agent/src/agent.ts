import type { AgentGrant } from './permissions';
import type { ToolProvider } from './tools/toolTypes';

/**
 * What makes an agent the agent it is — the parts that vary between capabilities. The
 * locator agent is built with the locator tool provider + a canvas-edit grant.
 */
export interface AgentConfig {
    id: string;
    /** What it handles — used by the future router (spec 0001 §9). */
    description: string;
    /** Persona / instructions. */
    systemPrompt: string;
    /** Its tool sources — one or more; the executor unions + routes across them. */
    tools: ToolProvider[];
    /** Capabilities it is allowed to use. */
    grant: AgentGrant;
}

/**
 * The turn surface the Panel drives. The locator agent owns the whole turn inside
 * `send`; there is no plan/approval gate this version (moves apply live), so unlike the
 * flow-edit agent (spec 0001) there is no `resolvePlan`.
 */
export interface Agent {
    /** Append the user message and run the whole turn to completion. */
    send(text: string): Promise<void>;
    /** Cancel the in-flight stream; moves already applied stay applied. */
    abort(): void;
}
