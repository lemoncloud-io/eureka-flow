/**
 * Format an epoch-ms timestamp as "YYYY. MM. DD HH:MM" (mirrors billing-front's
 * format.ts formatDateTime, but takes epoch ms instead of an ISO string).
 * Invalid / falsy (0, NaN) inputs return '' so the UI never renders junk dates.
 */
export const formatCreditDateTime = (ms: number): string => {
    if (!ms || !Number.isFinite(ms)) return '';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
