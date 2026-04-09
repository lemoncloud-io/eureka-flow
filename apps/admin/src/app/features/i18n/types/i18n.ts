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

/** A single translation entry with both language values */
export interface TranslationEntry {
    key: string;
    en: string;
    ko: string;
}

/** Tree node for rendering collapsible sections */
export interface TranslationTreeNode {
    /** Display name of this segment (e.g., "actions", "save") */
    segment: string;
    /** Full dot-notation path (e.g., "actions.save") */
    fullPath: string;
    /** Leaf value if this is a leaf node */
    values?: { en: string; ko: string };
    /** Child nodes if this is a branch */
    children?: TranslationTreeNode[];
}
