import { toolErr, toolOk } from './types';

import type { ToolCall, ToolProvider, ToolResult } from './types';
import type { AgentRoster } from '../agents/roster';
import type { SpawnInput, SubAgentRunner } from '../agents/subAgentRunner';
import type { CanvasBinding } from '../canvas/canvasBinding';
import type { ToolDef } from '../llm/llmGateway';

const LIST_AGENTS_DEF: ToolDef = {
    name: 'list_agents',
    description:
        'List the specialists available to delegate to: each type and a one-line description of what ' +
        'it can do. Discover your roster here — do not assume any specialist that is not listed.',
    parameters: { type: 'object', properties: {} },
};

/** Orchestrator-only `list_agents` provider: returns the compact agent directory read from the registry. */
export const createAgentDirectoryToolProvider = (roster: AgentRoster): ToolProvider => ({
    listTools: () => [LIST_AGENTS_DEF],
    dispatch: (call: ToolCall): ToolResult => toolOk(call, { agents: roster.list() }),
});

const SPAWN_DEF: ToolDef = {
    name: 'spawn',
    description:
        'Delegate one or more concrete tasks to specialists (types from list_agents). Each child edits ' +
        'the shared live canvas directly and returns a summary. Batch INDEPENDENT tasks as multiple children ' +
        'in one call (they run in parallel); sequence dependent tasks across separate spawn calls.',
    parameters: {
        type: 'object',
        properties: {
            children: {
                type: 'array',
                description: 'One entry per delegated task.',
                items: {
                    type: 'object',
                    properties: {
                        task: {
                            type: 'string',
                            description:
                                'A COMPLETE, self-contained instruction: concrete node id + concrete ' +
                                'values. The specialist cannot ask questions or see this conversation.',
                        },
                        agentType: {
                            type: 'string',
                            description: 'Which specialist to use (a type from list_agents).',
                        },
                    },
                    required: ['task', 'agentType'],
                },
            },
        },
        required: ['children'],
    },
};

/** Orchestrator-only `spawn` provider: fans children out over the live binding and returns their summaries. */
export const createSpawnToolProvider = (
    runner: SubAgentRunner,
    binding: CanvasBinding,
    getSignal?: () => AbortSignal | undefined
): ToolProvider => ({
    listTools: () => [SPAWN_DEF],
    dispatch: async (call: ToolCall): Promise<ToolResult> => {
        const { children } = call.args as SpawnInput;
        if (!Array.isArray(children) || children.length === 0) {
            return toolErr(call, 'spawn requires at least one child');
        }
        const results = await runner.fanOut(children, binding, getSignal?.());
        return toolOk(call, { children: results });
    },
});
