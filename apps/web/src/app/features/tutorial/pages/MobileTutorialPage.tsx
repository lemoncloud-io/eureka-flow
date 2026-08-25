import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { createFlowEngine } from '@flows/engine';
import { useBlocks, useCanvasStore, useFlowsStore } from '@flows/flows';
import { useWebCoreStore, validateApiKey } from '@flows/web-core';

import { useEngineMirror } from '../../flows/hooks/useEngineMirror';
import { MobileConnectionSheet, MobileStepList } from '../../mobile-editor/components';
import { useConnectionMode } from '../../mobile-editor/hooks';
import { loadFlowIntoEngine } from '../../mobile-editor/utils';
import { CompletionScreen } from '../components/CompletionScreen';
import { MobileTutorialOverlay } from '../components/MobileTutorialOverlay';
import { FALLBACK_BLOCKS, TUTORIAL_WORKFLOW } from '../consts/tutorialSteps';
import { useTutorialSteps } from '../hooks/useTutorialSteps';

import type { BlockDefinitionWithFrontend } from '@flows/flows';

export const MobileTutorialPage = () => {
    const { t } = useTranslation(['tutorial', 'flows']);
    const navigate = useNavigate();

    const { loadBlocks, blockRegistry } = useBlocks();
    const { setApiKey } = useWebCoreStore();
    const [isReady, setIsReady] = useState(false);

    const { currentStep, step, totalSteps, isLastStep, isSuccess, goNext, goPrev, skipToEnd, markTutorialDone } =
        useTutorialSteps();

    const setTutorialHint = useCanvasStore(s => s.setTutorialHint);
    const currentHint = step.hint ?? null;
    useEffect(() => {
        setTutorialHint(currentHint);
    }, [currentHint, setTutorialHint]);

    useEffect(() => {
        return () => useCanvasStore.getState().setTutorialHint(null);
    }, []);

    // The tutorial edits a canned graph with the same hooks the editor uses, so it needs
    // the same engine behind them. Nothing here is saved — it is thrown away on exit.
    // The registry goes in for the same reason the editor passes it: without it `connect`
    // never raises INCOMPATIBLE_PORTS, and the tutorial is where a wrong connection is
    // most likely to be tried on purpose.
    const blockRegistryRef = useRef(blockRegistry);
    blockRegistryRef.current = blockRegistry as Record<string, BlockDefinitionWithFrontend>;
    const engine = useMemo(() => createFlowEngine({ getBlockRegistry: () => blockRegistryRef.current }), []);
    useEngineMirror(engine, { paused: false });

    const connectionMode = useConnectionMode(blockRegistry as Record<string, BlockDefinitionWithFrontend>, engine);
    const handleTapCard = useCallback(() => {
        /* intentionally empty — tutorial doesn't open config */
    }, []);

    const bootedRef = useRef(false);
    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;

        const boot = async () => {
            try {
                await loadBlocks();
            } catch {
                const store = useFlowsStore.getState();
                store.setBlockRegistry(FALLBACK_BLOCKS as Parameters<typeof store.setBlockRegistry>[0]);
                store.setBlocksLoaded(true);
            }

            loadFlowIntoEngine(engine, TUTORIAL_WORKFLOW);
            setIsReady(true);
        };
        boot();
    }, [loadBlocks]);

    const handleSubmitKey = useCallback(
        async (key: string): Promise<boolean> => {
            const result = await validateApiKey(key);
            if (result.valid) {
                setApiKey(key);
                useWebCoreStore.getState().addApiKey(key, { profile: result.profile });
                markTutorialDone();
                navigate('/editor');
                return true;
            }
            return false;
        },
        [setApiKey, markTutorialDone, navigate]
    );

    if (!isReady) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground">
                <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="sticky top-0 z-30 border-b border-border/40 bg-background/95 backdrop-blur-md">
                <div className="flex items-center justify-center h-12 px-4">
                    <div className="flex items-center gap-2">
                        <img src="/logo/purple-symbol.png" alt="Eureka Flow" className="h-5 w-5" />
                        <span className="text-sm font-semibold">{t('tutorial:title', 'Tutorial')}</span>
                    </div>
                </div>
            </div>

            <div className="pt-3 pb-40">
                <MobileStepList
                    engine={engine}
                    onTapCard={handleTapCard}
                    onAddStep={() => {
                        /* tutorial does not allow adding steps */
                    }}
                    role="editor"
                />
            </div>

            {connectionMode.source && (
                <MobileConnectionSheet
                    open={connectionMode.isOpen}
                    onOpenChange={open => {
                        if (!open) connectionMode.close();
                    }}
                    sourceNodeName={connectionMode.source.nodeName}
                    sourcePortName={connectionMode.source.portName}
                    sourcePortDataType={connectionMode.source.portDataType}
                    sourceNodeId={connectionMode.source.nodeId}
                    sourcePortId={connectionMode.source.portId}
                    compatibleTargets={connectionMode.compatibleTargets}
                    onConnect={(targetNodeId, targetPortId) => {
                        connectionMode.connectTo(targetNodeId, targetPortId);
                    }}
                    onDisconnect={connectionMode.disconnect}
                />
            )}

            {isLastStep ? (
                <CompletionScreen step={step} onSubmitKey={handleSubmitKey} onClose={goPrev} />
            ) : (
                <MobileTutorialOverlay
                    currentStep={currentStep}
                    step={step}
                    totalSteps={totalSteps}
                    isSuccess={isSuccess}
                    onNext={goNext}
                    onSkip={skipToEnd}
                />
            )}
        </div>
    );
};
