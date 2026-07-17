import { useEffect, useRef } from 'react';

import { clearDraft, draftFor, useCanvasStore, writeDraft } from '@flows/flows';

/** Long enough to coalesce a drag, short enough that little is lost if the tab dies. */
const DRAFT_DELAY = 800;

interface UseDraftPersistenceParams {
    /**
     * Editor pages opt in; nothing else may. The tutorial drives the same canvas store
     * with its own demo flow and no flow id, so an always-on subscription would file that
     * as an unsaved new flow and offer it back on the next visit to the editor.
     */
    enabled: boolean;
}

/**
 * Keeps the working copy in local storage while it differs from the server's.
 *
 * Auto-save defaults to off, so this is the only thing standing between an unsaved flow
 * and a refresh.
 */
export const useDraftPersistence = ({ enabled }: UseDraftPersistenceParams): void => {
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const persistNow = () => {
            const { nodes, connections } = useCanvasStore.getState();
            const draft = draftFor({ nodes, connections }, Date.now());
            // Null means the graph matches the server, and a draft that agrees with the
            // server is worse than none — the next boot would offer to recover it.
            void (draft ? writeDraft(draft) : clearDraft());
        };

        const schedule = () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(persistNow, DRAFT_DELAY);
        };

        const unsubscribe = useCanvasStore.subscribe((state, prev) => {
            if (state.nodes !== prev.nodes || state.connections !== prev.connections) schedule();
        });

        // Write on the way out rather than warn on the way out. The edits at risk are only
        // the ones inside the debounce above, and they are better saved than announced —
        // a confirm dialog here was removed on purpose, and drafts are why it can stay
        // gone. visibilitychange rather than beforeunload: this app is used on phones,
        // where beforeunload frequently never fires at all.
        const flushIfHidden = () => {
            if (document.visibilityState !== 'hidden') return;
            if (timerRef.current) window.clearTimeout(timerRef.current);
            persistNow();
        };
        document.addEventListener('visibilitychange', flushIfHidden);

        return () => {
            unsubscribe();
            document.removeEventListener('visibilitychange', flushIfHidden);
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [enabled]);
};
