import { useTranslation } from 'react-i18next';

import { cn } from '@flows/lib/utils';

interface ShortcutItem {
    key: string;
    category: 'canvas' | 'editing' | 'workflow' | 'help';
}

const SHORTCUTS: ShortcutItem[] = [
    { key: 'pan', category: 'canvas' },
    { key: 'zoomIn', category: 'canvas' },
    { key: 'zoomOut', category: 'canvas' },
    { key: 'fitView', category: 'canvas' },
    { key: 'undo', category: 'editing' },
    { key: 'redo', category: 'editing' },
    { key: 'delete', category: 'editing' },
    { key: 'save', category: 'workflow' },
    { key: 'newFlow', category: 'workflow' },
    { key: 'export', category: 'workflow' },
    { key: 'autoLayout', category: 'workflow' },
    { key: 'openHelp', category: 'help' },
    { key: 'escape', category: 'help' },
];

const CATEGORIES = ['canvas', 'editing', 'workflow', 'help'] as const;

interface KeyBadgeProps {
    children: React.ReactNode;
}

const KeyBadge = ({ children }: KeyBadgeProps) => (
    <kbd
        className={cn(
            'inline-flex items-center justify-center',
            'min-w-[24px] h-6 px-1.5',
            'text-xs font-medium',
            'bg-muted border border-border rounded',
            'shadow-sm'
        )}
    >
        {children}
    </kbd>
);

export const KeyboardShortcutsContent = () => {
    const { t } = useTranslation(['flows']);

    const shortcutsByCategory = CATEGORIES.map(category => ({
        category,
        label: t(`flows:help.shortcuts.categories.${category}`),
        shortcuts: SHORTCUTS.filter(s => s.category === category),
    }));

    return (
        <div className="space-y-6">
            {shortcutsByCategory.map(({ category, label, shortcuts }) => (
                <div key={category}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">{label}</h3>
                    <div className="space-y-2">
                        {shortcuts.map(({ key }) => {
                            const shortcutLabel = t(`flows:help.shortcuts.keys.${key}.label`);
                            const keysData = t(`flows:help.shortcuts.keys.${key}.keys`, {
                                returnObjects: true,
                            });
                            const keys = Array.isArray(keysData) ? keysData : [];

                            return (
                                <div
                                    key={key}
                                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                                >
                                    <span className="text-sm">{shortcutLabel}</span>
                                    <div className="flex items-center gap-1">
                                        {keys.map((k, i) => (
                                            <span key={i} className="flex items-center gap-1">
                                                <KeyBadge>{k}</KeyBadge>
                                                {i < keys.length - 1 && (
                                                    <span className="text-muted-foreground text-xs">+</span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};
