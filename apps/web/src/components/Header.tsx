import React, { useEffect, useState } from 'react';

interface HeaderProps {
    flowName: string;
    onNameChange: (name: string) => void;
    onNew: () => void;
    onLoad: () => void;
    onSave: () => void;
    onExport: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onAutoLayout: () => void;
    onClear: () => void;
    onShare: () => void;
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
    onUndo,
    onRedo,
    onAutoLayout,
    onClear,
    onShare,
    isAutoSaveEnabled,
    onToggleAutoSave,
    isSaving,
    lastSavedAt,
}) => {
    const [nameInput, setNameInput] = useState(flowName);

    // Sync internal state if prop changes
    useEffect(() => {
        setNameInput(flowName);
    }, [flowName]);

    const handleBlur = () => {
        if (nameInput.trim()) {
            onNameChange(nameInput);
        } else {
            setNameInput(flowName); // Revert if empty
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const IconButton = ({ onClick, icon, label, danger = false, tooltip }: any) => (
        <button
            onClick={onClick}
            className={`
        flex items-center justify-center w-8 h-8 rounded transition-colors relative group
        ${danger ? 'hover:bg-red-900/50 text-gray-400 hover:text-red-200' : 'hover:bg-gray-700 text-gray-400 hover:text-white'}
      `}
            title={tooltip || label}
        >
            <span className="text-lg">{icon}</span>
        </button>
    );

    const Separator = () => <div className="h-5 w-px bg-gray-700 mx-2" />;

    return (
        <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 z-30 shadow-md shrink-0">
            {/* Left: Logo & File Info */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 select-none">
                    <span className="text-2xl">💠</span>
                    <span className="font-bold text-gray-200 hidden sm:block">FlowMosaic</span>
                </div>

                <Separator />

                <div className="flex items-center">
                    <input
                        type="text"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        className="bg-transparent border border-transparent hover:border-gray-700 focus:border-blue-500 rounded px-2 py-1 text-sm font-semibold text-white outline-none w-48 transition-all"
                        placeholder="Untitled Workflow"
                    />
                </div>

                <div className="text-[10px] text-gray-500 flex items-center gap-2">
                    {isSaving ? (
                        <span className="text-yellow-500 flex items-center gap-1">
                            <span className="block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" /> Saving...
                        </span>
                    ) : lastSavedAt ? (
                        <span>Saved {lastSavedAt.toLocaleTimeString()}</span>
                    ) : (
                        <span>Unsaved</span>
                    )}
                </div>
            </div>

            {/* Middle: Actions Toolbar */}
            <div className="flex items-center gap-1">
                <div className="flex items-center bg-gray-800/50 rounded-lg p-1 border border-gray-800">
                    <IconButton onClick={onNew} icon="📄" tooltip="New Flow" />
                    <IconButton onClick={onLoad} icon="📂" tooltip="Load Flow" />
                    <IconButton onClick={onSave} icon="💾" tooltip="Save Flow (Ctrl+S)" />
                    <IconButton onClick={onExport} icon="📤" tooltip="Export JSON" />
                </div>

                <Separator />

                <div className="flex items-center bg-gray-800/50 rounded-lg p-1 border border-gray-800">
                    <IconButton onClick={onUndo} icon="↩️" tooltip="Undo (Ctrl+Z)" />
                    <IconButton onClick={onRedo} icon="↪️" tooltip="Redo (Ctrl+Y)" />
                </div>

                <Separator />

                <div className="flex items-center bg-gray-800/50 rounded-lg p-1 border border-gray-800">
                    <IconButton onClick={onAutoLayout} icon="✨" tooltip="Auto Layout" />
                    <IconButton onClick={onClear} icon="🗑️" tooltip="Clear Canvas" danger />
                </div>
            </div>

            {/* Right: Auto Save & Share */}
            <div className="flex items-center gap-4">
                {/* Auto Save Toggle */}
                <div
                    className="flex items-center gap-2 cursor-pointer group"
                    onClick={onToggleAutoSave}
                    title="Toggle Auto Save"
                >
                    <div
                        className={`w-8 h-4 rounded-full p-0.5 transition-colors relative ${isAutoSaveEnabled ? 'bg-green-600/80' : 'bg-gray-700'}`}
                    >
                        <div
                            className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform absolute top-0.5 ${isAutoSaveEnabled ? 'left-[calc(100%-14px)]' : 'left-0.5'}`}
                        />
                    </div>
                    <span
                        className={`text-xs font-semibold select-none ${isAutoSaveEnabled ? 'text-green-400' : 'text-gray-500 group-hover:text-gray-400'}`}
                    >
                        Auto Save
                    </span>
                </div>

                <button
                    onClick={onShare}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95"
                >
                    <span>🔗</span> Share
                </button>
            </div>
        </div>
    );
};
