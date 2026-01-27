import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Download,
    FileText,
    FolderOpen,
    LayoutGrid,
    Link,
    Menu,
    Play,
    Redo2,
    Save,
    Square,
    Trash2,
    Undo2,
    Upload,
    Workflow,
} from 'lucide-react';

import { cn } from '@flows/lib/utils';
import {
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
    LanguageSwitcher,
    ThemeToggle,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@flows/ui-kit';

import type { SaveStatus } from '@flows/flows';

export interface FlowInfoProps {
    flowName: string;
    onNameChange: (name: string) => void;
}

export interface FileActionsProps {
    onNew: () => void;
    onLoad: () => void;
    onSave: () => void;
    onExport: () => void;
    onImport: () => void;
}

export interface EditActionsProps {
    onUndo: () => void;
    onRedo: () => void;
    onAutoLayout: () => void;
    onClear: () => void;
    onSave: () => void;
}

export interface ExecutionActionsProps {
    onRunAll: () => void;
    onStopAll: () => void;
    isRunning: boolean;
}

export interface SaveStateProps {
    lastSavedAt: Date | null;
    isAutoSaveEnabled: boolean;
    onToggleAutoSave: () => void;
    saveStatus?: SaveStatus;
    saveError?: Error | null;
    onRetrySave?: () => void;
}

interface HeaderProps {
    flowInfo: FlowInfoProps;
    fileActions: FileActionsProps;
    editActions: EditActionsProps;
    executionActions: ExecutionActionsProps;
    saveState: SaveStateProps;
    onShare: () => void;
}

const GlassPill = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div
        className={cn(
            'flex items-center gap-1 px-2 py-1.5 rounded-full',
            'bg-glass-bg backdrop-blur-[24px] border border-glass-border',
            'shadow-floating transition-all duration-200',
            className
        )}
    >
        {children}
    </div>
);

const IconButton = ({
    onClick,
    icon,
    tooltip,
    shortcut,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    tooltip: string;
    shortcut?: string;
}) => (
    <TooltipProvider delayDuration={300}>
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150',
                        'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                >
                    {icon}
                </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
                {tooltip}
                {shortcut && <span className="ml-2 text-muted-foreground font-mono">{shortcut}</span>}
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
);

const FlowNameInput: React.FC<FlowInfoProps> = ({ flowName, onNameChange }) => {
    const { t } = useTranslation(['flows']);
    const [nameInput, setNameInput] = useState(flowName);

    useEffect(() => {
        setNameInput(flowName);
    }, [flowName]);

    const handleBlur = () => {
        if (nameInput.trim()) {
            onNameChange(nameInput);
        } else {
            setNameInput(flowName);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn(
                'bg-transparent border border-transparent rounded-md px-2 py-1',
                'text-sm font-semibold text-foreground outline-none w-44',
                'hover:border-glass-border focus:border-primary',
                'transition-all duration-150'
            )}
            placeholder={t('header.untitledWorkflow')}
        />
    );
};

const getRelativeTime = (date: Date, t: (key: string, options?: Record<string, unknown>) => string): string => {
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) return t('time.justNow', '방금');
    if (seconds < 60) return t('time.secondsAgo', { count: seconds, defaultValue: '{{count}}초 전' });
    if (minutes < 60) return t('time.minutesAgo', { count: minutes, defaultValue: '{{count}}분 전' });
    if (hours < 24) return t('time.hoursAgo', { count: hours, defaultValue: '{{count}}시간 전' });
    return date.toLocaleDateString();
};

const SaveStatusIndicator: React.FC<
    Pick<SaveStateProps, 'lastSavedAt' | 'saveStatus' | 'saveError' | 'onRetrySave'>
