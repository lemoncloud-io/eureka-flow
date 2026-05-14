import React from 'react';
import { useTranslation } from 'react-i18next';

const SHORTCUT_KEYS = [
    { keys: '⌘ S', labelKey: 'shortcuts.save' },
    { keys: '⌘ Z', labelKey: 'shortcuts.undo' },
    { keys: '⌘⇧Z', labelKey: 'shortcuts.redo' },
    { keys: '⌘ O', labelKey: 'shortcuts.flowList' },
    { keys: '⌘⇧R', labelKey: 'shortcuts.runAll' },
    { keys: '⌘⇧A', labelKey: 'shortcuts.autoLayout' },
];

/** 2x3 grid showing keyboard shortcuts for the quick actions step */
export const ShortcutGrid: React.FC = () => {
    const { t } = useTranslation('tutorial');

    return (
        <div className="grid grid-cols-3 gap-2 px-4">
            {SHORTCUT_KEYS.map(({ keys, labelKey }) => (
                <div
                    key={keys}
                    className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background px-2 py-2"
                >
                    <kbd className="text-xs font-mono font-semibold text-primary">{keys}</kbd>
                    <span className="text-[10px] text-muted-foreground">{t(labelKey)}</span>
                </div>
            ))}
        </div>
    );
};
