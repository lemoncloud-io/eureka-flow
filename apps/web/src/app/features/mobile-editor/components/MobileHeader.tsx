import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Check,
    ChevronDown,
    Download,
    FilePlus,
    FolderOpen,
    Key,
    Loader2,
    Map as MapIcon,
    Monitor,
    MoreVertical,
    Play,
    Save,
    Search,
    Settings2,
    WifiOff,
} from 'lucide-react';

import { getPermissions, useSystemInfoQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { CreditBalanceChip } from '@flows/shared';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    LanguageSwitcher,
    ThemeToggle,
} from '@flows/ui-kit';

import { DebugModeToggle } from '../../../components/DebugModeToggle';
import { enableDesktopOverride } from '../hooks';

import type { FlowRole, SaveStatus } from '@flows/flows';

interface RunProgress {
    current: number;
    total: number;
}

interface MobileHeaderProps {
    flowName: string;
    onNameChange: (name: string) => void;
    saveStatus: SaveStatus;
    isSaving: boolean;
    isSocketConnected?: boolean;
    onSave: () => void;
    onOpenFlowList: () => void;
    onOpenFlowMap: () => void;
    onOpenFlowSettings: () => void;
    onRunAll: () => void;
    isRunning: boolean;
    runProgress: RunProgress | null;
    nodeCount: number;
    onToggleSearch?: () => void;
    onExport?: () => void;
    onNew?: () => void;
    onApiKeySettings?: () => void;
    role?: FlowRole;
    onVersionClick?: () => void;
    isDebugMode?: boolean;
    onDisableDebugMode?: () => void;
}

