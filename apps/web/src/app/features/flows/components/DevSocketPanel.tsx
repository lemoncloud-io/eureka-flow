import React, { useCallback, useRef, useState } from 'react';

import { ChevronRight, Copy, Play, Radio, RotateCcw, Square, Trash2, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { JsonViewer } from '@flows/ui-kit';

import type { RecordedMessage, ReplayState } from '../hooks/useSocketRecorder';
import type { WebSocketMessage } from '@flows/socket';

interface DevSocketPanelProps {
    messages: RecordedMessage[];
    isRecording: boolean;
    replayState: ReplayState;
    onToggleRecording: () => void;
    onClear: () => void;
    onReplay: (message: WebSocketMessage) => void;
    onReplayFromIndex: (fromIndex: number) => void;
    onStopReplay: () => void;
    onResetNodes: () => void;
    onMarkReplayed: (seq: number) => void;
    compact?: boolean;
}

const TYPE_COLORS: Record<RecordedMessage['type'], string> = {
    node: 'text-blue-400',
    port: 'text-amber-400',
    flow: 'text-green-400',
    trace: 'text-purple-400',
    unknown: 'text-muted-foreground',
};

const TYPE_DOT_COLORS = Object.fromEntries(
    Object.entries(TYPE_COLORS).map(([type, color]) => [type, color.replace('text-', 'bg-')])
) as Record<RecordedMessage['type'], string>;

const formatRelativeTime = (ts: number, baseTs: number): string => {
    const delta = ts - baseTs;
    if (delta < 1000) return `+${delta}ms`;
    if (delta < 60000) return `+${(delta / 1000).toFixed(1)}s`;
    return `+${(delta / 60000).toFixed(1)}m`;
};

export const DevSocketPanel: React.FC<DevSocketPanelProps> = ({
    messages,
    isRecording,
    replayState,
    onToggleRecording,
    onClear,
    onReplay,
    onReplayFromIndex,
    onStopReplay,
    onResetNodes,
    onMarkReplayed,
    compact = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
    const [pos, setPos] = useState({ x: 16, y: 80 });
    const dragRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
    const didDrag = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (compact) return;
            if ((e.target as HTMLElement).closest('button')) return;
            if ((e.target as HTMLElement).closest('[data-message-list]')) return;
            e.preventDefault();
            dragState.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
            didDrag.current = false;
            dragRef.current?.setPointerCapture(e.pointerId);
        },
        [pos, compact]
    );

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current) return;
        const dx = dragState.current.startX - e.clientX;
        const dy = dragState.current.startY - e.clientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
        setPos({
            x: Math.max(0, dragState.current.originX + dx),
            y: Math.max(0, dragState.current.originY + dy),
        });
    }, []);

    const handlePointerUp = useCallback(() => {
        dragState.current = null;
        requestAnimationFrame(() => {
            didDrag.current = false;
        });
    }, []);

    const handleDoubleClick = useCallback(
        (msg: RecordedMessage) => {
            onReplay(msg.raw);
            onMarkReplayed(msg.seq);
        },
        [onReplay, onMarkReplayed]
    );

    const handleCopy = useCallback((msg: RecordedMessage) => {
        void navigator.clipboard.writeText(JSON.stringify(msg.raw, null, 2));
    }, []);

    const handleReplayFrom = useCallback(
        (index: number, e: React.MouseEvent) => {
            e.stopPropagation();
            onReplayFromIndex(index);
        },
        [onReplayFromIndex]
    );

    // --- Compact (mobile) collapsed: minimal pill ---
    if (compact && !isExpanded) {
        return (
            <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-40 mb-[env(safe-area-inset-bottom)]">
                <button
                    onClick={() => setIsExpanded(true)}
                    className="flex items-center gap-1.5 bg-glass-bg backdrop-blur-[24px] border border-glass-border shadow-floating rounded-full px-3 py-1.5 text-xs font-mono"
                >
                    {replayState.isReplaying ? (
                        <Play className="w-3 h-3 text-green-400 animate-pulse" />
                    ) : (
                        <Radio
                            className={`w-3 h-3 ${isRecording ? 'text-red-500 animate-pulse' : 'text-muted-foreground/50'}`}
                        />
                    )}
                    <span className="text-muted-foreground">WS</span>
                    {messages.length > 0 && <span className="text-muted-foreground/60">{messages.length}</span>}
                </button>
            </div>
        );
    }

    // --- Compact (mobile) expanded: bottom sheet ---
    if (compact) {
        return (
            <div className="fixed inset-x-0 bottom-[72px] z-40 px-2 mb-[env(safe-area-inset-bottom)]">
                <div className="bg-glass-bg backdrop-blur-[24px] border border-glass-border shadow-floating rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold text-muted-foreground select-none">
                                WS
                            </span>
                            <span className="text-[10px] text-muted-foreground/50 font-mono">{messages.length}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {replayState.isReplaying ? (
                                <button
                                    onClick={onStopReplay}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                                >
                                    <Square className="w-2.5 h-2.5" />
                                    STOP
                                </button>
                            ) : (
                                <button
                                    onClick={onToggleRecording}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
                                        isRecording ? 'bg-red-500/15 text-red-400' : 'bg-muted/30 text-muted-foreground'
                                    }`}
                                >
                                    <div
                                        className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/50'}`}
                                    />
                                    {isRecording ? 'REC' : 'OFF'}
                                </button>
                            )}
                            <button
                                onClick={onResetNodes}
                                className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground rounded-lg transition-colors"
                                title="Reset nodes"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={onClear}
                                className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground rounded-lg transition-colors"
                                title="Clear"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground rounded-lg transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Compact Message List */}
                    <div ref={listRef} data-message-list className="max-h-[200px] overflow-y-auto overflow-x-hidden">
                        {messages.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-muted-foreground/40 font-mono select-none">
                                {isRecording ? 'Waiting for messages...' : 'Recording paused'}
                            </div>
                        ) : (
                            messages.map((msg, i) => {
                                const isCurrentReplay = replayState.currentSeq === msg.seq;
                                const isDetailOpen = expandedSeq === msg.seq;
                                return (
                                    <div key={msg.seq} className="border-b border-border/10">
                                        <div
                                            onClick={() => {
                                                setExpandedSeq(isDetailOpen ? null : msg.seq);
                                            }}
                                            className={cn(
                                                'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono active:bg-accent/30 transition-colors',
                                                isCurrentReplay
                                                    ? 'bg-green-500/15'
                                                    : msg.replayed
                                                      ? 'bg-primary/10'
                                                      : ''
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                                    TYPE_DOT_COLORS[msg.type]
                                                )}
                                            />
                                            <span className="text-muted-foreground/40 shrink-0">
                                                {i === 0
                                                    ? '+0'
                                                    : formatRelativeTime(msg.timestamp, messages[0].timestamp)}
                                            </span>
                                            <span className="text-foreground/70 truncate flex-1">{msg.targetId}</span>
                                            <span className="text-muted-foreground/50 truncate max-w-[100px]">
                                                {msg.summary}
                                            </span>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        handleDoubleClick(msg);
                                                    }}
                                                    className="p-0.5 text-green-400/60 active:text-green-400 transition-colors"
                                                    title="Replay"
                                                >
                                                    <Play className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        handleCopy(msg);
                                                    }}
                                                    className="p-0.5 text-muted-foreground/40 active:text-muted-foreground transition-colors"
                                                    title="Copy"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        {isDetailOpen && (
                                            <div className="px-2.5 py-1.5 bg-black/20 border-t border-border/10">
                                                <JsonViewer
                                                    data={msg.raw.data as object}
                                                    maxHeight={150}
                                                    collapsed={2}
                                                    className="text-[10px]"
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- Desktop: draggable floating panel ---
    if (!isExpanded) {
        return (
            <div
                ref={dragRef}
                className="fixed z-50 touch-none"
                style={{ right: pos.x, bottom: pos.y }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={() => {
                    if (!didDrag.current) setIsExpanded(true);
                }}
            >
                <div className="flex items-center gap-1.5 bg-glass-bg backdrop-blur-[24px] border border-glass-border shadow-floating rounded-xl px-2.5 py-1.5 text-xs font-mono cursor-grab active:cursor-grabbing select-none">
                    {replayState.isReplaying ? (
                        <Play className="w-3 h-3 text-green-400 animate-pulse" />
                    ) : (
                        <Radio
                            className={`w-3 h-3 ${isRecording ? 'text-red-500 animate-pulse' : 'text-muted-foreground/50'}`}
                        />
                    )}
                    <span className="text-muted-foreground">WS</span>
                    {messages.length > 0 && <span className="text-muted-foreground/60">{messages.length}</span>}
                </div>
            </div>
        );
    }

    return (
        <div
            ref={dragRef}
            className="fixed z-50 touch-none"
            style={{ right: pos.x, bottom: pos.y }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <div className="bg-glass-bg backdrop-blur-[24px] border border-glass-border shadow-floating rounded-xl overflow-hidden w-[420px] cursor-grab active:cursor-grabbing">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-muted-foreground select-none">
                            WS Replay
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 font-mono">{messages.length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {replayState.isReplaying ? (
                            <button
                                onClick={onStopReplay}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                                title="Stop replay"
                            >
                                <Square className="w-2.5 h-2.5" />
                                STOP
                            </button>
                        ) : (
                            <button
                                onClick={onToggleRecording}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
                                    isRecording
                                        ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                                }`}
                            >
                                <div
                                    className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/50'}`}
                                />
                                {isRecording ? 'REC' : 'OFF'}
                            </button>
                        )}
                        <button
                            onClick={onResetNodes}
                            className="p-1 text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-muted/30 transition-colors"
                            title="Reset all nodes to IDLE"
                        >
                            <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                            onClick={onClear}
                            className="p-1 text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-muted/30 transition-colors"
                            title="Clear messages"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="p-1 text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-muted/30 transition-colors"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Message List */}
                <div ref={listRef} data-message-list className="max-h-[320px] overflow-y-auto overflow-x-hidden">
                    {messages.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground/40 font-mono select-none">
                            {isRecording ? 'Waiting for messages...' : 'Recording paused'}
                        </div>
                    ) : (
                        messages.map((msg, i) => {
                            const isCurrentReplay = replayState.currentSeq === msg.seq;
                            const isDetailOpen = expandedSeq === msg.seq;
                            return (
                                <div key={msg.seq} className="border-b border-border/10">
                                    <div
                                        onDoubleClick={() => handleDoubleClick(msg)}
                                        className={`group flex items-center gap-2 px-3 py-1 text-[11px] font-mono hover:bg-accent/30 cursor-pointer transition-colors ${
                                            isCurrentReplay ? 'bg-green-500/15' : msg.replayed ? 'bg-primary/10' : ''
                                        }`}
                                        title="Double-click to replay"
                                    >
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setExpandedSeq(isDetailOpen ? null : msg.seq);
                                            }}
                                            className="p-0 border-0 bg-transparent cursor-pointer"
                                        >
                                            <ChevronRight
                                                className={`w-3 h-3 shrink-0 text-muted-foreground/30 transition-transform ${isDetailOpen ? 'rotate-90' : ''}`}
                                            />
                                        </button>
                                        <span className="text-muted-foreground/40 w-[48px] shrink-0 text-right">
                                            {i === 0
                                                ? '+0ms'
                                                : formatRelativeTime(msg.timestamp, messages[0].timestamp)}
                                        </span>
                                        <span className={`w-[36px] shrink-0 ${TYPE_COLORS[msg.type]}`}>{msg.type}</span>
                                        <span className="text-foreground/70 w-[90px] shrink-0 truncate">
                                            {msg.targetId}
                                        </span>
                                        <span className="text-muted-foreground/60 truncate flex-1">{msg.summary}</span>
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={e => handleReplayFrom(i, e)}
                                                className="p-0.5 text-green-400/60 hover:text-green-400 transition-colors"
                                                title="Replay from here"
                                            >
                                                <Play className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    handleCopy(msg);
                                                }}
                                                className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                                                title="Copy JSON"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                    {isDetailOpen && (
                                        <div className="px-3 py-1.5 bg-black/20 border-t border-border/10">
                                            <JsonViewer
                                                data={msg.raw.data as object}
                                                maxHeight={200}
                                                collapsed={2}
                                                className="text-[10px]"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
