import { validateArgs } from './validateArgs';
import { effectiveCapabilities } from '../permissions';
import { errorMessage } from '../utils/errors';

import type { AgentConfig } from '../agent';
import type { ToolCall, ToolExecutor, ToolProvider, ToolResult } from './types';
import type { ToolDef } from '../llm/llmGateway';

/** The single shared {@link ToolExecutor}; the acting agent (its `tools` + `grant`) is passed in on every call. `dispatch` never throws — thrown errors become a failed `ToolResult`. */
export const createToolExecutor = (): ToolExecutor => {
    const indexTools = async (
        agent: AgentConfig
    ): Promise<{ defs: ToolDef[]; byName: Map<string, { def: ToolDef; provider: ToolProvider }> }> => {
        const defs: ToolDef[] = [];
        const byName = new Map<string, { def: ToolDef; provider: ToolProvider }>();
        for (const provider of agent.tools) {
            const providerDefs = await provider.listTools();
            for (const def of providerDefs) {
                // Tool names must be unique across providers; first writer wins.
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
                return { toolCallId: call.id, ok: false, error: errorMessage(err) };
            }
        },
    };
};
