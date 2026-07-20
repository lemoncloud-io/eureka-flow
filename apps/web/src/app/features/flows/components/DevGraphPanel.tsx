import React, { useCallback, useMemo, useRef, useState } from 'react';

import { Braces, Copy, Download, Upload, X } from 'lucide-react';

import {
    diffAgainstBaseline,
    parseFlowJson,
    serializeFlowJson,
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

const ICON_BTN =
    'p-1 text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-muted/30 transition-colors';

/**
 * Dev-only window onto the internal JSON graph: shows the live `{nodes, edges}` the canvas
 * holds (client ids, config, dirty/baseline state) and round-trips it through export/import
 * so the local-graph model (S1–S9) can be inspected and replayed by hand.
 */
export const DevGraphPanel = ({ onImport }: DevGraphPanelProps) => {
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const currentFlowId = useFlowsStore(s => s.currentFlowId);
    // Subscribe to the baseline object, not just its presence: it changes identity on every
    // save, and the dirty flag below has to recompute when it does.
    const baseline = useFlowsStore(s => s.baseline);

    const graph = useMemo<FlowJson>(() => ({ nodes, edges: connections }), [nodes, connections]);
    const isDirty = !diffAgainstBaseline({ nodes, connections }).isEmpty;

    const [isExpanded, setIsExpanded] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [importError, setImportError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [pos, setPos] = useState({ x: 16, y: 80 });
    const dragRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if ((e.target as HTMLElement).closest('button, textarea, input, [data-json]')) return;
            e.preventDefault();
            dragState.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
            dragRef.current?.setPointerCapture(e.pointerId);
        },
        [pos]
    );

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current) return;
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        setPos({ x: Math.max(0, dragState.current.originX + dx), y: Math.max(0, dragState.current.originY + dy) });
    }, []);

    const handlePointerUp = useCallback(() => {
        dragState.current = null;
    }, []);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(serializeFlowJson(graph));
    }, [graph]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([serializeFlowJson(graph)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `graph-${currentFlowId || 'new'}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }, [graph, currentFlowId]);

    const runImport = useCallback(
        async (text: string) => {
            const result = parseFlowJson(text);
            if (!result.ok) {
                setImportError(result.error);
                return;
            }
            setImportError(null);
            await onImport(result.graph);
            setImportText('');
            setImportOpen(false);
        },
        [onImport]
    );

    const handleFile = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) await runImport(await file.text());
        },
        [runImport]
    );

    if (!isExpanded) {
        return (
            <div
                ref={dragRef}
                className="fixed z-50 touch-none"
                style={{ left: pos.x, top: pos.y }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={() => setIsExpanded(true)}
            >
                <div className="flex items-center gap-1.5 bg-glass-bg backdrop-blur-2xl border border-border/40 shadow-floating rounded-xl px-2.5 py-1.5 text-xs font-mono cursor-grab active:cursor-grabbing select-none">
                    <Braces className="w-3 h-3 text-purple-400" />
                    <span className="text-muted-foreground">GRAPH</span>
                    <span className="text-muted-foreground/60">
                        {nodes.length}/{connections.length}
                    </span>
                    {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="unsaved" />}
                </div>
            </div>
        );
    }

    return (
        <div
            ref={dragRef}
            className="fixed z-50 touch-none"
            style={{ left: pos.x, top: pos.y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <div className="bg-glass-bg backdrop-blur-2xl border border-border/40 shadow-floating rounded-xl overflow-hidden w-[420px]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 cursor-grab active:cursor-grabbing">
                    <div className="flex items-center gap-2">
                        <Braces className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs font-mono font-semibold text-muted-foreground select-none">GRAPH</span>
                        {isDirty && <span className="text-[10px] font-mono text-amber-400">dirty</span>}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={handleCopy} title="Copy JSON" className={ICON_BTN}>
                            <Copy className="w-3 h-3" />
                        </button>
                        <button onClick={handleDownload} title="Download JSON" className={ICON_BTN}>
                            <Download className="w-3 h-3" />
                        </button>
                        <button
                            onClick={() => setImportOpen(o => !o)}
                            title="Import JSON"
                            className={importOpen ? ICON_BTN.replace('/50', '') : ICON_BTN}
                        >
                            <Upload className="w-3 h-3" />
                        </button>
                        <button onClick={() => setIsExpanded(false)} className={ICON_BTN}>
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

                {importOpen && (
                    <div className="px-3 py-2 border-b border-border/20 space-y-1.5">
                        <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder='Paste {"nodes":[...],"edges":[...]}'
                            rows={4}
                            className="w-full text-[10px] font-mono bg-black/20 border border-border/30 rounded p-1.5 resize-y outline-none"
                        />
                        {importError && <div className="text-[10px] font-mono text-red-400">{importError}</div>}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => void runImport(importText)}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-mono bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                            >
                                Load
                            </button>
                            <button
                                onClick={() => fileRef.current?.click()}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-mono bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors"
                            >
                                File…
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="application/json,.json"
                                onChange={handleFile}
                                className="hidden"
                            />
                        </div>
                    </div>
                )}

                <div data-json className="px-3 py-2">
                    <JsonViewer
                        data={graph as unknown as object}
                        maxHeight={280}
                        collapsed={2}
                        className="text-[10px]"
                    />
                </div>
            </div>
        </div>
    );
};