> = ({ lastSavedAt, saveStatus = 'idle', saveError, onRetrySave }) => {
    const { t } = useTranslation(['common']);
    const [, forceUpdate] = useState(0);

    // Update relative time every 10 seconds
    useEffect(() => {
        if (!lastSavedAt || saveStatus !== 'idle') return;
        const interval = setInterval(() => forceUpdate(n => n + 1), 10000);
        return () => clearInterval(interval);
    }, [lastSavedAt, saveStatus]);

    const baseClass = 'text-[10px] flex items-center justify-end gap-1.5 pr-2';

    if (saveStatus === 'saving') {
        return (
            <span className={cn(baseClass, 'text-muted-foreground')}>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                {t('status.saving')}
            </span>
        );
    }

    if (saveStatus === 'error') {
        const errorMessage = saveError?.message || t('status.saveFailed', 'Save failed');
        return (
            <button
                onClick={onRetrySave}
                className={cn(baseClass, 'text-destructive hover:text-destructive/80 transition-colors')}
                title={errorMessage}
            >
                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                {t('status.retry', 'Retry')}
            </button>
        );
    }

    if (saveStatus === 'success') {
        return (
            <span className={cn(baseClass, 'text-success animate-in fade-in duration-200')}>
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                {t('status.saved')}
            </span>
        );
    }

    if (lastSavedAt) {
        const relativeTime = getRelativeTime(lastSavedAt, t);
        return (
            <span className={cn(baseClass, 'text-muted-foreground')} title={lastSavedAt.toLocaleString()}>
                <span className="w-1.5 h-1.5 rounded-full bg-success/60" />
                {relativeTime}
            </span>
        );
    }

    return <span className={cn(baseClass, 'text-muted-foreground')}>{t('status.unsaved')}</span>;
};

