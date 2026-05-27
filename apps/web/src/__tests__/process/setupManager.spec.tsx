import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processApi, resetMockDb } from '@flows/flows';

import { ActorManagerPage } from '../../app/features/process/pages/ActorManagerPage';
import { ToolManagerPage } from '../../app/features/process/pages/ToolManagerPage';

// Mock translation and other contexts
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, defaultValue?: string) => defaultValue || key,
    }),
}));

// Mock ResizeObserver and PointerEvent for Radix UI compatibility in JSDOM
if (typeof window !== 'undefined') {
    window.PointerEvent = class PointerEvent extends Event {} as any;
    global.ResizeObserver = class ResizeObserver {
        observe() {
            // do nothing
        }
        unobserve() {
            // do nothing
        }
        disconnect() {
            // do nothing
        }
    };
}

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: 0,
            },
            mutations: {
                retry: false,
            },
        },
    });

describe('Setup Screens CRUD & Validation Scenarios', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        resetMockDb();
        queryClient = createTestQueryClient();
    });

    it('DEBUG: check processApi and environment', async () => {
        console.log('--- DEBUG INFO ---');
        console.log('import.meta.env:', JSON.stringify((import.meta as any).env));
        try {
            const toolsRes = await processApi.tools.list();
            console.log('processApi.tools.list() returned data length:', toolsRes?.data?.length);
            console.log('processApi.tools.list() data:', JSON.stringify(toolsRes?.data));
        } catch (e: any) {
            console.error('Error calling processApi.tools.list():', e?.message, e?.stack);
        }
    });

    describe('Tool Manager CRUD & Validation Scenario', () => {
        it('should list default tools and support CRUD with validations', async () => {
            // Render ToolManagerPage
            const { container } = render(
                <QueryClientProvider client={queryClient}>
                    <ToolManagerPage />
                </QueryClientProvider>
            );

            // 1. Initial Listing: Wait for tools data to load (resolving from mock api delay)
            await waitFor(() => {
                expect(screen.queryByText('촬영 폴더')).not.toBeNull();
            });

            expect(screen.queryByText('상세페이지 에디터')).not.toBeNull();
            expect(screen.queryByText('스마트스토어 등록 작업')).not.toBeNull();
            expect(screen.queryByText('쿠팡 등록 작업')).not.toBeNull();

            // 2. Open Create Tool Dialog & Verify Field Validations
            const createBtn = screen.getByRole('button', { name: /Create Tool/i });
            fireEvent.click(createBtn);

            // Dialog Title verification
            expect(screen.getByRole('heading', { name: 'Create Tool' })).not.toBeNull();

            // Check that the dialog's submit button is disabled initially
            const submitBtn = screen.getByRole('button', { name: 'Create' });
            expect(submitBtn.hasAttribute('disabled')).toBe(true);

            // Input fields selection
            const nameInput = screen.getByPlaceholderText('e.g. 촬영 폴더');
            const actionLabelInput = screen.getByPlaceholderText('e.g. 폴더 열기');
            const urlInput = screen.getByPlaceholderText('https://example.com/{itemId}');

            // Enter Name only -> Should still be disabled
            fireEvent.change(nameInput, { target: { value: '테스트 도구' } });
            expect(submitBtn.hasAttribute('disabled')).toBe(true);

            // Enter Action Label only -> Should still be disabled (since link tools require urlTemplate)
            fireEvent.change(actionLabelInput, { target: { value: '테스트 실행' } });
            expect(submitBtn.hasAttribute('disabled')).toBe(true);

            // Enter valid URL Template -> Should become enabled!
            fireEvent.change(urlInput, { target: { value: 'https://example.com/test/{itemId}' } });
            expect(submitBtn.hasAttribute('disabled')).toBe(false);

            // 3. Submit Form & Verify Creation
            fireEvent.click(submitBtn);

            // Wait for dialog to close and list to be updated
            await waitFor(() => {
                expect(screen.queryByText('테스트 도구')).not.toBeNull();
            });
            expect(screen.queryByText('https://example.com/test/{itemId}')).not.toBeNull();

            // 4. Update the newly created Tool
            // Locate edit button specifically for our new tool
            const allCards = container.querySelectorAll('.space-y-3 > div');
            let testToolCard: HTMLElement | null = null;
            allCards.forEach(card => {
                if (card.textContent?.includes('테스트 도구')) {
                    testToolCard = card as HTMLElement;
                }
            });

            expect(testToolCard).not.toBeNull();
            const editBtn = Array.from(testToolCard!.querySelectorAll('button')).find(btn =>
                btn.textContent?.includes('Edit')
            );
            expect(editBtn).toBeDefined();

            fireEvent.click(editBtn!);

            // Verify dialog is open in edit mode
            await waitFor(() => {
                expect(screen.getByRole('heading', { name: 'Edit Tool' })).not.toBeNull();
            });

            const editNameInput = screen.getByPlaceholderText('e.g. 촬영 폴더');
            expect((editNameInput as HTMLInputElement).value).toBe('테스트 도구');

            // Change name
            fireEvent.change(editNameInput, { target: { value: '수정된 테스트 도구' } });
            const saveBtn = screen.getByRole('button', { name: 'Save' });
            expect(saveBtn.hasAttribute('disabled')).toBe(false);

            fireEvent.click(saveBtn);

            // Wait for update
            await waitFor(() => {
                expect(screen.queryByText('수정된 테스트 도구')).not.toBeNull();
            });
            expect(screen.queryByText('테스트 도구')).toBeNull();

            // 5. Toggle active state
            // Re-find the updated tool card from container after the update completes
            let updatedToolCard: HTMLElement | null = null;
            container.querySelectorAll('.space-y-3 > div').forEach(card => {
                if (card.textContent?.includes('수정된 테스트 도구')) {
                    updatedToolCard = card as HTMLElement;
                }
            });
            expect(updatedToolCard).not.toBeNull();

            const switchEl = updatedToolCard!.querySelector('button[role="switch"]');
            expect(switchEl).not.toBeNull();
            expect(switchEl!.getAttribute('aria-checked')).toBe('true');

            // Deactivate
            fireEvent.click(switchEl!);
            await waitFor(() => {
                // Since opacity is reduced on deactivation, let's verify if the update mutation occurs.
                // We can query the updated list from DB to see if isActive became false.
                const updatedList = queryClient.getQueryData<any>(['tools', 'list']);
                const match = updatedList?.data?.find((t: any) => t.name === '수정된 테스트 도구');
                expect(match?.isActive).toBe(false);
            });
        });
    });

    describe('Actor Manager CRUD & Validation Scenario', () => {
        it('should list default actors and support CRUD with validations', async () => {
            // Render ActorManagerPage
            const { container } = render(
                <QueryClientProvider client={queryClient}>
                    <ActorManagerPage />
                </QueryClientProvider>
            );

            // 1. Initial Listing: Wait for actors data to load
            await waitFor(() => {
                expect(screen.queryByText('MD팀')).not.toBeNull();
            });

            expect(screen.queryByText('촬영팀')).not.toBeNull();
            expect(screen.queryByText('디자인팀')).not.toBeNull();
            expect(screen.queryByText('상품등록팀')).not.toBeNull();

            // 2. Open Create Actor Dialog & Verify Validation
            const createBtn = screen.getByRole('button', { name: /Create Actor/i });
            fireEvent.click(createBtn);

            // Dialog Title verification
            expect(screen.getByRole('heading', { name: 'Create Actor' })).not.toBeNull();

            // Submit button should be disabled initially (Name is empty)
            const submitBtn = screen.getByRole('button', { name: 'Create' });
            expect(submitBtn.hasAttribute('disabled')).toBe(true);

            // Fill Name input -> Should become enabled!
            const nameInput = screen.getByPlaceholderText('e.g. MD팀');
            fireEvent.change(nameInput, { target: { value: '테스트 담당자' } });
            expect(submitBtn.hasAttribute('disabled')).toBe(false);

            // Add memo
            const memoInput = document.querySelector('textarea');
            expect(memoInput).not.toBeNull();
            fireEvent.change(memoInput!, { target: { value: '신규 테스터' } });

            // 3. Submit Form & Verify Creation
            fireEvent.click(submitBtn);

            // Wait for dialog to close and actor to appear in the list
            await waitFor(() => {
                expect(screen.queryByText('테스트 담당자')).not.toBeNull();
            });
            expect(screen.queryByText('신규 테스터')).not.toBeNull();

            // 4. Update the newly created Actor
            const allCards = container.querySelectorAll('.grid > div');
            let testActorCard: HTMLElement | null = null;
            allCards.forEach(card => {
                if (card.textContent?.includes('테스트 담당자')) {
                    testActorCard = card as HTMLElement;
                }
            });

            expect(testActorCard).not.toBeNull();
            const editBtn = Array.from(testActorCard!.querySelectorAll('button')).find(btn =>
                btn.textContent?.includes('Edit')
            );
            expect(editBtn).toBeDefined();

            fireEvent.click(editBtn!);

            // Verify dialog is open in edit mode
            await waitFor(() => {
                expect(screen.getByRole('heading', { name: 'Edit Actor' })).not.toBeNull();
            });

            const editNameInput = screen.getByPlaceholderText('e.g. MD팀');
            expect((editNameInput as HTMLInputElement).value).toBe('테스트 담당자');

            // Change name
            fireEvent.change(editNameInput, { target: { value: '수정된 담당자' } });
            const saveBtn = screen.getByRole('button', { name: 'Save' });
            expect(saveBtn.hasAttribute('disabled')).toBe(false);

            fireEvent.click(saveBtn);

            // Wait for update
            await waitFor(() => {
                expect(screen.queryByText('수정된 담당자')).not.toBeNull();
            });
            expect(screen.queryByText('테스트 담당자')).toBeNull();

            // 5. Toggle active state
            // Re-find the updated actor card from container after the update completes
            let updatedActorCard: HTMLElement | null = null;
            container.querySelectorAll('.grid > div').forEach(card => {
                if (card.textContent?.includes('수정된 담당자')) {
                    updatedActorCard = card as HTMLElement;
                }
            });
            expect(updatedActorCard).not.toBeNull();

            const switchEl = updatedActorCard!.querySelector('button[role="switch"]');
            expect(switchEl).not.toBeNull();
            expect(switchEl!.getAttribute('aria-checked')).toBe('true');

            // Deactivate
            fireEvent.click(switchEl!);
            await waitFor(() => {
                const updatedList = queryClient.getQueryData<any>(['actors', 'list']);
                const match = updatedList?.data?.find((a: any) => a.name === '수정된 담당자');
                expect(match?.isActive).toBe(false);
            });
        });
    });
});
