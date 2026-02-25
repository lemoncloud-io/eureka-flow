import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Blocks, BookOpen, Keyboard, Sparkles } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@flows/ui-kit';

import { BlockReferenceContent, ExamplesContent, GettingStartedContent, KeyboardShortcutsContent } from './help';

import type { HelpTab, WorkflowTemplate } from './help';

const TABS: { key: HelpTab; icon: typeof BookOpen }[] = [
    { key: 'gettingStarted', icon: BookOpen },
    { key: 'blocks', icon: Blocks },
    { key: 'shortcuts', icon: Keyboard },
    { key: 'examples', icon: Sparkles },
];

interface HelpDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUseTemplate?: (template: WorkflowTemplate) => void;
    defaultTab?: HelpTab;
}

export const HelpDialog = ({ open, onOpenChange, onUseTemplate, defaultTab = 'gettingStarted' }: HelpDialogProps) => {
    const { t } = useTranslation(['flows']);
    const [activeTab, setActiveTab] = useState<HelpTab>(defaultTab);

    // Sync activeTab with defaultTab when dialog opens
    useEffect(() => {
        if (open) {
            setActiveTab(defaultTab);
        }
    }, [open, defaultTab]);

    const handleUseTemplate = (template: WorkflowTemplate) => {
        onUseTemplate?.(template);
        onOpenChange(false);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'gettingStarted':
                return <GettingStartedContent />;
            case 'blocks':
                return <BlockReferenceContent />;
            case 'shortcuts':
                return <KeyboardShortcutsContent />;
            case 'examples':
                return <ExamplesContent onUseTemplate={handleUseTemplate} />;
            default:
                return null;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn('max-w-3xl h-[600px] p-0 gap-0', 'bg-background/95 backdrop-blur-xl', 'flex flex-col')}
            >
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-primary" />
                            {t('flows:help.title')}
                        </DialogTitle>
                    </div>
                </DialogHeader>

                {/* Tabs */}
                <div className="px-6 py-3 border-b border-border flex-shrink-0">
                    <div className="flex gap-1">
                        {TABS.map(({ key, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors',
                                    activeTab === key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {t(`flows:help.tabs.${key}`)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">{renderContent()}</div>

                {/* Footer with keyboard hint */}
                <div className="px-6 py-3 border-t border-border flex-shrink-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t('flows:help.keyboardHint')}</span>
                        <button
                            onClick={() => onOpenChange(false)}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                            <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Esc</kbd>
                            <span>{t('flows:help.close')}</span>
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
