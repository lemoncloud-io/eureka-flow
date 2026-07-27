export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SocketEventMap {
    /** One frame off the wire, still unparsed — the engine decides what a frame means. */
    message: string;
    status: SocketStatus;
}

export type SocketListener = <K extends keyof SocketEventMap>(type: K, payload: SocketEventMap[K]) => void;

/**
 * A live channel from the server, and nothing more.
 *
 * Reconnection and backoff belong to the adapter; deciding what a message *means* belongs
 * to the execution reducer. Keeping those apart is what lets the browser keep its Worker
 * implementation while Node uses a socket directly, with the same reducer behind both.
 */
export interface SocketPort {
    connect: () => void;
    close: () => void;
    /** Returns an unsubscribe function. */
    subscribe: (listener: SocketListener) => () => void;
    status: () => SocketStatus;
}
