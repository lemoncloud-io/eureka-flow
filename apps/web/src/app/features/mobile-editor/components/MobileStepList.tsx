import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Plus, Workflow } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { buildNodeDisplayNames, deleteNodeWithSync, findConnectedComponents } from '../utils';
import { MobileStepCard } from './MobileStepCard';

import type { FlowRole } from '@flows/flows';

interface MobileStepListProps {
    onTapCard: (nodeId: string) => void;
    onAddStep: () => void;
    onRunNode?: (nodeId: string) => void;
    flowId: string | null;
    role?: FlowRole;
}

export const MobileStepList = ({ onTapCard, onAddStep, onRunNode, flowId, role = 'owner' }: MobileStepListProps) => {
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
                    {t('mobile.emptyState.title', 'Start building your flow')}
                </p>
                <p className="text-xs text-muted-foreground/60 mb-6 text-center leading-relaxed">
                    {t(
                        'mobile.emptyState.description',
                        'Add blocks to create an AI workflow. Connect them to pass data between steps.'
                    )}
                </p>

                {role === 'owner' && (
                    <button
                        onClick={onAddStep}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 rounded-full',
                            'bg-primary text-primary-foreground text-sm font-medium',
                            'active:scale-[0.96] transition-all shadow-sm shadow-primary/20'
                        )}
                    >
                        <Plus className="w-4 h-4" />
                        {t('mobile.addFirstStep', 'Add your first step')}
                    </button>
                )}
            </div>
        );
    }

    return (
        <LayoutGroup>
            <div className="flex flex-col gap-5 px-4 pb-28">
                <AnimatePresence mode="popLayout">
                    {groups.map((group, groupIdx) => {
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
                            ? [hasInput && 'Input', hasProcess && 'Process', hasOutput && 'Output']
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
                                            ? 'rounded-2xl border-[1.3px] border-border p-3 space-y-0'
                                            : ''
                                    )}
                                >
                                    {/* Group header for multi-node groups */}
                                    {group.isMultiNode && groupLabel && (
                                        <div className="flex items-center gap-2 pb-3 px-1">
                                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                                                <span>{groupLabel}</span>
                                            </div>
                                            <div className="flex-1 h-px bg-border/40" />
                                            <span className="text-[10px] font-medium text-muted-foreground/50 tabular-nums">
                                                {group.nodeIds.length}
                                            </span>
                                        </div>
                                    )}

                                    {/* Nodes within the group */}
                                    {group.nodeIds.map((nodeId, idx) => {
                                        const node = nodeMap.get(nodeId);
                                        if (!node) return null;

                                        const prevId = idx > 0 ? group.nodeIds[idx - 1] : null;
                                        const showConnector = prevId !== null && isDirectlyConnected(prevId, nodeId);

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

                {/* Bottom spacer for fixed bottom bar */}
            </div>
        </LayoutGroup>
    );
};
