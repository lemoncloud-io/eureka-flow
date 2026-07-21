import { validateArgs } from './validateArgs';
import { effectiveCapabilities } from '../permissions';

import type { AgentConfig } from '../agent';
import type { ToolCall, ToolExecutor, ToolProvider, ToolResult } from './toolTypes';
import type { ToolDef } from '../llm/llmGateway';

/**
 * The single shared {@link ToolExecutor}. Per-agent behavior is data this one code reads:
 * the acting agent (its `tools` + `grant`) is passed in on every call.
 *
 * `dispatch` is the choke-point per tool call:
 *   1. route by name → the provider that owns it (unknown name → error),
 *   2. validate `args` against the tool's JSON Schema,
 *   3. check the tool's required capability against the agent's grant,
 *   4. run it — wrapping any thrown error into a `ToolResult` (never throws).
 *
 * Permission note: a session-role ceiling is not wired in this version, so the effective
 * set is just the agent's grant. The locator agent is
 * granted exactly the capabilities its tools require, so its moves pass; a tool whose
 * `requires` is outside the grant is denied.
 */
export const createToolExecutor = (): ToolExecutor => {
    const indexTools = async (
        agent: AgentConfig
    ): Promise<{ defs: ToolDef[]; byName: Map<string, { def: ToolDef; provider: ToolProvider }> }> => {
        const defs: ToolDef[] = [];
        const byName = new Map<string, { def: ToolDef; provider: ToolProvider }>();
        for (const provider of agent.tools) {
            const providerDefs = await provider.listTools();
            for (const def of providerDefs) {
                // Tool names are assumed unique across an agent's providers;
                // first writer wins and we skip a duplicate rather than shadow it.
                if (!byName.has(def.name)) {
                    byName.set(def.name, { def, provider });
                    defs.push(def);
                }
            }
        }
        return { defs, byName };
    };

    return {
        listTools: async (agent: AgentConfig) => (await indexTools(agent)).defs,

        dispatch: async (agent: AgentConfig, call: ToolCall): Promise<ToolResult> => {
            const { byName } = await indexTools(agent);
            const entry = byName.get(call.name);
            if (!entry) {
                return { toolCallId: call.id, ok: false, error: `unknown tool: ${call.name}` };
            }

            const schemaErrors = validateArgs(entry.def.parameters, call.args);
            if (schemaErrors.length > 0) {
                return { toolCallId: call.id, ok: false, error: `invalid args: ${schemaErrors.join('; ')}` };
            }

            if (entry.def.requires) {
                const effective = effectiveCapabilities(agent.grant);
                if (!effective.has(entry.def.requires)) {
                    return {
                        toolCallId: call.id,
                        ok: false,
                        error: `permission denied: ${call.name} requires ${entry.def.requires}`,
                    };
                }
            }

            try {
                return await entry.provider.dispatch(call);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { toolCallId: call.id, ok: false, error: message };
            }
        },
    };
};
