import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useBlocks, useCanvasStore, useFlowsStore } from '@flows/flows';
import { useWebCoreStore, validateApiKey } from '@flows/web-core';

import { Header, Sidebar, WorkflowCanvas } from '../../flows';
import { BlockTutorial } from '../components/BlockTutorial';
import { CompletionScreen } from '../components/CompletionScreen';
import { GuideTour } from '../components/GuideTour';
import { TutorialOverlay } from '../components/TutorialOverlay';
import { FALLBACK_BLOCKS, TUTORIAL_WORKFLOW } from '../consts/tutorialSteps';
import { useTutorialSteps } from '../hooks/useTutorialSteps';

import type { SidebarRef, WorkflowCanvasRef } from '../../flows';
import type { TutorialCanvasState } from '../hooks/useTutorialSteps';

type TourPhase = 'guide' | 'block' | 'none';

const noop = () => {
    /* intentionally empty */
};

export const TutorialPage = () => {
    const { t } = useTranslation(['tutorial', 'flows']);
    const navigate = useNavigate();
    const canvasRef = useRef<WorkflowCanvasRef>(null);
    const sidebarRef = useRef<SidebarRef>(null);

    const { loadBlocks } = useBlocks();
    const { setApiKey } = useWebCoreStore();
    const [isReady, setIsReady] = useState(false);
    const [tourPhase, setTourPhase] = useState<TourPhase>('none');
    const [canvasState, setCanvasState] = useState<TutorialCanvasState>({
        connectionCount: 0,
        hasCompletedNode: false,
    });

    const { currentStep, step, totalSteps, isLastStep, isSuccess, goNext, goPrev, skipToEnd, markTutorialDone } =
        useTutorialSteps(canvasState);

    // Set tutorial hint on canvas store for NodeBlock visual hints
    const setTutorialHint = useCanvasStore(s => s.setTutorialHint);
    const currentHint = step.hint ?? null;
    useEffect(() => {
        setTutorialHint(currentHint);
    }, [currentHint, setTutorialHint]);

    useEffect(() => {
        return () => useCanvasStore.getState().setTutorialHint(null);
    }, []);

    // Boot: load blocks from public API, then pre-load tutorial workflow
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
            setIsReady(true);
        };
        boot();
    }, [loadBlocks]);

    // Load pre-built workflow once canvas mounts, then auto-start guide tour
    const workflowLoadedRef = useRef(false);
    useEffect(() => {
        if (!isReady || workflowLoadedRef.current) return;
        if (canvasRef.current) {
            workflowLoadedRef.current = true;
            canvasRef.current.loadWorkflow(TUTORIAL_WORKFLOW);
            const timer = setTimeout(() => setTourPhase('guide'), 500);
            return () => clearTimeout(timer);
        }
    }, [isReady]);

    // When block tutorial starts, open the sidebar so block categories are visible
    useEffect(() => {
        if (tourPhase === 'block') {
            sidebarRef.current?.open();
        }
    }, [tourPhase]);

    const handleGuideTourClose = useCallback(() => {
        // Guide tour done → start block tutorial
        setTourPhase('block');
    }, []);

    const handleBlockTutorialClose = useCallback(() => {
        setTourPhase('none');
        sidebarRef.current?.close();
    }, []);

    const handleCanvasChange = useCallback(() => {
        const workflow = canvasRef.current?.getWorkflow();
        if (!workflow) return;
        setCanvasState({
            connectionCount: workflow.edges?.length ?? 0,
            hasCompletedNode: workflow.nodes?.some(n => n.status === 'COMPLETED') ?? false,
        });
    }, []);

    const handleAddNode = useCallback((type: string) => {
        canvasRef.current?.addNode(type);
    }, []);

    const handleOpenLibrary = useCallback(() => {
        sidebarRef.current?.open();
    }, []);

    const handleSubmitKey = useCallback(
        async (key: string): Promise<boolean> => {
            const isValid = await validateApiKey(key);
            if (isValid) {
                setApiKey(key);
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
            <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
                <div className="relative h-16 w-16">
                    <div className="absolute inset-0 rounded-full border-4 border-border" />
                    <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
                <div className="animate-pulse text-sm text-muted-foreground">{t('tutorial:loading')}</div>
            </div>
        );
    }

    const isTourActive = tourPhase !== 'none';

    return (
        <div className="relative h-screen overflow-hidden bg-canvas text-foreground">
            <div data-tour="canvas" className="absolute inset-0">
                <WorkflowCanvas
                    ref={canvasRef}
                    readOnly={false}
                    onNodeSelect={noop}
                    onChange={handleCanvasChange}
                    onOpenLibrary={handleOpenLibrary}
                    onConnectionError={noop}
                    onShowNotification={noop}
                />
            </div>

            <Header
                flowInfo={{ flowName: t('tutorial:flowName', '모델 합성'), onNameChange: noop }}
                fileActions={{ onNew: noop, onSave: noop, onExport: noop, onExportPng: noop }}
                editActions={{
                    onUndo: noop,
                    onRedo: noop,
                    onAutoLayout: noop,
                    onClear: noop,
                    onSave: noop,
                    onCollapseAll: noop,
                    onExpandAll: noop,
                    onRunAll: noop,
                }}
                saveState={{
                    lastSavedAt: new Date(),
                    isAutoSaveEnabled: false,
                    onToggleAutoSave: noop,
                    saveStatus: 'idle',
                }}
                role="owner"
            />

            <Sidebar ref={sidebarRef} onAddNode={handleAddNode} />

            {!isTourActive &&
                (isLastStep ? (
                    <CompletionScreen step={step} onSubmitKey={handleSubmitKey} onClose={goPrev} />
                ) : (
                    <TutorialOverlay
                        currentStep={currentStep}
                        step={step}
                        totalSteps={totalSteps}
                        isSuccess={isSuccess}
                        onNext={goNext}
                        onPrev={goPrev}
                        onSkip={skipToEnd}
                    />
                ))}

            {tourPhase === 'guide' && <GuideTour onClose={handleGuideTourClose} />}
            {tourPhase === 'block' && <BlockTutorial onClose={handleBlockTutorialClose} />}
        </div>
    );
};
