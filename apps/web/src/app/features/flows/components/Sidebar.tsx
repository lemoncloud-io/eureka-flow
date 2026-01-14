import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    ChevronLeft,
    ChevronRight,
    Eye,
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

interface SidebarProps {
    onAddNode: (type: string) => void;
    isLoading?: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
    'input-text': <Type className="w-4 h-4" />,
    'input-image': <Image className="w-4 h-4" />,
    validation: <Shield className="w-4 h-4" />,
    buffer: <Timer className="w-4 h-4" />,
    transform: <RefreshCw className="w-4 h-4" />,
    info: <Ruler className="w-4 h-4" />,
    'workflow-component': <Package className="w-4 h-4" />,
    preview: <Eye className="w-4 h-4" />,
    'debug-log': <Terminal className="w-4 h-4" />,
    default: <Puzzle className="w-4 h-4" />,
};

const NodeButton = ({
    type,
    icon,
    label,
    isCollapsed,
    disabled,
    onAddNode,
    onHover,
    onLeave,
    colorClass = 'bg-card border-border hover:bg-accent',
}: {
    type: string;
    icon: React.ReactNode;
    label: string;
    isCollapsed: boolean;
    disabled?: boolean;
    onAddNode: (type: string) => void;
    onHover: (type: string, top: number) => void;
    onLeave: () => void;
    colorClass?: string;
}) => (
    <button
        onClick={() => onAddNode(type)}
        onMouseEnter={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            onHover(type, rect.top);
        }}
        onMouseLeave={onLeave}
        disabled={disabled}
        className={`
            w-full p-2 rounded border text-sm transition-colors flex items-center
            ${colorClass}
            ${isCollapsed ? 'justify-center' : 'justify-start gap-2'}
            disabled:opacity-50 disabled:cursor-not-allowed
            relative group
        `}
    >
        <span className="text-muted-foreground">{icon}</span>
        {!isCollapsed && <span className="text-foreground">{label}</span>}
    </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ onAddNode, isLoading }) => {
    const { t } = useTranslation('flows');
    const blockRegistry = useBlockRegistry();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [hoveredNode, setHoveredNode] = useState<{ type: string; top: number } | null>(null);

    const SectionHeader = ({ title }: { title: string }) =>
        !isCollapsed ? (
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4 first:mt-0 px-1">
                {title}
            </h3>
        ) : (
            <div className="h-px bg-border my-2 mx-1" />
        );

    const handleHover = (type: string, top: number) => setHoveredNode({ type, top });
    const handleLeave = () => setHoveredNode(null);

    const getIcon = (type: string): React.ReactNode => {
        type = type ?? '';
        if (type.startsWith('input-')) {
            return type.includes('text') ? iconMap['input-text'] : iconMap['input-image'];
        }
        if (type.includes('validation')) return iconMap.validation;
        if (type === 'buffer') return iconMap.buffer;
        if (type.includes('transform')) return iconMap.transform;
        if (type.includes('info')) return iconMap.info;
        if (type === 'workflow-component') return iconMap['workflow-component'];
        if (type === 'preview') return iconMap.preview;
        if (type === 'debug-log') return iconMap['debug-log'];
        return iconMap.default;
    };

    const blockGroups = useMemo(() => {
        const blocks = Object.values(blockRegistry);
        return {
            inputs: blocks.filter(b => b.type.startsWith('input-')),
            process: blocks.filter(b => !b.type.startsWith('input-') && !['preview', 'debug-log'].includes(b.type)),
            outputs: blocks.filter(b => ['preview', 'debug-log'].includes(b.type)),
        };
    }, [blockRegistry]);

    const renderTooltip = () => {
        if (!hoveredNode) return null;
        const def = blockRegistry[hoveredNode.type];
        if (!def) return null;

        const leftPos = isCollapsed ? '4.5rem' : '15.5rem';

        return (
            <div
                className="fixed z-50 bg-popover border border-border rounded-lg shadow-2xl p-4 w-64 pointer-events-none animate-in fade-in slide-in-from-left-2 duration-200"
                style={{
                    top: hoveredNode.top,
                    left: leftPos,
                }}
            >
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                    <span className="font-bold text-foreground text-sm">{def.label}</span>
                    <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border font-mono">
                        {def.type}
                    </span>
                </div>

                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{def.description}</p>

                {(def.inputs.length > 0 || def.outputs.length > 0) && (
                    <div className="space-y-2">
                        {def.inputs.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                                <span className="text-[9px] text-muted-foreground uppercase font-bold mr-1">In:</span>
                                {def.inputs.map(i => (
                                    <span
                                        key={i.id}
                                        className="text-[9px] bg-muted text-info px-1.5 rounded border border-border"
                                    >
                                        {i.label} <span className="opacity-50">({i.type})</span>
                                    </span>
                                ))}
                            </div>
                        )}
                        {def.outputs.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                                <span className="text-[9px] text-muted-foreground uppercase font-bold mr-1">Out:</span>
                                {def.outputs.map(o => (
                                    <span
                                        key={o.id}
                                        className="text-[9px] bg-muted text-success px-1.5 rounded border border-border"
                                    >
                                        {o.label} <span className="opacity-50">({o.type})</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            className={`
            relative bg-sidebar border-r border-border flex flex-col h-full z-20 shadow-lg
            transition-all duration-300 ease-in-out shrink-0
            ${isCollapsed ? 'w-16' : 'w-60'}
        `}
        >
            {/* Toggle Button */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-4 bg-card border border-border rounded-full w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent z-50 shadow-md transition-colors"
                title={isCollapsed ? t('sidebar.expandSidebar') : t('sidebar.collapseSidebar')}
            >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>

            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-center">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    {isCollapsed ? t('sidebar.libraryShort') : t('sidebar.library')}
                </span>
            </div>

            {/* Node Library */}
            <div
                className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-2 space-y-2' : 'p-4 space-y-1'}`}
                onScroll={() => setHoveredNode(null)}
            >
                <div>
                    <SectionHeader title={t('sidebar.inputs')} />
                    <div className="space-y-2">
                        {blockGroups.inputs.map(b => (
                            <NodeButton
                                key={b.type}
                                type={b.type}
                                icon={getIcon(b.icon ?? b.type)}
                                label={b.label}
                                isCollapsed={isCollapsed}
                                disabled={isLoading}
                                onAddNode={onAddNode}
                                onHover={handleHover}
                                onLeave={handleLeave}
                            />
                        ))}
                    </div>
                </div>

                <div>
                    <SectionHeader title={t('sidebar.process')} />
                    <div className="space-y-2">
                        {blockGroups.process.map(b => (
                            <NodeButton
                                key={b.type}
                                type={b.type}
                                icon={getIcon(b?.icon ?? b.type)}
                                label={b.label}
                                isCollapsed={isCollapsed}
                                disabled={isLoading}
                                onAddNode={onAddNode}
                                onHover={handleHover}
                                onLeave={handleLeave}
                                colorClass={
                                    b.type === 'workflow-component'
                                        ? 'bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900/80 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-100'
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                </div>

                <div>
                    <SectionHeader title={t('sidebar.output')} />
                    <div className="space-y-2">
                        {blockGroups.outputs.map(b => (
                            <NodeButton
                                key={b.type}
                                type={b.type}
                                icon={getIcon(b?.icon ?? b.type)}
                                label={b.label}
                                isCollapsed={isCollapsed}
                                disabled={isLoading}
                                onAddNode={onAddNode}
                                onHover={handleHover}
                                onLeave={handleLeave}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            {!isCollapsed && (
                <div className="p-4 border-t border-border text-[10px] text-muted-foreground text-center">
                    {t('sidebar.dragHint')}
                </div>
            )}

            {/* Tooltip */}
            {renderTooltip()}
        </div>
    );
};
