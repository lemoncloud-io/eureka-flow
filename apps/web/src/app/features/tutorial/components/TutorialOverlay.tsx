import React from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

import type { TutorialStep } from '../consts/tutorialSteps';

interface TutorialOverlayProps {
    currentStep: number;
    step: TutorialStep;
    totalSteps: number;
    isSuccess: boolean;
    onNext: () => void;
    onPrev: () => void;
    onSkip: () => void;
}

const getStepState = (index: number, currentStep: number, isSuccess: boolean) => ({
    isDone: index < currentStep,
    isActive: index === currentStep,
    isSuccessActive: isSuccess && index === currentStep,
});

export const TutorialOverlay = ({
    currentStep,
    step,
    totalSteps,
    isSuccess,
    onNext,
    onPrev,
    onSkip,
}: TutorialOverlayProps) => {
    const { t } = useTranslation(['tutorial']);

    return (
        <div className="pointer-events-none absolute inset-0 z-40">
            <div className="pointer-events-auto border-b border-border/50 bg-background/95 backdrop-blur-md">
                <div className="flex items-center gap-4 px-5 py-3">
                    <StepIndicators currentStep={currentStep} totalSteps={totalSteps} isSuccess={isSuccess} />

                    <div className="h-6 w-px bg-border/50" />

                    <div className="min-w-0 flex-1">
                        {isSuccess ? (
                            <>
                                <span className="text-sm font-semibold text-green-500">
                                    {t('tutorial:feedback.great')}
                                </span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                    {t('tutorial:feedback.advancing')}
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="text-sm font-semibold">{t(step.titleKey)}</span>
                                <span className="ml-2 text-xs text-muted-foreground">{t(step.descriptionKey)}</span>
                            </>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        {currentStep > 0 && !isSuccess && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev}>
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        {!isSuccess && (
                            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onNext}>
                                {t('tutorial:cta.next')}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground/50"
                            onClick={onSkip}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                <div className="h-0.5 bg-border/30">
                    <div
                        className={cn(
                            'h-full transition-all duration-500 ease-out',
                            isSuccess ? 'bg-green-500' : 'bg-primary'
                        )}
                        style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

/** Step indicator circles for the banner */
const StepIndicators = React.memo(
    ({ currentStep, totalSteps, isSuccess }: { currentStep: number; totalSteps: number; isSuccess: boolean }) => (
        <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => {
                const { isDone, isActive, isSuccessActive } = getStepState(i, currentStep, isSuccess);
                return (
                    <div
                        key={i}
                        className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300',
                            isSuccessActive && 'bg-green-500 text-white tutorial-success-check',
                            !isSuccessActive && isActive && 'bg-primary text-primary-foreground',
                            !isSuccessActive && isDone && 'bg-primary/15 text-primary',
                            !isSuccessActive && !isDone && !isActive && 'bg-muted text-muted-foreground/40'
                        )}
                    >
                        {isSuccessActive || isDone ? <Check className="h-3 w-3" /> : i + 1}
                    </div>
                );
            })}
        </div>
    )
);
