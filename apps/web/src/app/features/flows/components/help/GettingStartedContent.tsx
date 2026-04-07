import { useTranslation } from 'react-i18next';

import { Download, GitBranch, Globe, MousePointer2, Play, Plus, Save, Settings } from 'lucide-react';

import { cn } from '@flows/lib/utils';

const STEPS = [
    { key: 'navigate', icon: MousePointer2 },
    { key: 'addBlock', icon: Plus },
    { key: 'connect', icon: GitBranch },
    { key: 'configure', icon: Settings },
    { key: 'run', icon: Play },
    { key: 'save', icon: Save },
    { key: 'publish', icon: Globe },
    { key: 'importExport', icon: Download },
] as const;

export const GettingStartedContent = () => {
    const { t } = useTranslation(['flows']);

    return (
        <div className="space-y-6">
            <div className="text-sm text-muted-foreground">{t('flows:help.gettingStarted.intro')}</div>

            <div className="space-y-4">
                {STEPS.map(({ key, icon: Icon }, index) => (
                    <div
                        key={key}
                        className={cn('flex gap-4 p-4 rounded-lg', 'bg-muted/30 hover:bg-muted/50 transition-colors')}
                    >
                        <div
                            className={cn(
                                'flex-shrink-0 w-10 h-10 rounded-full',
                                'bg-primary/10 text-primary',
                                'flex items-center justify-center'
                            )}
                        >
                            <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                                <h3 className="font-medium">{t(`flows:help.gettingStarted.steps.${key}.title`)}</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {t(`flows:help.gettingStarted.steps.${key}.description`)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
