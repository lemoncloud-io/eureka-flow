import { useSyncExternalStore } from 'react';

/**
 * Tracks recently-created connection IDs so the connected-node cards can show
 * a "new" badge for a few seconds after the connection is made. The store is
 * intentionally module-level (not Zustand) — a single transient UI signal does
 * not need a global store, and `useSyncExternalStore` keeps subscribers in sync
 * across mounts/unmounts while the card list re-renders.
 */

const NEW_BADGE_TTL_MS = 5000;

const recentIds = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => {
    listeners.forEach(listener => listener());
};

const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
};

export const markConnectionNew = (connectionId: string): void => {
    if (!connectionId) return;
    recentIds.add(connectionId);
    notify();
    setTimeout(() => {
        recentIds.delete(connectionId);
        notify();
    }, NEW_BADGE_TTL_MS);
};

export const useIsConnectionNew = (connectionId: string): boolean =>
    useSyncExternalStore(
        subscribe,
        () => recentIds.has(connectionId),
        () => false
    );
