import { useCallback, useRef, useState } from 'react';

import { isFlowUpdateMessage, isNodeUpdateMessage, isPortUpdateMessage, isTraceMessage } from '@flows/socket';

import type { WebSocketMessage } from '@flows/socket';

export interface RecordedMessage {
    seq: number;
    timestamp: number;
    type: 'node' | 'port' | 'flow' | 'trace' | 'unknown';
    targetId: string;
    summary: string;
    raw: WebSocketMessage;
    replayed?: boolean;
}

const MAX_MESSAGES = 500;

const summarize = (message: WebSocketMessage): Pick<RecordedMessage, 'type' | 'targetId' | 'summary'> => {
    const data = message.data;

    if (message.action === 'trace' && isTraceMessage(data)) {
        const stage = data.stage ? `[${data.stage}]` : '';
        const msg = data.message ? ` ${String(data.message).slice(0, 40)}` : '';
        return { type: 'trace', targetId: message.id, summary: `${stage}${msg}`.trim() || 'trace' };
    }

    if (isFlowUpdateMessage(data)) {
        return { type: 'flow', targetId: data.id, summary: 'flow updated' };
    }

    if (isNodeUpdateMessage(data)) {
        const state = data.state ?? '';
        const progress = data.progress !== undefined ? ` ${data.progress}%` : '';
        const stage = data.stage ? ` ${data.stage}` : '';
        return { type: 'node', targetId: data.id, summary: `${state}${stage}${progress}`.trim() || 'node' };
    }

    if (isPortUpdateMessage(data)) {
        const ts = data.ts ? ` ts=${data.ts}` : '';
        return { type: 'port', targetId: data.id, summary: `port${ts}`.trim() };
    }

    return { type: 'unknown', targetId: message.id, summary: 'unknown' };
};

export interface ReplayState {
    isReplaying: boolean;
    currentSeq: number | null;
    totalCount: number;
}

export const useSocketRecorder = () => {
    const [messages, setMessages] = useState<RecordedMessage[]>([]);
    const [isRecording, setIsRecording] = useState(true);
    const [replayState, setReplayState] = useState<ReplayState>({
        isReplaying: false,
        currentSeq: null,
        totalCount: 0,
    });
    const seqRef = useRef(0);
    const replayTimersRef = useRef<number[]>([]);

    const record = useCallback(
        (message: WebSocketMessage) => {
            if (!isRecording) return;
            const { type, targetId, summary } = summarize(message);
            const entry: RecordedMessage = {
                seq: ++seqRef.current,
                timestamp: Date.now(),
                type,
                targetId,
                summary,
                raw: message,
            };
            setMessages(prev => {
                const next = [...prev, entry];
                return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
            });
        },
        [isRecording]
    );

    const clear = useCallback(() => {
        setMessages([]);
        seqRef.current = 0;
    }, []);

    const toggleRecording = useCallback(() => setIsRecording(prev => !prev), []);

    const markReplayed = useCallback((seq: number) => {
        setMessages(prev => prev.map(m => (m.seq === seq ? { ...m, replayed: true } : m)));
        setTimeout(() => {
            setMessages(prev => prev.map(m => (m.seq === seq ? { ...m, replayed: false } : m)));
        }, 600);
    }, []);

    const stopReplaySequence = useCallback(() => {
        replayTimersRef.current.forEach(id => window.clearTimeout(id));
        replayTimersRef.current = [];
        setReplayState({ isReplaying: false, currentSeq: null, totalCount: 0 });
        setMessages(prev => prev.map(m => ({ ...m, replayed: false })));
    }, []);

    const startReplayFromIndex = useCallback(
        (fromIndex: number, replayFn: (msg: WebSocketMessage) => void) => {
            stopReplaySequence();

            const remaining = messages.slice(fromIndex);
            if (remaining.length === 0) return;

            const baseTs = remaining[0].timestamp;
            setReplayState({ isReplaying: true, currentSeq: null, totalCount: remaining.length });

            remaining.forEach((msg, i) => {
                const delay = msg.timestamp - baseTs;
                const timerId = window.setTimeout(() => {
                    replayFn(msg.raw);
                    setReplayState(prev => ({ ...prev, currentSeq: msg.seq }));
                    setMessages(prev => prev.map(m => (m.seq === msg.seq ? { ...m, replayed: true } : m)));

                    // Clear highlight after 400ms (unless next message arrives sooner)
                    const clearId = window.setTimeout(() => {
                        setMessages(prev => prev.map(m => (m.seq === msg.seq ? { ...m, replayed: false } : m)));
                    }, 400);
                    replayTimersRef.current.push(clearId);

                    // Last message: end replay
                    if (i === remaining.length - 1) {
                        const endId = window.setTimeout(() => {
                            setReplayState({ isReplaying: false, currentSeq: null, totalCount: 0 });
                        }, 500);
                        replayTimersRef.current.push(endId);
                    }
                }, delay);
                replayTimersRef.current.push(timerId);
            });
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
