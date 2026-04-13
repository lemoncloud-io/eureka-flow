import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
    ArrowLeft,
    Download,
    FilePlus,
    FolderOpen,
    Key,
    Loader2,
    Map as MapIcon,
    Menu,
    Save,
    Trash2,
} from 'lucide-react';

import { useSystemInfoQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';
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

import type { SaveStatus } from '@flows/flows';

interface MobileHeaderProps {
    flowName: string;
    onNameChange: (name: string) => void;
    saveStatus: SaveStatus;
    isSaving: boolean;
    isSocketConnected?: boolean;
    onSave: () => void;
    onOpenFlowList: () => void;
    onOpenFlowMap: () => void;
    onExport?: () => void;
    onNew?: () => void;
    onClear?: () => void;
    onApiKeySettings?: () => void;
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
    onExport,
    onNew,
    onClear,
    onApiKeySettings,
}: MobileHeaderProps) => {
    const { t } = useTranslation(['flows']);
    const navigate = useNavigate();
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

    return (
        <header
            className={cn(
                'fixed top-0 left-0 right-0 z-30',
                'h-14 px-2 flex items-center gap-1',
                'bg-background/95 backdrop-blur-md border-b border-border/60',
                'pt-[env(safe-area-inset-top)]'
            )}
        >
            <button
                onClick={() => navigate('/')}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0 flex items-center gap-1.5">
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
                        className="w-full text-sm font-bold bg-transparent border-b-2 border-primary outline-none"
                        autoFocus
                    />
                ) : (
                    <button
                        onClick={handleStartEditing}
                        className="truncate text-sm font-bold text-foreground leading-tight"
                    >
                        {flowName}
                    </button>
                )}

                <div className="flex items-center gap-1 shrink-0">
                    <div
                        className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            saveStatus === 'saving' && 'bg-warning animate-pulse',
                            saveStatus === 'success' && 'bg-success',
                            saveStatus === 'error' && 'bg-destructive',
                            saveStatus === 'idle' && 'bg-muted-foreground/30'
                        )}
                    />
                    {isSocketConnected !== undefined && (
                        <div
                            className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                isSocketConnected ? 'bg-success' : 'bg-muted-foreground/20'
                            )}
                        />
                    )}
                </div>
            </div>

            <button
                onClick={onOpenFlowMap}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0"
            >
                <MapIcon className="w-[18px] h-[18px]" />
            </button>

            <button
                onClick={onSave}
                disabled={isSaving}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0 disabled:opacity-40"
            >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            </button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0">
                        <Menu className="w-5 h-5" />
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
                    <DropdownMenuItem onClick={onSave} className="gap-2">
                        <Save className="w-4 h-4" />
                        {t('header.saveFlow', 'Save Flow')}
                    </DropdownMenuItem>
                    {onExport && (
                        <DropdownMenuItem onClick={onExport} className="gap-2">
                            <Download className="w-4 h-4" />
                            {t('header.export', 'Export JSON')}
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {/* Canvas */}
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        {t('header.menuGroup.canvas', 'Canvas')}
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={onOpenFlowMap} className="gap-2">
                        <MapIcon className="w-4 h-4" />
                        {t('mobile.flowOverview', 'Flow Overview')}
                    </DropdownMenuItem>
                    {onClear && (
                        <DropdownMenuItem onClick={onClear} className="gap-2 text-destructive">
                            <Trash2 className="w-4 h-4" />
                            {t('header.clearCanvas', 'Clear Canvas')}
                        </DropdownMenuItem>
                    )}

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

                    {/* Theme & Language */}
                    <div className="flex items-center justify-center gap-4 px-2 py-1.5">
                        <ThemeToggle />
                        <LanguageSwitcher />
                    </div>

                    {/* Version */}
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground/50 text-center">
                        Web v{__APP_VERSION__} {apiVersion && `/ API v${apiVersion}`}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
};
