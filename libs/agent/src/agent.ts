import type { AgentGrant } from './permissions';
import type { ToolProvider } from './tools/types';

/** An agent's varying parts: tool provider(s) plus a capability grant. */
export interface AgentConfig {
    id: string;
    /** What it handles. */
    description: string;
    /** Persona / instructions. */
    systemPrompt: string;
    /** Its tool sources; the executor unions + routes across them. */
    tools: ToolProvider[];
    /** Capabilities it is allowed to use. */
    grant: AgentGrant;
}

/** The turn surface the Panel drives. */
export interface Agent {
    /** Append the user message and run the whole turn to completion. */
    send(text: string): Promise<void>;
    /** Cancel the in-flight stream; moves already applied stay applied. */
    abort(): void;
}
