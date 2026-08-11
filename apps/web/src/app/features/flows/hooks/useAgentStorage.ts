import { useMemo } from 'react';

import { createBrowserAgentStorage } from '@flows/agent';

import type { AgentStorage } from '@flows/agent';

/**
 * One localStorage-backed {@link AgentStorage} per editor page (keys namespaced under `flow_mosaic_agent_`).
 * Persistence only — observability is a separate concern (see `useAgentTrace`). Stable for the page's
 * lifetime so a StrictMode remount never swaps the store mid-session.
 */
export const useAgentStorage = (): AgentStorage => useMemo(() => createBrowserAgentStorage(), []);
