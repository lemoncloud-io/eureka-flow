import { useSyncExternalStore } from 'react';

const NEW_BADGE_TTL_MS = 5000;

const recentIds = new Set<string>();
const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
};

export const markConnectionNew = (connectionId: string): void => {
    if (!connectionId) return;
    // Reset the TTL when the same id is marked again so the first timeout does
    // not prematurely clear an id that was just re-marked.
    const existing = pendingTimeouts.get(connectionId);
    if (existing) clearTimeout(existing);

    recentIds.add(connectionId);
    listeners.forEach(l => l());

    const timeoutId = setTimeout(() => {
        recentIds.delete(connectionId);
        pendingTimeouts.delete(connectionId);
        listeners.forEach(l => l());
    }, NEW_BADGE_TTL_MS);
    pendingTimeouts.set(connectionId, timeoutId);
};

export const useIsConnectionNew = (connectionId: string): boolean =>
    useSyncExternalStore(
        subscribe,
        () => recentIds.has(connectionId),
        () => false
    );
