import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronRight, Clock, Eye, FileInput, Puzzle, RefreshCw, Search, X } from 'lucide-react';

import { translateField, useBlockGroups, useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@flows/ui-kit';

import { BlockIcon } from '../../flows/components/BlockIcon';

import type { BlockDefinitionWithFrontend } from '@flows/flows';

const CATEGORY_CONFIG = {
    inputs: { icon: FileInput, label: 'sidebar.inputs', color: 'text-primary', iconBg: 'bg-primary/10' },
    process: { icon: RefreshCw, label: 'sidebar.process', color: 'text-muted-foreground', iconBg: 'bg-muted/50' },
    outputs: { icon: Eye, label: 'sidebar.output', color: 'text-success', iconBg: 'bg-success/10' },
} as const;

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>;

interface MobileBlockLibrarySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAddBlock: (type: string) => void;
    recentBlockIds?: string[];
}

export const MobileBlockLibrarySheet = ({
    open,
    onOpenChange,
    onAddBlock,
    recentBlockIds,
}: MobileBlockLibrarySheetProps) => {
    const { t } = useTranslation(['flows', 'blocks']);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<keyof typeof CATEGORY_CONFIG>>(
        new Set(CATEGORIES)
    );
    const searchInputRef = useRef<HTMLInputElement>(null);

    const blockGroups = useBlockGroups(searchQuery);
    const blockRegistry = useBlockRegistry();
    const recentBlocks = useMemo(
        () => (recentBlockIds ?? []).map(id => blockRegistry[id]).filter(Boolean),
        [recentBlockIds, blockRegistry]
    );

    const handleAddBlock = (block: BlockDefinitionWithFrontend) => {
        onAddBlock(block.id);
        onOpenChange(false);
        setSearchQuery('');
    };

    const toggleCategory = (category: keyof typeof CATEGORY_CONFIG) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="max-h-[85vh] rounded-t-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]"
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-3">
                    <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                <SheetTitle className="text-base font-semibold mb-3">
                    {t('sidebar.library', 'Block Library')}
                </SheetTitle>

                {/* Search */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t('sidebar.searchPlaceholder', 'Search blocks...')}
                        className={cn(
                            'w-full pl-9 pr-8 py-2.5 text-sm rounded-xl',
                            'bg-muted/50 border border-border',
                            'placeholder:text-muted-foreground/60',
                            'focus:outline-none focus:ring-2 focus:ring-primary/30'
                        )}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Recent blocks — hidden during search or when empty */}
                {!searchQuery && recentBlocks.length > 0 && (
                    <div className="mb-4">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                {t('sidebar.recent', 'Recent')}
                            </span>
                        </div>
                        <div className="flex overflow-x-auto gap-2 pb-2 -mx-1 px-1">
                            {recentBlocks.map(block => (
                                <button
                                    key={block.id}
                                    onClick={() => handleAddBlock(block)}
                                    className={cn(
                                        'flex flex-col items-center gap-1.5 p-2.5 rounded-xl min-w-[72px] shrink-0',
                                        'border border-border/40 bg-card',
                                        'hover:bg-accent/50 active:scale-[0.96] transition-all'
                                    )}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                                        <BlockIcon icon={block.icon} size={14} />
                                    </div>
                                    <span className="text-[10px] font-medium text-foreground/70 truncate max-w-[64px]">
                                        {translateField(t, block, 'label')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Categories */}
                <div className="space-y-2 overflow-y-auto max-h-[60vh] pb-4">
                    {CATEGORIES.map(category => {
                        const config = CATEGORY_CONFIG[category];
                        const Icon = config.icon;
                        const blocks = blockGroups[category];
                        const isExpanded = expandedCategories.has(category);

                        return (
                            <div key={category}>
                                <button
                                    onClick={() => toggleCategory(category)}
                                    className={cn(
                                        'flex items-center gap-2 w-full p-2.5 rounded-xl',
                                        'hover:bg-accent/50 transition-colors',
                                        isExpanded && 'bg-accent/30'
                                    )}
                                >
                                    <Icon className={cn('w-4 h-4', config.color)} />
                                    <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">
                                        {t(config.label)}
                                    </span>
                                    <span className="text-xs text-muted-foreground mr-1">{blocks.length}</span>
                                    {isExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    )}
                                </button>

                                {isExpanded && (
                                    <div className="space-y-1.5 pt-1.5 pl-2">
                                        {blocks.length === 0 ? (
                                            <div className="text-center py-3 text-muted-foreground text-xs">
                                                {t('sidebar.noResults', 'No results')}
                                            </div>
                                        ) : (
                                            blocks.map(block => (
                                                <button
                                                    key={block.id}
                                                    onClick={() => handleAddBlock(block)}
                                                    className={cn(
                                                        'w-full p-3 rounded-xl border border-border/40',
                                                        'text-left transition-all duration-150',
                                                        'hover:bg-accent/50 hover:border-accent',
                                                        'active:scale-[0.98]'
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className={cn(
                                                                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                                                                config.iconBg
                                                            )}
                                                        >
                                                            <BlockIcon
                                                                icon={block.icon}
                                                                size={16}
                                                                fallback={
                                                                    <Puzzle className="w-4 h-4 text-muted-foreground" />
                                                                }
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-medium truncate">
                                                                {translateField(t, block, 'label')}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {translateField(t, block, 'description')}
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                                            {block.inputs?.length ?? 0}→{block.outputs?.length ?? 0}
                                                        </span>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
};
