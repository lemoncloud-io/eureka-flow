import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nextProvider, initReactI18next } from 'react-i18next';

import { fireEvent, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AgentPanel } from './AgentPanel';

import type { Message, SessionState } from '@flows/agent';

/**
 * Renders against the shipped `en/flows.json` rather than a stub, so a row that reads correctly here
 * is a row the user sees — and a key missing from the locale file fails the test instead of silently
 * falling back to the in-code default.
 */
const LOCALE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../public/locales/en/flows.json');

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        fallbackLng: 'en',
        ns: ['flows'],
        defaultNS: 'flows',
        resources: { en: { flows: JSON.parse(readFileSync(LOCALE, 'utf-8')) } },
        interpolation: { escapeValue: false },
    });
});

const session = (messages: Message[], phase: SessionState['phase']): SessionState => ({
    flowId: 'f1',
    messages,
    phase,
});

const renderPanel = (
    state: SessionState | null,
    onSend = vi.fn(),
    extra: { onAbort?: () => void; onClose?: () => void; onNewChat?: () => void } = {}
) =>
    render(
        <I18nextProvider i18n={i18n}>
            <AgentPanel session={state} onSend={onSend} {...extra} />
        </I18nextProvider>
    );

describe('AgentPanel', () => {
    it('offers a first request to send when the transcript is empty', () => {
        const onSend = vi.fn();
        renderPanel(null, onSend);

        const suggestion = screen.getByRole('button', { name: 'Create a flow that writes a blog title' });
        fireEvent.click(suggestion);

        // The suggestion fills the composer rather than sending — the user stays in control of the ask.
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
            'Create a flow that writes a blog title'
        );
        expect(onSend).not.toHaveBeenCalled();
    });

    it('shows what the agent is doing to the canvas instead of a bare spinner', () => {
        renderPanel(
            session(
                [
                    { id: 'u1', role: 'user', content: 'build it', ts: 0 },
                    {
                        id: 'a1',
                        role: 'assistant',
                        toolCalls: [
                            {
                                id: 'c1',
                                name: 'add_node',
                                args: JSON.stringify({ type: 'generate' }),
                                status: 'ok',
                            },
                            {
                                id: 'c2',
                                name: 'move_node',
                                args: JSON.stringify({ nodeId: 'n2' }),
                                status: 'ok',
                            },
                        ],
                        ts: 0,
                    },
                    { id: 't1', role: 'tool', content: 'ok', toolCallId: 'c1', ts: 0 },
                ],
                'thinking'
            )
        );

        const live = screen.getByRole('status');
        expect(within(live).getByText(/Added/)).toBeTruthy();
        expect(within(live).getByText('generate')).toBeTruthy();
        // The unsettled call is the one still happening, and it reads as present tense.
        expect(within(live).getByText(/Moving/)).toBeTruthy();
        // The generic fallback line is suppressed while there is real work to show.
        expect(screen.queryByText('Thinking…')).toBeNull();
    });

    it('folds a finished turn into a count the user can open', () => {
        renderPanel(
            session(
                [
                    { id: 'u1', role: 'user', content: 'build it', ts: 0 },
                    {
                        id: 'a1',
                        role: 'assistant',
                        toolCalls: [
                            { id: 'c1', name: 'add_node', args: JSON.stringify({ type: 'input' }), status: 'ok' },
                            { id: 'c2', name: 'add_node', args: JSON.stringify({ type: 'generate' }), status: 'ok' },
                        ],
                        ts: 0,
                    },
                    { id: 't1', role: 'tool', content: 'ok', toolCallId: 'c1', ts: 0 },
                    { id: 't2', role: 'tool', content: 'ok', toolCallId: 'c2', ts: 0 },
                    { id: 'a2', role: 'assistant', content: 'Done — two blocks added.', ts: 0 },
                ],
                'done'
            )
        );

        const summary = screen.getByRole('button', { name: /2 changes/ });
        expect(summary.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByText('generate')).toBeNull();

        fireEvent.click(summary);
        expect(summary.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByText('generate')).toBeTruthy();
    });

    it('leaves an earlier turn folded while a new one runs', () => {
        renderPanel(
            session(
                [
                    { id: 'u1', role: 'user', content: 'build it', ts: 0 },
                    {
                        id: 'a1',
                        role: 'assistant',
                        toolCalls: [
                            { id: 'c1', name: 'add_node', args: JSON.stringify({ type: 'input' }), status: 'ok' },
                        ],
                        ts: 0,
                    },
                    { id: 't1', role: 'tool', content: 'ok', toolCallId: 'c1', ts: 0 },
                    { id: 'a2', role: 'assistant', content: 'Added one block.', ts: 0 },
                    { id: 'u2', role: 'user', content: 'now move it', ts: 0 },
                    {
                        id: 'a3',
                        role: 'assistant',
                        toolCalls: [
                            { id: 'c2', name: 'move_node', args: JSON.stringify({ nodeId: 'n1' }), status: 'ok' },
                        ],
                        ts: 0,
                    },
                ],
                'thinking'
            )
        );

        const [past, current] = screen.getAllByRole('button', { name: /1 change/ });
        expect(past.getAttribute('aria-expanded')).toBe('false');
        expect(current.getAttribute('aria-expanded')).toBe('true');
        // Only the running turn announces itself.
        expect(screen.getAllByRole('status')).toHaveLength(1);
        expect(screen.getByText(/Moving/)).toBeTruthy();
        expect(screen.queryByText('input')).toBeNull();
    });

    it('keeps the step that failed in view', () => {
        renderPanel(
            session(
                [
                    { id: 'u1', role: 'user', content: 'rewire it', ts: 0 },
                    {
                        id: 'a1',
                        role: 'assistant',
                        toolCalls: [
                            { id: 'c1', name: 'move_node', args: JSON.stringify({ nodeId: 'n1' }), status: 'ok' },
                            {
                                id: 'c2',
                                name: 'delete_node',
                                args: JSON.stringify({ nodeId: 'preview-1' }),
                                status: 'error',
                            },
                        ],
                        ts: 0,
                    },
                    { id: 't1', role: 'tool', content: 'ok', toolCallId: 'c1', ts: 0 },
                    { id: 't2', role: 'tool', content: 'denied', toolCallId: 'c2', ts: 0 },
                ],
                'error'
            )
        );

        // A failed turn does not fold: the row that failed is the one the user came for.
        const summary = screen.getByRole('button', { name: /2 changes/ });
        expect(summary.getAttribute('aria-expanded')).toBe('true');
        expect((summary as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('preview-1')).toBeTruthy();
    });

    it('offers a way out of a running turn', () => {
        const onAbort = vi.fn();
        renderPanel(session([{ id: 'u1', role: 'user', content: 'build it', ts: 0 }], 'thinking'), vi.fn(), {
            onAbort,
        });

        // The send slot is what the user reaches for, and during a turn it is the stop control.
        const stop = screen.getByRole('button', { name: 'Stop' });
        expect((stop as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(stop);
        expect(onAbort).toHaveBeenCalledTimes(1);

        expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    });

    it('sends when the turn is not running', () => {
        const onSend = vi.fn();
        const onAbort = vi.fn();
        renderPanel(null, onSend, { onAbort });

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'add a preview' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(onSend).toHaveBeenCalledWith('add a preview');
        expect(onAbort).not.toHaveBeenCalled();
    });

    it('can be closed, and shows no close control when there is nowhere to collapse to', () => {
        const onClose = vi.fn();
        const { unmount } = renderPanel(null, vi.fn(), { onClose });

        fireEvent.click(screen.getByRole('button', { name: 'Close the assistant' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        unmount();

        renderPanel(null);
        expect(screen.queryByRole('button', { name: 'Close the assistant' })).toBeNull();
    });

    it('offers a new conversation only once there is one to forget', () => {
        const onNewChat = vi.fn();
        const { unmount } = renderPanel(null, vi.fn(), { onNewChat });

        // Nothing said yet: starting over would do nothing, so the control stays out of the way.
        expect(screen.queryByRole('button', { name: 'Start a new conversation' })).toBeNull();
        unmount();

        renderPanel(session([{ id: 'u1', role: 'user', content: 'build it', ts: 0 }], 'done'), vi.fn(), { onNewChat });
        fireEvent.click(screen.getByRole('button', { name: 'Start a new conversation' }));
        expect(onNewChat).toHaveBeenCalledTimes(1);
    });

    it('will not start over mid-turn', () => {
        const onNewChat = vi.fn();
        renderPanel(session([{ id: 'u1', role: 'user', content: 'build it', ts: 0 }], 'thinking'), vi.fn(), {
            onNewChat,
        });

        const button = screen.getByRole('button', { name: 'Start a new conversation' });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(button);
        expect(onNewChat).not.toHaveBeenCalled();
    });

    it('says a turn stopped, and why', () => {
        const failed: SessionState = { ...session([], 'error'), error: 'exceeded 12 reasoning iterations' };
        renderPanel(failed);

        expect(screen.getByText('The turn stopped')).toBeTruthy();
        expect(screen.getByText('exceeded 12 reasoning iterations')).toBeTruthy();
    });
});
