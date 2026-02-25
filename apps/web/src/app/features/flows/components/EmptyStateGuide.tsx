import { useTranslation } from 'react-i18next';

import { BookOpen, Lightbulb, Plus, Sparkles } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface EmptyStateGuideProps {
    onAddBlock?: () => void;
    onBrowseExamples?: () => void;
    onViewHelp?: () => void;
}

export const EmptyStateGuide = ({ onAddBlock, onBrowseExamples, onViewHelp }: EmptyStateGuideProps) => {
    const { t } = useTranslation(['flows']);

    return (
        <div className={cn('absolute inset-0 flex items-center justify-center', 'pointer-events-none')}>
            <div
                className={cn(
                    'max-w-md p-8 rounded-2xl text-center',
                    'bg-glass-bg backdrop-blur-[24px] border border-glass-border',
                    'shadow-floating pointer-events-auto',
                    'animate-in fade-in-0 zoom-in-95 duration-300'
                )}
            >
                {/* Icon */}
                <div
                    className={cn(
                        'w-16 h-16 mx-auto mb-6 rounded-2xl',
                        'bg-primary/10 flex items-center justify-center'
                    )}
                >
                    <Sparkles className="w-8 h-8 text-primary" />
                </div>

                {/* Title & Description */}
                <h2 className="text-xl font-semibold mb-2">{t('flows:help.emptyState.title')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('flows:help.emptyState.description')}</p>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
                    <button
                        onClick={onAddBlock}
                        className={cn(
                            'flex items-center justify-center gap-2 px-4 py-2.5',
                            'bg-primary text-primary-foreground rounded-lg',
                            'hover:bg-primary/90 transition-colors',
                            'text-sm font-medium'
                        )}
                    >
                        <Plus className="w-4 h-4" />
                        {t('flows:help.emptyState.actions.addBlock')}
                    </button>

                    <button
                        onClick={onBrowseExamples}
                        className={cn(
                            'flex items-center justify-center gap-2 px-4 py-2.5',
                            'bg-muted hover:bg-muted/80 rounded-lg',
                            'transition-colors text-sm font-medium'
                        )}
                    >
                        <Sparkles className="w-4 h-4" />
                        {t('flows:help.emptyState.actions.browseExamples')}
                    </button>

                    <button
                        onClick={onViewHelp}
                        className={cn(
                            'flex items-center justify-center gap-2 px-4 py-2.5',
                            'bg-muted hover:bg-muted/80 rounded-lg',
                            'transition-colors text-sm font-medium'
                        )}
                    >
                        <BookOpen className="w-4 h-4" />
                        {t('flows:help.emptyState.actions.viewHelp')}
                    </button>
                </div>

                {/* Tips */}
                <div className="pt-4 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span className="font-medium">{t('flows:help.emptyState.tips.title')}</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                        <p>{t('flows:help.emptyState.tips.search')}</p>
                        <p>{t('flows:help.emptyState.tips.connect')}</p>
                        <p>{t('flows:help.emptyState.tips.help')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
