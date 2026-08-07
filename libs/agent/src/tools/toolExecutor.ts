import { toolErr, toolUnknown } from './types';
import { validateArgs } from './validateArgs';
import { effectiveCapabilities } from '../permissions';
import { NoopTracer, TOOL_CALL, TOOL_RESULT } from '../trace';
import { errorMessage } from '../utils/errors';

import type { AgentConfig } from '../agent';
import type { ToolCall, ToolExecutor, ToolProvider, ToolResult } from './types';
import type { ToolDef } from '../llm/llmGateway';
import type { AgentGrant } from '../permissions';
import type { Tracer } from '../trace';

/**
 * The single shared {@link ToolExecutor}: a required-capability tool runs only if both the agent's fixed
 * `grant` and the caller's `userPermissions` allow it. `dispatch` never throws. It emits `tool.call` before
 * and `tool.result` after every dispatch via the `tracer` accessor (default no-op).
 */
export const createToolExecutor = (tracer: () => Tracer = () => NoopTracer): ToolExecutor => {
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

    /** Validate → gate → run, returning a {@link ToolResult}. Never throws (errors become a result). */
    const route = async (agent: AgentConfig, call: ToolCall, userPermissions: AgentGrant): Promise<ToolResult> => {
        const { byName } = await indexTools(agent);
        const entry = byName.get(call.name);
        if (!entry) {
            return toolUnknown(call);
        }

        const schemaErrors = validateArgs(entry.def.parameters, call.args);
        if (schemaErrors.length > 0) {
            return toolErr(call, `invalid args: ${schemaErrors.join('; ')}`);
        }

        // A required capability is gated twice: the agent's fixed grant AND the user's role ceiling must both allow it.
        const cap = entry.def.requires;
        if (cap) {
            if (!effectiveCapabilities(agent.grant).has(cap)) {
                return toolErr(call, `permission denied: ${call.name} requires ${cap}`);
            }
            if (!effectiveCapabilities(userPermissions).has(cap)) {
                return toolErr(call, `permission denied: ${call.name} requires ${cap} (not permitted for this role)`);
            }
        }

        try {
            return await entry.provider.dispatch(call);
        } catch (err) {
            return toolErr(call, errorMessage(err));
        }
    };

    return {
        listTools: async (agent: AgentConfig) => (await indexTools(agent)).defs,

        dispatch: async (agent: AgentConfig, call: ToolCall, userPermissions: AgentGrant): Promise<ToolResult> => {
            const t = tracer();
            t.emit({ name: TOOL_CALL, fields: { toolCallId: call.id, name: call.name, args: call.args } });
            const result = await route(agent, call, userPermissions);
            t.emit({
                name: TOOL_RESULT,
                fields: result.ok
                    ? { toolCallId: call.id, ok: true, data: result.data }
                    : { toolCallId: call.id, ok: false, error: result.error },
            });
            return result;
        },
    };
};
