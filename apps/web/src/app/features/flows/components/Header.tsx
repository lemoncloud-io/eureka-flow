import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Download,
    FileText,
    FolderOpen,
    Hexagon,
    Link,
    Play,
    Redo2,
    Save,
    Sparkles,
    Square,
    Trash2,
    Undo2,
    Upload,
} from 'lucide-react';

import { LanguageSwitcher, ThemeToggle } from '@flows/ui-kit';

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

const IconButton = ({
    onClick,
    icon,
    danger = false,
    tooltip,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    danger?: boolean;
    tooltip?: string;
}) => (
    <button
        onClick={onClick}
        className={`
            flex items-center justify-center w-8 h-8 rounded transition-colors relative group
            ${danger ? 'hover:bg-destructive/20 text-muted-foreground hover:text-destructive' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}
        `}
        title={tooltip}
    >
        {icon}
    </button>
);

const Separator = () => <div className="h-5 w-px bg-border mx-2" />;

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
            className="bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-sm font-semibold text-foreground outline-none w-48 transition-all"
            placeholder={t('header.untitledWorkflow')}
        />
    );
};

const SaveStatusIndicator: React.FC<
    Pick<SaveStateProps, 'lastSavedAt' | 'saveStatus' | 'saveError' | 'onRetrySave'>
> = ({ lastSavedAt, saveStatus = 'idle', saveError, onRetrySave }) => {
    const { t } = useTranslation(['common']);

    // Fixed width container to prevent layout shift
    const containerClass = 'w-[120px] text-[10px] flex items-center gap-1.5';

    // Saving state - subtle blue dot with animation
    if (saveStatus === 'saving') {
        return (
            <span className={`${containerClass} text-muted-foreground`}>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                {t('status.saving')}
            </span>
        );
    }

    // Error state - red indicator with retry option
    if (saveStatus === 'error') {
        const errorMessage = saveError?.message || t('status.saveFailed', 'Save failed');
        return (
            <button
                onClick={onRetrySave}
                className={`${containerClass} text-destructive hover:text-destructive/80 transition-colors`}
                title={errorMessage}
                aria-label={`${errorMessage}. ${t('status.retry', 'Retry')}`}
            >
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                <span className="truncate">
                    {t('status.saveFailed', 'Save failed')} · {t('status.retry', 'Retry')}
                </span>
            </button>
        );
    }

    // Success state - brief green checkmark (auto-fades to idle)
    if (saveStatus === 'success') {
        return (
            <span className={`${containerClass} text-success animate-in fade-in duration-200`}>
                <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                {t('status.saved')}
            </span>
        );
    }

    // Idle state - show last saved time or unsaved
    if (lastSavedAt) {
        return (
            <span className={`${containerClass} text-muted-foreground`}>
                {t('status.saved')} {lastSavedAt.toLocaleTimeString()}
            </span>
        );
    }

    return <span className={`${containerClass} text-muted-foreground`}>{t('status.unsaved')}</span>;
};

const FileActionsToolbar: React.FC<FileActionsProps> = ({ onNew, onLoad, onSave, onExport, onImport }) => {
    const { t } = useTranslation(['flows']);

    return (
        <div className="flex items-center bg-toolbar rounded-lg p-1 border border-border">
            <IconButton onClick={onNew} icon={<FileText className="w-4 h-4" />} tooltip={t('header.newFlow')} />
            <IconButton onClick={onLoad} icon={<FolderOpen className="w-4 h-4" />} tooltip={t('header.openFlow')} />
            <IconButton
                onClick={onSave}
                icon={<Save className="w-4 h-4" />}
                tooltip={`${t('header.saveFlow')} (Ctrl+S)`}
            />
            <IconButton onClick={onExport} icon={<Download className="w-4 h-4" />} tooltip={t('header.exportJson')} />
            <IconButton onClick={onImport} icon={<Upload className="w-4 h-4" />} tooltip={t('header.importJson')} />
        </div>
    );
};

