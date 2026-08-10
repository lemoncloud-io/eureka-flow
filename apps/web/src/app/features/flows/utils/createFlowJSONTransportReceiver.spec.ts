import { splitJSON } from 'lemon-model';
import { describe, expect, it } from 'vitest';

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
    it('reassembles socket packets and resolves the matching generate request', async () => {
        const connection = new TestToolSocketConnection();
        const receiver = createFlowJSONTransportReceiver(connection);
        receiver.attach();

        try {
            const payload = { requestId: 'request-1', output: { content: 'x'.repeat(512) } };
            const pending = receiver.generateReceiver.wait(payload.requestId, async () => undefined);
            const { manifest, chunks, complete } = splitJSON(payload, { largeValueBytes: 16, chunkBytes: 64 });

            connection.publish({ type: 'node' });
            [manifest, ...chunks, complete].forEach(packet => connection.publish(packet));

            await expect(pending).resolves.toEqual(payload);
        } finally {
            receiver.close();
        }
    });
});
