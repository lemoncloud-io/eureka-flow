import { create } from 'zustand';

import { DEFAULT_LANGUAGES, DEFAULT_NAMESPACES, fetchLocales } from '../consts';
import { fetchTranslation, sortObjectKeys, unflattenJson, uploadTranslation } from '../consts';
import { flattenJson } from '../consts';

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
    isSaving: boolean;
    error: string | null;

    isDirty: () => boolean;
    initLocales: () => Promise<void>;
    setNamespace: (ns: string) => void;
    loadTranslations: () => Promise<void>;
    saveTranslations: () => Promise<void>;
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
    isSaving: false,
    error: null,

    isDirty: () => {
        const { originals, edited, languages } = get();
        return languages.some(lang => JSON.stringify(originals[lang]) !== JSON.stringify(edited[lang]));
    },

    initLocales: async () => {
        const { languages, namespaces } = await fetchLocales();
        set({
            languages,
            namespaces,
            originals: emptyByLang(languages),
            edited: emptyByLang(languages),
        });
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

    saveTranslations: async () => {
        const { namespace, edited, languages } = get();
        set({ isSaving: true, error: null });
        try {
            await Promise.all(
                languages.map(lang => {
                    const nested = sortObjectKeys(unflattenJson(edited[lang]) as NestedTranslations);
                    return uploadTranslation(lang, namespace, nested);
                })
            );
            set({
                originals: Object.fromEntries(languages.map(lang => [lang, { ...edited[lang] }])),
                isSaving: false,
            });
        } catch (e) {
            set({ isSaving: false, error: e instanceof Error ? e.message : 'Failed to save translations' });
        }
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
