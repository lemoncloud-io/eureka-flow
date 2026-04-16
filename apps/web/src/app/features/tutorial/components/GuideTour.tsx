import React, { useCallback, useMemo } from 'react';

import { TourArrow, getArrowPositionStyle } from './TourArrow';
import { TourOverlay } from './TourOverlay';
import { TourTooltip } from './TourTooltip';
import { useGuideTour } from '../hooks/useGuideTour';
import { useTooltipPosition } from '../hooks/useTooltipPosition';

import type { TourStep } from '../types/tour';

interface GuideTourProps {
    onClose: () => void;
    onComplete?: () => void;
    /** Override default guide tour steps (e.g. for tutorial page with limited UI) */
    steps?: TourStep[];
    /** Called when the current step changes */
    onStepChange?: (stepId: string) => void;
}

const OVERLAY_OPACITY = 0.46;
const TOOLTIP_WIDTH = 360;

export const GuideTour: React.FC<GuideTourProps> = ({ onClose, onComplete, steps, onStepChange }) => {
    const tour = useGuideTour(onComplete, steps);
    const tooltipStyle = useTooltipPosition(tour.step?.targetSelector, tour.step?.arrowDirection);

    React.useEffect(() => {
        if (tour.step?.id) onStepChange?.(tour.step.id);
    }, [tour.step?.id, onStepChange]);

    const handleClose = useCallback(() => {
        tour.close();
        onClose();
    }, [tour, onClose]);

    const handleNext = useCallback(() => {
        const isLast = tour.currentStep >= tour.totalSteps - 1;
        tour.next();
        if (isLast) onClose();
    }, [tour, onClose]);

    const arrowStyle = useMemo(
        () => getArrowPositionStyle(tour.step?.arrowDirection ?? 'none'),
        [tour.step?.arrowDirection]
    );

    if (!tour.step) return null;

    return (
        <TourOverlay
            opacity={OVERLAY_OPACITY}
            highlightSelector={tour.step.targetSelector}
            interactive={false}
            onClose={handleClose}
        >
            <div style={tooltipStyle}>
                <div className="relative">
                    <TourArrow direction={tour.step.arrowDirection} className="absolute z-10" style={arrowStyle} />
                    <TourTooltip
                        step={tour.step}
                        currentIndex={tour.currentStep}
                        totalSteps={tour.totalSteps}
                        width={TOOLTIP_WIDTH}
                        onNext={handleNext}
                        onPrev={tour.prev}
                        onClose={handleClose}
                    />
                </div>
            </div>
        </TourOverlay>
    );
};
