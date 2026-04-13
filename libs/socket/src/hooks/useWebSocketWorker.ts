import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type {
    BaseWebSocketMessage,
    ConnectionStatus,
    UseWebSocketWorkerConfig,
    UseWebSocketWorkerReturn,
} from '../types';

export const useWebSocketWorker = <TMessage extends BaseWebSocketMessage = BaseWebSocketMessage>(
    config: UseWebSocketWorkerConfig<TMessage>
): UseWebSocketWorkerReturn<TMessage> => {
    const {
        endpoint,
        tokenProvider,
        messageParser,
        enabled = true,
        authQueryParam = 'x-api-key',
        logPrefix = '[WebSocketWorker]',
        sessionId,
        channels,
    } = config;

    const workerRef = useRef<Worker | null>(null);
    const configRef = useRef({ endpoint, authQueryParam, sessionId, channels });
    const [id, setId] = useState<string | null>(null);
    const [connectionId, setConnectionId] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [lastMessage, setLastMessage] = useState<TMessage | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
    const [maxReconnectReached, setMaxReconnectReached] = useState<boolean>(false);

    // Update config ref when props change
    useEffect(() => {
        configRef.current = { endpoint, authQueryParam, sessionId, channels };
    }, [endpoint, authQueryParam, sessionId, channels]);

    const initWorker = useCallback(() => {
        if (workerRef.current) return;

        workerRef.current = new Worker('/websocket.worker.js');

        workerRef.current.onmessage = (e: MessageEvent) => {
            const { type, status, id: msgId, connectionId: connId, data, message, error, count, maxReached } = e.data;

            switch (type) {
                case 'status':
                    setConnectionStatus(status);
                    setIsConnected(status === 'connected');
                    break;

                case 'connectionId':
                    setId(msgId);
                    setConnectionId(connId);
                    console.log(`${logPrefix} ID:`, msgId);
                    console.log(`${logPrefix} Connection ID:`, connId);
                    break;

                case 'message':
                    if (messageParser) {
                        const parsed = messageParser(data);
                        if (parsed) {
                            // flushSync forces synchronous render + effects before returning,
                            // preventing React 18 batching from dropping rapid messages
                            flushSync(() => setLastMessage(parsed));
                        }
                    } else {
                        flushSync(() => setLastMessage(data as TMessage));
                    }
                    break;

                case 'reconnectAttempts':
                    setReconnectAttempts(count);
                    setMaxReconnectReached(maxReached);
                    break;

                case 'log':
                    console.log(`${logPrefix}`, message);
                    break;

                case 'error':
                    console.error(`${logPrefix} Error:`, error);
                    break;
            }
        };
    }, [logPrefix, messageParser]);

    const connect = useCallback(async (): Promise<void> => {
        if (!endpoint) {
            console.error(`${logPrefix} Endpoint not configured`);
            return;
        }

        try {
            const token = tokenProvider ? (await tokenProvider()) || '' : '';

            initWorker();

            workerRef.current?.postMessage({
                type: 'connect',
                config: {
                    endpoint,
                    token,
                    authQueryParam,
                    sessionId,
                    channels,
                },
            });
        } catch (error) {
            console.error(`${logPrefix} Failed to connect:`, error);
        }
    }, [endpoint, tokenProvider, authQueryParam, logPrefix, sessionId, channels, initWorker]);

    const disconnect = useCallback((): void => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'disconnect' });
        }
        setConnectionStatus('disconnected');
        setIsConnected(false);
        setReconnectAttempts(0);
        setMaxReconnectReached(false);
    }, []);

    const reconnect = useCallback((): void => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'reconnect' });
            setMaxReconnectReached(false);
        } else {
            // Worker not initialized, do a full connect
            void connect();
        }
    }, [connect]);

    const send = useCallback(
        (data: unknown): void => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'send', data });
            } else {
                console.warn(`${logPrefix} Cannot send - worker not initialized`);
            }
        },
        [logPrefix]
    );

    useEffect(() => {
        if (!enabled) {
            disconnect();
            return;
        }

        void connect();

        return () => {
            disconnect();
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, [enabled]);

    return {
        id,
        connectionId,
        isConnected,
        connectionStatus,
        lastMessage,
        reconnectAttempts,
        maxReconnectReached,
        connect,
        disconnect,
        reconnect,
        send,
    };
};
