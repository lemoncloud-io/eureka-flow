import type { SocketEventMap, SocketListener, SocketPort, SocketStatus } from '../ports/socket';

/** The subset of the WebSocket API this adapter uses — so a fake needs four members, not forty. */
export interface SocketLike {
    close: () => void;
    onopen: ((this: unknown, ev: unknown) => unknown) | null;
    onclose: ((this: unknown, ev: unknown) => unknown) | null;
    onerror: ((this: unknown, ev: unknown) => unknown) | null;
    onmessage: ((this: unknown, ev: { data: unknown }) => unknown) | null;
}

export interface WebSocketPortOptions {
    url: string;
    /** Defaults to the global `WebSocket` — Node 22 has one, so both runtimes share this adapter. */
    createSocket?: (url: string) => SocketLike;
    /** Backoff ceiling. Attempt n waits min(2^n * 500ms, this). */
    maxBackoffMs?: number;
    maxAttempts?: number;
    /** Injectable so the reconnect schedule is testable without waiting for it. */
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

/**
 * Reached through `globalThis` rather than named directly: the engine compiles without the
 * DOM lib on purpose, so `WebSocket` is not an ambient binding here even though both
 * target runtimes provide one. The check turns "undefined is not a constructor" into a
 * sentence that says which runtime is too old.
 */
const defaultCreateSocket = (url: string): SocketLike => {
    const Ctor = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
    if (!Ctor) throw new Error('No global WebSocket — pass createSocket, or run Node 22+ / a browser');
    return new Ctor(url);
};

/**
 * The one socket adapter both runtimes use.
 *
 * Node 22 ships `WebSocket` as a global, so — as with fetch — there is no browser branch
 * here and nothing to keep in sync. The browser app still runs its Worker implementation
 * for the main canvas; this is what a CLI or a worker-less consumer connects with.
 */
export const createWebSocketPort = ({
    url,
    createSocket = defaultCreateSocket,
    maxBackoffMs = 30_000,
    maxAttempts = 10,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: WebSocketPortOptions): SocketPort => {
    const listeners = new Set<SocketListener>();
    let socket: SocketLike | null = null;
    let status: SocketStatus = 'disconnected';
    let attempts = 0;
    let retryTimer: unknown = null;
    let closedByCaller = false;
    let connectionId: string | null = null;

    const emit = <K extends keyof SocketEventMap>(type: K, payload: SocketEventMap[K]): void => {
        [...listeners].forEach(listener => listener(type, payload));
    };

    const setStatus = (next: SocketStatus): void => {
        if (status === next) return;
        status = next;
        emit('status', next);
    };

    /**
     * The server opens with `{ action: 'info', data: { connectionId } }`, and that id is
     * what a run has to be asked for with. Read here rather than in the reducer because it
     * is a fact about this socket, not about the flow: a reconnect gets a new one, and the
     * frame announcing it belongs to the transport.
     */
    const rememberConnectionId = (raw: string): void => {
        if (!raw.includes('connectionId')) return;
        try {
            const frame = JSON.parse(raw) as { action?: string; data?: { connectionId?: unknown } };
            const id = frame.data?.connectionId;
            if (frame.action === 'info' && typeof id === 'string') connectionId = id;
        } catch {
            // Not JSON, or not the shape we hoped for. The socket carries other traffic.
        }
    };

    const open = (): void => {
        setStatus(attempts === 0 ? 'connecting' : 'reconnecting');
        const next = createSocket(url);
        socket = next;

        next.onopen = () => {
            attempts = 0;
            setStatus('connected');
        };
        next.onmessage = event => {
            const raw = typeof event.data === 'string' ? event.data : String(event.data);
            rememberConnectionId(raw);
            emit('message', raw);
        };
        next.onerror = () => setStatus('error');
        // A close the caller did not ask for is a dropped connection, and a dropped
        // connection during a run means the client stops hearing about it — so retry.
        next.onclose = () => {
            socket = null;
            // The id belonged to the connection that just went away.
            connectionId = null;
            if (closedByCaller) return setStatus('disconnected');
            if (attempts >= maxAttempts) return setStatus('error');
            attempts += 1;
            setStatus('reconnecting');
            retryTimer = setTimer(open, Math.min(2 ** attempts * 500, maxBackoffMs));
        };
    };

    return {
        connect: () => {
            if (socket) return;
            closedByCaller = false;
            attempts = 0;
            open();
        },
        close: () => {
            closedByCaller = true;
            if (retryTimer !== null) clearTimer(retryTimer);
            retryTimer = null;
            socket?.close();
            socket = null;
            connectionId = null;
            setStatus('disconnected');
        },
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        status: () => status,
        connectionId: () => connectionId,
    };
};
