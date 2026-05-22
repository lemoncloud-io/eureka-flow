const TERMINAL_STATES = new Set(['done', 'completed', 'error', 'failed', 'cancelled', 'canceled']);
const ERROR_STATES = new Set(['error', 'failed']);

export const isTerminalProductState = (state: string): boolean => TERMINAL_STATES.has(state.toLowerCase());
export const isErrorProductState = (state: string): boolean => ERROR_STATES.has(state.toLowerCase());

/**
 * Estimate milliseconds remaining until 100% based on velocity of the last few samples.
 * Returns null when there is not enough data (need >=2 timestamps and forward progress).
 */
export const computeEta = (timestamps: number[], progressTotal: number): number | null => {
    if (timestamps.length < 2) return null;
    if (progressTotal <= 0 || progressTotal >= 100) return null;

    const first = timestamps[0];
    const last = timestamps[timestamps.length - 1];
    const elapsedMs = last - first;
    if (elapsedMs <= 0) return null;

    const samplesPerProgressPercent = elapsedMs / progressTotal;
    const remainingPercent = 100 - progressTotal;
    const remainingMs = remainingPercent * samplesPerProgressPercent;

    if (!Number.isFinite(remainingMs) || remainingMs < 0) return null;
    return Math.round(remainingMs);
};

/** Average percent across all phases in a progress$ map. Empty map → 0. */
export const averageProgress = (progress$: Record<string, number>): number => {
    const values = Object.values(progress$);
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
    return Math.round(sum / values.length);
};

/**
 * Format remaining milliseconds as a short human-readable string.
 * `null` → null (caller decides what to render).
 */
export const formatEta = (ms: number | null): string | null => {
    if (ms === null) return null;
    const totalSeconds = Math.max(1, Math.round(ms / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};
