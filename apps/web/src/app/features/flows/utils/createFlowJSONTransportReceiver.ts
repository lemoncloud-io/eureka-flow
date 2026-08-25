import { createJSONTransport } from 'lemon-model';

import type { GenerateReceiver, GenerateResponse } from './createGenerateApiLlmGateway';
import type { WebSocketMessage } from '@flows/socket';
import type { JSONTransport, NetworkMessageHandler, NetworkSupportable, SocketReadyState } from 'lemon-model';

type TransportPayload = GenerateResponse & { requestId: string };
type Pending = {
    resolve: (value: GenerateResponse) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    /** Detaches the abort listener; a no-op when the request carried no signal. Run on every settle. */
    cleanup: () => void;
};

/** No socket result within this window ⇒ fail the request rather than leak a pending entry forever. */
const DEFAULT_TIMEOUT_MS = 120_000;

export interface ToolSocketConnectionSnapshot {
    isConnected: boolean;
    connectionId: string | null;
}

export interface ToolSocketConnection {
    getSnapshot(): ToolSocketConnectionSnapshot;
    subscribe(subscriber: (message: WebSocketMessage) => void): () => void;
}

export interface FlowJSONTransportReceiver {
    generateReceiver: GenerateReceiver<GenerateResponse>;
    attach(): () => void;
    close(): void;
}

class ReceiveOnlyToolSocketNetwork implements NetworkSupportable {
    private readonly messageHandlers = new Set<NetworkMessageHandler>();

    public constructor(private readonly connection: ToolSocketConnection) {}

    public get readyState(): SocketReadyState {
        return this.connection.getSnapshot().isConnected ? 'open' : 'closed';
    }

    public send(): void {
        throw new Error('Browser JSON transport receiver is receive-only');
    }

    public onMessage(handler: NetworkMessageHandler): () => void {
        this.messageHandlers.add(handler);
        return (): void => {
            this.messageHandlers.delete(handler);
        };
    }

    public onError(): () => void {
        return (): void => undefined;
    }

    public readonly close = (): void => undefined;

    public readonly receive = (message: WebSocketMessage): void => {
        const packet = message.data as { type?: string };
        if (!packet?.type?.startsWith('json:')) return;
        const raw = JSON.stringify(packet);
        this.messageHandlers.forEach(handler => handler(raw));
    };
}

/** Reassembles JSONTransport generate results carried by the tool socket, correlated by `requestId`. */
class FlowJSONTransportReceiverAdapter implements FlowJSONTransportReceiver {
    private readonly waits = new Map<string, Pending>();
    private readonly network: ReceiveOnlyToolSocketNetwork;
    private transport?: JSONTransport<TransportPayload>;
    private unsubscribe?: () => void;

    public constructor(
        private readonly connection: ToolSocketConnection,
        private readonly timeoutMs: number
    ) {
        this.network = new ReceiveOnlyToolSocketNetwork(connection);
    }

    private readonly settle = (requestId: string): Pending | undefined => {
        const pending = this.waits.get(requestId);
        if (!pending) return undefined;
        clearTimeout(pending.timer);
        pending.cleanup();
        this.waits.delete(requestId);
        return pending;
    };

    private readonly resolvePayload = (payload: TransportPayload): void => {
        this.settle(payload.requestId)?.resolve(payload);
    };

    public readonly generateReceiver: GenerateReceiver<GenerateResponse> = {
        wait: (requestId, fire, opts) =>
            new Promise<GenerateResponse>((resolve, reject) => {
                const signal = opts?.signal;
                if (signal?.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }
                const timer = setTimeout(() => {
                    this.settle(requestId);
                    reject(new Error(`Generate request timed out after ${this.timeoutMs}ms (no socket result)`));
                }, this.timeoutMs);
                // Observe the signal for the whole wait, not just the POST: once the ACK resolves the
                // request lingers on the socket result, and an aborted turn must drop it now — not in 120s.
                const onAbort = (): void => {
                    this.settle(requestId);
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                signal?.addEventListener('abort', onAbort);
                const cleanup = (): void => signal?.removeEventListener('abort', onAbort);
                this.waits.set(requestId, { resolve, reject, timer, cleanup });
                fire().catch(error => {
                    this.settle(requestId);
                    reject(error);
                });
            }),
    };

    public attach(): () => void {
        if (this.transport) return this.close;
        this.transport = createJSONTransport<TransportPayload>(this.network);
        this.transport.onMessage(this.resolvePayload);
        this.unsubscribe = this.connection.subscribe(this.network.receive);
        return this.close;
    }

    public readonly close = (): void => {
        this.waits.forEach((_, requestId) =>
            this.settle(requestId)?.reject(new Error('Generate receiver closed before the result arrived'))
        );
        this.transport?.detach();
        this.unsubscribe?.();
        this.transport = undefined;
        this.unsubscribe = undefined;
    };
}

export const createFlowJSONTransportReceiver = (
    connection: ToolSocketConnection,
    options: { timeoutMs?: number } = {}
): FlowJSONTransportReceiver =>
    new FlowJSONTransportReceiverAdapter(connection, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
