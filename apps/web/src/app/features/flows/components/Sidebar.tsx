import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    ChevronRight,
    Eye,
    FileInput,
    Image,
    Package,
    Puzzle,
    RefreshCw,
    Ruler,
    Shield,
    Terminal,
    Timer,
    Type,
} from 'lucide-react';

import { useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@flows/ui-kit';

interface SidebarProps {
    onAddNode: (type: string) => void;
    isLoading?: boolean;
}

const CATEGORY_CONFIG = {
    inputs: {
        icon: FileInput,
        label: 'sidebar.inputs',
        color: 'text-primary',
        hoverBg: 'hover:bg-primary/10',
    },
    process: {
        icon: RefreshCw,
        label: 'sidebar.process',
        color: 'text-muted-foreground',
        hoverBg: 'hover:bg-accent',
    },
    outputs: {
        icon: Eye,
        label: 'sidebar.output',
        color: 'text-success',
        hoverBg: 'hover:bg-success/10',
    },
} as const;

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

const getIcon = (type: string): React.ElementType => {
    type = type ?? '';
    if (type.startsWith('input-')) {
        return type.includes('text') ? iconMap['input-text'] : iconMap['input-image'];
    }
    // Server types: length-validator, buffer-delay, text-transform, image-info, etc.
    if (type.includes('validator')) return iconMap.validator;
    if (type.includes('delay') || type.includes('buffer')) return iconMap.delay;
    if (type.includes('transform')) return iconMap.transform;
    if (type.includes('info')) return iconMap.info;
    if (type === 'workflow-component') return iconMap['workflow-component'];
    if (type.includes('preview')) return iconMap.preview;
    if (type.includes('log') || type.includes('console')) return iconMap.log;
    return iconMap.default;
};

interface CategoryButtonProps {
    category: keyof typeof CATEGORY_CONFIG;
    isActive: boolean;
    onClick: () => void;
}

const CategoryButton: React.FC<CategoryButtonProps> = ({ category, isActive, onClick }) => {
    const { t } = useTranslation(['flows']);
    const config = CATEGORY_CONFIG[category];
    const Icon = config.icon;

    return (
        <TooltipProvider delayDuration={0}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={onClick}
                        className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150',
                            config.hoverBg,
                            isActive
                                ? `bg-glass-bg ${config.color} shadow-md`
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <Icon className="w-5 h-5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs font-medium">
                    {t(config.label)}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

interface BlockItemProps {
    type: string;
    label: string;
    description: string;
    onAdd: () => void;
    disabled?: boolean;
}

const BlockItem: React.FC<BlockItemProps> = ({ type, label, description, onAdd, disabled }) => {
    const Icon = getIcon(type);

    return (
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
                    <Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{description}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </button>
    );
};

export const Sidebar: React.FC<SidebarProps> = ({ onAddNode, isLoading }) => {
    const { t } = useTranslation(['flows']);
    const blockRegistry = useBlockRegistry();
    const [activeCategory, setActiveCategory] = useState<keyof typeof CATEGORY_CONFIG | null>(null);

    const blockGroups = useMemo(() => {
        const blocks = Object.values(blockRegistry);

        return {
            inputs: blocks.filter(b => b.type.startsWith('input-')),
            process: blocks.filter(
                b => !b.type.startsWith('input-') && !['result-preview', 'console-log'].includes(b.type)
            ),
            outputs: blocks.filter(b => ['result-preview', 'console-log'].includes(b.type)),
        };
    }, [blockRegistry]);

    const handleCategoryClick = (category: keyof typeof CATEGORY_CONFIG) => {
        setActiveCategory(activeCategory === category ? null : category);
    };

    const handleAddNode = (type: string) => {
        onAddNode(type);
        setActiveCategory(null);
    };

    return (
        <>
            {/* Icon Bar */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 pointer-events-auto">
                <div
                    className={cn(
                        'flex flex-col gap-2 p-2 rounded-2xl',
                        'bg-glass-bg backdrop-blur-[24px] border border-glass-border',
                        'shadow-floating'
                    )}
                >
                    {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map(category => (
                        <CategoryButton
                            key={category}
                            category={category}
                            isActive={activeCategory === category}
                            onClick={() => handleCategoryClick(category)}
                        />
                    ))}
                </div>
            </div>

            {/* Expanded Panel */}
            {activeCategory && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-15" onClick={() => setActiveCategory(null)} />

                    {/* Panel */}
                    <div
                        className={cn(
                            'absolute left-20 top-1/2 -translate-y-1/2 z-20 w-64',
                            'bg-glass-bg backdrop-blur-[24px] border border-glass-border rounded-2xl',
                            'shadow-lg p-3 pointer-events-auto',
                            'animate-in fade-in slide-in-from-left-2 duration-200'
                        )}
                    >
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-glass-border">
                            {React.createElement(CATEGORY_CONFIG[activeCategory].icon, {
                                className: cn('w-4 h-4', CATEGORY_CONFIG[activeCategory].color),
                            })}
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                {t(CATEGORY_CONFIG[activeCategory].label)}
                            </span>
                        </div>

                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {blockGroups[activeCategory].length === 0 ? (
                                <div className="text-center py-4 text-muted-foreground text-xs">
                                    {t('sidebar.noResults')}
                                </div>
                            ) : (
                                blockGroups[activeCategory].map(block => (
                                    <BlockItem
                                        key={block.type}
                                        type={block.type}
                                        label={block.label}
                                        description={block.description}
                                        onAdd={() => handleAddNode(block.type)}
                                        disabled={isLoading}
                                    />
                                ))
                            )}
                        </div>

                        <div className="mt-3 pt-2 border-t border-glass-border text-[10px] text-muted-foreground text-center">
                            {t('sidebar.clickToAdd')}
                        </div>
                    </div>
                </>
            )}
        </>
    );
};
