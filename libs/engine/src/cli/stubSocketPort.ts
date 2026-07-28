import type { SocketListener, SocketPort, SocketStatus } from '../ports/socket';

export interface StubSocketPort extends SocketPort {
    /** Push one frame at the subscribers, as if the server had sent it. */
    emit: (frame: unknown) => void;
}

/**
 * A socket with no server behind it.
 *
 * The demo's claim is that the engine can follow a run headlessly — not that a WebSocket
 * connects. Driving the frames by hand keeps the run deterministic, which is what lets the
 * demo double as a test.
 */
export const createStubSocketPort = (): StubSocketPort => {
    const listeners = new Set<SocketListener>();
    let status: SocketStatus = 'disconnected';

    const announce = (next: SocketStatus): void => {
        status = next;
        listeners.forEach(listener => listener('status', next));
    };

    return {
        connect: () => announce('connected'),
        close: () => announce('disconnected'),
        status: () => status,
        // A fixed id, because the stub has one connection and never loses it. It is here so
        // a caller that must pass a connection id can be exercised without a server.
        connectionId: () => (status === 'connected' ? 'stub-connection' : null),
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        emit: frame => {
            const raw = typeof frame === 'string' ? frame : JSON.stringify(frame);
            listeners.forEach(listener => listener('message', raw));
        },
    };
};
