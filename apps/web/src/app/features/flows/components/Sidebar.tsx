import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, LayoutGrid, Search, X } from 'lucide-react';

import { BLOCK_CATEGORIES, BLOCK_CATEGORY_CONFIG, useBlockGroups } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, TooltipProvider } from '@flows/ui-kit';

import { BlockIcon } from './BlockIcon';
import { FrontendBadge } from './FrontendBadge';

import type { FlowRole } from '@flows/flows';

interface SidebarProps {
    onAddNode: (type: string) => void;
    isLoading?: boolean;
    role?: FlowRole;
}

export interface SidebarRef {
    open: () => void;
    close: () => void;
}

// ─── Block Card ───

interface BlockCardProps {
    type: string;
    label: string;
    description: string;
    icon?: string;
    onAdd: () => void;
    disabled?: boolean;
    inputCount?: number;
    outputCount?: number;
    isFrontend?: boolean;
}

const BlockCard: React.FC<BlockCardProps> = ({
    type,
    label,
    description,
    icon,
    onAdd,
    disabled,
    inputCount = 0,
    outputCount = 0,
    isFrontend,
}) => (
    <button
        onClick={onAdd}
        disabled={disabled}
        data-block-item={type}
        className={cn(
            'w-full rounded-lg border border-border bg-background p-2.5',
            'text-left transition-all duration-150',
            'hover:border-accent hover:bg-accent/50',
            'disabled:cursor-not-allowed disabled:opacity-50'
        )}
    >
        <div className="flex flex-col gap-1.5">
            {isFrontend && <FrontendBadge className="self-start" />}
            <div className="flex items-center gap-1.5">
                <BlockIcon icon={icon} size={18} />
                <span className="text-sm font-medium leading-5 text-foreground">{label}</span>
            </div>
            <p className="truncate text-[11px] leading-4 text-muted-foreground">
                {description} {inputCount}→{outputCount}
            </p>
        </div>
    </button>
);

// ─── Sidebar ───

