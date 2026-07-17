import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

import { getPermissions, useBlockRegistry, useCanvasConnections, useCanvasNodes, useCanvasStore } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { BlockIcon } from '../../flows/components/BlockIcon';
import { buildNodeDisplayNames, findConnectedComponents } from '../utils';
import { STEREO_ICON_BG } from './consts';
import { MobileStepCard } from './MobileStepCard';

import type { FlowRole } from '@flows/flows';

interface MobileStepListProps {
    onTapCard: (nodeId: string) => void;
    onExpandContent?: (content: { value: unknown; type?: string }) => void;
    onAddStep: () => void;
    onAddBlockDirect?: (type: string) => void;
    onRunNode?: (nodeId: string) => void;
    searchQuery?: string;
    role?: FlowRole;
}

export const MobileStepList = ({
    onTapCard,
    onExpandContent,
    onAddStep,
    onAddBlockDirect,
    onRunNode,
    searchQuery,
    role = 'owner',
}: MobileStepListProps) => {
    const { t } = useTranslation(['flows']);
    const { canModifyCanvas } = getPermissions(role);
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

    const handleDelete = canModifyCanvas ? (nodeId: string) => useCanvasStore.getState().deleteNode(nodeId) : undefined;

    /** Check if nodeB follows nodeA via a direct connection (in topological order) */
    const isDirectlyConnected = (prevId: string, currId: string) =>
        connectionPairs.has(`${prevId}|${currId}`) || connectionPairs.has(`${currId}|${prevId}`);

    // Empty state
    if (nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="w-full rounded-2xl border border-border bg-card p-6 flex flex-col items-center">
                    <p className="text-sm font-medium text-foreground mb-1">
                        + {t('mobile.emptyState.title', '입력 노드 선택')}
                    </p>
                    <p className="text-xs text-muted-foreground mb-5 text-center leading-relaxed">
                        {t(
                            'mobile.emptyState.description',
                            '블록을 추가하여 AI 워크플로우를 만들고, 연결하여 데이터를 전달하세요.'
                        )}
                    </p>

                    {canModifyCanvas &&
                        onAddBlockDirect &&
                        (() => {
                            const quickBlocks = Object.values(blockRegistry)
                                .filter(b => b.stereo === 'input')
                                .slice(0, 2);
                            if (quickBlocks.length === 0) return null;
                            return (
                                <div className="flex justify-center gap-2">
                                    {quickBlocks.map(block => (
                                        <button
                                            key={block.type}
                                            onClick={() => onAddBlockDirect(block.type)}
                                            className={cn(
                                                'flex items-center gap-2 px-4 py-2.5 rounded-xl',
                                                'border border-border bg-background',
                                                'text-xs font-medium',
                                                'hover:border-primary/40 transition-colors'
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
                            );
                        })()}
                </div>
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
                        const hasInput = stereos.includes('input');
                        const hasProcess = stereos.includes('process');
                        const hasOutput = stereos.includes('output');
                        const groupLabel = group.isMultiNode
                            ? [hasInput && 'INPUT', hasProcess && 'PROCESS', hasOutput && 'OUTPUT']
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
                                <div
                                    className={cn(
                                        group.isMultiNode
                                            ? cn(
                                                  'rounded-2xl border border-border px-3 pt-3 space-y-0',
                                                  collapsedGroups.has(group.id) ? 'pb-0' : 'pb-3'
                                              )
                                            : ''
                                    )}
                                >
                                    {/* Group header */}
                                    {group.isMultiNode && groupLabel && (
                                        <button
                                            type="button"
                                            onClick={() => toggleGroupCollapse(group.id)}
                                            className="w-full flex items-center gap-2 pb-3 px-1"
                                        >
                                            <ChevronDown
                                                className={cn(
                                                    'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
                                                    collapsedGroups.has(group.id) && '-rotate-90'
                                                )}
                                            />
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                                                {groupLabel}
                                            </span>
                                            <div className="flex-1 h-px bg-border" />
                                            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                                                {group.nodeIds.length}
                                            </span>
                                        </button>
                                    )}

                                    {/* Nodes */}
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
