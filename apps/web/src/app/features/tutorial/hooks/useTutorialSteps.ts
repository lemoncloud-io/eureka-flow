import { useCallback, useEffect, useState } from 'react';

import { useCanvasStore } from '@flows/flows';

import { SUCCESS_FEEDBACK_DELAY_MS, TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY } from '../consts/tutorialSteps';

export interface TutorialCanvasState {
    connectionCount: number;
    hasCompletedNode: boolean;
}

/**
 * @param canvasState - When provided, uses these values for step detection (desktop tutorial).
 *   Desktop WorkflowCanvas manages connections in local useState, NOT the Zustand store,
 *   so the caller must pass canvas state from the onChange callback.
 *   When omitted, falls back to the Zustand store (mobile tutorial uses store directly).
 */
export const useTutorialSteps = (canvasState?: TutorialCanvasState) => {
    const [currentStep, setCurrentStep] = useState(0);
    // Track the highest step reached so we don't auto-advance on revisited steps
    const [highestStep, setHighestStep] = useState(0);

    const step = TUTORIAL_STEPS[currentStep];
    const totalSteps = TUTORIAL_STEPS.length;
    const isLastStep = currentStep === totalSteps - 1;

    // Fallback: read from Zustand store when canvasState is not provided (mobile)
    const storeCanProceed = useCanvasStore(state => {
        if (canvasState) return false; // Skip store check when canvasState is provided
        switch (step.action) {
            case 'connect':
                return state.connections.length >= 1;
            case 'run':
                return state.nodes.some(n => n.status === 'COMPLETED');
            default:
                return true;
        }
    });

    // Use provided canvasState (desktop) or store-based detection (mobile)
    const canProceed = canvasState
        ? (() => {
              switch (step.action) {
                  case 'connect':
                      return canvasState.connectionCount >= 1;
                  case 'run':
                      return canvasState.hasCompletedNode;
                  default:
                      return true;
              }
          })()
        : storeCanProceed;

    // Only show success feedback & auto-advance on first visit to this step
    const isFirstVisit = currentStep >= highestStep;
    const isSuccess = canProceed && step.action !== 'done' && isFirstVisit;

    const goNext = useCallback(() => {
        if (currentStep < totalSteps - 1) {
            const next = currentStep + 1;
            setCurrentStep(next);
            setHighestStep(prev => Math.max(prev, next));
        }
    }, [currentStep, totalSteps]);

    const goPrev = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const skipToEnd = useCallback(() => {
        setCurrentStep(totalSteps - 1);
        setHighestStep(totalSteps - 1);
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
