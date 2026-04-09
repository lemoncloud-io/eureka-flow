import { useTranslation } from 'react-i18next';

import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

import { TUTORIAL_STEPS } from '../consts/tutorialSteps';

import type { TutorialStep } from '../consts/tutorialSteps';

interface TutorialOverlayProps {
    currentStep: number;
    step: TutorialStep;
    totalSteps: number;
    onNext: () => void;
    onPrev: () => void;
    onSkip: () => void;
}

export const TutorialOverlay = ({ currentStep, step, totalSteps, onNext, onPrev, onSkip }: TutorialOverlayProps) => {
    const { t } = useTranslation(['tutorial']);

    return (
        <div className="pointer-events-none absolute inset-0 z-40">
            <div className="pointer-events-auto border-b border-border/50 bg-background/95 backdrop-blur-md">
                <div className="flex items-center gap-4 px-5 py-3">
                    <div className="flex items-center gap-1.5">
                        {TUTORIAL_STEPS.map((_, i) => {
                            const isDone = i < currentStep;
                            const isActive = i === currentStep;
                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                                        isActive && 'bg-primary text-primary-foreground',
                                        isDone && 'bg-primary/15 text-primary',
                                        !isDone && !isActive && 'bg-muted text-muted-foreground/40'
                                    )}
                                >
                                    {isDone ? <Check className="h-3 w-3" /> : i + 1}
                                </div>
                            );
                        })}
                    </div>

                    <div className="h-6 w-px bg-border/50" />

                    <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold">{t(step.titleKey)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{t(step.descriptionKey)}</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        {currentStep > 0 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev}>
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onNext}>
                            {t('tutorial:cta.next')}
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
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
                        className="h-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
};
