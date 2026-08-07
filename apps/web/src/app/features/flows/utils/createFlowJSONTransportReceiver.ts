import { createJSONTransport } from 'lemon-model';

import { useWebSocketStore } from '@flows/socket';

import type { GenerateReceiver, GenerateResponse } from './createGenerateApiLlmGateway';
import type { ToolCall, ToolResult } from '@flows/agent';
import type { JSONTransport, NetworkMessageHandler, NetworkSupportable } from 'lemon-model';

type GenerateTransportPayload = GenerateResponse & { requestId: string };
type ToolTransportPayload = ToolResult & { requestId: string };
type TransportPayload = GenerateTransportPayload | ToolTransportPayload;
type Pending<T> = { resolve: (value: T) => void; reject: (error: unknown) => void };

export interface FlowJSONTransportReceiver {
    generateReceiver: GenerateReceiver<GenerateResponse>;
    waitTool(requestId: string, fire: () => Promise<unknown>): Promise<ToolResult>;
    attach(): () => void;
    close(): void;
}

/** Run one backend-owned tool and resolve it from the matching socket result. */
export const dispatchAsyncTool = async (
    call: ToolCall,
    options: {
        receiver: Pick<FlowJSONTransportReceiver, 'waitTool'>;
        getConnectionId: () => string | null;
        dispatchHttp: () => Promise<ToolResult>;
        fire: (request: { requestId: string; toolCallId: string; connectionId: string }) => Promise<unknown>;
    }
): Promise<ToolResult> => {
    const connectionId = options.getConnectionId();
    if (!connectionId) return options.dispatchHttp();
    const requestId = crypto.randomUUID();
    return options.receiver.waitTool(requestId, () => options.fire({ requestId, toolCallId: call.id, connectionId }));
};

/** Reassembles JSONTransport packets already carried by the app's single socket worker. */
class FlowJSONTransportReceiverAdapter implements FlowJSONTransportReceiver {
    private readonly messageHandlers = new Set<NetworkMessageHandler>();
    private readonly generateWaits = new Map<string, Pending<GenerateResponse>>();
    private readonly toolWaits = new Map<string, Pending<ToolResult>>();
    private transport?: JSONTransport<TransportPayload>;
    private unsubscribe?: () => void;

    private readonly network: NetworkSupportable = {
        get readyState() {
            return useWebSocketStore.getState().isConnected ? 'open' : 'closed';
        },
        send: () => {
            throw new Error('Browser JSON transport receiver is receive-only');
        },
        onMessage: handler => {
            this.messageHandlers.add(handler);
            return () => this.messageHandlers.delete(handler);
        },
        onError: () => () => undefined,
        close: () => undefined,
    };

    private readonly forwardSocketMessage = (message: { data: unknown }): void => {
        const packet = message.data as { type?: string };
        if (!packet?.type?.startsWith('json:')) return;
        const raw = JSON.stringify(packet);
        this.messageHandlers.forEach(handler => handler(raw));
    };

    private readonly resolvePayload = (payload: TransportPayload): void => {
        if ('toolCallId' in payload && 'ok' in payload) {
            const pending = this.toolWaits.get(payload.requestId);
            if (!pending) return;
            this.toolWaits.delete(payload.requestId);
            pending.resolve(payload);
            return;
        }
        const pending = this.generateWaits.get(payload.requestId);
        if (!pending) return;
        this.generateWaits.delete(payload.requestId);
        pending.resolve(payload);
    };

    private readonly waitFor = <T>(
        waits: Map<string, Pending<T>>,
        requestId: string,
        fire: () => Promise<unknown>
    ): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            waits.set(requestId, { resolve, reject });
            fire().catch(error => {
                waits.delete(requestId);
                reject(error);
            });
        });

    public readonly generateReceiver: GenerateReceiver<GenerateResponse> = {
        wait: (requestId, fire) => this.waitFor(this.generateWaits, requestId, fire),
    };

    public waitTool(requestId: string, fire: () => Promise<unknown>): Promise<ToolResult> {
        return this.waitFor(this.toolWaits, requestId, fire);
    }

    public attach(): () => void {
        if (this.transport) return this.close;
        this.transport = createJSONTransport<TransportPayload>(this.network);
        this.transport.onMessage(this.resolvePayload);
        this.unsubscribe = useWebSocketStore.getState().subscribe(this.forwardSocketMessage);
        return this.close;
    }

    public readonly close = (): void => {
        this.transport?.detach();
        this.unsubscribe?.();
        this.transport = undefined;
        this.unsubscribe = undefined;
    };
}

export const createFlowJSONTransportReceiver = (): FlowJSONTransportReceiver => new FlowJSONTransportReceiverAdapter();
