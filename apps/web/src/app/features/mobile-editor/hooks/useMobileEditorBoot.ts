import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBlocks, useCanvasStore, useFlows } from '@flows/flows';
import { useWebCoreStore } from '@flows/web-core';

import type { SerializeWorkflowFn } from './types';

interface UseMobileEditorBootParams {
    serializeWorkflowState: SerializeWorkflowFn;
    lastSavedStateRef: React.MutableRefObject<string | null>;
}

interface UseMobileEditorBootReturn {
    isAppReady: boolean;
    loadingText: string;
    bootError: string | null;
    isApiKeyDialogOpen: boolean;
    setIsApiKeyDialogOpen: (open: boolean) => void;
    handleApiKeySubmit: (key: string) => Promise<boolean>;
    reBoot: () => void;
    updateUrl: (flowId: string | null) => void;
}

export const useMobileEditorBoot = ({
    serializeWorkflowState,
    lastSavedStateRef,
}: UseMobileEditorBootParams): UseMobileEditorBootReturn => {
    const { t } = useTranslation(['flows']);
    const { loadBlocks } = useBlocks();
    const { initializeFlow, loadFlowById } = useFlows();
    const { apiKey, setApiKey } = useWebCoreStore();

    const [isAppReady, setIsAppReady] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [bootError, setBootError] = useState<string | null>(null);
    const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);

    const bootedRef = useRef(false);

    const updateUrl = useCallback((flowId: string | null) => {
        try {
            const path = flowId ? `/flows/${flowId}` : '/editor';
            if (window.location.pathname !== path) {
                window.history.replaceState({ flowId }, '', path);
            }
        } catch {
            // ignore
        }
    }, []);

    const boot = useCallback(async () => {
        setBootError(null);
        setIsAppReady(false);

        const currentApiKey = useWebCoreStore.getState().apiKey;
        const pathParts = window.location.pathname.split('/');
        const flowIdFromUrl = pathParts.length > 2 && pathParts[1] === 'flows' ? pathParts[2] : null;

        if (!currentApiKey && !flowIdFromUrl) {
            setIsApiKeyDialogOpen(true);
            return;
        }

        setLoadingText(t('flowEditor.initializingEngine'));
        try {
            setLoadingText(t('flowEditor.loadingBlockRegistry'));
            await loadBlocks();

            let loadedId: string | null = null;
            let initialFlow = null;

            if (flowIdFromUrl) {
                setLoadingText(t('flowEditor.loadingFlow', { flowId: flowIdFromUrl }));
                initialFlow = await loadFlowById(flowIdFromUrl);
                if (!initialFlow) {
                    if (!currentApiKey) {
                        throw new Error(t('flowEditor.flowNotPublic', 'This flow is private.'));
                    }
                    throw new Error(t('flowEditor.failedToLoadFlow'));
                }
                loadedId = flowIdFromUrl;
            } else {
                setLoadingText(t('flowEditor.initializingFlow'));
                const result = await initializeFlow();
                loadedId = result.flowId;
                initialFlow = result.flowData;
            }

            if (initialFlow) {
                useCanvasStore.getState().loadWorkflow(initialFlow);
                lastSavedStateRef.current = serializeWorkflowState(initialFlow);
            }

            if (loadedId) {
                updateUrl(loadedId);
            }

            setIsAppReady(true);
        } catch (e) {
            console.error('[MobileFlowEditor] Boot failed:', e);
            setBootError(e instanceof Error ? e.message : t('flowEditor.errorLoadingApp'));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;
        boot();
    }, [boot]);

    const handleApiKeySubmit = useCallback(
        async (key: string): Promise<boolean> => {
            setApiKey(key);
            setIsApiKeyDialogOpen(false);
            bootedRef.current = false;
            setTimeout(() => boot(), 0);
            return true;
        },
        [setApiKey, boot]
    );

    const reBoot = useCallback(() => {
        bootedRef.current = false;
        boot();
    }, [boot]);

    return {
        isAppReady,
        loadingText,
        bootError,
        isApiKeyDialogOpen,
        setIsApiKeyDialogOpen,
        handleApiKeySubmit,
        reBoot,
        updateUrl,
    };
};
