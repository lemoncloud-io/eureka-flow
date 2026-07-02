import type { TFunction } from 'i18next';

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
