import { useCallback, useEffect, useState } from 'react';

import { useCanvasStore } from '@flows/flows';

import { SUCCESS_FEEDBACK_DELAY_MS, TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY } from '../consts/tutorialSteps';

export const useTutorialSteps = () => {
    const [currentStep, setCurrentStep] = useState(0);

    const step = TUTORIAL_STEPS[currentStep];
    const totalSteps = TUTORIAL_STEPS.length;
    const isLastStep = currentStep === totalSteps - 1;

    // Reactive validation via Zustand subscription (no polling)
    const canProceed = useCanvasStore(state => {
        switch (step.action) {
            case 'connect':
                return state.connections.length >= 1;
            case 'run':
                return state.nodes.some(n => n.state === 'COMPLETED');
            default:
                return true;
        }
    });

    // Derived: true during the success feedback window
    const isSuccess = canProceed && step.action !== 'done';

    const goNext = useCallback(() => {
        if (currentStep < totalSteps - 1) {
            setCurrentStep(prev => prev + 1);
        }
    }, [currentStep, totalSteps]);

    const goPrev = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const skipToEnd = useCallback(() => {
        setCurrentStep(totalSteps - 1);
    }, [totalSteps]);

    // Auto-advance with success feedback for interactive steps (connect, run)
    useEffect(() => {
        if (!isSuccess) return;
        const timer = setTimeout(goNext, SUCCESS_FEEDBACK_DELAY_MS);
        return () => clearTimeout(timer);
    }, [isSuccess, goNext]);

    const markTutorialDone = useCallback(() => {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    }, []);

    return {
        currentStep,
        step,
        totalSteps,
        isLastStep,
        isSuccess,
        goNext,
        goPrev,
        skipToEnd,
        markTutorialDone,
    };
};
