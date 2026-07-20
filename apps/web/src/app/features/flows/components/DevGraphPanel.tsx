import React, { useCallback, useMemo, useRef, useState } from 'react';

import { Braces, Download, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import {
    diffAgainstBaseline,
    parseFlowJson,
    serializeFlowJson,
    useBlockRegistry,
    useCanvasConnections,
    useCanvasNodes,
    useFlowsStore,
} from '@flows/flows';
import { JsonViewer } from '@flows/ui-kit';

import type { FlowJson } from '@flows/flows';

interface DevGraphPanelProps {
    /** Load an imported graph onto the canvas — the parent owns the canvas ref. */
    onImport: (graph: FlowJson) => Promise<void>;
}

const ACTION_BTN =
    'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors';

/**
 * Dev-only window onto the internal JSON graph: shows the live `{nodes, edges}` the canvas
 * holds (client ids, config, dirty/baseline state) and round-trips it through JSON files —
 * export downloads the graph, import loads one back — so the local-graph model (S1–S9) can
 * be inspected and replayed by hand.
 */
export const DevGraphPanel = ({ onImport }: DevGraphPanelProps) => {
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const currentFlowId = useFlowsStore(s => s.currentFlowId);
    // The baseline object, not just its presence: it changes identity on every save, and the
    // dirty flag below is recomputed from it.
    const baseline = useFlowsStore(s => s.baseline);
    const blockRegistry = useBlockRegistry();

    const graph = useMemo<FlowJson>(() => ({ nodes, edges: connections }), [nodes, connections]);
    // Memoized because `diffAgainstBaseline` is explicitly not a render-body call: it snapshots
    // the whole graph and canonicalizes every node's config, which a node drag would re-enter
    // once per frame — megabytes of stringify per frame for a flow holding an image in config.
    // `baseline` and `blockRegistry` look unnecessary to the linter because
    // `diffAgainstBaseline` reads them off the store via `getState` rather than taking them as
    // arguments. They are real inputs: without them the flag goes stale after a save.
    const isDirty = useMemo(
        () => !diffAgainstBaseline({ nodes, connections }).isEmpty,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [nodes, connections, baseline, blockRegistry]
    );

    const [isExpanded, setIsExpanded] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const [pos, setPos] = useState({ x: 16, y: 80 });
    const dragRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
    // Suppresses the click that fires after a drag, so dragging the collapsed pill does not
    // also expand it — same guard the sibling dev panels carry.
    const didDrag = useRef(false);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if ((e.target as HTMLElement).closest('button, input, [data-json]')) return;
            e.preventDefault();
            dragState.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
            didDrag.current = false;
            dragRef.current?.setPointerCapture(e.pointerId);
        },
        [pos]
    );

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current) return;
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
        setPos({ x: Math.max(0, dragState.current.originX + dx), y: Math.max(0, dragState.current.originY + dy) });
    }, []);

    const handlePointerUp = useCallback(() => {
        dragState.current = null;
        requestAnimationFrame(() => {
            didDrag.current = false;
        });
    }, []);

    const handleExport = useCallback(() => {
        const fileName = `graph-${currentFlowId || 'new'}.json`;
        const blob = new Blob([serializeFlowJson(graph)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${fileName}`);
    }, [graph, currentFlowId]);

    const handleFile = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;

            const result = parseFlowJson(await file.text());
            if (!result.ok) {
                toast.error(`Import failed: ${result.error}`);
                return;
            }
            await onImport(result.graph);
            toast.success(`Imported ${result.graph.nodes.length} nodes from ${file.name}`);
        },
        [onImport]
    );

    // One draggable wrapper for both states: the drag wiring lives in a single place, so a
    // change to it cannot leave the panel draggable in one state and stuck in the other.
    return (
        <div
            ref={dragRef}
            className="fixed z-50 touch-none"
            style={{ left: pos.x, top: pos.y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={
                isExpanded
                    ? undefined
                    : () => {
                          if (!didDrag.current) setIsExpanded(true);
                      }
            }
        >
            {!isExpanded ? (
                <div className="flex items-center gap-1.5 bg-glass-bg backdrop-blur-2xl border border-border/40 shadow-floating rounded-xl px-2.5 py-1.5 text-xs font-mono cursor-grab active:cursor-grabbing select-none">
                    <Braces className="w-3 h-3 text-purple-400" />
                    <span className="text-muted-foreground">GRAPH</span>
                    <span className="text-muted-foreground/60">
                        {nodes.length}/{connections.length}
                    </span>
                    {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="unsaved" />}
                </div>
            ) : (
                <div className="bg-glass-bg backdrop-blur-2xl border border-border/40 shadow-floating rounded-xl overflow-hidden w-[420px]">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 cursor-grab active:cursor-grabbing">
                        <div className="flex items-center gap-2">
                            <Braces className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-xs font-mono font-semibold text-muted-foreground select-none">
                                GRAPH
                            </span>
                            {isDirty && <span className="text-[10px] font-mono text-amber-400">dirty</span>}
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={handleExport} title="Download graph as JSON file" className={ACTION_BTN}>
                                <Download className="w-3 h-3" />
                                Export
                            </button>
                            <button
                                onClick={() => fileRef.current?.click()}
                                title="Load a graph from a JSON file"
                                className={ACTION_BTN}
                            >
                                <Upload className="w-3 h-3" />
                                Import
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="application/json,.json"
                                onChange={handleFile}
                                className="hidden"
                            />
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-1 text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-muted/30 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 border-b border-border/20 flex items-center gap-3 text-[10px] font-mono text-muted-foreground/70">
                        <span>flow: {currentFlowId ?? 'new'}</span>
                        <span>nodes: {nodes.length}</span>
                        <span>edges: {connections.length}</span>
                        <span>baseline: {baseline ? 'yes' : 'no'}</span>
                    </div>

                    <div data-json className="px-3 py-2">
                        <JsonViewer
                            data={graph as unknown as object}
                            maxHeight={280}
                            collapsed={2}
                            className="text-[10px]"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
