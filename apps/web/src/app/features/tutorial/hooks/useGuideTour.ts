import { useCallback, useState } from 'react';

import { GUIDE_TOUR_STEPS, GUIDE_TOUR_STORAGE_KEY } from '../consts/guideTourSteps';

import type { TourStep } from '../types/tour';

export const useGuideTour = (onComplete?: () => void, customSteps?: TourStep[]) => {
    const [currentStep, setCurrentStep] = useState(0);

    const steps = customSteps ?? GUIDE_TOUR_STEPS;
    const step = steps[currentStep];

    const close = useCallback(() => {
        setCurrentStep(0);
    }, []);

    const next = useCallback(() => {
        if (currentStep >= steps.length - 1) {
            localStorage.setItem(GUIDE_TOUR_STORAGE_KEY, 'true');
            close();
            onComplete?.();
            return;
        }
        setCurrentStep(prev => prev + 1);
    }, [currentStep, steps.length, close, onComplete]);

    const prev = useCallback(() => {
        if (currentStep <= 0) return;
        setCurrentStep(prev => prev - 1);
    }, [currentStep]);

    return { step, currentStep, totalSteps: steps.length, close, next, prev };
};
