import { describe, expect, it } from 'vitest';

import { createWebSocketPort } from '../adapters/webSocketPort';

import type { SocketLike } from '../adapters/webSocketPort';
import type { SocketStatus } from '../ports/socket';

/** A socket that never touches a network, driven by the test. */
class FakeSocket implements SocketLike {
    onopen: ((this: unknown, ev: unknown) => unknown) | null = null;
    onclose: ((this: unknown, ev: unknown) => unknown) | null = null;
    onerror: ((this: unknown, ev: unknown) => unknown) | null = null;
    onmessage: ((this: unknown, ev: { data: unknown }) => unknown) | null = null;
    closed = false;

    close(): void {
        this.closed = true;
    }

    open(): void {
        this.onopen?.call(null, {});
    }

    send(data: unknown): void {
        this.onmessage?.call(null, { data });
    }

    drop(): void {
        this.onclose?.call(null, {});
    }
}

/** Ports plus the sockets they made and the timers they asked for. */
const harness = (options: { maxAttempts?: number } = {}) => {
    const sockets: FakeSocket[] = [];
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const statuses: SocketStatus[] = [];
    const messages: string[] = [];

    const port = createWebSocketPort({
        url: 'wss://example.test/socket',
        createSocket: () => {
            const socket = new FakeSocket();
            sockets.push(socket);
            return socket;
        },
        setTimer: (fn, ms) => {
            timers.push({ fn, ms });
            return timers.length - 1;
        },
        clearTimer: () => undefined,
        ...options,
    });

    port.subscribe((type, payload) => {
        if (type === 'status') statuses.push(payload as SocketStatus);
        if (type === 'message') messages.push(payload as string);
    });

    return { port, sockets, timers, statuses, messages, runTimer: (i = 0) => timers[i].fn() };
};

describe('connect', () => {
    it('reports connecting, then connected', () => {
        const { port, sockets, statuses } = harness();

        port.connect();
        sockets[0].open();

        expect(statuses).toEqual(['connecting', 'connected']);
        expect(port.status()).toBe('connected');
    });

    it('does not open a second socket while one is live', () => {
        const { port, sockets } = harness();

        port.connect();
        port.connect();

        expect(sockets).toHaveLength(1);
    });

    it('passes frames through as strings', () => {
        const { port, sockets, messages } = harness();
        port.connect();
        sockets[0].open();

        sockets[0].send('{"type":"node","id":"n1"}');

        expect(messages).toEqual(['{"type":"node","id":"n1"}']);
    });
});

describe('reconnect', () => {
    it('retries a drop the caller did not ask for', () => {
        const { port, sockets, runTimer, statuses } = harness();
        port.connect();
        sockets[0].open();

        sockets[0].drop();
        runTimer();

        expect(sockets).toHaveLength(2);
        expect(statuses).toContain('reconnecting');
    });

    it('backs off further on each successive failure', () => {
        const { port, sockets, timers, runTimer } = harness();
        port.connect();
        sockets[0].drop();
        runTimer(0);
        sockets[1].drop();
        runTimer(1);
        sockets[2].drop();

        expect(timers.map(t => t.ms)).toEqual([1000, 2000, 4000]);
    });

    it('starts the backoff over once a connection succeeds', () => {
        const { port, sockets, timers, runTimer } = harness();
        port.connect();
        sockets[0].drop();
        runTimer(0);
        sockets[1].open();

        sockets[1].drop();

        expect(timers.map(t => t.ms)).toEqual([1000, 1000]);
    });

    it('gives up after the attempt ceiling', () => {
        const { port, sockets, timers, runTimer } = harness({ maxAttempts: 2 });
        port.connect();

        sockets[0].drop();
        runTimer(0);
        sockets[1].drop();
        runTimer(1);
        sockets[2].drop();

        expect(port.status()).toBe('error');
        expect(timers).toHaveLength(2);
    });

    it('does not retry a close the caller asked for', () => {
        const { port, sockets, timers } = harness();
        port.connect();
        sockets[0].open();

        port.close();
        sockets[0].drop();

        expect(timers).toHaveLength(0);
        expect(port.status()).toBe('disconnected');
    });
});

describe('subscribe', () => {
    it('stops delivering after unsubscribe', () => {
        const { port, sockets } = harness();
        const seen: string[] = [];
        const stop = port.subscribe((type, payload) => {
            if (type === 'message') seen.push(payload as string);
        });
        port.connect();
        sockets[0].open();

        stop();
        sockets[0].send('after');

        expect(seen).toEqual([]);
    });
});

describe('connection id', () => {
    it('is null until the server says what it is', () => {
        const { port, sockets } = harness();

        expect(port.connectionId()).toBeNull();
        port.connect();
        sockets[0].open();
        expect(port.connectionId()).toBeNull();
    });

    it('takes the id out of the opening info frame', () => {
        const { port, sockets } = harness();
        port.connect();
        sockets[0].open();

        sockets[0].send(JSON.stringify({ action: 'info', data: { connectionId: 'abc123' } }));

        expect(port.connectionId()).toBe('abc123');
    });

    it('ignores a connectionId that is not the server introducing itself', () => {
        const { port, sockets } = harness();
        port.connect();
        sockets[0].open();

        sockets[0].send(JSON.stringify({ action: 'node', data: { connectionId: 'not-mine' } }));

        expect(port.connectionId()).toBeNull();
    });

    it('survives a frame that is not JSON', () => {
        const { port, sockets } = harness();
        port.connect();
        sockets[0].open();

        expect(() => sockets[0].send('connectionId but not json')).not.toThrow();
        expect(port.connectionId()).toBeNull();
    });

    it('drops the id when the connection goes, since the next one gets a new id', () => {
        const { port, sockets } = harness();
        port.connect();
        sockets[0].open();
        sockets[0].send(JSON.stringify({ action: 'info', data: { connectionId: 'abc123' } }));

        sockets[0].drop();

        expect(port.connectionId()).toBeNull();
    });
});
