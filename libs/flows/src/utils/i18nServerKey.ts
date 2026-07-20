import type { TFunction } from 'i18next';

/**
 * Server text ships as a pair: the human-readable original (`label`) and its language
 * key in a sibling field suffixed `En` (`labelEn`).
 *
 * This is the only place that *resolves* a translation from an `*En` field — all 46
 * render sites go through `translateField`, so none of them name the suffix.
 *
 * It is not the only place that *spells* it: the admin block editor declares
 * `labelEn`/`descriptionEn`/`placeholderEn` as real interface fields
 * (`apps/admin/.../blocks/types/block.ts`, `apis/blockMappers.ts`) because it edits
 * them directly. Changing the suffix here compiles fine and silently stops resolving
 * until those are changed in lockstep.
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
