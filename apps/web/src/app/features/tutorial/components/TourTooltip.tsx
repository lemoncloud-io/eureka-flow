import React from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { EurekaFlowLogo } from './tour-visuals/EurekaFlowLogo';
import { LottieConfetti } from './tour-visuals/LottieConfetti';

import type { TourStep } from '../types/tour';

interface TourTooltipProps {
    step: TourStep;
    currentIndex: number;
    totalSteps: number;
    width?: number;
    /** Hide step counter (e.g. for intro/completion modals) */
    hideCounter?: boolean;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
}

const VisualArea: React.FC<{ visual: NonNullable<TourStep['visual']>; width: number }> = ({ visual, width }) => (
    <div
        className="flex items-center justify-center overflow-hidden rounded-t-[22px] bg-muted"
        style={{ width, height: 184 }}
    >
        {visual.type === 'logo' && <EurekaFlowLogo />}
        {visual.type === 'icon' && (visual.element ?? <div className="h-16 w-16 rounded-xl bg-foreground" />)}
        {visual.type === 'confetti' && <LottieConfetti />}
        {visual.type === 'image' && <img src={visual.src} alt="" className="h-full w-full object-cover" />}
        {visual.type === 'images' && (
            <div className="flex gap-2 px-4">
                {visual.srcs.map(src => (
                    <img key={src} src={src} alt="" className="h-[140px] rounded-lg object-cover" />
                ))}
            </div>
        )}
    </div>
);

export const TourTooltip: React.FC<TourTooltipProps> = ({
    step,
    currentIndex,
    totalSteps,
    width = 360,
    hideCounter = false,
    onNext,
    onPrev,
    onClose,
}) => {
    const { t } = useTranslation('tutorial');

    return (
        <div className="relative overflow-hidden rounded-[22px] bg-background shadow-lg" style={{ width }}>
            <button
                onClick={onClose}
                aria-label={t('cta.close')}
                className={cn(
                    'absolute right-3.5 top-3.5 z-10 flex items-center justify-center rounded-full',
                    'border border-border bg-background p-2.5 shadow-[0_0_6px_rgba(0,0,0,0.14)]'
                )}
            >
                <X size={20} className="text-foreground" />
            </button>

            {step.visual && <VisualArea visual={step.visual} width={width} />}

            <div className="flex flex-col gap-5 p-5">
                <div className="flex flex-col gap-2">
                    <h3 className="text-base font-semibold leading-6 tracking-[-0.48px] text-foreground">
                        {step.title}
                    </h3>
                    <p className="whitespace-pre-line text-sm leading-[1.5] tracking-[-0.42px] text-muted-foreground">
                        {step.description}
                    </p>
                </div>

                <div className={cn('flex items-center', hideCounter && 'justify-end')}>
                    {!hideCounter && (
                        <span className="flex-1 text-sm font-semibold text-foreground">
                            {currentIndex + 1}/<span className="text-muted-foreground">{totalSteps}</span>
                        </span>
                    )}

                    <div className="flex gap-3">
                        {step.showSecondary !== false && currentIndex > 0 && (
                            <button
                                onClick={onPrev}
                                className={cn(
                                    'rounded-[10px] border border-border px-4 py-[9px]',
                                    'text-sm font-semibold leading-[22px] text-foreground'
                                )}
                            >
                                {step.secondaryLabel ?? t('cta.prev')}
                            </button>
                        )}
                        <button
                            onClick={onNext}
                            className={cn(
                                'rounded-[10px] bg-primary px-4 py-[9px]',
                                'text-sm font-semibold leading-[22px] text-white'
                            )}
                        >
                            {step.primaryLabel ?? (currentIndex === totalSteps - 1 ? t('cta.done') : t('cta.next'))}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
