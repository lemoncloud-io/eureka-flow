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

interface HeaderProps {
    flowName: string;
    onNameChange: (name: string) => void;
    onNew: () => void;
    onLoad: () => void;
    onSave: () => void;
    onExport: () => void;
    onImport: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onAutoLayout: () => void;
    onClear: () => void;
    onShare: () => void;
    onRunAll: () => void;
    onStopAll: () => void;
    isRunning: boolean;
    isAutoSaveEnabled: boolean;
    onToggleAutoSave: () => void;
    isSaving: boolean;
    lastSavedAt: Date | null;
}

export const Header: React.FC<HeaderProps> = ({
    flowName,
    onNameChange,
    onNew,
    onLoad,
    onSave,
    onExport,
    onImport,
    onUndo,
    onRedo,
    onAutoLayout,
    onClear,
    onShare,
    onRunAll,
    onStopAll,
    isRunning,
    isAutoSaveEnabled,
    onToggleAutoSave,
    isSaving,
    lastSavedAt,
}) => {
    const { t } = useTranslation(['flows', 'common']);
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

    return (
        <div className="h-14 bg-header border-b border-border flex items-center justify-between px-4 z-30 shadow-sm shrink-0 transition-colors">
            {/* Left: Logo & File Info */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 select-none">
                    <Hexagon className="w-6 h-6 text-primary" />
                    <span className="font-bold text-foreground hidden sm:block">{t('flows:header.title')}</span>
                </div>

                <Separator />

                <div className="flex items-center">
                    <input
                        type="text"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        className="bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-sm font-semibold text-foreground outline-none w-48 transition-all"
                        placeholder={t('flows:header.untitledWorkflow')}
                    />
                </div>

                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                    {isSaving ? (
                        <span className="text-warning flex items-center gap-1">
                            <span className="block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                            {t('common:status.saving')}
                        </span>
                    ) : lastSavedAt ? (
                        <span>
                            {t('common:status.saved')} {lastSavedAt.toLocaleTimeString()}
                        </span>
                    ) : (
                        <span>{t('common:status.unsaved')}</span>
                    )}
                </div>
            </div>

            {/* Middle: Actions Toolbar */}
            <div className="flex items-center gap-1">
                <div className="flex items-center bg-toolbar rounded-lg p-1 border border-border">
                    <IconButton
                        onClick={onNew}
                        icon={<FileText className="w-4 h-4" />}
                        tooltip={t('flows:header.newFlow')}
                    />
                    <IconButton
                        onClick={onLoad}
                        icon={<FolderOpen className="w-4 h-4" />}
                        tooltip={t('flows:header.openFlow')}
                    />
                    <IconButton
                        onClick={onSave}
                        icon={<Save className="w-4 h-4" />}
                        tooltip={`${t('flows:header.saveFlow')} (Ctrl+S)`}
                    />
                    <IconButton
                        onClick={onExport}
                        icon={<Download className="w-4 h-4" />}
                        tooltip={t('flows:header.exportJson')}
                    />
                    <IconButton
                        onClick={onImport}
                        icon={<Upload className="w-4 h-4" />}
                        tooltip={t('flows:header.importJson')}
                    />
                </div>

                <Separator />

                <div className="flex items-center bg-toolbar rounded-lg p-1 border border-border">
                    <IconButton
                        onClick={onUndo}
                        icon={<Undo2 className="w-4 h-4" />}
                        tooltip={`${t('flows:header.undo')} (Ctrl+Z)`}
                    />
                    <IconButton
                        onClick={onRedo}
                        icon={<Redo2 className="w-4 h-4" />}
                        tooltip={`${t('flows:header.redo')} (Ctrl+Y)`}
                    />
                </div>

                <Separator />

                <div className="flex items-center bg-toolbar rounded-lg p-1 border border-border">
                    <IconButton
                        onClick={onAutoLayout}
                        icon={<Sparkles className="w-4 h-4" />}
                        tooltip={t('flows:header.autoLayout')}
                    />
                    <IconButton
                        onClick={onClear}
                        icon={<Trash2 className="w-4 h-4" />}
                        tooltip={t('flows:header.clearCanvas')}
                        danger
                    />
                </div>

                <Separator />

                {/* Run/Stop Buttons */}
                <div className="flex items-center gap-1">
                    {isRunning ? (
                        <button
                            onClick={onStopAll}
                            className="flex items-center gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-md active:scale-95"
                        >
                            <Square className="w-3.5 h-3.5" />
                            {t('flows:header.stopAll')}
                        </button>
                    ) : (
                        <button
                            onClick={onRunAll}
                            className="flex items-center gap-1.5 bg-success text-success-foreground hover:bg-success/90 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-md active:scale-95"
                        >
                            <Play className="w-3.5 h-3.5" />
                            {t('flows:header.runAll')}
                        </button>
                    )}
                </div>
            </div>

            {/* Right: Theme, Language, Auto Save & Share */}
            <div className="flex items-center gap-2">
                <ThemeToggle />
                <LanguageSwitcher />

                <Separator />

                {/* Auto Save Toggle */}
                <div
                    className="flex items-center gap-2 cursor-pointer group"
                    onClick={onToggleAutoSave}
                    title={t('flows:header.toggleAutoSave')}
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
                        {t('flows:header.autoSave')}
                    </span>
                </div>

                <button
                    onClick={onShare}
                    className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg hover:shadow-primary/20 active:scale-95"
                >
                    <Link className="w-3.5 h-3.5" /> {t('flows:header.share')}
                </button>
            </div>
        </div>
    );
};
