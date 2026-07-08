import { useCallback, useRef, useState } from 'react';

import {
    isFlowUpdateMessage,
    isLogEnvelopeMessage,
    isNodeUpdateMessage,
    isPortUpdateMessage,
    isProgressEnvelopeMessage,
    isTraceMessage,
} from '@flows/socket';

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

    if (isProgressEnvelopeMessage(data)) {
        const state = data.data;
        const percent = state?.percent !== undefined ? ` ${state.percent}%` : '';
        return { type: 'progress', targetId: message.id, summary: `${state?.status ?? 'progress'}${percent}` };
    }

    if (isLogEnvelopeMessage(data)) {
        const batch = data.data;
        const count = batch?.entries?.length ?? 0;
        const first = batch?.entries?.[0];
        const head = first ? ` · ${first.level} ${String(first.message ?? '').slice(0, 30)}` : '';
        return { type: 'log', targetId: message.id, summary: `${count} entries${head}` };
    }

    return { type: 'unknown', targetId: message.id, summary: 'unknown' };
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
