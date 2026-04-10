import { LANGUAGES } from '../types';

import type { FlatTranslations, Language, NestedTranslations, TranslationTreeNode } from '../types';

/**
 * Flatten nested JSON to dot-notation keys.
 * { errors: { network: { title: "Error" } } } → { "errors.network.title": "Error" }
 */
export const flattenJson = (obj: NestedTranslations, prefix = ''): FlatTranslations => {
    const result: FlatTranslations = {};
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenJson(value as NestedTranslations, fullKey));
        } else {
            result[fullKey] = String(value ?? '');
        }
    }
    return result;
};

/**
 * Unflatten dot-notation keys back to nested JSON.
 * { "errors.network.title": "Error" } → { errors: { network: { title: "Error" } } }
 */
export const unflattenJson = (flat: FlatTranslations): NestedTranslations => {
    const result: NestedTranslations = {};
    for (const [key, value] of Object.entries(flat)) {
        const parts = key.split('.');
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current) || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part] as NestedTranslations;
        }
        current[parts[parts.length - 1]] = value;
    }
    return result;
};

/**
 * Build a tree structure from per-language flat translations for rendering collapsible sections.
 */
export const buildTranslationTree = (translations: Record<Language, FlatTranslations>): TranslationTreeNode[] => {
    const allKeys = new Set<string>();
    for (const lang of LANGUAGES) {
        for (const key of Object.keys(translations[lang] || {})) {
            allKeys.add(key);
        }
    }
    const sortedKeys = [...allKeys].sort();

    const root: TranslationTreeNode = { segment: '', fullPath: '', children: [] };

    for (const key of sortedKeys) {
        const parts = key.split('.');
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const segment = parts[i];
            const fullPath = parts.slice(0, i + 1).join('.');
            const isLeaf = i === parts.length - 1;

            if (!current.children) current.children = [];
            let child = current.children.find(c => c.segment === segment);

            if (!child) {
                child = { segment, fullPath };
                if (isLeaf) {
                    child.values = Object.fromEntries(
                        LANGUAGES.map(lang => [lang, translations[lang]?.[key] ?? ''])
                    ) as Record<Language, string>;
                } else {
                    child.children = [];
                }
                current.children.push(child);
            }

            current = child;
        }
    }

    return root.children ?? [];
};

/**
 * Sort object keys alphabetically (for consistent JSON output).
 */
export const sortObjectKeys = (obj: NestedTranslations): NestedTranslations => {
    const sorted: NestedTranslations = {};
    for (const key of Object.keys(obj).sort()) {
        const value = obj[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            sorted[key] = sortObjectKeys(value as NestedTranslations);
        } else {
            sorted[key] = value;
        }
    }
    return sorted;
};
