import { describe, expect, it } from 'vitest';

import { blockToBlockBody, blockViewToBlock } from './blockMappers';

import type { BlockView } from './blockMappers';
import type { BlockFormData } from '../types';

/** What the edit form holds — a Block already satisfies it, minus the identity fields. */
const toFormData = (view: BlockView): BlockFormData => blockViewToBlock(view);

/**
 * The mappers list fields explicitly, so anything they forget is dropped on read
 * and wiped on the next save. These tests pin the language keys against exactly
 * that: a block edited in the admin must come back out carrying every `*En` it
 * arrived with.
 */
const keyedBlock: BlockView = {
    id: '0008',
    stereo: 'input',
    name: '텍스트 입력',
    label: '텍스트 입력',
    labelEn: 'input_text',
    description: 'User text input',
    descriptionEn: 'input_text_desc',
    icon: '📝',
    order: 1,
    processType: 'input-text',
    isFrontend: true,
    input$$: [],
    output$$: [{ id: 'out', label: '텍스트', labelEn: 'text', type: 'text' }],
    config$$: [
        {
            key: 'text',
            type: 'text',
            label: '텍스트',
            labelEn: 'text',
            placeholder: '입력이 연결되지 않은 경우 사용',
            placeholderEn: 'input_text_hint',
        },
    ],
};

describe('blockViewToBlock', () => {
    it('reads the language key of every text field', () => {
        const block = blockViewToBlock(keyedBlock);
        expect(block.labelEn).toBe('input_text');
        expect(block.descriptionEn).toBe('input_text_desc');
        expect(block.output$[0].labelEn).toBe('text');
        expect(block.config$[0].labelEn).toBe('text');
        expect(block.config$[0].placeholderEn).toBe('input_text_hint');
    });

    it('accepts nameEn as the block key while the server field name is unsettled', () => {
        const keyedUnderNameEn: BlockView = { ...keyedBlock, labelEn: undefined, nameEn: 'input_text' };
        expect(blockViewToBlock(keyedUnderNameEn).labelEn).toBe('input_text');
    });

    it('leaves keys undefined for a block the server has not keyed', () => {
        const block = blockViewToBlock({ id: '1', label: '버퍼', description: '지연', output$$: [{ id: 'out' }] });
        expect(block.labelEn).toBeUndefined();
        expect(block.descriptionEn).toBeUndefined();
        expect(block.output$[0].labelEn).toBeUndefined();
    });
});

describe('round trip', () => {
    it('saving an unedited block preserves every language key', () => {
        const body = blockToBlockBody(toFormData(keyedBlock));

        expect(body.labelEn).toBe('input_text');
        expect(body.descriptionEn).toBe('input_text_desc');
        expect(body.output$$?.[0].labelEn).toBe('text');
        expect(body.config$$?.[0].labelEn).toBe('text');
        expect(body.config$$?.[0].placeholderEn).toBe('input_text_hint');
    });

    it('keeps the human-readable text alongside the keys', () => {
        const body = blockToBlockBody(toFormData(keyedBlock));

        expect(body.label).toBe('텍스트 입력');
        expect(body.description).toBe('User text input');
        expect(body.output$$?.[0].label).toBe('텍스트');
        expect(body.config$$?.[0].label).toBe('텍스트');
        expect(body.config$$?.[0].placeholder).toBe('입력이 연결되지 않은 경우 사용');
    });
});
