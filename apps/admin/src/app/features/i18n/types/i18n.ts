/** Known language labels — unknown languages show their code as-is */
export const LANGUAGE_LABELS: Record<string, string> = {
    en: 'English',
    ko: '한국어',
    ja: '日本語',
    'zh-TW': '繁體中文',
    'zh-CN': '简体中文',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
};

export const getLanguageLabel = (lang: string): string => LANGUAGE_LABELS[lang] ?? lang;

/** Flat key-value map (dot notation keys → string values) */
export type FlatTranslations = Record<string, string>;

/** Nested JSON structure as stored in locale files */
export type NestedTranslations = Record<string, unknown>;

/** Tree node for rendering collapsible sections */
export interface TranslationTreeNode {
    segment: string;
    fullPath: string;
    /** Per-language values (only on leaf nodes) */
    values?: Record<string, string>;
    children?: TranslationTreeNode[];
}
