import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, Download, FolderOpen, Loader2, Map as MapIcon, Menu, Play, Save } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@flows/ui-kit';

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
    onRunAll?: () => void;
    isRunning?: boolean;
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
    onRunAll,
    isRunning,
}: MobileHeaderProps) => {
    const { t } = useTranslation(['flows']);
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(flowName);
    const inputRef = useRef<HTMLInputElement>(null);

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
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0"
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

            {/* Flow map toggle */}
            <button
                onClick={onOpenFlowMap}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0"
            >
                <MapIcon className="w-[18px] h-[18px]" />
            </button>

            <button
                onClick={onSave}
                disabled={isSaving}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0 disabled:opacity-40"
            >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            </button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0">
                        <Menu className="w-5 h-5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {onRunAll && (
                        <DropdownMenuItem onClick={onRunAll} disabled={isRunning} className="gap-2">
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            {t('header.runAll', 'Run All Nodes')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={onOpenFlowList} className="gap-2">
                        <FolderOpen className="w-4 h-4" />
                        {t('header.openFlow', 'Open Flow')}
                    </DropdownMenuItem>
                    {onExport && (
                        <DropdownMenuItem onClick={onExport} className="gap-2">
                            <Download className="w-4 h-4" />
                            {t('header.export', 'Export JSON')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
};
