import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createFakeGateway, createInMemoryCanvasBinding } from '@flows/agent';

import { AgentPanel } from './AgentPanel';
import { createCommandLlmGateway } from '../utils/createCommandLlmGateway';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (id: string, x: number, y: number, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

// Submit with Enter — the composer's Send is the only button, but Enter is the robust hook.
const typeAndSend = (text: string) => {
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: 'Enter' });
};

afterEach(() => {
    cleanup();
    localStorage.clear(); // sessions persist per flowId; isolate tests that share flowId="f"
});

describe('AgentPanel', () => {
    it('applies a move and shows the transcript when the gateway returns a tool call', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('n1', 200, 80, { type: 'http', customLabel: 'Fetch' })],
            edges: [],
        });
        const gateway = createFakeGateway([
            { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] },
            { text: 'Moved Fetch 10px right to (210, 80).' },
        ]);

        render(<AgentPanel binding={binding} flowId="f" gateway={gateway} />);
        typeAndSend('move Fetch right 10');

        // The move is applied to the (in-memory) canvas...
        await waitFor(() => {
            expect(binding.readGraph().nodes[0].position).toEqual({ x: 210, y: 80 });
        });
        // ...and both the user's message and the agent's confirmation are shown.
        expect(await screen.findByText(/Moved Fetch/)).toBeTruthy();
        expect(screen.getByText('move Fetch right 10')).toBeTruthy();
    });

    it('drives the offline command gateway end-to-end from a typed command', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('n1', 200, 80, { type: 'http', customLabel: 'Fetch' })],
            edges: [],
        });

        render(<AgentPanel binding={binding} flowId="f" gateway={createCommandLlmGateway()} />);
        typeAndSend('move(Fetch, up, 10)');

        await waitFor(() => {
            expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 70 });
        });
        expect(await screen.findByText(/Moved Fetch/)).toBeTruthy();
    });
});
