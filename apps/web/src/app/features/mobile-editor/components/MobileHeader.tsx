import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, Download, FolderOpen, Loader2, Menu, Save, Share2 } from 'lucide-react';

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
    onExport?: () => void;
    onPublish?: () => void;
}

const STATUS_INDICATOR: Record<SaveStatus, string> = {
    idle: 'bg-muted-foreground/40',
    saving: 'bg-warning animate-pulse',
    success: 'bg-success',
    error: 'bg-destructive',
};

export const MobileHeader = ({
    flowName,
    onNameChange,
    saveStatus,
    isSaving,
    isSocketConnected,
    onSave,
    onOpenFlowList,
    onExport,
    onPublish,
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
        if (trimmed && trimmed !== flowName) {
            onNameChange(trimmed);
        }
        setIsEditing(false);
    }, [editValue, flowName, onNameChange]);

    const handleBack = useCallback(() => {
        navigate('/');
    }, [navigate]);

    return (
        <header
            className={cn(
                'fixed top-0 left-0 right-0 z-30',
                'h-14 px-3 flex items-center gap-2',
                'bg-glass-bg backdrop-blur-[24px] border-b border-glass-border',
                'pt-[env(safe-area-inset-top)]'
            )}
        >
            {/* Back button */}
            <button onClick={handleBack} className="p-2 -ml-1 rounded-lg hover:bg-accent/50 transition-colors shrink-0">
                <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Flow name */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
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
                        className="w-full text-sm font-semibold bg-transparent border-b-2 border-primary outline-none py-0.5"
                        autoFocus
                    />
                ) : (
                    <button onClick={handleStartEditing} className="truncate text-sm font-semibold text-foreground">
                        {flowName}
                    </button>
                )}

                {/* Status indicators */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className={cn('w-2 h-2 rounded-full', STATUS_INDICATOR[saveStatus])} />
                    {isSocketConnected !== undefined && (
                        <div
                            className={cn(
                                'w-2 h-2 rounded-full',
                                isSocketConnected ? 'bg-success' : 'bg-muted-foreground/30'
                            )}
                        />
                    )}
                </div>
            </div>

            {/* Save button */}
            <button
                onClick={onSave}
                disabled={isSaving}
                className="p-2 rounded-lg hover:bg-accent/50 transition-colors shrink-0 disabled:opacity-50"
            >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            </button>

            {/* Menu */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="p-2 rounded-lg hover:bg-accent/50 transition-colors shrink-0">
                        <Menu className="w-5 h-5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
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
                    {onPublish && (
                        <DropdownMenuItem onClick={onPublish} className="gap-2">
                            <Share2 className="w-4 h-4" />
                            {t('header.publish', 'Publish')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
};
