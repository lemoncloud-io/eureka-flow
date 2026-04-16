import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import { ArrowRight, Cable, Play, Plus, Sparkles } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface EmptyStateGuideProps {
    onAddBlock?: () => void;
}

const STEPS = [
    { icon: Plus, key: 'addBlocks' },
    { icon: Cable, key: 'connectNodes' },
    { icon: Play, key: 'executeFlow' },
] as const;

export const EmptyStateGuide = ({ onAddBlock }: EmptyStateGuideProps) => {
    const { t } = useTranslation(['flows']);
    const location = useLocation();
    const isExplorePage = location.pathname === '/flows';

    return (
        <div className={cn('absolute inset-0 flex items-center justify-center', 'pointer-events-none')}>
            <div
                className={cn(
                    'max-w-md w-full mx-4 p-8 rounded-2xl text-center',
                    'bg-glass-bg backdrop-blur-[24px] border border-glass-border',
                    'shadow-floating pointer-events-auto',
                    'animate-in fade-in-0 zoom-in-95 duration-300'
                )}
            >
                {/* Icon */}
                <div
                    className={cn(
                        'w-14 h-14 mx-auto mb-5 rounded-2xl',
                        'bg-primary/10 flex items-center justify-center'
                    )}
                >
                    <Sparkles className="w-7 h-7 text-primary" />
                </div>

                {/* Title */}
                <h2 className="text-lg font-semibold mb-1">{t('help.emptyState.title')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('help.emptyState.description')}</p>

                {/* 3-Step Guide */}
                <div className="flex flex-col gap-3 mb-6 text-left">
                    {STEPS.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-3">
                            <div
                                className={cn(
                                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                    'bg-primary/10 text-primary text-xs font-bold'
                                )}
                            >
                                {i + 1}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <step.icon className="w-4 h-4 shrink-0" />
                                <span>{t(`help.emptyState.steps.${step.key}`)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 justify-center mb-5">
                    <button
                        onClick={onAddBlock}
                        className={cn(
                            'flex items-center justify-center gap-2 px-5 py-2.5',
                            'bg-primary text-primary-foreground rounded-lg',
                            'hover:bg-primary/90 transition-colors',
                            'text-sm font-medium shadow-lg shadow-primary/20'
                        )}
                    >
                        <Plus className="w-4 h-4" />
                        {t('help.emptyState.actions.addBlock')}
                    </button>

                    {!isExplorePage && (
                        <RouterLink
                            to="/flows"
                            className={cn(
                                'flex items-center justify-center gap-2 px-5 py-2.5',
                                'bg-muted hover:bg-muted/80 rounded-lg',
                                'transition-colors text-sm font-medium'
                            )}
                        >
                            <ArrowRight className="w-4 h-4" />
                            {t('help.emptyState.actions.browseExamples')}
                        </RouterLink>
                    )}
                </div>

                {/* Keyboard Hint */}
                <p className="text-[11px] text-muted-foreground/50">{t('help.emptyState.tips.keyboard')}</p>
            </div>
        </div>
    );
};
