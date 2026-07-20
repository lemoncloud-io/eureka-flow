import type { TFunction } from 'i18next';

/**
 * Server text ships as a pair: the human-readable original (`label`) and its language
 * key in a sibling field suffixed `En` (`labelEn`). This convention is the single
 * source of truth for the pairing — nothing outside this module reads an `*En` field,
 * so renaming the suffix is a one-line change here.
 */
const EN_SUFFIX = 'En';

/** Language key for a text field, or undefined when the block has not been keyed yet. */
export const fieldKey = (obj: unknown, field: string): string | undefined => {
    const value = (obj as Record<string, unknown> | undefined | null)?.[`${field}${EN_SUFFIX}`];
    return typeof value === 'string' && value ? value : undefined;
};

/**
 * Display value for a server text field, resolved at render time so a language switch
 * needs no refetch.
 *
 * Resolution order:
 *   1. Translation of the `<field>En` language key, from the `blocks` namespace
 *   2. The human-readable original in `<field>`
 *
 * Both steps are optional, so this reads correctly whether the server has migrated a
 * given field or not — no per-field frontend change is needed as migration progresses.
 */
export const translateField = <T extends object>(
    t: TFunction,
    obj: T | undefined | null,
    field: Extract<keyof T, string>
): string => {
    if (!obj) return '';
    const key = fieldKey(obj, field);
    if (key) {
        const translated = t(`blocks:${key}`, { defaultValue: '' });
        if (translated) return translated;
    }
    const original = (obj as Record<string, unknown>)[field];
    return typeof original === 'string' ? original : '';
};

/**
 * Server-provided block text (label, description, port/config labels) is stored as
 * language keys (snake_case, e.g. `input_text`) and converted to a display value at
 * render time. This keeps translation reactive to language changes without refetching.
 *
 * Resolution order:
 *   1. Translated value from the `blocks` namespace, if present
 *   2. Humanized key (Title Case) as a last-resort fallback
 *
 * Legacy raw text (spaces / uppercase — anything not matching the key pattern) passes
 * through unchanged, so this ships safely before the server migrates text → keys.
 */
const KEY_PATTERN = /^[a-z0-9_]+$/;

export const humanizeKey = (key: string): string =>
    key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export const translateServerKey = (t: TFunction, key: string | undefined | null): string => {
    if (!key) return '';
    // Legacy raw text (not a snake_case key) is returned as-is
    if (!KEY_PATTERN.test(key)) return key;
    // `t` resolves the blocks namespace; humanize only on a miss (avoids building the fallback on the hit path)
    return t(`blocks:${key}`, { defaultValue: '' }) || humanizeKey(key);
};
