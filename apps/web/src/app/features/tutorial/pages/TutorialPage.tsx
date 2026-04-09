import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useBlocks, useFlowsStore } from '@flows/flows';
import { useWebCoreStore, validateApiKey } from '@flows/web-core';

import { Sidebar, WorkflowCanvas } from '../../flows';
import { CompletionScreen } from '../components/CompletionScreen';
import { TutorialOverlay } from '../components/TutorialOverlay';
import { FALLBACK_BLOCKS, TUTORIAL_WORKFLOW } from '../consts/tutorialSteps';
import { useTutorialSteps } from '../hooks/useTutorialSteps';

import type { SidebarRef, WorkflowCanvasRef } from '../../flows';

const noop = () => {
    /* intentionally empty */
};

export const TutorialPage = () => {
    const { t } = useTranslation(['tutorial', 'flows']);
    const navigate = useNavigate();
    const canvasRef = useRef<WorkflowCanvasRef>(null);
    const sidebarRef = useRef<SidebarRef>(null);
    const driverRef = useRef<{ destroy: () => void } | null>(null);

    const { loadBlocks } = useBlocks();
    const { setApiKey } = useWebCoreStore();
    const [isReady, setIsReady] = useState(false);

    const { currentStep, step, totalSteps, isLastStep, goNext, goPrev, skipToEnd, markTutorialDone } =
        useTutorialSteps();

    // Boot: load blocks from public API, then pre-load tutorial workflow
    const bootedRef = useRef(false);
    useEffect(() => {
        if (bootedRef.current) return;
        bootedRef.current = true;

        const boot = async () => {
            try {
                await loadBlocks();
            } catch {
                // Fallback: use hardcoded blocks when public API is unavailable
                const store = useFlowsStore.getState();
                store.setBlockRegistry(FALLBACK_BLOCKS as Parameters<typeof store.setBlockRegistry>[0]);
                store.setBlocksLoaded(true);
            }
            setIsReady(true);
        };
        boot();
    }, [loadBlocks]);

    /** Run driver.js mini-tour (welcome + sidebar + canvas highlight) */
    const runGuidedTour = useCallback(async () => {
        const { driver } = await import('driver.js');
        await import('driver.js/dist/driver.css');

        const driverInstance = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            overlayColor: 'rgba(0, 0, 0, 0.6)',
            stagePadding: 8,
            stageRadius: 12,
            popoverClass: 'eureka-tour-popover',
            nextBtnText: t('flows:tour.next'),
            prevBtnText: t('flows:tour.prev'),
            doneBtnText: t('flows:tour.done'),
            progressText: t('flows:tour.progress'),
            steps: [
                {
                    popover: {
                        title: t('tutorial:steps.welcome.title'),
                        description: t('tutorial:steps.welcome.description'),
                        side: 'over' as const,
                        align: 'center' as const,
                    },
                },
                {
                    element: '[data-tour="sidebar"]',
                    popover: {
                        title: t('tutorial:steps.sidebar.title'),
                        description: t('tutorial:steps.sidebar.description'),
                        side: 'right' as const,
                        align: 'center' as const,
                    },
                },
                {
                    element: '[data-tour="canvas"]',
                    popover: {
                        title: t('tutorial:steps.canvas.title'),
                        description: t('tutorial:steps.canvas.description'),
                        side: 'over' as const,
                        align: 'center' as const,
                    },
                },
            ],
            onDestroyStarted: () => {
                driverInstance.destroy();
                driverRef.current = null;
            },
        });

        driverRef.current = driverInstance;
        driverInstance.drive();
    }, [t]);

    // Load pre-built workflow once canvas mounts, then auto-start mini-tour
    const workflowLoadedRef = useRef(false);
    useEffect(() => {
        if (!isReady || workflowLoadedRef.current) return;
        if (canvasRef.current) {
            workflowLoadedRef.current = true;
            canvasRef.current.loadWorkflow(TUTORIAL_WORKFLOW);
            const timer = setTimeout(runGuidedTour, 500);
            return () => clearTimeout(timer);
        }
    }, [isReady, runGuidedTour]);

    // Clean up driver.js on unmount
    useEffect(() => {
        return () => {
            driverRef.current?.destroy();
        };
    }, []);

    const handleAddNode = useCallback((type: string) => {
        canvasRef.current?.addNode(type);
    }, []);

    const handleOpenLibrary = useCallback(() => {
        sidebarRef.current?.open();
    }, []);

    const handleSkip = skipToEnd;

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

    return (
        <div className="relative h-screen overflow-hidden bg-canvas text-foreground">
            <div data-tour="canvas" className="absolute inset-0">
                <WorkflowCanvas
                    ref={canvasRef}
                    readOnly={false}
                    onNodeSelect={noop}
                    onChange={noop}
                    onOpenLibrary={handleOpenLibrary}
                    onConnectionError={noop}
                    onShowNotification={noop}
                />
            </div>

            <Sidebar ref={sidebarRef} onAddNode={handleAddNode} />

            {isLastStep ? (
                <CompletionScreen step={step} onSubmitKey={handleSubmitKey} onClose={goPrev} />
            ) : (
                <TutorialOverlay
                    currentStep={currentStep}
                    step={step}
                    totalSteps={totalSteps}
                    onNext={goNext}
                    onPrev={goPrev}
                    onSkip={handleSkip}
                />
            )}
        </div>
    );
};