export const MobileHeader = ({
    flowName,
    onNameChange,
    saveStatus,
    isSaving,
    isSocketConnected,
    onSave,
    onOpenFlowList,
    onOpenFlowMap,
    onOpenFlowSettings,
    onRunAll,
    isRunning,
    runProgress,
    nodeCount,
    onToggleSearch,
    onExport,
    onNew,
    onApiKeySettings,
    role = 'owner',
    onVersionClick,
    isDebugMode,
    onDisableDebugMode,
}: MobileHeaderProps) => {
    const { t } = useTranslation(['flows']);
    const { canEdit, canRun } = getPermissions(role);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(flowName);
    const inputRef = useRef<HTMLInputElement>(null);
    const { data: systemInfo } = useSystemInfoQuery();
    const apiVersion = systemInfo?.components?.find(c => c.name === 'eureka-flows-api')?.version;

    const handleStartEditing = useCallback(() => {
        setEditValue(flowName);
        setIsEditing(true);
        setTimeout(() => inputRef.current?.select(), 50);
    }, [flowName]);

    const handleFinishEditing = useCallback(() => {
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== flowName) onNameChange(trimmed);
        setIsEditing(false);
    }, [editValue, flowName, onNameChange]);

    const isDisconnected = isSocketConnected === false;

    return (
        <header
            className={cn(
                'fixed top-0 left-0 right-0 z-30',
                'h-14 px-3 flex items-center gap-2',
                'bg-background/80 backdrop-blur-xl border-b border-border',
                'pt-[env(safe-area-inset-top)]'
            )}
        >
            {/* Flow name + switcher dropdown — no back arrow per Figma */}
            <div className="flex-1 min-w-0 flex items-center gap-1">
                {isEditing ? (
                    <input
                        ref={inputRef}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={handleFinishEditing}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleFinishEditing();
                            if (e.key === 'Escape') setIsEditing(false);
                        }}
                        className="w-full text-base font-bold bg-transparent border-b-2 border-primary outline-none"
                        autoFocus
                    />
                ) : (
                    <div className="flex items-center gap-1 min-w-0">
                        {canEdit ? (
                            <button
                                onClick={handleStartEditing}
                                className="truncate text-base font-bold text-foreground leading-tight"
                            >
                                {flowName}
                            </button>
                        ) : (
                            <span className="truncate text-base font-bold text-foreground leading-tight">
                                {flowName}
                            </span>
                        )}
                        {/* Flow switcher chevron */}
                        <button
                            onClick={onOpenFlowList}
                            className="w-7 h-7 rounded flex items-center justify-center shrink-0 hover:bg-accent transition-colors"
                            aria-label={t('mobile.switchFlow', 'Switch flow')}
                        >
                            <ChevronDown className="w-5 h-5 text-foreground" />
                        </button>
                    </div>
                )}

                {/* View-only badge for non-owner roles */}
                {!canEdit && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        {t('mobile.viewOnly', 'View only')}
                    </span>
                )}
                {/* Disconnected warning */}
                {isDisconnected && <WifiOff className="w-3.5 h-3.5 text-destructive/60 shrink-0" />}
            </div>

            {/* Action buttons group */}
            <div className="flex items-center gap-1 shrink-0">
                <CreditBalanceChip variant="bare" />
                {/* Search */}
                {onToggleSearch && nodeCount > 0 && (
                    <button
                        onClick={onToggleSearch}
                        className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors shrink-0"
                        aria-label="Search nodes"
                    >
                        <Search className="w-4 h-4 text-muted-foreground" />
                    </button>
                )}
                {/* Save */}
                {canEdit && (
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className={cn(
                            'w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0',
                            'disabled:opacity-40',
                            isSaving
                                ? 'bg-muted'
                                : saveStatus === 'success'
                                  ? 'bg-success/15 text-success'
                                  : 'hover:bg-accent text-muted-foreground'
                        )}
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saveStatus === 'success' ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                    </button>
                )}

                {/* Run All — circular purple background */}
                {canRun && (
                    <button
                        onClick={onRunAll}
                        disabled={isRunning || nodeCount === 0}
                        className={cn(
                            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors',
                            'disabled:opacity-40',
                            isRunning ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary hover:bg-primary/25'
                        )}
                        aria-label="Run All"
                    >
                        {isRunning ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Play className="w-4 h-4 fill-current" />
                        )}
                    </button>
                )}
            </div>

            {/* More menu */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors shrink-0">
                        <MoreVertical className="w-[18px] h-[18px]" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    {/* File */}
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        {t('header.menuGroup.file', 'File')}
                    </DropdownMenuLabel>
                    {onNew && (
                        <DropdownMenuItem onClick={onNew} className="gap-2">
                            <FilePlus className="w-4 h-4" />
                            {t('header.newFlow', 'New Flow')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={onOpenFlowList} className="gap-2">
                        <FolderOpen className="w-4 h-4" />
                        {t('header.openFlow', 'Open Flow')}
                    </DropdownMenuItem>
                    {canEdit && (
                        <DropdownMenuItem onClick={onSave} className="gap-2">
                            <Save className="w-4 h-4" />
                            {t('header.saveFlow', 'Save Flow')}
                        </DropdownMenuItem>
                    )}
                    {canRun && onExport && (
                        <DropdownMenuItem onClick={onExport} className="gap-2">
                            <Download className="w-4 h-4" />
                            {t('header.exportJson', 'Export JSON')}
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {/* Canvas */}
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        {t('header.menuGroup.canvas', 'Canvas')}
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={onOpenFlowSettings} className="gap-2">
                        <Settings2 className="w-4 h-4" />
                        {t('mobile.flowSettings.menuLabel', '플로우 설정')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={enableDesktopOverride} className="gap-2">
                        <Monitor className="w-4 h-4" />
                        {t('mobile.pcVersion', 'PC 버전 보기')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onOpenFlowMap} className="gap-2">
                        <MapIcon className="w-4 h-4" />
                        {t('mobile.flowOverview', '플로우 전체보기')}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Settings */}
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        {t('header.menuGroup.settings', 'Settings')}
                    </DropdownMenuLabel>
                    {onApiKeySettings && (
                        <DropdownMenuItem onClick={onApiKeySettings} className="gap-2">
                            <Key className="w-4 h-4" />
                            {t('header.apiKeySettings', 'API Key Settings')}
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {/* Theme, Language & Debug */}
                    <div className="flex items-center justify-center gap-4 px-2 py-1.5">
                        <ThemeToggle />
                        <LanguageSwitcher />
                        {isDebugMode && onDisableDebugMode && <DebugModeToggle onDisable={onDisableDebugMode} />}
                    </div>

                    {/* Version */}
                    <div
                        className="px-2 py-1.5 text-[10px] text-muted-foreground text-center select-none cursor-default"
                        onClick={onVersionClick}
                    >
                        Web v{__APP_VERSION__} {apiVersion && `/ API v${apiVersion}`}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
};
