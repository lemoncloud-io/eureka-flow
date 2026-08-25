import { parseSocketFrame } from '@flows/engine';

import type {
    LogTraceEntryInfo,
    NodeUpdateInfo,
    PortUpdateInfo,
    ProductProgressInfo,
    ProgressUpdateInfo,
    TraceUpdateInfo,
    WebSocketMessage,
} from '../types';

/** A save made here comes back as a reload notice; reloading on it discards work. */
export const SELF_ECHO_MS = 3000;

export interface FrameSubscribers {
    onFlowUpdate?: (flowId: string) => void;
    onNodeReload?: (info: NodeUpdateInfo) => void;
    onPortUpdate?: (info: PortUpdateInfo) => void;
    onTraceUpdate?: (info: TraceUpdateInfo) => void;
    onProgressUpdate?: (info: ProgressUpdateInfo) => void;
    onLogTrace?: (info: LogTraceEntryInfo) => void;
    onProductProgress?: (info: ProductProgressInfo) => void;
}

export interface DispatchContext extends FrameSubscribers {
    currentFlowId?: string | null;
    /** When the canvas last saved, for the self-echo window. */
    getLastLocalUpdateTimestamp?: () => number | null;
    now?: () => number;
}

/** Matches `{ type: 'product-progress', productId, progress$, state }` — deploy traffic, not graph traffic. */
const isProductProgress = (
    data: unknown
): data is { productId: string; progress$: Record<string, number>; state: string; timestamps?: number[] } => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return (
        msg['type'] === 'product-progress' &&
        typeof msg['productId'] === 'string' &&
        typeof msg['progress$'] === 'object' &&
        msg['progress$'] !== null &&
        typeof msg['state'] === 'string'
    );
};

/**
 * Decide what to do about one message.
 *
 * Split out of the hook so it can be tested without a React tree or a socket: this is the
 * live path between the wire and the canvas, and it is worth being able to drive a frame
 * through it and assert which subscriber heard about it.
 *
 * What a frame *is* — envelopes, the trace merge, port ids, history snapshots — belongs to
 * the engine's parser. What is left here is what to do about it.
 */
export const dispatchSocketFrame = (message: WebSocketMessage, context: DispatchContext): void => {
    const {
        currentFlowId,
        getLastLocalUpdateTimestamp,
        now = () => Date.now(),
        onFlowUpdate,
        onNodeReload,
        onPortUpdate,
        onTraceUpdate,
        onProgressUpdate,
        onLogTrace,
        onProductProgress,
    } = context;
    const data = message.data;

    // Product deploy progress (codes-goods-api → eureka-sockets-api) is not flow-graph
    // traffic, so the engine has no opinion about it and it is recognised only here.
    if (message.action === 'progress' && isProductProgress(data)) {
        const { productId, progress$, state, timestamps } = data;
        onProductProgress?.({ productId, progress$, state, timestamps: timestamps ?? [] });
        return;
    }

    const frame = parseSocketFrame(data);
    if (!frame) return;

    // Messages for another flow are not this canvas's business. They may omit `flowId` —
    // the channel subscription already filters by flow — so only a stated mismatch drops.
    const isOtherFlow = (flowId?: string): boolean => !!flowId && flowId !== currentFlowId;

    switch (frame.kind) {
        case 'trace':
            if (isOtherFlow(frame.trace.flowId)) return;
            onTraceUpdate?.({ ...frame.trace, ts: frame.trace.ts || now() });
            return;

        case 'progress':
            onProgressUpdate?.({
                nodeId: frame.event.nodeId,
                status: frame.event.status,
                percent: frame.event.percent,
                step: frame.event.step,
                totalSteps: frame.event.totalSteps,
                label: frame.label,
                error: frame.error,
                seq: frame.event.seq,
                ts: frame.ts,
                product$: frame.product$,
            });
            return;

        case 'log':
            frame.log.entries.forEach(entry =>
                onLogTrace?.({ nodeId: frame.log.nodeId, source: frame.log.source, ...entry })
            );
            return;

        case 'flow': {
            // A save made here comes back as a reload notice, and reloading on it would
            // throw away whatever was typed since.
            const lastUpdate = getLastLocalUpdateTimestamp?.();
            if (lastUpdate && now() - lastUpdate < SELF_ECHO_MS) return;
            if (currentFlowId && frame.flowId === currentFlowId) onFlowUpdate?.(frame.flowId);
            return;
        }

        case 'node':
            // No self-echo debounce here: run results arrive this way, and dropping them
            // for three seconds after a save loses the start of every run.
            if (isOtherFlow(frame.event.flowId)) return;
            console.log(`[WS] ${frame.event.nodeId}: ${frame.event.state}`, data);
            onNodeReload?.({ ...frame.event, isPort: frame.event.isPort ?? false, timestamp: frame.ts });
            return;

        case 'port':
            if (isOtherFlow(frame.event.flowId)) return;
            console.log(`[WS] ${frame.event.nodeId}:${frame.event.portName} updated`, data);
            onPortUpdate?.({ ...frame.event, portName: frame.event.portName ?? '', direction: frame.direction });
            return;
    }
};
