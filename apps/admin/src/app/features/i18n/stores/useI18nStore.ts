import { create } from 'zustand';

import { fetchTranslation, flattenJson, sortObjectKeys, unflattenJson, uploadTranslation } from '../consts';
import { LANGUAGES } from '../types';

import type { I18nNamespace } from '../consts';
import type { FlatTranslations, Language, NestedTranslations } from '../types';

const mapByLang = (fn: (lang: Language) => FlatTranslations): Record<Language, FlatTranslations> =>
    Object.fromEntries(LANGUAGES.map(lang => [lang, fn(lang)])) as Record<Language, FlatTranslations>;

interface I18nState {
    namespace: I18nNamespace;
    originals: Record<Language, FlatTranslations>;
    edited: Record<Language, FlatTranslations>;
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;

    isDirty: () => boolean;
    setNamespace: (ns: I18nNamespace) => void;
    loadFromS3: () => Promise<void>;
    saveToS3: () => Promise<void>;
    updateValue: (key: string, lang: Language, value: string) => void;
    addKey: (key: string, values: Record<Language, string>) => void;
    deleteKey: (key: string) => void;
    resetChanges: () => void;
}

export const useI18nStore = create<I18nState>()((set, get) => ({
    namespace: 'common',
    originals: mapByLang(() => ({})),
    edited: mapByLang(() => ({})),
    isLoading: false,
    isSaving: false,
    error: null,

    isDirty: () => {
        const { originals, edited } = get();
        return LANGUAGES.some(lang => JSON.stringify(originals[lang]) !== JSON.stringify(edited[lang]));
    },

    setNamespace: (ns: I18nNamespace) => {
        set({ namespace: ns });
    },

    loadFromS3: async () => {
        const { namespace } = get();
        set({ isLoading: true, error: null });
        try {
            const results = await Promise.all(LANGUAGES.map(lang => fetchTranslation(lang, namespace)));
            const flatMap = Object.fromEntries(LANGUAGES.map((lang, i) => [lang, flattenJson(results[i])])) as Record<
                Language,
                FlatTranslations
            >;
            set({
                originals: flatMap,
                edited: mapByLang(lang => ({ ...flatMap[lang] })),
                isLoading: false,
            });
        } catch (e) {
            set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load translations' });
        }
    },

    saveToS3: async () => {
        const { namespace, edited } = get();
        set({ isSaving: true, error: null });
        try {
            await Promise.all(
                LANGUAGES.map(lang => {
                    const nested = sortObjectKeys(unflattenJson(edited[lang]) as NestedTranslations);
                    return uploadTranslation(lang, namespace, nested);
                })
            );
            set({ originals: mapByLang(lang => ({ ...edited[lang] })), isSaving: false });
        } catch (e) {
            set({ isSaving: false, error: e instanceof Error ? e.message : 'Failed to save translations' });
        }
    },

    updateValue: (key: string, lang: Language, value: string) => {
        set(state => ({
            edited: {
                ...state.edited,
                [lang]: { ...state.edited[lang], [key]: value },
            },
        }));
    },

    addKey: (key: string, values: Record<Language, string>) => {
        set(state => {
            const newEdited = { ...state.edited };
            LANGUAGES.forEach(lang => {
                newEdited[lang] = { ...newEdited[lang], [key]: values[lang] ?? '' };
            });
            return { edited: newEdited };
        });
    },

    deleteKey: (key: string) => {
        set(state => {
            const newEdited = { ...state.edited };
            LANGUAGES.forEach(lang => {
                const copy = { ...newEdited[lang] };
                delete copy[key];
                newEdited[lang] = copy;
            });
            return { edited: newEdited };
        });
    },

    resetChanges: () => {
        set(state => ({ edited: mapByLang(lang => ({ ...state.originals[lang] })) }));
    },
}));
