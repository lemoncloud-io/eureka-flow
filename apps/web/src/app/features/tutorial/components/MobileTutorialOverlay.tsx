import React from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowRight, Check, SkipForward } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

import type { TutorialStep } from '../consts/tutorialSteps';

interface MobileTutorialOverlayProps {
    currentStep: number;
    step: TutorialStep;
    totalSteps: number;
    isSuccess: boolean;
    onNext: () => void;
    onSkip: () => void;
}

export const MobileTutorialOverlay = ({
    currentStep,
    step,
    totalSteps,
    isSuccess,
    onNext,
    onSkip,
}: MobileTutorialOverlayProps) => {
    const { t } = useTranslation(['tutorial']);

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[calc(1rem+env(safe-area-inset-bottom))] px-3">
            <div
                className={cn(
                    'pointer-events-auto rounded-2xl border shadow-lg backdrop-blur-xl',
                    'animate-in slide-in-from-bottom-4 fade-in duration-400',
                    isSuccess
                        ? 'border-success/30 bg-success/5 shadow-success/10'
                        : 'border-border/60 bg-background/95 shadow-black/5'
                )}
            >
                <div className="flex items-center justify-center gap-2 pt-3 pb-1">
                    {Array.from({ length: totalSteps }, (_, i) => (
                        <StepDot key={i} index={i} currentStep={currentStep} isSuccess={isSuccess} />
                    ))}
                </div>

                <div className="px-4 pb-3 pt-1">
                    {isSuccess ? (
                        <div className="flex items-center justify-center gap-2 py-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
                                <Check className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span className="text-sm font-semibold text-success">{t('tutorial:feedback.great')}</span>
                            <span className="text-xs text-muted-foreground">{t('tutorial:feedback.advancing')}</span>
                        </div>
                    ) : (
                        <>
                            <h3 className="text-[15px] font-semibold text-center mb-0.5">{t(step.titleKey)}</h3>
                            <p className="text-xs text-muted-foreground text-center leading-relaxed mb-3">
                                {t(step.descriptionKey)}
                            </p>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 flex-1 text-xs text-muted-foreground gap-1.5"
                                    onClick={onSkip}
                                >
                                    <SkipForward className="h-3 w-3" />
                                    {t('tutorial:cta.skip', 'Skip')}
                                </Button>
                                <Button size="sm" className="h-9 flex-[2] text-xs gap-1.5" onClick={onNext}>
                                    {t('tutorial:cta.next')}
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const StepDot = React.memo(
    ({ index, currentStep, isSuccess }: { index: number; currentStep: number; isSuccess: boolean }) => {
        const isDone = index < currentStep;
        const isActive = index === currentStep;
        const isSuccessActive = isSuccess && isActive;

        return (
            <div
                className={cn(
                    'h-1.5 rounded-full transition-all duration-500',
                    isSuccessActive && 'w-6 bg-success',
                    !isSuccessActive && isActive && 'w-6 bg-primary',
                    !isSuccessActive && isDone && 'w-1.5 bg-primary/40',
                    !isSuccessActive && !isDone && !isActive && 'w-1.5 bg-muted-foreground/20'
                )}
            />
        );
    }
);

StepDot.displayName = 'StepDot';
