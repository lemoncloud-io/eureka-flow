import { splitJSON } from 'lemon-model';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFlowJSONTransportReceiver } from './createFlowJSONTransportReceiver';

import type { ToolSocketConnection, ToolSocketConnectionSnapshot } from './createFlowJSONTransportReceiver';
import type { WebSocketMessage } from '@flows/socket';

class TestToolSocketConnection implements ToolSocketConnection {
    private subscriber?: (message: WebSocketMessage) => void;

    public getSnapshot(): ToolSocketConnectionSnapshot {
        return { isConnected: true, connectionId: 'tool-connection-1' };
    }

    public subscribe(subscriber: (message: WebSocketMessage) => void): () => void {
        this.subscriber = subscriber;
        return (): void => {
            this.subscriber = undefined;
        };
    }

    public publish(data: unknown): void {
        this.subscriber?.({ id: 'packet', data });
    }
}

describe('createFlowJSONTransportReceiver', () => {
    afterEach(() => vi.useRealTimers());

    it('reassembles socket packets and resolves the matching generate request', async () => {
        const connection = new TestToolSocketConnection();
        const receiver = createFlowJSONTransportReceiver(connection);
        receiver.attach();

        try {
            const payload = { requestId: 'request-1', output: { content: 'x'.repeat(512) } };
            const pending = receiver.generateReceiver.wait(payload.requestId, async () => undefined);
            const { manifest, chunks, complete } = splitJSON(payload, { largeValueBytes: 16, chunkBytes: 64 });

            connection.publish({ type: 'node' }); // unrelated traffic is ignored
            [manifest, ...chunks, complete].forEach(packet => connection.publish(packet));

            await expect(pending).resolves.toEqual(payload);
        } finally {
            receiver.close();
        }
    });

    it('rejects a request that never receives a socket result within the timeout', async () => {
        vi.useFakeTimers();
        const connection = new TestToolSocketConnection();
        const receiver = createFlowJSONTransportReceiver(connection, { timeoutMs: 50 });
        receiver.attach();

        try {
            const pending = receiver.generateReceiver.wait('request-1', async () => undefined);
            const assertion = expect(pending).rejects.toThrow(/timed out/);
            await vi.advanceTimersByTimeAsync(50);
            await assertion;
        } finally {
            receiver.close();
        }
    });

    it('rejects the fire failure and stops the timeout', async () => {
        const connection = new TestToolSocketConnection();
        const receiver = createFlowJSONTransportReceiver(connection);
        receiver.attach();

        try {
            const pending = receiver.generateReceiver.wait('request-1', async () => {
                throw new Error('post failed');
            });
            await expect(pending).rejects.toThrow(/post failed/);
        } finally {
            receiver.close();
        }
    });

    it('rejects still-pending requests when the receiver is closed', async () => {
        const connection = new TestToolSocketConnection();
        const receiver = createFlowJSONTransportReceiver(connection);
        receiver.attach();

        const pending = receiver.generateReceiver.wait('request-1', async () => undefined);
        receiver.close();

        await expect(pending).rejects.toThrow(/closed/);
    });

    it('rejects with AbortError and drops the pending entry when the signal aborts mid-wait', async () => {
        const connection = new TestToolSocketConnection();
        const receiver = createFlowJSONTransportReceiver(connection);
        receiver.attach();
        const controller = new AbortController();

        try {
            const pending = receiver.generateReceiver.wait('request-1', async () => undefined, {
                signal: controller.signal,
            });
            controller.abort();

            await expect(pending).rejects.toThrow(/Aborted/);

            // The entry is gone: a late socket result for the same request is ignored, not settled twice.
            const payload = { requestId: 'request-1', output: { content: 'late' } };
            const { manifest, chunks, complete } = splitJSON(payload, { largeValueBytes: 16, chunkBytes: 64 });
            expect(() => [manifest, ...chunks, complete].forEach(packet => connection.publish(packet))).not.toThrow();
        } finally {
            receiver.close();
        }
    });

    it('rejects immediately without firing the POST when the signal is already aborted', async () => {
        const connection = new TestToolSocketConnection();
        const receiver = createFlowJSONTransportReceiver(connection);
        receiver.attach();
        const controller = new AbortController();
        controller.abort();
        const fire = vi.fn(async () => undefined);

        try {
            const pending = receiver.generateReceiver.wait('request-1', fire, { signal: controller.signal });
            await expect(pending).rejects.toThrow(/Aborted/);
            expect(fire).not.toHaveBeenCalled();
        } finally {
            receiver.close();
        }
    });
});
