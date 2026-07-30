import { useCallback, useRef, useState } from 'react';

import { parseSocketFrame } from '@flows/engine';

import type { WebSocketMessage } from '@flows/socket';

export interface RecordedMessage {
    seq: number;
    timestamp: number;
    type: 'node' | 'port' | 'flow' | 'trace' | 'progress' | 'log' | 'unknown';
    targetId: string;
    summary: string;
    raw: WebSocketMessage;
    replayed?: boolean;
}

const MAX_MESSAGES = 500;

/**
 * Describe a frame for the recorder panel.
 *
 * Reads the same parse the live path does, so what is recorded and what was acted on can
 * never disagree — a replay tool that classified messages its own way would be lying about
 * the run it claims to be replaying.
 */
const summarize = (message: WebSocketMessage): Pick<RecordedMessage, 'type' | 'targetId' | 'summary'> => {
    const frame = parseSocketFrame(message.data);
    const unknown = { type: 'unknown', targetId: message.id, summary: 'unknown' } as const;
    if (!frame) return unknown;

    switch (frame.kind) {
        case 'trace': {
            const stage = frame.trace.stage ? `[${frame.trace.stage}]` : '';
            const msg = frame.trace.message ? ` ${frame.trace.message.slice(0, 40)}` : '';
            return { type: 'trace', targetId: frame.trace.nodeId, summary: `${stage}${msg}`.trim() || 'trace' };
        }

        case 'flow':
            return { type: 'flow', targetId: frame.flowId, summary: 'flow updated' };

        case 'node': {
            const { nodeId, state = '', stage, progress } = frame.event;
            const suffix = `${stage ? ` ${stage}` : ''}${progress === undefined ? '' : ` ${progress}%`}`;
            return { type: 'node', targetId: nodeId, summary: `${state}${suffix}`.trim() || 'node' };
        }

        case 'port':
            return {
                type: 'port',
                targetId: frame.event.portId,
                summary: `port${frame.event.ts ? ` ts=${frame.event.ts}` : ''}`,
            };

        case 'progress': {
            const percent = frame.event.percent === undefined ? '' : ` ${frame.event.percent}%`;
            return {
                type: 'progress',
                targetId: frame.event.nodeId,
                summary: `${frame.event.status ?? 'progress'}${percent}`,
            };
        }

        case 'log': {
            const [first] = frame.log.entries;
            const head = first ? ` · ${first.level} ${(first.message ?? '').slice(0, 30)}` : '';
            return { type: 'log', targetId: frame.log.nodeId, summary: `${frame.log.entries.length} entries${head}` };
        }

        default:
            return unknown;
    }
};

export interface ReplayState {
    isReplaying: boolean;
    currentSeq: number | null;
    totalCount: number;
}

const HIGHLIGHT_MS = 400;

export const useSocketRecorder = () => {
    const [messages, setMessages] = useState<RecordedMessage[]>([]);
    const [isRecording, setIsRecording] = useState(true);
    const [replayState, setReplayState] = useState<ReplayState>({
        isReplaying: false,
        currentSeq: null,
        totalCount: 0,
    });
    const seqRef = useRef(0);
    const isRecordingRef = useRef(true);
    const replayTimerRef = useRef<number | null>(null);
    const highlightTimerRef = useRef<number | null>(null);

    const record = useCallback((message: WebSocketMessage) => {
        if (!isRecordingRef.current) return;
        const { type, targetId, summary } = summarize(message);
        const entry: RecordedMessage = {
            seq: ++seqRef.current,
            timestamp: Date.now(),
            type,
            targetId,
            summary,
            raw: message,
        };
        setMessages(prev => (prev.length >= MAX_MESSAGES ? [...prev.slice(1), entry] : [...prev, entry]));
    }, []);

    const clear = useCallback(() => {
        setMessages([]);
        seqRef.current = 0;
    }, []);

    const toggleRecording = useCallback(() => {
        setIsRecording(prev => {
            isRecordingRef.current = !prev;
            return !prev;
        });
    }, []);

    const markReplayed = useCallback((seq: number) => {
        setMessages(prev => prev.map(m => (m.seq === seq ? { ...m, replayed: true } : m)));
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = window.setTimeout(() => {
            setMessages(prev => prev.map(m => (m.seq === seq ? { ...m, replayed: false } : m)));
        }, 600);
    }, []);

    const stopReplaySequence = useCallback(() => {
        if (replayTimerRef.current) window.clearTimeout(replayTimerRef.current);
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
        replayTimerRef.current = null;
        highlightTimerRef.current = null;
        setReplayState({ isReplaying: false, currentSeq: null, totalCount: 0 });
        setMessages(prev => prev.map(m => (m.replayed ? { ...m, replayed: false } : m)));
    }, []);

    const startReplayFromIndex = useCallback(
        (fromIndex: number, replayFn: (msg: WebSocketMessage) => void) => {
            stopReplaySequence();

            // Snapshot messages at call time
            const remaining = messages.slice(fromIndex);
            if (remaining.length === 0) return;

            setReplayState({ isReplaying: true, currentSeq: null, totalCount: remaining.length });

            // Sequential scheduler: one timer at a time
            const scheduleNext = (index: number) => {
                if (index >= remaining.length) {
                    replayTimerRef.current = window.setTimeout(() => {
                        setReplayState({ isReplaying: false, currentSeq: null, totalCount: 0 });
                    }, HIGHLIGHT_MS);
                    return;
                }

                const msg = remaining[index];
                const delay = index === 0 ? 0 : msg.timestamp - remaining[index - 1].timestamp;

                replayTimerRef.current = window.setTimeout(() => {
                    replayFn(msg.raw);
                    setReplayState(prev => ({ ...prev, currentSeq: msg.seq }));
                    setMessages(prev =>
                        prev.map(m => {
                            if (m.seq === msg.seq) return { ...m, replayed: true };
                            if (m.replayed) return { ...m, replayed: false };
                            return m;
                        })
                    );
                    scheduleNext(index + 1);
                }, delay);
            };

            scheduleNext(0);
        },
        [messages, stopReplaySequence]
    );

    return {
        messages,
        isRecording,
        replayState,
        record,
        clear,
        toggleRecording,
        markReplayed,
        startReplayFromIndex,
        stopReplaySequence,
    };
};