const EditActionsToolbar: React.FC<EditActionsProps> = ({ onUndo, onRedo, onAutoLayout, onClear }) => {
    const { t } = useTranslation(['flows']);

    return (
        <>
            <div className="flex items-center bg-toolbar rounded-lg p-1 border border-border">
                <IconButton
                    onClick={onUndo}
                    icon={<Undo2 className="w-4 h-4" />}
                    tooltip={`${t('header.undo')} (Ctrl+Z)`}
                />
                <IconButton
                    onClick={onRedo}
                    icon={<Redo2 className="w-4 h-4" />}
                    tooltip={`${t('header.redo')} (Ctrl+Y)`}
                />
            </div>
            <Separator />
            <div className="flex items-center bg-toolbar rounded-lg p-1 border border-border">
                <IconButton
                    onClick={onAutoLayout}
                    icon={<Sparkles className="w-4 h-4" />}
                    tooltip={t('header.autoLayout')}
                />
                <IconButton
                    onClick={onClear}
                    icon={<Trash2 className="w-4 h-4" />}
                    tooltip={t('header.clearCanvas')}
                    danger
                />
            </div>
        </>
    );
};

const ExecutionButtons: React.FC<ExecutionActionsProps> = ({ onRunAll, onStopAll, isRunning }) => {
    const { t } = useTranslation(['flows']);

    return (
        <div className="flex items-center gap-1">
            {isRunning ? (
                <button
                    onClick={onStopAll}
                    className="flex items-center gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-md active:scale-95"
                >
                    <Square className="w-3.5 h-3.5" />
                    {t('header.stopAll')}
                </button>
            ) : (
                <button
                    onClick={onRunAll}
                    className="flex items-center gap-1.5 bg-success text-success-foreground hover:bg-success/90 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-md active:scale-95"
                >
                    <Play className="w-3.5 h-3.5" />
                    {t('header.runAll')}
                </button>
            )}
        </div>
    );
};

const AutoSaveToggle: React.FC<Pick<SaveStateProps, 'isAutoSaveEnabled' | 'onToggleAutoSave'>> = ({
    isAutoSaveEnabled,
    onToggleAutoSave,
}) => {
    const { t } = useTranslation(['flows']);

    return (
        <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={onToggleAutoSave}
            title={t('header.toggleAutoSave')}
        >
            <div
                className={`w-8 h-4 rounded-full p-0.5 transition-colors relative ${isAutoSaveEnabled ? 'bg-success/80' : 'bg-muted'}`}
            >
                <div
                    className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform absolute top-0.5 ${isAutoSaveEnabled ? 'left-[calc(100%-14px)]' : 'left-0.5'}`}
                />
            </div>
            <span
                className={`text-xs font-semibold select-none ${isAutoSaveEnabled ? 'text-success' : 'text-muted-foreground group-hover:text-foreground'}`}
            >
                {t('header.autoSave')}
            </span>
        </div>
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
        <div className="h-14 bg-header border-b border-border flex items-center justify-between px-4 z-30 shadow-sm shrink-0 transition-colors">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 select-none">
                    <Hexagon className="w-6 h-6 text-primary" />
                    <span className="font-bold text-foreground hidden sm:block">{t('header.title')}</span>
                </div>

                <Separator />

                <div className="flex items-center">
                    <FlowNameInput {...flowInfo} />
                </div>

                <SaveStatusIndicator
                    lastSavedAt={saveState.lastSavedAt}
                    saveStatus={saveState.saveStatus}
                    saveError={saveState.saveError}
                    onRetrySave={saveState.onRetrySave}
                />
            </div>

            <div className="flex items-center gap-1">
                <FileActionsToolbar {...fileActions} />
                <Separator />
                <EditActionsToolbar {...editActions} />
                <Separator />
                <ExecutionButtons {...executionActions} />
            </div>

            <div className="flex items-center gap-2">
                <ThemeToggle />
                <LanguageSwitcher />

                <Separator />

                <AutoSaveToggle
                    isAutoSaveEnabled={saveState.isAutoSaveEnabled}
                    onToggleAutoSave={saveState.onToggleAutoSave}
                />

                <button
                    onClick={onShare}
                    className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg hover:shadow-primary/20 active:scale-95"
                >
                    <Link className="w-3.5 h-3.5" /> {t('header.share')}
                </button>
            </div>
        </div>
    );
};
