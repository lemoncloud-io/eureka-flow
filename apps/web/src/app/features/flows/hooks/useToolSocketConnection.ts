import { useCallback, useEffect, useMemo } from 'react';

import { useWebSocketWorker } from '@flows/socket';
import { useWebCoreStore } from '@flows/web-core';

import type { ToolSocketConnection, ToolSocketConnectionSnapshot } from '../utils/createFlowJSONTransportReceiver';
import type { WebSocketMessage } from '@flows/socket';

const TOOL_WS_ENDPOINT = import.meta.env.VITE_TOOL_WS_ENDPOINT || '';

const parseToolSocketMessage = (data: unknown): WebSocketMessage | null => {
    if (typeof data !== 'object' || data === null) return null;

    const packet = data as Record<string, unknown>;
    if (typeof packet['type'] !== 'string' || !packet['type'].startsWith('json:')) return null;
    if (typeof packet['tid'] !== 'string') return null;
    return { id: packet['tid'], data: packet };
};

/** Mutable socket port kept stable while React updates the underlying worker state. */
export class ToolSocketConnectionAdapter implements ToolSocketConnection {
    private snapshot: ToolSocketConnectionSnapshot = { isConnected: false, connectionId: null };
    private readonly subscribers = new Set<(message: WebSocketMessage) => void>();

    public getSnapshot(): ToolSocketConnectionSnapshot {
        return this.snapshot;
    }

    public update(snapshot: ToolSocketConnectionSnapshot): void {
        this.snapshot = snapshot;
    }

    public publish(message: WebSocketMessage): void {
        this.subscribers.forEach(subscriber => subscriber(message));
    }

    public subscribe(subscriber: (message: WebSocketMessage) => void): () => void {
        this.subscribers.add(subscriber);
        return (): void => {
            this.subscribers.delete(subscriber);
        };
    }

    public close(): void {
        this.snapshot = { isConnected: false, connectionId: null };
        this.subscribers.clear();
    }
}

/** Connects only LLM/tool JSONTransport traffic to the configured Chatic socket API. */
export const useToolSocketConnection = (enabled = true): ToolSocketConnection => {
    const apiKey = useWebCoreStore(state => state.apiKey);
    const connection = useMemo(() => new ToolSocketConnectionAdapter(), []);
    const tokenProvider = useCallback(async (): Promise<string | null> => apiKey || null, [apiKey]);
    const { id, isConnected, lastMessage } = useWebSocketWorker<WebSocketMessage>({
        endpoint: TOOL_WS_ENDPOINT,
        tokenProvider,
        messageParser: parseToolSocketMessage,
        enabled: enabled && !!apiKey && !!TOOL_WS_ENDPOINT,
        logPrefix: '[ToolSocket]',
    });

    useEffect(() => {
        connection.update({ isConnected, connectionId: isConnected ? id : null });
    }, [connection, id, isConnected]);

    useEffect(() => {
        if (lastMessage) connection.publish(lastMessage);
    }, [connection, lastMessage]);

    useEffect(() => (): void => connection.close(), [connection]);

    return connection;
};
