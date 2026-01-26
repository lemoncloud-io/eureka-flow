import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Download,
    FileText,
    FolderOpen,
    LayoutGrid,
    Link,
    Play,
    Redo2,
    Save,
    Square,
    Trash2,
    Undo2,
    Upload,
} from 'lucide-react';

import { cn } from '@flows/lib/utils';
import {
    Button,
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
}

export interface ExecutionActionsProps {
    onRunAll: () => void;
    onStopAll: () => void;
    isRunning: boolean;
}

export interface SaveStateProps {
    isSaving: boolean;
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
    danger = false,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    tooltip: string;
    shortcut?: string;
    danger?: boolean;
}) => (
    <TooltipProvider delayDuration={300}>
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150',
                        danger
                            ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
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

const Divider = () => <div className="h-5 w-px bg-glass-border mx-1" />;

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

const SaveStatusIndicator: React.FC<
    Pick<SaveStateProps, 'lastSavedAt' | 'saveStatus' | 'saveError' | 'onRetrySave'>
> = ({ lastSavedAt, saveStatus = 'idle', saveError, onRetrySave }) => {
    const { t } = useTranslation(['common']);

    const baseClass = 'w-[72px] text-[10px] flex items-center justify-end gap-1.5';

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
        return (
            <span className={cn(baseClass, 'text-muted-foreground')}>
                {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        );
    }

    return <span className={cn(baseClass, 'text-muted-foreground')}>{t('status.unsaved')}</span>;
};

const AutoSaveToggle: React.FC<Pick<SaveStateProps, 'isAutoSaveEnabled' | 'onToggleAutoSave'>> = ({
    isAutoSaveEnabled,
    onToggleAutoSave,
}) => {
    const { t } = useTranslation(['flows']);

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={onToggleAutoSave}
                        className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-accent/50 transition-colors"
                    >
                        <div
                            className={cn(
                                'w-7 h-4 rounded-full p-0.5 transition-colors relative',
                                isAutoSaveEnabled ? 'bg-success' : 'bg-muted-foreground/30'
                            )}
                        >
                            <div
                                className={cn(
                                    'w-3 h-3 bg-white rounded-full shadow-sm transition-transform absolute top-0.5',
                                    isAutoSaveEnabled ? 'left-[calc(100%-14px)]' : 'left-0.5'
                                )}
                            />
                        </div>
                        <span
                            className={cn(
                                'text-[10px] font-medium uppercase tracking-wider',
                                isAutoSaveEnabled ? 'text-success' : 'text-muted-foreground'
                            )}
                        >
                            Auto
                        </span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {t('header.toggleAutoSave')}
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
            <div className="flex items-center justify-between px-4 py-3">
                {/* Left Section - Title + Save Status */}
                <div className="pointer-events-auto flex items-center gap-3">
                    <GlassPill>
                        <FlowNameInput {...flowInfo} />
                        <SaveStatusIndicator
                            lastSavedAt={saveState.lastSavedAt}
                            saveStatus={saveState.saveStatus}
                            saveError={saveState.saveError}
                            onRetrySave={saveState.onRetrySave}
                        />
                    </GlassPill>
                </div>

                {/* Center Section - Edit Tools */}
                <div className="pointer-events-auto flex items-center gap-2">
                    <GlassPill>
                        <IconButton
                            onClick={fileActions.onNew}
                            icon={<FileText className="w-4 h-4" />}
                            tooltip={t('header.newFlow')}
                            shortcut="⌘N"
                        />
                        <IconButton
                            onClick={fileActions.onLoad}
                            icon={<FolderOpen className="w-4 h-4" />}
                            tooltip={t('header.openFlow')}
                            shortcut="⌘O"
                        />
                        <IconButton
                            onClick={fileActions.onSave}
                            icon={<Save className="w-4 h-4" />}
                            tooltip={t('header.saveFlow')}
                            shortcut="⌘S"
                        />
                        <Divider />
                        <IconButton
                            onClick={fileActions.onExport}
                            icon={<Download className="w-4 h-4" />}
                            tooltip={t('header.exportJson')}
                            shortcut="⌘E"
                        />
                        <IconButton
                            onClick={fileActions.onImport}
                            icon={<Upload className="w-4 h-4" />}
                            tooltip={t('header.importJson')}
                        />
                    </GlassPill>

                    <GlassPill>
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
                    </GlassPill>

                    <GlassPill>
                        <IconButton
                            onClick={editActions.onAutoLayout}
                            icon={<LayoutGrid className="w-4 h-4" />}
                            tooltip={t('header.autoLayout')}
                            shortcut="⌘L"
                        />
                        <IconButton
                            onClick={editActions.onClear}
                            icon={<Trash2 className="w-4 h-4" />}
                            tooltip={t('header.clearCanvas')}
                            danger
                        />
                    </GlassPill>
                </div>

                {/* Right Section - Run + Share + Settings */}
                <div className="pointer-events-auto flex items-center gap-3">
                    <GlassPill className="gap-2">
                        <AutoSaveToggle
                            isAutoSaveEnabled={saveState.isAutoSaveEnabled}
                            onToggleAutoSave={saveState.onToggleAutoSave}
                        />
                        <Divider />
                        <ThemeToggle />
                        <LanguageSwitcher />
                    </GlassPill>

                    {executionActions.isRunning ? (
                        <Button
                            onClick={executionActions.onStopAll}
                            variant="destructive"
                            size="sm"
                            className="rounded-full px-4 shadow-lg"
                        >
                            <Square className="w-3.5 h-3.5 mr-1.5" />
                            {t('header.stopAll')}
                        </Button>
                    ) : (
                        <Button
                            onClick={executionActions.onRunAll}
                            size="sm"
                            className="rounded-full px-4 bg-success hover:bg-success/90 text-success-foreground shadow-lg"
                        >
                            <Play className="w-3.5 h-3.5 mr-1.5" />
                            {t('header.runAll')}
                        </Button>
                    )}

                    <Button onClick={onShare} size="sm" className="rounded-full px-4 shadow-lg">
                        <Link className="w-3.5 h-3.5 mr-1.5" />
                        {t('header.share')}
                    </Button>
                </div>
            </div>
        </div>
    );
};
