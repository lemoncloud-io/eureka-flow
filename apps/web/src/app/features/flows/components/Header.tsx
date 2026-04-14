import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import {
    ChevronsDownUp,
    ChevronsUpDown,
    Download,
    EyeOff,
    FileText,
    FolderOpen,
    Globe,
    GraduationCap,
    HelpCircle,
    ImageDown,
    Key,
    LayoutGrid,
    MapPin,
    Menu,
    Play,
    Redo2,
    Save,
    Trash2,
    Undo2,
} from 'lucide-react';

import { useSystemInfoQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Badge,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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
    onSave: () => void;
    onExport: () => void;
    onExportPng?: () => void;
}

export interface EditActionsProps {
    onUndo: () => void;
    onRedo: () => void;
    onAutoLayout: () => void;
    onClear: () => void;
    onSave: () => void;
    onCollapseAll?: () => void;
    onExpandAll?: () => void;
    onRunAll?: () => void;
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
    saveState: SaveStateProps;
    socketState?: SocketStateProps;
    isPublic?: boolean;
    /** Read-only public viewing mode (no API key) */
    isPublicMode?: boolean;
    onTogglePublic?: () => void;
    onPublish?: () => void;
    onApiKeySettings?: () => void;
    onHelp?: () => void;
    onTour?: () => void;
    onOpenFlowList?: () => void;
    onGraphView?: () => void;
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
    variant?: 'default' | 'success' | 'warning' | 'error';
}> = ({ onClick, icon, tooltip, shortcut, variant = 'default' }) => {
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
                            variantStyles[variant]
                        )}
                    >
                        {icon}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {tooltip}
                    {shortcut && <span className="ml-2 text-primary-foreground/70 font-mono">{shortcut}</span>}
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
            return { color: 'bg-sky-500', animate: true, tooltip: t('header.socketLive'), clickable: false };
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
                tooltip: `${t('header.socketError')} - ${t('header.socketClickToRetry')}`,
                clickable: true,
            };
        }
        return {
            color: 'bg-zinc-400',
            animate: false,
            tooltip: `${t('header.socketOffline')} - ${t('header.socketClickToConnect')}`,
            clickable: true,
        };
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

/**
 * Version info component for dropdown menu
 */
const VersionInfo: React.FC = () => {
    const { data: systemInfo } = useSystemInfoQuery();
    const apiVersion = systemInfo?.components?.find(c => c.name === 'eureka-flows-api')?.version;

    return (
        <div className="px-2 py-1.5 text-[10px] text-muted-foreground/50 text-center">
            Web v{__APP_VERSION__} {apiVersion && `/ API v${apiVersion}`}
        </div>
    );
};

