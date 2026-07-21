type TFunc = (key: string, options?: Record<string, unknown>) => string;

/** 7 days — an App updated within this window is badged "New". */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Format an epoch-ms timestamp as relative time via the common `time.*` keys; older than a month falls back to a locale date. */
export const formatRelativeTime = (timestamp: number | undefined, t: TFunc): string => {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return t('time.justNow');
    if (minutes < 60) return t('time.minutesAgo', { count: minutes });
    if (hours < 24) return t('time.hoursAgo', { count: hours });
    if (days < 30) return t('time.daysAgo', { count: days });
    return new Date(timestamp).toLocaleDateString();
};

/** Whether an epoch-ms timestamp falls within the last 7 days. */
export const isRecent = (timestamp: number | undefined): boolean =>
    timestamp != null && Date.now() - timestamp < RECENT_WINDOW_MS;
