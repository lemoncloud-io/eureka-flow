import { create } from 'zustand';

import { fetchTranslation, flattenJson, sortObjectKeys, unflattenJson, uploadTranslation } from '../consts';

import type { I18nNamespace } from '../consts';
import type { FlatTranslations, NestedTranslations } from '../types';

interface I18nState {
    // Current selection
    namespace: I18nNamespace;

    // Data per language: original (from S3) and edited
    originalEn: FlatTranslations;
    originalKo: FlatTranslations;
    editedEn: FlatTranslations;
    editedKo: FlatTranslations;

    // Status
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;

    // Computed
    isDirty: () => boolean;

    // Actions
    setNamespace: (ns: I18nNamespace) => void;
    loadFromS3: () => Promise<void>;
    saveToS3: () => Promise<void>;
    updateValue: (key: string, lang: 'en' | 'ko', value: string) => void;
    addKey: (key: string, enValue: string, koValue: string) => void;
    deleteKey: (key: string) => void;
    resetChanges: () => void;
}

export const useI18nStore = create<I18nState>()((set, get) => ({
    namespace: 'common',
    originalEn: {},
    originalKo: {},
    editedEn: {},
    editedKo: {},
    isLoading: false,
    isSaving: false,
    error: null,

    isDirty: () => {
        const { originalEn, originalKo, editedEn, editedKo } = get();
        return (
            JSON.stringify(originalEn) !== JSON.stringify(editedEn) ||
            JSON.stringify(originalKo) !== JSON.stringify(editedKo)
        );
    },

    setNamespace: (ns: I18nNamespace) => {
        set({ namespace: ns });
    },

    loadFromS3: async () => {
        const { namespace } = get();
        set({ isLoading: true, error: null });
        try {
            const [enNested, koNested] = await Promise.all([
                fetchTranslation('en', namespace),
                fetchTranslation('ko', namespace),
            ]);
            const enFlat = flattenJson(enNested);
            const koFlat = flattenJson(koNested);
            set({
                originalEn: enFlat,
                originalKo: koFlat,
                editedEn: { ...enFlat },
                editedKo: { ...koFlat },
                isLoading: false,
            });
        } catch (e) {
            set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load translations' });
        }
    },

    saveToS3: async () => {
        const { namespace, editedEn, editedKo } = get();
        set({ isSaving: true, error: null });
        try {
            const enNested = sortObjectKeys(unflattenJson(editedEn) as NestedTranslations);
            const koNested = sortObjectKeys(unflattenJson(editedKo) as NestedTranslations);
            await Promise.all([
                uploadTranslation('en', namespace, enNested),
                uploadTranslation('ko', namespace, koNested),
            ]);
            set({
                originalEn: { ...editedEn },
                originalKo: { ...editedKo },
                isSaving: false,
            });
        } catch (e) {
            set({ isSaving: false, error: e instanceof Error ? e.message : 'Failed to save translations' });
        }
    },

    updateValue: (key: string, lang: 'en' | 'ko', value: string) => {
        if (lang === 'en') {
            set(state => ({ editedEn: { ...state.editedEn, [key]: value } }));
        } else {
            set(state => ({ editedKo: { ...state.editedKo, [key]: value } }));
        }
    },

    addKey: (key: string, enValue: string, koValue: string) => {
        set(state => ({
            editedEn: { ...state.editedEn, [key]: enValue },
            editedKo: { ...state.editedKo, [key]: koValue },
        }));
    },

    deleteKey: (key: string) => {
        set(state => {
            const newEn = { ...state.editedEn };
            const newKo = { ...state.editedKo };
            delete newEn[key];
            delete newKo[key];
            return { editedEn: newEn, editedKo: newKo };
        });
    },

    resetChanges: () => {
        set(state => ({
            editedEn: { ...state.originalEn },
            editedKo: { ...state.originalKo },
        }));
    },
}));
