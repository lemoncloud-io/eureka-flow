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

export interface SocketStateProps {
    isConnected: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
    reconnectAttempts: number;
    maxReconnectReached: boolean;
    onReconnect: () => void;
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
    socketState?: SocketStateProps;
    onShare: () => void;
}

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
                'bg-transparent border-none rounded px-1 py-0.5',
                'text-sm font-medium text-foreground outline-none',
                'hover:bg-accent/30 focus:bg-accent/50',
                'transition-colors duration-150 min-w-[120px] max-w-[200px]'
            )}
            placeholder={t('header.untitledWorkflow')}
        />
    );
};

const ToolbarButton: React.FC<{
    onClick: () => void;
    icon: React.ReactNode;
    tooltip: string;
    shortcut?: string;
    active?: boolean;
    variant?: 'default' | 'success' | 'warning' | 'error';
}> = ({ onClick, icon, tooltip, shortcut, active, variant = 'default' }) => {
    const variantStyles = {
        default: 'text-muted-foreground hover:text-foreground',
        success: 'text-emerald-500',
        warning: 'text-amber-500',
        error: 'text-red-500',
    };

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={onClick}
                        className={cn(
                            'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150',
                            'hover:bg-accent/60',
                            variantStyles[variant],
                            active && 'bg-accent/40'
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
};

const getRelativeTime = (date: Date, t: (key: string, options?: { count: number }) => string): string => {
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) return t('time.justNow');
    if (seconds < 60) return t('time.secondsAgo', { count: seconds });
    if (minutes < 60) return t('time.minutesAgo', { count: minutes });
    if (hours < 24) return t('time.hoursAgo', { count: hours });
    return date.toLocaleDateString();
};

const SaveStatusBadge: React.FC<{
    saveStatus?: SaveStatus;
    lastSavedAt: Date | null;
}> = ({ saveStatus, lastSavedAt }) => {
    const { t } = useTranslation(['common']);
    const [, forceUpdate] = useState(0);

    // Update relative time every 10 seconds
    useEffect(() => {
        if (!lastSavedAt || saveStatus !== 'idle') return;
        const interval = setInterval(() => forceUpdate(n => n + 1), 10000);
        return () => clearInterval(interval);
    }, [lastSavedAt, saveStatus]);

    if (saveStatus === 'saving') {
        return <span className="text-[11px] text-blue-500 font-medium animate-pulse">{t('status.saving')}</span>;
    }

    if (saveStatus === 'error') {
        return <span className="text-[11px] text-red-500 font-medium">{t('status.saveFailed')}</span>;
    }

    if (saveStatus === 'success') {
        return <span className="text-[11px] text-emerald-500 font-medium">{t('status.saved')}</span>;
    }

    if (lastSavedAt) {
        return (
            <span className="text-[11px] text-muted-foreground" title={lastSavedAt.toLocaleString()}>
                {getRelativeTime(lastSavedAt, t)}
            </span>
        );
    }

    return <span className="text-[11px] text-muted-foreground">{t('status.unsaved')}</span>;
};

const SocketDot: React.FC<SocketStateProps> = ({
    isConnected,
    connectionStatus,
    reconnectAttempts,
    maxReconnectReached,
    onReconnect,
}) => {
    const { t } = useTranslation(['flows']);

    const getConfig = () => {
        if (isConnected) {
            return { color: 'bg-sky-500', animate: true, tooltip: 'Live', clickable: false };
        }
        if (connectionStatus === 'connecting') {
            return { color: 'bg-sky-400', animate: true, tooltip: t('header.socketConnecting'), clickable: false };
        }
        if (connectionStatus === 'reconnecting') {
            return {
                color: 'bg-amber-500',
                animate: true,
                tooltip: `${t('header.socketReconnecting')} (${reconnectAttempts})`,
                clickable: false,
            };
        }
        if (connectionStatus === 'error' || maxReconnectReached) {
            return {
                color: 'bg-red-500',
                animate: false,
                tooltip: `${t('header.socketError')} - Click to retry`,
                clickable: true,
            };
        }
        return { color: 'bg-zinc-400', animate: false, tooltip: 'Offline - Click to connect', clickable: true };
    };

    const config = getConfig();

    const dot = (
        <div
            className={cn(
                'w-2 h-2 rounded-full transition-colors',
                config.color,
                config.animate && 'animate-pulse',
                config.clickable && 'cursor-pointer hover:scale-125'
            )}
            onClick={config.clickable ? onReconnect : undefined}
        />
    );

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center justify-center w-8 h-8">{dot}</div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {config.tooltip}
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
    socketState,
    onShare,
}) => {
    const { t } = useTranslation(['flows']);

    const getSaveButtonVariant = (): 'default' | 'success' | 'warning' | 'error' => {
        if (saveState.saveStatus === 'saving') return 'warning';
        if (saveState.saveStatus === 'error') return 'error';
        if (saveState.saveStatus === 'success') return 'success';
        return 'default';
    };

    return (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
            <div className="flex items-center justify-between px-4 py-3">
                {/* Left: Brand + Flow Info */}
                <div className="pointer-events-auto">
                    <div
                        className={cn(
                            'flex items-center gap-2 h-10 px-3 rounded-xl',
                            'bg-background/80 backdrop-blur-xl border border-border/50',
                            'shadow-sm'
                        )}
                    >
                        <Workflow className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="text-sm font-semibold text-foreground">FlowMosaic</span>
                        <div className="w-px h-4 bg-border/60" />
                        <FlowNameInput {...flowInfo} />
                        <SaveStatusBadge saveStatus={saveState.saveStatus} lastSavedAt={saveState.lastSavedAt} />
                    </div>
                </div>

                {/* Right: Toolbar */}
                <div className="pointer-events-auto flex items-center gap-2">
                    {/* Edit Tools */}
                    <div
                        className={cn(
                            'flex items-center h-10 px-1 rounded-xl',
                            'bg-background/80 backdrop-blur-xl border border-border/50',
                            'shadow-sm'
                        )}
                    >
                        <ToolbarButton
                            onClick={editActions.onSave}
                            icon={<Save className="w-4 h-4" />}
                            tooltip={t('header.saveFlow')}
                            shortcut="⌘S"
                            variant={getSaveButtonVariant()}
                        />
                        <ToolbarButton
                            onClick={editActions.onUndo}
                            icon={<Undo2 className="w-4 h-4" />}
                            tooltip={t('header.undo')}
                            shortcut="⌘Z"
                        />
                        <ToolbarButton
                            onClick={editActions.onRedo}
                            icon={<Redo2 className="w-4 h-4" />}
                            tooltip={t('header.redo')}
                            shortcut="⌘⇧Z"
                        />
                        <ToolbarButton
                            onClick={editActions.onAutoLayout}
                            icon={<LayoutGrid className="w-4 h-4" />}
                            tooltip={t('header.autoLayout')}
                            shortcut="⌘L"
                        />
                        {socketState && <SocketDot {...socketState} />}
                    </div>

                    {/* Primary Actions */}
                    {executionActions.isRunning ? (
                        <Button
                            onClick={executionActions.onStopAll}
                            variant="destructive"
                            size="sm"
                            className="h-10 px-4 rounded-xl text-xs font-medium shadow-sm"
                        >
                            <Square className="w-3.5 h-3.5 mr-1.5" />
                            {t('header.stopAll')}
                        </Button>
                    ) : (
                        <Button
                            onClick={executionActions.onRunAll}
                            size="sm"
                            className="h-10 px-4 rounded-xl text-xs font-medium bg-primary hover:bg-primary/90 shadow-sm"
                        >
                            <Play className="w-3.5 h-3.5 mr-1.5" />
                            {t('header.runAll')}
                        </Button>
                    )}

                    {/* Menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    'flex items-center justify-center w-10 h-10 rounded-xl',
                                    'bg-background/80 backdrop-blur-xl border border-border/50',
                                    'text-muted-foreground hover:text-foreground',
                                    'shadow-sm transition-colors duration-150'
                                )}
                            >
                                <Menu className="w-4 h-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
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
                            <DropdownMenuItem onClick={onShare}>
                                <Link className="w-4 h-4 mr-2" />
                                {t('header.share')}
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

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

                            <div className="flex items-center justify-between px-2 py-1.5">
                                <span className="text-sm">{t('header.autoSave')}</span>
                                <button
                                    onClick={saveState.onToggleAutoSave}
                                    className={cn(
                                        'w-9 h-5 rounded-full p-0.5 transition-colors relative',
                                        saveState.isAutoSaveEnabled ? 'bg-primary' : 'bg-muted'
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'w-4 h-4 bg-white rounded-full shadow-sm transition-transform absolute top-0.5',
                                            saveState.isAutoSaveEnabled ? 'translate-x-4' : 'translate-x-0.5'
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
