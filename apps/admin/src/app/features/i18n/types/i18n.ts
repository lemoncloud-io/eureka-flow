export type Language = 'en' | 'ko';

export const LANGUAGES: Language[] = ['en', 'ko'];

export const LANGUAGE_LABELS: Record<Language, string> = {
    en: 'English',
    ko: '한국어',
};

/** Flat key-value map (dot notation keys → string values) */
export type FlatTranslations = Record<string, string>;

/** Nested JSON structure as stored in locale files */
export type NestedTranslations = Record<string, unknown>;

/** Tree node for rendering collapsible sections */
export interface TranslationTreeNode {
    segment: string;
    fullPath: string;
    /** Per-language values (only on leaf nodes) */
    values?: Record<Language, string>;
    children?: TranslationTreeNode[];
}
