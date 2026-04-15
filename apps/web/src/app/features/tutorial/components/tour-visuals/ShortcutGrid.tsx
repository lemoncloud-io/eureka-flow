import React from 'react';

const SHORTCUTS = [
    { keys: '⌘ S', label: '저장' },
    { keys: '⌘ Z', label: '실행취소' },
    { keys: '⌘⇧Z', label: '다시실행' },
    { keys: '⌘ O', label: '플로우 목록' },
    { keys: '⌘⇧R', label: '모두실행' },
    { keys: '⌘⇧A', label: '자동정렬' },
];

/** 2x3 grid showing keyboard shortcuts for the "빠른 작업" step */
export const ShortcutGrid: React.FC = () => (
    <div className="grid grid-cols-3 gap-2 px-4">
        {SHORTCUTS.map(({ keys, label }) => (
            <div
                key={keys}
                className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background px-2 py-2"
            >
                <kbd className="text-xs font-mono font-semibold text-primary">{keys}</kbd>
                <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
        ))}
    </div>
);