type CategoryKey = keyof typeof BLOCK_CATEGORY_CONFIG;

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(({ onAddNode, isLoading, role = 'owner' }, ref) => {
    const isReadOnly = role !== 'owner';
    const { t } = useTranslation(['flows']);
    const [isOpen, setIsOpen] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<CategoryKey>>(new Set(BLOCK_CATEGORIES));
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
        open: () => {
            setIsOpen(true);
            setExpandedCategories(new Set(BLOCK_CATEGORIES));
            setTimeout(() => searchInputRef.current?.focus(), 100);
        },
        close: () => setIsOpen(false),
    }));

    const blockGroups = useBlockGroups(searchQuery);

    const handleTogglePanel = () => {
        if (isOpen) {
            setIsOpen(false);
            setSearchQuery('');
        } else {
            setIsOpen(true);
            setExpandedCategories(new Set(BLOCK_CATEGORIES));
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    };

    const handleCategoryToggle = (category: CategoryKey) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    };

    const handleAddNode = (type: string) => {
        if (isReadOnly) return;
        onAddNode(type);
        setIsOpen(false);
    };

    const handleClose = () => {
        setIsOpen(false);
        setSearchQuery('');
    };

    const totalResults = blockGroups.inputs.length + blockGroups.process.length + blockGroups.outputs.length;

    return (
        <>
            {/* Library Button */}
            <div
                data-tour="sidebar"
                className="absolute bottom-4 left-2 z-20 pointer-events-auto sm:bottom-auto sm:left-4 sm:top-1/2 sm:-translate-y-1/2"
            >
                <div
                    className={cn(
                        'flex flex-col gap-2 rounded-xl border border-glass-border bg-glass-bg p-1.5 backdrop-blur-[24px]',
                        'shadow-floating sm:rounded-2xl sm:p-2'
                    )}
                >
                    <TooltipProvider delayDuration={0}>
                        <button
                            onClick={handleTogglePanel}
                            className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 sm:h-8 sm:w-8',
                                'hover:bg-accent',
                                isOpen
                                    ? 'bg-glass-bg text-primary shadow-md'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                    </TooltipProvider>
                </div>
            </div>

            {/* Expanded Panel */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-15 bg-black/20 sm:bg-transparent" onClick={handleClose} />

                    {/* Panel */}
                    <div
                        className={cn(
                            'fixed inset-x-0 bottom-0 z-20 rounded-t-2xl',
                            'max-h-[80vh] sm:max-h-none',
                            'sm:absolute sm:inset-auto sm:left-[72px] sm:top-1/2 sm:w-80 sm:-translate-y-1/2 sm:rounded-2xl',
                            'border border-glass-border bg-glass-bg p-3 shadow-lg backdrop-blur-[24px]',
                            'pointer-events-auto',
                            'animate-in fade-in slide-in-from-bottom-4 duration-200 sm:slide-in-from-left-2'
                        )}
                    >
                        {/* Mobile drag handle */}
                        <div className="mb-2 flex justify-center sm:hidden">
                            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                        </div>

                        {/* Search */}
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={t('sidebar.searchPlaceholder')}
                                className={cn(
                                    'w-full rounded-lg border border-border bg-background/50 py-2 pl-8 pr-8 text-sm',
                                    'placeholder:text-muted-foreground/60',
                                    'transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30'
                                )}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        {/* Search Results Count */}
                        {searchQuery && (
                            <div className="mb-2 px-1 text-xs text-muted-foreground">
                                {totalResults === 0
                                    ? t('sidebar.noResults')
                                    : t('sidebar.resultsCount', { count: totalResults })}
                            </div>
                        )}

                        {/* Categories */}
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 sm:max-h-[60vh]">
                            {BLOCK_CATEGORIES.map(category => {
                                const config = BLOCK_CATEGORY_CONFIG[category];
                                const Icon = config.icon;
                                const blocks = blockGroups[category];
                                const isExpanded = expandedCategories.has(category);

                                return (
                                    <Collapsible
                                        key={category}
                                        open={isExpanded}
                                        onOpenChange={() => handleCategoryToggle(category)}
                                        data-block-category={category}
                                    >
                                        <div
                                            className={cn(
                                                'rounded-xl border border-border bg-muted/30 p-3',
                                                'transition-colors'
                                            )}
                                        >
                                            <CollapsibleTrigger className="flex w-full items-center gap-2">
                                                <Icon className={cn('h-4 w-4', config.color)} />
                                                <span className="flex-1 text-left text-sm font-medium text-foreground">
                                                    {t(config.label)}
                                                </span>
                                                <span className="text-sm text-muted-foreground">{blocks.length}</span>
                                                <ChevronDown
                                                    className={cn(
                                                        'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                                                        isExpanded && 'rotate-180'
                                                    )}
                                                />
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                                                {blocks.length === 0 ? (
                                                    <div className="py-2 text-center text-xs text-muted-foreground">
                                                        {t('sidebar.noResults')}
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-2 gap-1.5 pt-2">
                                                        {blocks.map(block => (
                                                            <BlockCard
                                                                key={block.id}
                                                                type={block.id}
                                                                label={block.label}
                                                                description={block.description}
                                                                icon={block.icon}
                                                                onAdd={() => handleAddNode(block.id)}
                                                                disabled={isLoading || isReadOnly}
                                                                inputCount={block.inputs?.length}
                                                                outputCount={block.outputs?.length}
                                                                isFrontend={block.isFrontend}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </CollapsibleContent>
                                        </div>
                                    </Collapsible>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="mt-3 border-t border-border pt-3 text-center text-xs text-muted-foreground">
                            {isReadOnly ? t('sidebar.readOnlyHint', 'Sign in to add blocks') : t('sidebar.clickToAdd')}
                        </div>
                    </div>
                </>
            )}
        </>
    );
});

Sidebar.displayName = 'Sidebar';
