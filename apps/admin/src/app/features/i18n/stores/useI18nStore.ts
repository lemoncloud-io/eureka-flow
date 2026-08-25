import { create } from 'zustand';

import { DEFAULT_LANGUAGES, DEFAULT_NAMESPACES, downloadTranslationFile, fetchTranslation } from '../consts';
import { flattenJson, sortObjectKeys, unflattenJson } from '../consts';

import type { FlatTranslations, NestedTranslations } from '../types';

const emptyByLang = (langs: string[]): Record<string, FlatTranslations> =>
    Object.fromEntries(langs.map(lang => [lang, {}]));

interface I18nState {
    languages: string[];
    namespaces: string[];
    namespace: string;
    originals: Record<string, FlatTranslations>;
    edited: Record<string, FlatTranslations>;
    isLoading: boolean;
    error: string | null;

    isDirty: () => boolean;
    setNamespace: (ns: string) => void;
    loadTranslations: () => Promise<void>;
    exportTranslations: () => void;
    importTranslations: (lang: string, data: NestedTranslations) => void;
    updateValue: (key: string, lang: string, value: string) => void;
    addKey: (key: string, values: Record<string, string>) => void;
    deleteKey: (key: string) => void;
    resetChanges: () => void;
}

export const useI18nStore = create<I18nState>()((set, get) => ({
    languages: DEFAULT_LANGUAGES,
    namespaces: DEFAULT_NAMESPACES,
    namespace: 'common',
    originals: emptyByLang(DEFAULT_LANGUAGES),
    edited: emptyByLang(DEFAULT_LANGUAGES),
    isLoading: false,
    error: null,

    isDirty: () => {
        const { originals, edited, languages } = get();
        return languages.some(lang => JSON.stringify(originals[lang]) !== JSON.stringify(edited[lang]));
    },

    setNamespace: (ns: string) => set({ namespace: ns }),

    loadTranslations: async () => {
        const { namespace, languages } = get();
        set({ isLoading: true, error: null });
        try {
            const results = await Promise.all(languages.map(lang => fetchTranslation(lang, namespace)));
            const flatMap = Object.fromEntries(languages.map((lang, i) => [lang, flattenJson(results[i])])) as Record<
                string,
                FlatTranslations
            >;
            set({
                originals: flatMap,
                edited: Object.fromEntries(languages.map(lang => [lang, { ...flatMap[lang] }])),
                isLoading: false,
            });
        } catch (e) {
            set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load translations' });
        }
    },

    exportTranslations: () => {
        const { namespace, edited, languages } = get();
        languages.forEach(lang => {
            const nested = sortObjectKeys(unflattenJson(edited[lang]) as NestedTranslations);
            downloadTranslationFile(lang, namespace, nested);
        });
        // Exported files ARE the new source of truth — mark editor state clean
        set({
            originals: Object.fromEntries(languages.map(lang => [lang, { ...edited[lang] }])),
        });
    },

    importTranslations: (lang, data) => {
        set(state => ({
            edited: { ...state.edited, [lang]: flattenJson(data) },
        }));
    },

    updateValue: (key, lang, value) => {
        set(state => ({
            edited: { ...state.edited, [lang]: { ...state.edited[lang], [key]: value } },
        }));
    },

    addKey: (key, values) => {
        set(state => {
            const newEdited = { ...state.edited };
            state.languages.forEach(lang => {
                newEdited[lang] = { ...newEdited[lang], [key]: values[lang] ?? '' };
            });
            return { edited: newEdited };
        });
    },

    deleteKey: key => {
        set(state => {
            const newEdited = { ...state.edited };
            state.languages.forEach(lang => {
                const copy = { ...newEdited[lang] };
                delete copy[key];
                newEdited[lang] = copy;
            });
            return { edited: newEdited };
        });
    },

    resetChanges: () => {
        set(state => ({
            edited: Object.fromEntries(state.languages.map(lang => [lang, { ...state.originals[lang] }])),
        }));
    },
}));
