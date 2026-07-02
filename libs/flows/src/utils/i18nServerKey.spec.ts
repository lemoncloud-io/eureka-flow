import { describe, expect, it } from 'vitest';

import { humanizeKey, translateServerKey } from './i18nServerKey';

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
