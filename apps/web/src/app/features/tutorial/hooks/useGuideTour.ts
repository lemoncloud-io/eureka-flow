import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GUIDE_TOUR_STORAGE_KEY, createGuideTourSteps } from '../consts/guideTourSteps';

import type { TourStep } from '../types/tour';

export const useGuideTour = (onComplete?: () => void, customSteps?: TourStep[]) => {
    const { t } = useTranslation('tutorial');
    const [currentStep, setCurrentStep] = useState(0);

    const defaultSteps = useMemo(() => createGuideTourSteps(t), [t]);
    const steps = customSteps ?? defaultSteps;
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
