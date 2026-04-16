import React, { useCallback, useMemo } from 'react';

import { BlockTutorialConfirmDialog } from './BlockTutorialConfirmDialog';
import { TourArrow, getArrowPositionStyle } from './TourArrow';
import { TourOverlay } from './TourOverlay';
import { TourTooltip } from './TourTooltip';
import { useBlockTutorial } from '../hooks/useBlockTutorial';
import { useTooltipPosition } from '../hooks/useTooltipPosition';

interface BlockTutorialProps {
    onClose: () => void;
    onComplete?: () => void;
    onOpenHelp?: () => void;
}

const OVERLAY_OPACITY = 0.46;
const TOOLTIP_WIDTH = 420;

export const BlockTutorial: React.FC<BlockTutorialProps> = ({ onClose, onComplete, onOpenHelp }) => {
    const tutorial = useBlockTutorial(onComplete);
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
        if (tutorial.currentStep >= tutorial.totalSteps - 1) onClose();
    }, [tutorial, onClose]);

    const handlePrev = useCallback(() => {
        // Last step's secondary button is "도움말 보러가기"
        if (tutorial.step?.id === 'help') {
            tutorial.complete();
            onClose();
            onOpenHelp?.();
            return;
        }
        tutorial.prev();
    }, [tutorial, onClose, onOpenHelp]);

    const arrowStyle = useMemo(
        () => getArrowPositionStyle(tutorial.step?.arrowDirection ?? 'none'),
        [tutorial.step?.arrowDirection]
    );

    if (!tutorial.step) return null;

    return (
        <>
            <TourOverlay
                opacity={OVERLAY_OPACITY}
                highlightSelector={tutorial.step.targetSelector}
                onClose={handleClose}
            >
                <div style={tooltipStyle}>
                    <div className="relative">
                        <TourArrow
                            direction={tutorial.step.arrowDirection}
                            className="absolute z-10"
                            style={arrowStyle}
                        />
                        <TourTooltip
                            step={tutorial.step}
                            currentIndex={tutorial.currentStep}
                            totalSteps={tutorial.totalSteps}
                            width={TOOLTIP_WIDTH}
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
