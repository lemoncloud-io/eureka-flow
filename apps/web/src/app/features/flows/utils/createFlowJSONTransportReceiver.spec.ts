import { splitJSON } from 'lemon-model';
import { describe, expect, it } from 'vitest';

import { useWebSocketStore } from '@flows/socket';

import { createFlowJSONTransportReceiver } from './createFlowJSONTransportReceiver';

describe('createFlowJSONTransportReceiver', () => {
    it('reassembles socket packets and resolves the matching generate request', async () => {
        const receiver = createFlowJSONTransportReceiver();
        receiver.attach();

        try {
            const payload = { requestId: 'request-1', output: { content: 'x'.repeat(512) } };
            const pending = receiver.generateReceiver.wait(payload.requestId, async () => undefined);
            const { manifest, chunks, complete } = splitJSON(payload, { largeValueBytes: 16, chunkBytes: 64 });

            useWebSocketStore.getState().broadcastMessage({ data: { type: 'node' } });
            [manifest, ...chunks, complete].forEach(packet =>
                useWebSocketStore.getState().broadcastMessage({ data: packet })
            );

            await expect(pending).resolves.toEqual(payload);
        } finally {
            receiver.close();
            useWebSocketStore.getState().reset();
        }
    });
});
