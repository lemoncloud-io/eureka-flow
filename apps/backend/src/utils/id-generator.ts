import { ulid } from 'ulid';

/** Generate a ULID — time-sortable, unique. */
export const generateId = (): string => ulid();

/**
 * Generate a numeric-style ID for backward compat with existing frontend.
 * The frontend currently uses numeric string IDs like "1000637".
 * This generates a 7-digit number starting from 2000000 range.
 */
let counter = 2000000 + Math.floor(Math.random() * 100000);
export const generateNumericId = (): string => String(++counter);
