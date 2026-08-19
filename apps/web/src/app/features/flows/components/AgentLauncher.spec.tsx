import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nextProvider, initReactI18next } from 'react-i18next';

import { fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AgentLauncher } from './AgentLauncher';

import type { Message, SessionState } from '@flows/agent';

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

const withCalls = (phase: SessionState['phase']): SessionState => ({
    flowId: 'f1',
    phase,
    messages: [
        { id: 'u1', role: 'user', content: 'build it', ts: 0 },
        {
            id: 'a1',
            role: 'assistant',
            toolCalls: [
                { id: 'c1', name: 'add_node', args: '{"type":"input"}', status: 'ok' },
                { id: 'c2', name: 'add_node', args: '{"type":"generate"}', status: 'ok' },
                { id: 'c3', name: 'get_graph', args: '{}', status: 'ok' },
            ],
            ts: 0,
        },
    ] as Message[],
});

const renderLauncher = (session: SessionState | null, onOpen = vi.fn()) =>
    render(
        <I18nextProvider i18n={i18n}>
            <AgentLauncher session={session} onOpen={onOpen} />
        </I18nextProvider>
    );

describe('AgentLauncher', () => {
    it('is just a way back in when nothing is running', () => {
        const onOpen = vi.fn();
        renderLauncher(null, onOpen);

        const button = screen.getByRole('button', { name: 'Open the assistant' });
        expect(button.textContent).toBe('');

        fireEvent.click(button);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('reports the work in flight so a closed panel hides nothing', () => {
        renderLauncher(withCalls('thinking'));

        // Reads the same rule the ledger does: the two writes count, the read does not.
        expect(screen.getByRole('button', { name: 'Open the assistant' }).textContent).toContain('2 changes');
    });

    it('goes quiet once the turn settles', () => {
        renderLauncher(withCalls('done'));

        expect(screen.getByRole('button', { name: 'Open the assistant' }).textContent).toBe('');
    });
});
