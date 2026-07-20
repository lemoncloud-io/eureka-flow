import { describe, expect, it } from 'vitest';

import { fieldKey, humanizeKey, translateField, translateServerKey } from './i18nServerKey';

import type { TFunction } from 'i18next';

// Minimal fake TFunction: returns the translation from `dict` if present, else defaultValue.
const makeT = (dict: Record<string, string> = {}): TFunction =>
    ((key: string, opts?: { defaultValue?: string }) => dict[key] ?? opts?.defaultValue ?? key) as unknown as TFunction;

describe('humanizeKey', () => {
    it('converts snake_case to Title Case', () => {
        expect(humanizeKey('input_text')).toBe('Input Text');
        expect(humanizeKey('run_and_propagate')).toBe('Run And Propagate');
    });

    it('capitalizes a single word', () => {
        expect(humanizeKey('text')).toBe('Text');
    });

    it('handles numeric segments', () => {
        expect(humanizeKey('gpt_4')).toBe('Gpt 4');
    });
});

describe('translateServerKey', () => {
    it('returns the translated value when the key exists in the blocks namespace', () => {
        const t = makeT({ 'blocks:input_text': '텍스트 입력' });
        expect(translateServerKey(t, 'input_text')).toBe('텍스트 입력');
    });

    it('humanizes the key when no translation exists', () => {
        const t = makeT();
        expect(translateServerKey(t, 'input_text')).toBe('Input Text');
    });

    it('passes legacy raw text through unchanged', () => {
        const t = makeT();
        expect(translateServerKey(t, 'Input Text')).toBe('Input Text');
        expect(translateServerKey(t, 'AI Chat')).toBe('AI Chat');
    });

    it('returns empty string for empty / undefined / null', () => {
        const t = makeT();
        expect(translateServerKey(t, '')).toBe('');
        expect(translateServerKey(t, undefined)).toBe('');
        expect(translateServerKey(t, null)).toBe('');
    });

    it('humanizes a single lowercase word (cosmetic case change)', () => {
        const t = makeT();
        expect(translateServerKey(t, 'text')).toBe('Text');
    });
});

describe('fieldKey', () => {
    it('reads the language key from the `<field>En` sibling', () => {
        expect(fieldKey({ label: '텍스트 입력', labelEn: 'input_text' }, 'label')).toBe('input_text');
        expect(fieldKey({ description: '설명', descriptionEn: 'input_text_desc' }, 'description')).toBe(
            'input_text_desc'
        );
    });

    it('returns undefined when the sibling is absent or blank', () => {
        expect(fieldKey({ label: '텍스트 입력' }, 'label')).toBeUndefined();
        expect(fieldKey({ label: '텍스트 입력', labelEn: '' }, 'label')).toBeUndefined();
        expect(fieldKey(undefined, 'label')).toBeUndefined();
    });
});

describe('translateField', () => {
    it('translates the key held in the `<field>En` sibling', () => {
        const t = makeT({ 'blocks:input_text': '텍스트 입력' });
        expect(translateField(t, { label: 'Text Input', labelEn: 'input_text' }, 'label')).toBe('텍스트 입력');
    });

    it('falls back to the human-readable original when the key has no translation', () => {
        const t = makeT();
        expect(translateField(t, { label: 'Text Input', labelEn: 'input_text' }, 'label')).toBe('Text Input');
    });

    it('returns the original text when no `<field>En` sibling exists', () => {
        const t = makeT({ 'blocks:input_text': '텍스트 입력' });
        expect(translateField(t, { label: '텍스트 입력' }, 'label')).toBe('텍스트 입력');
    });

    it('works for any text field, not just label', () => {
        const t = makeT({ 'blocks:prompt_hint': '프롬프트를 입력하세요' });
        const field = { placeholder: 'Enter a prompt', placeholderEn: 'prompt_hint' };
        expect(translateField(t, field, 'placeholder')).toBe('프롬프트를 입력하세요');
    });

    it('returns empty string for missing object, missing field, or non-string value', () => {
        const t = makeT();
        expect(translateField(t, undefined, 'label')).toBe('');
        expect(translateField(t, null, 'label')).toBe('');
        expect(translateField(t, {} as { label?: string }, 'label')).toBe('');
        expect(translateField(t, { label: 42 } as unknown as { label: string }, 'label')).toBe('');
    });

    it('does not guess: snake_case original text stays as-is without an `<field>En` sibling', () => {
        const t = makeT({ 'blocks:input_text': '텍스트 입력' });
        expect(translateField(t, { label: 'input_text' }, 'label')).toBe('input_text');
    });
});
