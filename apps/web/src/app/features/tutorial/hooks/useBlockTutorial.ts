import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BLOCK_TUTORIAL_STORAGE_KEY, createBlockTutorialSteps } from '../consts/blockTutorialSteps';

export const useBlockTutorial = (onComplete?: () => void) => {
    const { t } = useTranslation('tutorial');
    const [currentStep, setCurrentStep] = useState(0);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const steps = useMemo(() => createBlockTutorialSteps(t), [t]);
    const step = steps[currentStep];

    const close = useCallback(() => {
        setCurrentStep(0);
        setShowConfirmDialog(false);
    }, []);

    const complete = useCallback(() => {
        localStorage.setItem(BLOCK_TUTORIAL_STORAGE_KEY, 'true');
        close();
        onComplete?.();
    }, [close, onComplete]);

    const next = useCallback(() => {
        if (currentStep >= steps.length - 1) {
            complete();
            return;
        }
        setCurrentStep(prev => prev + 1);
    }, [currentStep, steps.length, complete]);

    const prev = useCallback(() => {
        if (currentStep <= 0) return;
        setCurrentStep(prev => prev - 1);
    }, [currentStep]);

    const requestClose = useCallback(() => {
        setShowConfirmDialog(true);
    }, []);

    const cancelClose = useCallback(() => {
        setShowConfirmDialog(false);
    }, []);

    return {
        step,
        currentStep,
        totalSteps: steps.length,
        showConfirmDialog,
        close,
        next,
        prev,
        requestClose,
        cancelClose,
        complete,
    };
};
