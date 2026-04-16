import React, { useCallback, useMemo } from 'react';

import { BlockTutorialConfirmDialog } from './BlockTutorialConfirmDialog';
import { TourArrow, getArrowPositionStyle } from './TourArrow';
import { TourOverlay } from './TourOverlay';
import { TourTooltip } from './TourTooltip';
import { useInteractiveTutorial } from '../hooks/useInteractiveTutorial';
import { useTooltipPosition } from '../hooks/useTooltipPosition';

import type { SidebarRef, WorkflowCanvasRef } from '../../flows';

interface InteractiveTutorialProps {
    canvasRef: React.RefObject<WorkflowCanvasRef | null>;
    sidebarRef: React.RefObject<SidebarRef | null>;
    onClose: () => void;
    onComplete?: () => void;
}

const OVERLAY_OPACITY = 0.46;
const DEFAULT_TOOLTIP_WIDTH = 360;

export const InteractiveTutorial: React.FC<InteractiveTutorialProps> = ({
    canvasRef,
    sidebarRef,
    onClose,
    onComplete,
}) => {
    const handleComplete = useCallback(() => {
        onComplete?.();
        onClose();
    }, [onClose, onComplete]);

    const tutorial = useInteractiveTutorial({
        canvasRef,
        sidebarRef,
        onComplete: handleComplete,
    });

    const tooltipWidth = tutorial.step?.tooltipWidth ?? DEFAULT_TOOLTIP_WIDTH;
    const tooltipStyle = useTooltipPosition(tutorial.step?.targetSelector, tutorial.step?.arrowDirection);

    const handleClose = useCallback(() => {
        tutorial.requestClose();
    }, [tutorial]);

    const handleConfirmClose = useCallback(() => {
        tutorial.close();
        onClose();
    }, [tutorial, onClose]);

    const handleNext = useCallback(() => {
        tutorial.next();
    }, [tutorial]);

    const handlePrev = useCallback(() => {
        tutorial.prev();
    }, [tutorial]);

    const arrowStyle = useMemo(
        () => getArrowPositionStyle(tutorial.step?.arrowDirection ?? 'none'),
        [tutorial.step?.arrowDirection]
    );

    if (!tutorial.step) return null;

    const isModalStep = tutorial.step.action === 'start' || tutorial.step.action === 'complete';
    const isAutoStep = tutorial.step.action === 'auto';
    // For auto/generating steps, block interaction; for confirm steps with target, block too
    const interactive = false;

    // Convert InteractiveTourStep to TourStep shape for TourTooltip
    const tourStepCompat = {
        ...tutorial.step,
        visual: tutorial.step.visual,
    };

    return (
        <>
            <TourOverlay
                opacity={OVERLAY_OPACITY}
                highlightSelector={tutorial.step.targetSelector}
                interactive={interactive}
                onClose={handleClose}
            >
                <div style={tooltipStyle}>
                    <div className="relative">
                        {!isModalStep && tutorial.step.targetSelector && (
                            <TourArrow
                                direction={tutorial.step.arrowDirection}
                                className="absolute z-10"
                                style={arrowStyle}
                            />
                        )}
                        <TourTooltip
                            step={tourStepCompat}
                            currentIndex={tutorial.currentStep}
                            totalSteps={tutorial.totalSteps}
                            width={tooltipWidth}
                            hideCounter={isModalStep || isAutoStep}
                            onNext={handleNext}
                            onPrev={handlePrev}
                            onClose={handleClose}
                        />
                    </div>
                </div>
            </TourOverlay>

            {tutorial.showConfirmDialog && (
                <BlockTutorialConfirmDialog onCancel={tutorial.cancelClose} onConfirm={handleConfirmClose} />
            )}
        </>
    );
};
