import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronRight, Filter, Search, X } from 'lucide-react';

import { BLOCK_CATEGORIES, BLOCK_CATEGORY_CONFIG, translateField, useBlockGroups } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { BlockIcon } from './BlockIcon';

interface CanvasContextMenuProps {
    screenX: number;
    screenY: number;
    onSelect: (type: string) => void;
    onClose: () => void;
    /**
     * Port type the menu was opened from, when a dragged link landed on empty canvas.
     * Narrows the list to blocks that link can actually feed; `onClearFilter` lets the
     * user see everything again, so the filter never becomes a dead end.
     */
    portTypeFilter?: string;
    onClearFilter?: () => void;
}

const MENU_WIDTH = 240;
const MENU_MAX_HEIGHT = 360;
const VIEWPORT_PADDING = 8;

export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
    screenX,
    screenY,
    onSelect,
    onClose,
    portTypeFilter,
    onClearFilter,
}) => {
    const { t } = useTranslation(['flows', 'blocks']);
    const [searchQuery, setSearchQuery] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const blockGroups = useBlockGroups(searchQuery, { acceptsPortType: portTypeFilter });

    const adjustedX = Math.min(screenX, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING);
    const adjustedY = Math.min(screenY, window.innerHeight - MENU_MAX_HEIGHT - VIEWPORT_PADDING);

    useEffect(() => {
        requestAnimationFrame(() => searchInputRef.current?.focus());
    }, []);

    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [onClose]);

    const totalResults = blockGroups.inputs.length + blockGroups.process.length + blockGroups.outputs.length;

    return (
        <div
            ref={menuRef}
            className={cn(
                'fixed z-50 flex flex-col',
                'bg-popover/95 backdrop-blur-xl border border-border rounded-xl shadow-xl',
                'animate-in fade-in zoom-in-95 duration-100'
            )}
            style={{ left: adjustedX, top: adjustedY, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
            onContextMenu={e => e.preventDefault()}
            onMouseDown={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
        >
            <div className="p-2 pb-0">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t('sidebar.searchPlaceholder')}
                        className={cn(
                            'w-full pl-8 pr-7 py-1.5 text-xs rounded-lg',
                            'bg-background/50 border border-border',
                            'placeholder:text-muted-foreground/60',
                            'focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50',
                            'transition-all'
                        )}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {portTypeFilter && (
                <div className="flex items-center gap-1.5 px-3 pt-1.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                        <Filter className="w-2.5 h-2.5" />
                        {t('canvasMenu.portFilter', { type: portTypeFilter })}
                    </span>
                    {onClearFilter && (
                        <button
                            onClick={onClearFilter}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                            {t('canvasMenu.showAll')}
                        </button>
                    )}
                </div>
            )}

            {searchQuery && (
                <div className="text-[10px] text-muted-foreground px-3 pt-1">
                    {totalResults === 0 ? t('sidebar.noResults') : t('sidebar.resultsCount', { count: totalResults })}
                </div>
            )}

            <div className="overflow-y-auto p-1.5 space-y-0.5">
                {BLOCK_CATEGORIES.map(category => {
                    const config = BLOCK_CATEGORY_CONFIG[category];
                    const Icon = config.icon;
                    const blocks = blockGroups[category];
                    if (blocks.length === 0) return null;

                    return (
                        <div key={category}>
                            <div className="flex items-center gap-1.5 px-2 py-1">
                                <Icon className={cn('w-3 h-3', config.color)} />
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {t(config.label)}
                                </span>
                                <span className="text-[9px] text-muted-foreground/60 ml-auto">{blocks.length}</span>
                            </div>
                            {blocks.map(block => (
                                <button
                                    key={block.type}
                                    onClick={() => onSelect(block.type)}
                                    className={cn(
                                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left',
                                        'hover:bg-accent/50 transition-colors duration-100',
                                        'group'
                                    )}
                                >
                                    <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                                        <BlockIcon icon={block.icon} size={12} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-medium text-foreground truncate">
                                                {translateField(t, block, 'label')}
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                            ))}
                        </div>
                    );
                })}
                {totalResults === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-xs">
                        {portTypeFilter ? t('canvasMenu.noCompatibleBlocks') : t('sidebar.noResults')}
                    </div>
                )}
            </div>
        </div>
    );
};
