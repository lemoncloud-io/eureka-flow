import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronUp, LayoutGrid, Search, X } from 'lucide-react';

import { BLOCK_CATEGORIES, BLOCK_CATEGORY_CONFIG, translateField, useBlockGroups } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    MarkdownViewer,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@flows/ui-kit';

import { BlockIcon } from './BlockIcon';

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
}) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <button
                onClick={onAdd}
                disabled={disabled}
                data-block-item={type}
                className={cn(
                    'group w-full rounded-xl border border-border/40 bg-background p-3',
                    'text-left transition-[transform,box-shadow,border-color] duration-300',
                    'hover:border-primary/30 hover:shadow-floating-hover hover:-translate-y-0.5',
                    'active:scale-[0.98]',
                    'disabled:cursor-not-allowed disabled:opacity-40'
                )}
            >
                <div className="flex items-start gap-1.5">
                    <BlockIcon icon={icon} size={18} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2 text-[13px] font-semibold leading-[18px] tracking-[-0.3px] text-foreground">
                        {label}
                    </span>
                </div>
                <p className="mt-1 truncate text-[11px] leading-4 tracking-[-0.2px] text-muted-foreground/80">
                    {description} {inputCount}→{outputCount}
                </p>
            </button>
        </TooltipTrigger>
        {description && (
            <TooltipContent
                side="right"
                sideOffset={8}
                className="max-w-xs bg-popover text-popover-foreground border border-border shadow-lg"
            >
                <MarkdownViewer
                    content={description}
                    className="text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:m-0 [&_p]:mb-1 [&_ul]:m-0 [&_ol]:m-0 [&_pre]:bg-muted [&_pre]:whitespace-pre-wrap [&_pre]:overflow-x-hidden [&_code]:bg-muted/70"
                />
            </TooltipContent>
        )}
    </Tooltip>
);

// ─── Sidebar ───

type CategoryKey = keyof typeof BLOCK_CATEGORY_CONFIG;

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(({ onAddNode, isLoading, role = 'owner' }, ref) => {
    const isReadOnly = role === 'viewer' || role === 'anonymous';
    const { t } = useTranslation(['flows', 'blocks']);
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
                        'flex flex-col gap-2 rounded-2xl border border-border/40 bg-glass-bg p-1.5 backdrop-blur-2xl',
                        'shadow-floating sm:p-2'
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
                    <div className="fixed inset-0 z-15 bg-black/20 sm:bg-transparent" onClick={handleClose} />

                    <div
                        className={cn(
                            'fixed inset-x-0 bottom-0 z-20 rounded-t-2xl',
                            'max-h-[80vh] sm:max-h-none',
                            'sm:absolute sm:inset-auto sm:left-[72px] sm:top-1/2 sm:w-[340px] sm:-translate-y-1/2 sm:rounded-2xl',
                            'border border-border/40 bg-glass-bg p-3 shadow-floating backdrop-blur-2xl',
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
                            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={t('sidebar.searchPlaceholder')}
                                className={cn(
                                    'w-full rounded-lg border border-border bg-background py-2 pl-8 pr-8 text-[13px]',
                                    'placeholder:text-muted-foreground/50',
                                    'transition-all focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20'
                                )}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Search Results Count */}
                        {searchQuery && (
                            <div className="mb-2 px-0.5 text-[11px] text-muted-foreground">
                                {totalResults === 0
                                    ? t('sidebar.noResults')
                                    : t('sidebar.resultsCount', { count: totalResults })}
                            </div>
                        )}

                        {/* Categories */}
                        <div className="space-y-2.5 max-h-[50vh] overflow-y-auto sm:max-h-[60vh]">
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
                                        <div className="rounded-xl border border-border/30 bg-card/40 p-3">
                                            <CollapsibleTrigger className="flex w-full items-center gap-2">
                                                <Icon className={cn('h-[18px] w-[18px]', config.color)} />
                                                <span className="flex-1 text-left text-[13px] font-semibold tracking-[-0.3px] text-foreground">
                                                    {t(config.label)}
                                                </span>
                                                <span className="text-[13px] tabular-nums text-muted-foreground">
                                                    {blocks.length}
                                                </span>
                                                <ChevronUp
                                                    className={cn(
                                                        'h-4 w-4 text-muted-foreground/60 transition-transform duration-200',
                                                        !isExpanded && 'rotate-180'
                                                    )}
                                                />
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                                                {blocks.length === 0 ? (
                                                    <div className="py-3 text-center text-[11px] text-muted-foreground">
                                                        {t('sidebar.noResults')}
                                                    </div>
                                                ) : (
                                                    <TooltipProvider delayDuration={300}>
                                                        <div className="grid grid-cols-2 gap-1.5 pt-2.5">
                                                            {blocks.map(block => (
                                                                <BlockCard
                                                                    key={block.id}
                                                                    type={block.id}
                                                                    label={
                                                                        translateField(t, block, 'label') || block.type
                                                                    }
                                                                    description={translateField(
                                                                        t,
                                                                        block,
                                                                        'description'
                                                                    )}
                                                                    icon={block.icon}
                                                                    onAdd={() => handleAddNode(block.id)}
                                                                    disabled={isLoading || isReadOnly}
                                                                    inputCount={block.inputs?.length}
                                                                    outputCount={block.outputs?.length}
                                                                />
                                                            ))}
                                                        </div>
                                                    </TooltipProvider>
                                                )}
                                            </CollapsibleContent>
                                        </div>
                                    </Collapsible>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="mt-3 border-t border-border/30 pt-2.5 text-center text-[11px] text-muted-foreground/70">
                            {isReadOnly
                                ? role === 'anonymous'
                                    ? t('sidebar.readOnlyHint', 'Sign in to add blocks')
                                    : t('sidebar.viewerHint', 'Viewers cannot add blocks')
                                : t('sidebar.clickToAdd')}
                        </div>
                    </div>
                </>
            )}
        </>
    );
});

Sidebar.displayName = 'Sidebar';