const SaveButton: React.FC<{
    onClick: () => void;
    saveStatus?: SaveStatus;
}> = ({ onClick, saveStatus = 'idle' }) => {
    const { t } = useTranslation(['flows']);

    const getButtonState = () => {
        switch (saveStatus) {
            case 'saving':
                return {
                    icon: <Save className="w-4 h-4 animate-pulse" />,
                    className: 'text-blue-500',
                    tooltip: t('header.saving', 'Saving...'),
                };
            case 'success':
                return {
                    icon: <Save className="w-4 h-4" />,
                    className: 'text-success',
                    tooltip: t('header.saved', 'Saved'),
                };
            case 'error':
                return {
                    icon: <Save className="w-4 h-4" />,
                    className: 'text-destructive',
                    tooltip: t('header.saveFailed', 'Save failed'),
                };
            default:
                return {
                    icon: <Save className="w-4 h-4" />,
                    className: 'text-muted-foreground hover:text-foreground',
                    tooltip: t('header.saveFlow'),
                };
        }
    };

    const { icon, className, tooltip } = getButtonState();

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={onClick}
                        className={cn(
                            'flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150',
                            'hover:bg-accent/50',
                            className
                        )}
                    >
                        {icon}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {tooltip}
                    <span className="ml-2 text-muted-foreground font-mono">⌘S</span>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export const Header: React.FC<HeaderProps> = ({
    flowInfo,
    fileActions,
    editActions,
    executionActions,
    saveState,
    onShare,
}) => {
    const { t } = useTranslation(['flows']);

    return (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
            <div className="flex items-center justify-between px-6 py-3">
                {/* Left Section - Logo + Title + Save Status */}
                <div className="pointer-events-auto flex items-center gap-3">
                    <GlassPill className="gap-3 pl-3">
                        <Workflow className="w-5 h-5 text-primary" />
                        <span className="text-sm font-semibold text-foreground">FlowMosaic</span>
                        <div className="w-px h-5 bg-glass-border mx-1" />
                        <FlowNameInput {...flowInfo} />
                        <SaveStatusIndicator
                            lastSavedAt={saveState.lastSavedAt}
                            saveStatus={saveState.saveStatus}
                            saveError={saveState.saveError}
                            onRetrySave={saveState.onRetrySave}
                        />
                    </GlassPill>
                </div>

                {/* Center Section - Empty for clean look */}
                <div className="flex-1" />

                {/* Right Section - Actions */}
                <div className="pointer-events-auto flex items-center gap-2">
                    {/* Save + Undo/Redo + Auto Layout */}
                    <GlassPill>
                        <SaveButton onClick={editActions.onSave} saveStatus={saveState.saveStatus} />
                        <div className="w-px h-4 bg-glass-border" />
                        <IconButton
                            onClick={editActions.onUndo}
                            icon={<Undo2 className="w-4 h-4" />}
                            tooltip={t('header.undo')}
                            shortcut="⌘Z"
                        />
                        <IconButton
                            onClick={editActions.onRedo}
                            icon={<Redo2 className="w-4 h-4" />}
                            tooltip={t('header.redo')}
                            shortcut="⌘⇧Z"
                        />
                        <div className="w-px h-4 bg-glass-border" />
                        <IconButton
                            onClick={editActions.onAutoLayout}
                            icon={<LayoutGrid className="w-4 h-4" />}
                            tooltip={t('header.autoLayout')}
                            shortcut="⌘L"
                        />
                    </GlassPill>

                    {/* Run Button */}
                    {executionActions.isRunning ? (
                        <Button
                            onClick={executionActions.onStopAll}
                            variant="destructive"
                            size="sm"
                            className="rounded-full px-4 h-8 text-xs shadow-lg"
                        >
                            <Square className="w-3 h-3 mr-1" />
                            {t('header.stopAll')}
                        </Button>
                    ) : (
                        <Button
                            onClick={executionActions.onRunAll}
                            size="sm"
                            className="rounded-full px-4 h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
                        >
                            <Play className="w-3 h-3 mr-1" />
                            {t('header.runAll')}
                        </Button>
                    )}

                    {/* Share Button */}
                    <Button
                        onClick={onShare}
                        variant="secondary"
                        size="sm"
                        className="rounded-full px-4 h-8 text-xs shadow-lg"
                    >
                        <Link className="w-3 h-3 mr-1" />
                        {t('header.share')}
                    </Button>

                    {/* Menu Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    'flex items-center justify-center w-9 h-9 rounded-full',
                                    'bg-glass-bg backdrop-blur-[24px] border border-glass-border',
                                    'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                                    'shadow-floating transition-all duration-150'
                                )}
                            >
                                <Menu className="w-4 h-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {/* File Actions */}
                            <DropdownMenuItem onClick={fileActions.onNew}>
                                <FileText className="w-4 h-4 mr-2" />
                                {t('header.newFlow')}
                                <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={fileActions.onLoad}>
                                <FolderOpen className="w-4 h-4 mr-2" />
                                {t('header.openFlow')}
                                <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={fileActions.onSave}>
                                <Save className="w-4 h-4 mr-2" />
                                {t('header.saveFlow')}
                                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={fileActions.onExport}>
                                <Download className="w-4 h-4 mr-2" />
                                {t('header.exportJson')}
                                <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={fileActions.onImport}>
                                <Upload className="w-4 h-4 mr-2" />
                                {t('header.importJson')}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* Edit Actions */}
                            <DropdownMenuItem onClick={editActions.onAutoLayout}>
                                <LayoutGrid className="w-4 h-4 mr-2" />
                                {t('header.autoLayout')}
                                <DropdownMenuShortcut>⌘L</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={editActions.onClear} className="text-destructive">
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('header.clearCanvas')}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* Settings */}
                            <div className="flex items-center justify-between px-2 py-1.5">
                                <span className="text-sm">{t('header.autoSave')}</span>
                                <button
                                    onClick={saveState.onToggleAutoSave}
                                    className={cn(
                                        'w-8 h-5 rounded-full p-0.5 transition-colors relative',
                                        saveState.isAutoSaveEnabled ? 'bg-success' : 'bg-muted-foreground/30'
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'w-4 h-4 bg-white rounded-full shadow-sm transition-transform absolute top-0.5',
                                            saveState.isAutoSaveEnabled ? 'left-[calc(100%-18px)]' : 'left-0.5'
                                        )}
                                    />
                                </button>
                            </div>

                            <DropdownMenuSeparator />

                            <div className="flex items-center justify-between px-2 py-1.5">
                                <ThemeToggle />
                                <LanguageSwitcher />
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
};
