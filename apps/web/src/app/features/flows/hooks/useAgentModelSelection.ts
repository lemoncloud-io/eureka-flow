import { useCallback, useEffect, useState } from 'react';

import { useLlmModelsQuery } from '@flows/flows';

import type { AgentStorage } from '@flows/agent';
import type { LlmModelView } from '@lemoncloud/eureka-flows-api';

/** Per-flow persisted key for the chosen agent (reasoning) model. */
const KEY_PREFIX = 'agent-model:';
const keyFor = (flowId: string): string => `${KEY_PREFIX}${flowId}`;

export interface AgentModelSelection {
    /** The live server catalog (text models) — the selector's options. */
    models: LlmModelView[];
    /** Catalog still loading (selector should read as busy/empty). */
    isLoading: boolean;
    /** The user's current pick for this flow: persisted value, else the server-recommended default. */
    selected: string | undefined;
    /** Choose a model for this flow; persists immediately. Applying it to the agent is the caller's
     *  concern (committed at the next turn boundary — see FlowAgentPanel). */
    setSelected: (name: string) => void;
}

/**
 * The agent's reasoning-model choice for one flow: fetches the live model catalog
 * (`useLlmModelsQuery`, same source as the block `ModelSelect`) and remembers the pick **per flow**
 * through the injected {@link AgentStorage} (survives reload / flow-switch). Falls back to the
 * server-recommended default when a flow has no saved pick. Selection only — the caller owns when
 * the choice reaches the running agent.
 */
export const useAgentModelSelection = ({
    flowId,
    storage,
}: {
    flowId: string;
    storage: AgentStorage;
}): AgentModelSelection => {
    const { data, isLoading } = useLlmModelsQuery({ image: false });
    const models = data?.list ?? [];
    const serverDefault = data?.default || undefined;

    const [selected, setSelected] = useState<string | undefined>(undefined);
    const [persistedLoaded, setPersistedLoaded] = useState(false);

    // Load this flow's saved pick (once per flow); clear while switching so a stale pick never leaks.
    useEffect(() => {
        let cancelled = false;
        setSelected(undefined);
        setPersistedLoaded(false);
        void storage
            .getJson<string>(keyFor(flowId))
            .then(saved => {
                if (cancelled) return;
                if (saved) setSelected(saved);
                setPersistedLoaded(true);
            })
            .catch(() => {
                if (!cancelled) setPersistedLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [flowId, storage]);

    // No saved pick for this flow → adopt the server default once the catalog resolves.
    useEffect(() => {
        if (persistedLoaded && !selected && serverDefault) {
            setSelected(serverDefault);
        }
    }, [persistedLoaded, selected, serverDefault]);

    const choose = useCallback(
        (name: string) => {
            setSelected(name);
            void storage.setJson(keyFor(flowId), name).catch(() => undefined);
        },
        [flowId, storage]
    );

    return { models, isLoading, selected, setSelected: choose };
};
