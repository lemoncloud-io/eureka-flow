import { useCallback, useEffect, useRef, useState } from 'react';

import { RefreshCw } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { CanvasBinding } from '../utils/createDesktopCanvasBinding';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface DevCanvasBindingPanelProps {
    binding: CanvasBinding;
}

/**
 * Dev-only panel that validates the CanvasBinding seam: it lists the live canvas nodes
 * (`binding.readGraph`) and lets you rename / move a selected node (`binding.updateNode`),
 * with the change appearing on the canvas immediately.
 *
 * Reads are a pull (the Refresh button): the desktop canvas is component-local state the
 * panel can't subscribe to, so the list is re-read on demand. Edits are applied optimistically
 * to the panel's own snapshot so the list stays in sync without a re-read.
 */
export const DevCanvasBindingPanel = ({ binding }: DevCanvasBindingPanelProps) => {
    // Draggable floating overlay (house pattern from DevRoleChip / DevSocketPanel).
    const dragRef = useRef<HTMLDivElement>(null);
    // Anchored to the left of the (420px-wide, right:16) DevSocketPanel so the two don't overlap.
    const [pos, setPos] = useState({ x: 456, y: 144 });
    const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

    const [nodes, setNodes] = useState<NodeData[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Edit fields are raw strings so intermediate values (empty, "-", "12.") survive typing.
    const [labelStr, setLabelStr] = useState('');
    const [xStr, setXStr] = useState('');
    const [yStr, setYStr] = useState('');

    // Tracks the current selection for refresh() without re-running the mount effect on every select.
    const selectedIdRef = useRef<string | null>(null);

    const seedFields = useCallback((node: NodeData) => {
        setLabelStr(node.customLabel ?? '');
        setXStr(String(node.position?.x ?? 0));
        setYStr(String(node.position?.y ?? 0));
    }, []);

    const refresh = useCallback(() => {
        try {
            const fresh = binding.readGraph().nodes;
            setNodes(fresh);
            // Reconcile the editor with external canvas changes (node drag / socket / autoLayout).
            const id = selectedIdRef.current;
            if (id) {
                const node = fresh.find(n => n.id === id);
                if (node) seedFields(node);
            }
        } catch {
            // Canvas not mounted yet — leave the list empty; the user can refresh again.
            setNodes([]);
        }
    }, [binding, seedFields]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const selectNode = useCallback(
        (node: NodeData) => {
            selectedIdRef.current = node.id;
            setSelectedId(node.id);
            seedFields(node);
        },
        [seedFields]
    );

    const applyPatch = useCallback(
        (id: string, patch: { label?: string; position?: { x: number; y: number } }) => {
            binding.updateNode(id, patch);
            // Mirror the binding's effect on the local snapshot so the list stays coherent.
            setNodes(prev =>
                prev.map(node => {
                    if (node.id !== id) return node;
                    const next: NodeData = { ...node };
                    if (patch.label !== undefined) next.customLabel = patch.label || undefined;
                    if (patch.position) next.position = patch.position;
                    return next;
                })
            );
        },
        [binding]
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if ((e.target as HTMLElement).closest('button, input, textarea')) return;
            e.preventDefault();
            dragState.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
            dragRef.current?.setPointerCapture(e.pointerId);
        },
        [pos]
    );

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current) return;
        const dx = dragState.current.startX - e.clientX;
        const dy = dragState.current.startY - e.clientY;
        setPos({
            x: Math.max(0, dragState.current.originX + dx),
            y: Math.max(0, dragState.current.originY + dy),
        });
    }, []);

    const handlePointerUp = useCallback(() => {
        dragState.current = null;
    }, []);

    const selected = nodes.find(node => node.id === selectedId) ?? null;

    const commitX = (raw: string) => {
        setXStr(raw);
        const x = Number(raw);
        if (selected && raw.trim() !== '' && Number.isFinite(x)) {
            applyPatch(selected.id, { position: { x, y: selected.position?.y ?? 0 } });
        }
    };

    const commitY = (raw: string) => {
        setYStr(raw);
        const y = Number(raw);
        if (selected && raw.trim() !== '' && Number.isFinite(y)) {
            applyPatch(selected.id, { position: { x: selected.position?.x ?? 0, y } });
        }
    };

    const fieldClass =
        'w-full bg-muted/40 border border-border/40 rounded-md px-2 py-1 text-foreground outline-none focus:border-primary/60';

    return (
        <div className="fixed z-50 touch-none" style={{ right: pos.x, bottom: pos.y }}>
            <div className="w-[280px] bg-glass-bg backdrop-blur-2xl border border-border/40 shadow-floating rounded-xl overflow-hidden text-xs font-mono">
                {/* Header (drag handle) */}
                <div
                    ref={dragRef}
                    className="flex items-center justify-between px-3 py-2 border-b border-border/40 cursor-grab active:cursor-grabbing select-none"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <span className="font-semibold text-muted-foreground select-none">
                        Canvas Binding · {nodes.length}
                    </span>
                    <button
                        onClick={refresh}
                        title="Re-read nodes from the canvas"
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" />
                    </button>
                </div>

                {/* Node list */}
                <div className="max-h-52 overflow-y-auto">
                    {nodes.length === 0 ? (
                        <div className="px-3 py-4 text-center text-muted-foreground/60">No nodes — click refresh.</div>
                    ) : (
                        nodes.map(node => (
                            <button
                                key={node.id}
                                onClick={() => selectNode(node)}
                                className={cn(
                                    'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors',
                                    node.id === selectedId
                                        ? 'bg-primary/15 text-foreground'
                                        : 'text-muted-foreground hover:bg-accent/40'
                                )}
                            >
                                <span className="w-full truncate">{node.customLabel || node.type}</span>
                                <span className="w-full truncate text-[10px] text-muted-foreground/50">{node.id}</span>
                            </button>
                        ))
                    )}
                </div>

                {/* Editor */}
                {selected && (
                    <div className="flex flex-col gap-2 border-t border-border/40 px-3 py-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground/60">Name</span>
                            <input
                                value={labelStr}
                                placeholder={selected.type}
                                onChange={e => {
                                    setLabelStr(e.target.value);
                                    applyPatch(selected.id, { label: e.target.value });
                                }}
                                className={fieldClass}
                            />
                        </label>
                        <div className="flex gap-2">
                            <label className="flex flex-1 flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground/60">X</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={xStr}
                                    onChange={e => commitX(e.target.value)}
                                    className={fieldClass}
                                />
                            </label>
                            <label className="flex flex-1 flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground/60">Y</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={yStr}
                                    onChange={e => commitY(e.target.value)}
                                    className={fieldClass}
                                />
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
