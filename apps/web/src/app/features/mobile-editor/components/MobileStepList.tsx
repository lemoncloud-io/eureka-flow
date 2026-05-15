import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, Plus, Workflow } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { BlockIcon } from '../../flows/components/BlockIcon';
import { buildNodeDisplayNames, deleteNodeWithSync, findConnectedComponents } from '../utils';
import { STEREO_ICON_BG } from './consts';
import { MobileStepCard } from './MobileStepCard';

import type { FlowRole } from '@flows/flows';

interface MobileStepListProps {
    onTapCard: (nodeId: string) => void;
    onExpandContent?: (content: { value: unknown; type?: string }) => void;
    onAddStep: () => void;
    onAddBlockDirect?: (type: string) => void;
    onRunNode?: (nodeId: string) => void;
    flowId: string | null;
    searchQuery?: string;
    role?: FlowRole;
}

export const MobileStepList = ({
    onTapCard,
    onExpandContent,
    onAddStep,
    onAddBlockDirect,
    onRunNode,
    flowId,
    searchQuery,
    role = 'owner',
}: MobileStepListProps) => {
    const { t } = useTranslation(['flows']);
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const blockRegistry = useBlockRegistry();

    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const displayNames = useMemo(() => buildNodeDisplayNames(nodes, blockRegistry), [nodes, blockRegistry]);

    /** Connected components — each is an independent subflow */
    const groups = useMemo(() => findConnectedComponents(nodes, connections), [nodes, connections]);

    /** Connection lookup for showing connectors between linked nodes */
    const connectionPairs = useMemo(() => {
        const pairs = new Set<string>();
        for (const c of connections) {
            pairs.add(`${c.sourceNodeId}|${c.targetNodeId}`);
        }
        return pairs;
    }, [connections]);

    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const toggleGroupCollapse = (groupId: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    /** Filter groups/nodes by search query */
    const filteredGroups = useMemo(() => {
        if (!searchQuery?.trim()) return groups;
        const q = searchQuery.toLowerCase();
        return groups
            .map(group => ({
                ...group,
                nodeIds: group.nodeIds.filter(id => {
                    const name = displayNames.get(id) ?? nodeMap.get(id)?.type ?? '';
                    return name.toLowerCase().includes(q);
                }),
            }))
            .filter(group => group.nodeIds.length > 0);
    }, [groups, searchQuery, displayNames, nodeMap]);

    const handleDelete = role === 'owner' ? (nodeId: string) => deleteNodeWithSync(nodeId, flowId) : undefined;

    /** Check if nodeB follows nodeA via a direct connection (in topological order) */
    const isDirectlyConnected = (prevId: string, currId: string) =>
        connectionPairs.has(`${prevId}|${currId}`) || connectionPairs.has(`${currId}|${prevId}`);

    // Empty state
    if (nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-muted-foreground">
                <div className="relative w-20 h-20 mb-6">
                    <div className="absolute inset-0 rounded-2xl bg-primary/5 border border-primary/10" />
                    <Workflow className="absolute inset-0 m-auto w-10 h-10 text-primary/25" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <Plus className="w-4 h-4 text-primary/50" />
                    </div>
                </div>

                <p className="text-sm font-medium text-foreground/70 mb-1">
                    {t('mobile.emptyState.title', '입력 노드를 선택하세요')}
                </p>
                <p className="text-xs text-muted-foreground/60 mb-6 text-center leading-relaxed">
                    {t(
                        'mobile.emptyState.description',
                        'Add blocks to create an AI workflow. Connect them to pass data between steps.'
                    )}
                </p>

                {role === 'owner' &&
                    (() => {
                        const quickBlocks = Object.values(blockRegistry)
                            .filter(b => b.stereo === 'input')
                            .slice(0, 2);

                        return (
                            <div className="flex flex-col items-center gap-4 w-full">
                                {/* Quick-add blocks — column layout */}
                                {onAddBlockDirect && quickBlocks.length > 0 && (
                                    <div className="flex justify-center gap-2">
                                        {quickBlocks.map(block => (
                                            <button
                                                key={block.type}
                                                onClick={() => onAddBlockDirect(block.type)}
                                                className={cn(
                                                    'flex items-center gap-2 px-4 py-2.5 rounded-xl',
                                                    'border border-border/40 bg-card',
                                                    'text-xs font-medium',
                                                    'hover:border-primary/30 hover:shadow-sm',
                                                    'active:scale-[0.97] transition-all'
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                                        STEREO_ICON_BG.input
                                                    )}
                                                >
                                                    <BlockIcon icon={block.icon} size={16} />
                                                </div>
                                                {block.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {/* Browse all */}
                                <button
                                    onClick={onAddStep}
                                    className={cn(
                                        'flex items-center justify-center gap-2 w-full h-12 rounded-xl',
                                        'border border-primary/20 bg-card text-sm font-semibold text-primary',
                                        'hover:bg-primary/5 active:scale-[0.98] transition-all'
                                    )}
                                >
                                    <Plus className="w-4 h-4" />
                                    {t('mobile.addNode', '노드 추가')}
                                </button>
                            </div>
                        );
                    })()}
            </div>
        );
    }

    return (
        <LayoutGroup>
            <div className="flex flex-col gap-5 px-4 pb-28">
                <AnimatePresence mode="popLayout">
                    {filteredGroups.map((group, groupIdx) => {
                        const stereos = group.nodeIds
                            .map(id => {
                                const node = nodeMap.get(id);
                                return node ? blockRegistry[node.type]?.stereo : undefined;
                            })
                            .filter(Boolean);

                        // Determine group label based on node types
                        const hasInput = stereos.includes('input');
                        const hasProcess = stereos.includes('process');
                        const hasOutput = stereos.includes('output');
                        const groupLabel = group.isMultiNode
                            ? [
                                  hasInput && t('mobile.groupLabel.input', 'Input'),
                                  hasProcess && t('mobile.groupLabel.process', 'Process'),
                                  hasOutput && t('mobile.groupLabel.output', 'Output'),
                              ]
                                  .filter(Boolean)
                                  .join(' → ')
                            : undefined;

                        return (
                            <motion.div
                                key={group.id}
                                layout
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.2, delay: groupIdx * 0.03 }}
                            >
                                {/* Group container */}
                                <div
                                    className={cn(
                                        group.isMultiNode
                                            ? cn(
                                                  'rounded-2xl border-[1.3px] border-border px-3 pt-3 space-y-0',
                                                  collapsedGroups.has(group.id) ? 'pb-0' : 'pb-3'
                                              )
                                            : ''
                                    )}
                                >
                                    {/* Group header — tappable to collapse/expand */}
                                    {group.isMultiNode && groupLabel && (
                                        <button
                                            type="button"
                                            onClick={() => toggleGroupCollapse(group.id)}
                                            className="w-full flex items-center gap-2 pb-3 px-1"
                                        >
                                            <ChevronDown
                                                className={cn(
                                                    'w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200',
                                                    collapsedGroups.has(group.id) && '-rotate-90'
                                                )}
                                            />
                                            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                                                {groupLabel}
                                            </span>
                                            <div className="flex-1 h-px bg-border/40" />
                                            <span className="text-[10px] font-medium text-muted-foreground/50 tabular-nums">
                                                {group.nodeIds.length}
                                            </span>
                                        </button>
                                    )}

                                    {/* Nodes within the group — hidden when collapsed */}
                                    {!collapsedGroups.has(group.id) &&
                                        group.nodeIds.map((nodeId, idx) => {
                                            const node = nodeMap.get(nodeId);
                                            if (!node) return null;

                                            const prevId = idx > 0 ? group.nodeIds[idx - 1] : null;
                                            const showConnector =
                                                prevId !== null && isDirectlyConnected(prevId, nodeId);

                                            return (
                                                <div key={nodeId}>
                                                    {/* Connector line between connected nodes */}
                                                    {idx > 0 && (
                                                        <div className="flex justify-center py-0.5">
                                                            <div
                                                                className={cn(
                                                                    'w-px h-4',
                                                                    showConnector
                                                                        ? 'bg-primary/25'
                                                                        : 'bg-border/30 border-l border-dashed border-border/40'
                                                                )}
                                                            />
                                                        </div>
                                                    )}
                                                    <MobileStepCard
                                                        node={node}
                                                        displayName={displayNames.get(nodeId) ?? node.type}
                                                        onTapCard={onTapCard}
                                                        onExpandContent={onExpandContent}
                                                        onRun={onRunNode}
                                                        onDelete={handleDelete}
                                                        role={role}
                                                    />
                                                </div>
                                            );
                                        })}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Search empty state */}
                {searchQuery?.trim() && filteredGroups.length === 0 && (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                        {t('mobile.noSearchResults', 'No matching nodes')}
                    </div>
                )}
            </div>
        </LayoutGroup>
    );
};
