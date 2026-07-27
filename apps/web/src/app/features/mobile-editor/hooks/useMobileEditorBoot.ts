import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    FLOW_FORBIDDEN,
    captureBaseline,
    getProfile,
    toAiKeyStatus,
    useBlocks,
    useCanvasStore,
    useFlows,
} from '@flows/flows';
import { useWebCoreStore, validateApiKey } from '@flows/web-core';

import { useDraftRecovery } from '../../flows/hooks/useDraftRecovery';

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

export const useMobileEditorBoot = (): UseMobileEditorBootReturn => {
    const { t } = useTranslation(['flows']);
    const { loadBlocks } = useBlocks();
    const { initializeFlow, loadFlowById } = useFlows();
    const recoverDraft = useDraftRecovery();
    const { setApiKey } = useWebCoreStore();

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
            // Fetch AI key availability (fire-and-forget, parallel with loadBlocks)
            if (currentApiKey) {
                getProfile()
                    .then(data => {
                        const store = useWebCoreStore.getState();
                        store.setAiKeyStatus(toAiKeyStatus(data));
                        store.addApiKey(currentApiKey);
                        store.updateKeyProfile(currentApiKey, { sid: data.sid, uid: data.uid });
                    })
                    .catch(err => console.warn('[MobileFlowEditor] Profile fetch failed:', err));
            }

            setLoadingText(t('flowEditor.loadingBlockRegistry'));
            await loadBlocks();

            let loadedId: string | null = null;
            let initialFlow = null;

            if (flowIdFromUrl) {
                setLoadingText(t('flowEditor.loadingFlow', { flowId: flowIdFromUrl }));
                try {
                    initialFlow = await loadFlowById(flowIdFromUrl);
                } catch (loadErr) {
                    if (loadErr instanceof Error && loadErr.message === FLOW_FORBIDDEN) {
                        throw new Error(
                            t('flowEditor.flowForbidden', 'You do not have permission to access this flow.')
                        );
                    }
                    throw loadErr;
                }
                if (!initialFlow) {
                    if (!currentApiKey) {
                        throw new Error(t('flowEditor.flowNotPublic', 'This flow is private.'));
                    }
                    throw new Error(t('flowEditor.failedToLoadFlow'));
                }
                loadedId = initialFlow.id ?? flowIdFromUrl;
            } else {
                setLoadingText(t('flowEditor.initializingFlow'));
                const result = await initializeFlow();
                loadedId = result.flowId;
                initialFlow = result.flowData;
            }

            if (initialFlow) {
                useCanvasStore.getState().loadWorkflow(initialFlow);
                // Baseline off the store, not off initialFlow, and only here — after
                // loadBlocks. The registry resolves each node's type on the way into a
                // snapshot, so a baseline taken any earlier reads dirty against a flow
                // nobody has touched, and every load would trip auto-save.
                const { nodes, connections } = useCanvasStore.getState();
                captureBaseline({ nodes, connections });
            }

            // After the baseline: the draft is judged against it, and before it exists
            // every flow looks unsaved.
            await recoverDraft(working => useCanvasStore.getState().loadWorkflow(working));

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
            const result = await validateApiKey(key);
            if (!result.valid) return false;
            setApiKey(key);
            useWebCoreStore.getState().addApiKey(key, { profile: result.profile });
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
