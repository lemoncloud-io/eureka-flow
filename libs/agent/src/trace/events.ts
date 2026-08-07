/**
 * The event vocabulary — one source of truth shared by the emitters (decorators + agent core) and the
 * projectors, so a name can never drift between where it is written and where it is read.
 */
export const LLM_REQUEST = 'llm.request';
export const LLM_RESPONSE = 'llm.response';
export const LLM_ERROR = 'llm.error';
export const TOOL_CALL = 'tool.call';
export const TOOL_RESULT = 'tool.result';
export const MESSAGE = 'message';
export const CANVAS_MUTATE = 'canvas.mutate';
export const AGENT_SPAWN = 'agent.spawn';
export const AGENT_RETURN = 'agent.return';
export const TURN_START = 'turn.start';
export const TURN_STEP = 'turn.step';
export const TURN_DONE = 'turn.done';
export const TURN_ERROR = 'turn.error';
