import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    ChevronDown,
    ChevronRight,
    Image,
    LayoutGrid,
    Package,
    Puzzle,
    Ruler,
    Search,
    Shield,
    Terminal,
    Timer,
    Type,
    X,
} from 'lucide-react';

import { BLOCK_CATEGORIES, BLOCK_CATEGORY_CONFIG, useBlockGroups } from '@flows/flows';
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
import { FrontendBadge } from './FrontendBadge';

interface SidebarProps {
    onAddNode: (type: string) => void;
    isLoading?: boolean;
    readOnly?: boolean;
}

export interface SidebarRef {
    open: () => void;
}

const iconMap: Record<string, React.ElementType> = {
    'input-text': Type,
    'input-image': Image,
    validator: Shield,
    delay: Timer,
    transform: RefreshCw,
    info: Ruler,
    'workflow-component': Package,
    preview: Eye,
    log: Terminal,
    default: Puzzle,
};

const getIcon = (blockType: string): React.ElementType => {
    if (blockType.startsWith('input-')) {
        return blockType.includes('text') ? iconMap['input-text'] : iconMap['input-image'];
    }
    // Server types: length-validator, buffer-delay, text-transform, image-info, etc.
    if (blockType.includes('validator')) return iconMap.validator;
    if (blockType.includes('delay') || blockType.includes('buffer')) return iconMap.delay;
    if (blockType.includes('transform')) return iconMap.transform;
    if (blockType.includes('info')) return iconMap.info;
    if (blockType === 'workflow-component') return iconMap['workflow-component'];
    if (blockType.includes('preview')) return iconMap.preview;
    if (blockType.includes('log') || blockType.includes('console')) return iconMap.log;
    return iconMap.default;
};

interface BlockItemProps {
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

const BlockItem: React.FC<BlockItemProps> = ({
    type,
    label,
    description,
    icon,
    onAdd,
    disabled,
    inputCount = 0,
    outputCount = 0,
    isFrontend,
}) => {
    const { t } = useTranslation(['flows']);
    const FallbackIcon = getIcon(type);

    return (
        <TooltipProvider delayDuration={0}>
            <button
                onClick={onAdd}
                disabled={disabled}
                className={cn(
                    'w-full p-3 rounded-lg border border-glass-border bg-glass-bg backdrop-blur-sm',
                    'text-left transition-all duration-150',
                    'hover:bg-accent/50 hover:border-accent',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'group'
                )}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                        <BlockIcon
                            icon={icon}
                            size={16}
                            fallback={
                                <FallbackIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            }
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground truncate">{label}</span>
                            {isFrontend && <FrontendBadge showTooltip />}
                        </div>
                        <div className="flex items-center gap-2">
                            {description ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="text-[10px] text-muted-foreground truncate flex-1 cursor-help">
                                            {description}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="right"
                                        sideOffset={8}
                                        className="max-w-xl break-words bg-popover text-popover-foreground border border-border shadow-lg"
                                    >
                                        <MarkdownViewer
                                            content={description}
                                            className="text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:m-0 [&_p]:mb-1 [&_ul]:m-0 [&_ol]:m-0 [&_pre]:bg-muted [&_pre]:whitespace-pre-wrap [&_pre]:overflow-x-hidden [&_code]:bg-muted/70"
                                        />
                                    </TooltipContent>
                                </Tooltip>
                            ) : (
                                <span className="text-[10px] text-muted-foreground truncate flex-1" />
                            )}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="text-[9px] text-muted-foreground/70 shrink-0 cursor-help">
                                        {inputCount}→{outputCount}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" sideOffset={8} className="text-xs">
                                    {t('sidebar.portsInfo', { inputs: inputCount, outputs: outputCount })}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </button>
        </TooltipProvider>
    );
};

