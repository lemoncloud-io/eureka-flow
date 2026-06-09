/**
 * Format a credit amount for display with locale thousands separators.
 * Non-finite values (NaN/Infinity) fall back to '0' so the UI never shows junk.
 */
export const formatCredits = (n: number): string => {
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString();
};