export const Header: React.FC<HeaderProps> = ({
    flowInfo,
    fileActions,
    editActions,
    saveState,
    socketState,
    isPublic,
    isPublicMode,
    onTogglePublic,
    onPublish,
    onApiKeySettings,
    onHelp,
    onTour,
    onOpenFlowList,
    onGraphView,
}) => {
    const { t } = useTranslation(['flows']);
    const navigate = useNavigate();

    const getSaveButtonVariant = (): 'default' | 'success' | 'warning' | 'error' => {
        if (saveState.saveStatus === 'saving') return 'warning';
        if (saveState.saveStatus === 'error') return 'error';
        if (saveState.saveStatus === 'success') return 'success';
        return 'default';
    };

    return (
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
            <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3">
                {/* Left: Brand + Flow Info */}
                <div data-tour="header-left" className="pointer-events-auto">
                    <div
                        className={cn(
                            'flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-2 sm:px-3 rounded-xl',
                            'bg-background/80 backdrop-blur-xl border border-border/50',
                            'shadow-sm'
                        )}
                    >
                        <RouterLink
                            to="/"
                            className="flex items-center gap-1.5 sm:gap-2 hover:opacity-70 transition-opacity"
                        >
                            <img src="/logo/purple-symbol.png" alt="Eureka Flow" className="h-5 w-5 sm:h-6 sm:w-6" />
                            <span className="text-xs sm:text-sm font-semibold text-foreground hidden sm:inline">
                                Flow
                            </span>
                            <Badge variant="orange" size="sm" className="hidden sm:inline-flex font-semibold">
                                {t('header.beta')}
                            </Badge>
                        </RouterLink>
                        <div className="w-px h-3 sm:h-4 bg-border/60 hidden sm:block" />
                        {isPublicMode ? (
                            <span className="text-xs sm:text-sm text-foreground truncate max-w-[120px] sm:max-w-[200px]">
                                {flowInfo.flowName}
                            </span>
                        ) : (
                            <FlowNameInput {...flowInfo} />
                        )}
                        {!isPublicMode && (
                            <span className="hidden md:inline">
                                <SaveStatusBadge
                                    saveStatus={saveState.saveStatus}
                                    lastSavedAt={saveState.lastSavedAt}
                                />
                            </span>
                        )}
                        {isPublicMode && (
                            <Badge variant="secondary" size="sm" className="text-[10px]">
                                {t('header.viewOnly', 'View Only')}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Right: Toolbar */}
                <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
                    {/* Edit Tools - hidden on mobile, shown on tablet+ */}
                    <div
                        data-tour="header-toolbar"
                        className={cn(
                            'hidden sm:flex items-center h-9 sm:h-10 px-1 rounded-xl',
                            'bg-background/80 backdrop-blur-xl border border-border/50',
                            'shadow-sm'
                        )}
                    >
                        {!isPublicMode && onOpenFlowList && (
                            <ToolbarButton
                                onClick={onOpenFlowList}
                                icon={<FolderOpen className="w-4 h-4" />}
                                tooltip={t('flowList.openFlows')}
                                shortcut="⌘O"
                            />
                        )}
                        {!isPublicMode && (
                            <ToolbarButton
                                onClick={editActions.onSave}
                                icon={<Save className="w-4 h-4" />}
                                tooltip={t('header.saveFlow')}
                                shortcut="⌘S"
                                variant={getSaveButtonVariant()}
                            />
                        )}
                        {!isPublicMode && editActions.onRunAll && (
                            <ToolbarButton
                                onClick={editActions.onRunAll}
                                icon={<Play className="w-4 h-4" />}
                                tooltip={t('header.runAll')}
                            />
                        )}
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
                        {socketState && <SocketDot {...socketState} />}
                    </div>

                    {/* Menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                data-tour="header-menu"
                                className={cn(
                                    'flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl',
                                    'bg-background/80 backdrop-blur-xl border border-border/50',
                                    'text-muted-foreground hover:text-foreground',
                                    'shadow-sm transition-colors duration-150'
                                )}
                            >
                                <Menu className="w-4 h-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {/* File Group */}
                            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                                {t('header.menuGroup.file')}
                            </DropdownMenuLabel>
                            {!isPublicMode && (
                                <>
                                    <DropdownMenuItem onClick={fileActions.onNew}>
                                        <FileText className="w-4 h-4 mr-2" />
                                        {t('header.newFlow')}
                                        <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={fileActions.onSave}>
                                        <Save className="w-4 h-4 mr-2" />
                                        {t('header.saveFlow')}
                                        <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                                    </DropdownMenuItem>
                                </>
                            )}
                            <DropdownMenuItem onClick={fileActions.onExport}>
                                <Download className="w-4 h-4 mr-2" />
                                {t('header.exportJson')}
                                <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            {fileActions.onExportPng && (
                                <DropdownMenuItem onClick={fileActions.onExportPng}>
                                    <ImageDown className="w-4 h-4 mr-2" />
                                    {t('header.exportPng')}
                                </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            {/* Edit actions - visible on mobile */}
                            <div className="sm:hidden">
                                <DropdownMenuItem onClick={editActions.onUndo}>
                                    <Undo2 className="w-4 h-4 mr-2" />
                                    {t('header.undo')}
                                    <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={editActions.onRedo}>
                                    <Redo2 className="w-4 h-4 mr-2" />
                                    {t('header.redo')}
                                    <DropdownMenuShortcut>⌘⇧Z</DropdownMenuShortcut>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </div>

                            {/* Canvas Group */}
                            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                                {t('header.menuGroup.canvas')}
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={editActions.onAutoLayout}>
                                <LayoutGrid className="w-4 h-4 mr-2" />
                                {t('header.autoLayout')}
                                <DropdownMenuShortcut>⌘A</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            {editActions.onCollapseAll && (
                                <DropdownMenuItem onClick={editActions.onCollapseAll}>
                                    <ChevronsDownUp className="w-4 h-4 mr-2" />
                                    {t('header.collapseAll')}
                                </DropdownMenuItem>
                            )}
                            {editActions.onExpandAll && (
                                <DropdownMenuItem onClick={editActions.onExpandAll}>
                                    <ChevronsUpDown className="w-4 h-4 mr-2" />
                                    {t('header.expandAll')}
                                </DropdownMenuItem>
                            )}
                            {!isPublicMode && (
                                <DropdownMenuItem onClick={editActions.onClear} className="text-destructive">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {t('header.clearCanvas')}
                                </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            {/* Share Group */}
                            {!isPublicMode && (onTogglePublic || onPublish) && (
                                <>
                                    <DropdownMenuLabel className="flex items-center justify-between text-xs text-muted-foreground font-normal">
                                        {t('header.menuGroup.share')}
                                        {isPublic && (
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                {t('header.publishedStatus', 'Published')}
                                            </span>
                                        )}
                                    </DropdownMenuLabel>
                                    {isPublic ? (
                                        <>
                                            <DropdownMenuItem onClick={onPublish}>
                                                <Globe className="w-4 h-4 mr-2" />
                                                {t('header.editPublishInfo', 'Edit publish info')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={onTogglePublic}>
                                                <EyeOff className="w-4 h-4 mr-2" />
                                                {t('header.unpublish', 'Unpublish')}
                                            </DropdownMenuItem>
                                        </>
                                    ) : (
                                        <DropdownMenuItem onClick={onPublish}>
                                            <Globe className="w-4 h-4 mr-2" />
                                            {t('header.publish')}
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                </>
                            )}

                            {/* Settings Group */}
                            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                                {t('header.menuGroup.settings')}
                            </DropdownMenuLabel>
                            {!isPublicMode && (
                                <div className="flex items-center justify-between px-2 py-1.5">
                                    <span className="text-sm">{t('header.autoSave')}</span>
                                    <button
                                        onClick={saveState.onToggleAutoSave}
                                        role="switch"
                                        aria-checked={saveState.isAutoSaveEnabled}
                                        aria-label={t('header.toggleAutoSave')}
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
                            )}
                            {onApiKeySettings && (
                                <DropdownMenuItem onClick={onApiKeySettings}>
                                    <Key className="w-4 h-4 mr-2" />
                                    {t('header.apiKeySettings')}
                                </DropdownMenuItem>
                            )}

                            {/* Graph View */}
                            {onGraphView && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onGraphView}>
                                        <LayoutGrid className="w-4 h-4 mr-2" />
                                        {t('header.graphView', 'Graph View')}
                                    </DropdownMenuItem>
                                </>
                            )}

                            {/* Help & Tour */}
                            {(onHelp || onTour || !isPublicMode) && <DropdownMenuSeparator />}
                            {onHelp && (
                                <DropdownMenuItem onClick={onHelp}>
                                    <HelpCircle className="w-4 h-4 mr-2" />
                                    {t('help.title')}
                                    <DropdownMenuShortcut>?</DropdownMenuShortcut>
                                </DropdownMenuItem>
                            )}
                            {onTour && (
                                <DropdownMenuItem onClick={onTour}>
                                    <MapPin className="w-4 h-4 mr-2" />
                                    {t('header.guidedTour')}
                                </DropdownMenuItem>
                            )}
                            {!isPublicMode && (
                                <DropdownMenuItem onClick={() => navigate('/tutorial')}>
                                    <GraduationCap className="w-4 h-4 mr-2" />
                                    {t('header.replayTutorial')}
                                </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            {/* Theme & Language */}
                            <div className="flex items-center justify-center gap-4 px-2 py-1.5">
                                <ThemeToggle />
                                <LanguageSwitcher />
                            </div>

                            <VersionInfo />
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
};