type CategoryKey = keyof typeof BLOCK_CATEGORY_CONFIG;

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(({ onAddNode, isLoading, readOnly }, ref) => {
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
    }));

    const blockGroups = useBlockGroups(searchQuery);

    const handleTogglePanel = () => {
        if (isOpen) {
            setIsOpen(false);
            setSearchQuery('');
        } else {
            setIsOpen(true);
            // Open with all categories expanded
            setExpandedCategories(new Set(BLOCK_CATEGORIES));
            // Focus search input after panel opens
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
        if (readOnly) return;
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
            {/* Single Library Button */}
            <div
                data-tour="sidebar"
                className="absolute left-2 sm:left-4 bottom-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-20 pointer-events-auto"
            >
                <div
                    className={cn(
                        'flex flex-col gap-2 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl',
                        'bg-glass-bg backdrop-blur-[24px] border border-glass-border',
                        'shadow-floating'
                    )}
                >
                    <TooltipProvider delayDuration={0}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleTogglePanel}
                                    className={cn(
                                        'w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all duration-150',
                                        'hover:bg-accent',
                                        isOpen
                                            ? 'bg-glass-bg text-primary shadow-md'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs font-medium hidden sm:block">
                                {t('sidebar.library')}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* Expanded Panel */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-15 bg-black/20 sm:bg-transparent" onClick={handleClose} />

                    {/* Panel - Full screen on mobile, floating on tablet+ */}
                    <div
                        className={cn(
                            // Mobile: full-screen sheet from bottom
                            'fixed inset-x-0 bottom-0 z-20 rounded-t-2xl',
                            'max-h-[80vh] sm:max-h-none',
                            // Tablet+: positioned floating panel
                            'sm:absolute sm:inset-auto sm:left-20 sm:top-1/2 sm:-translate-y-1/2 sm:w-64 sm:rounded-2xl',
                            'bg-glass-bg backdrop-blur-[24px] border border-glass-border',
                            'shadow-lg p-3 pointer-events-auto',
                            'animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-left-2 duration-200'
                        )}
                    >
                        {/* Mobile drag handle indicator */}
                        <div className="flex justify-center mb-2 sm:hidden">
                            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                        </div>

                        {/* Search Input */}
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={t('sidebar.searchPlaceholder')}
                                className={cn(
                                    'w-full pl-9 pr-8 py-2 text-sm rounded-lg',
                                    'bg-background/50 border border-border',
                                    'placeholder:text-muted-foreground/60',
                                    'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
                                    'transition-all'
                                )}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        {/* Search Results Count */}
                        {searchQuery && (
                            <div className="text-[10px] text-muted-foreground mb-2 px-1">
                                {totalResults === 0
                                    ? t('sidebar.noResults')
                                    : t('sidebar.resultsCount', { count: totalResults })}
                            </div>
                        )}

                        <div className="space-y-2 max-h-[50vh] sm:max-h-[60vh] overflow-y-auto pr-1">
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
                                    >
                                        <CollapsibleTrigger
                                            className={cn(
                                                'flex items-center gap-2 w-full p-2 rounded-lg',
                                                'hover:bg-accent/50 transition-colors',
                                                isExpanded && 'bg-accent/30'
                                            )}
                                        >
                                            <Icon className={cn('w-4 h-4', config.color)} />
                                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex-1 text-left">
                                                {t(config.label)}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground mr-1">
                                                {blocks.length}
                                            </span>
                                            <ChevronDown
                                                className={cn(
                                                    'w-4 h-4 text-muted-foreground transition-transform duration-200',
                                                    isExpanded && 'rotate-180'
                                                )}
                                            />
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                                            <div className="space-y-2 pt-2 pl-2">
                                                {blocks.length === 0 ? (
                                                    <div className="text-center py-2 text-muted-foreground text-xs">
                                                        {t('sidebar.noResults')}
                                                    </div>
                                                ) : (
                                                    blocks.map(block => (
                                                        <BlockItem
                                                            key={block.id}
                                                            type={block.id}
                                                            label={block.label}
                                                            description={block.description}
                                                            icon={block.icon}
                                                            onAdd={() => handleAddNode(block.id)}
                                                            disabled={isLoading || readOnly}
                                                            inputCount={block.inputs?.length}
                                                            outputCount={block.outputs?.length}
                                                            isFrontend={block.isFrontend}
                                                        />
                                                    ))
                                                )}
                                            </div>
                                        </CollapsibleContent>
                                    </Collapsible>
                                );
                            })}
                        </div>

                        <div className="mt-3 pt-2 border-t border-glass-border text-[10px] text-muted-foreground text-center">
                            {readOnly ? t('sidebar.readOnlyHint', 'Sign in to add blocks') : t('sidebar.clickToAdd')}
                        </div>
                    </div>
                </>
            )}
        </>
    );
});

Sidebar.displayName = 'Sidebar';
