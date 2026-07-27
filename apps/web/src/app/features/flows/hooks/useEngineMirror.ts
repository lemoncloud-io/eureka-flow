import { useEffect, useRef } from 'react';

import { useCanvasStore } from '@flows/flows';

import type { FlowEngine } from '@flows/engine';

/**
 * Push the engine's graph into `useCanvasStore`, one way.
 *
 * The engine owns the graph now, but a hundred components still read it through the
 * store's selectors. Rather than rewrite all of them at once, the store becomes a
 * projection: the engine is written to, the store is read from. Nothing here reads the
 * store, so the two can never argue about which is right.
 *
 * There is no write on mount. A second canvas — the component-viewer modal renders one —
 * would otherwise publish its own empty graph over the editor's on the way up.
 */
export const useEngineMirror = (engine: FlowEngine, { paused }: { paused: boolean }): void => {
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const missedUpdate = useRef(false);

    useEffect(() => {
        const publish = (): void => {
            const { nodes, edges } = engine.getGraph();
            // Fresh array identities every time — that is what tells the selectors to re-render.
            useCanvasStore.setState({ nodes, connections: edges });
        };

        return engine.subscribe(() => {
            // While a drag is in flight the store is ahead of the engine, holding preview
            // positions that are not committed yet. Publishing over them — a socket
            // message during a run is enough — would snap the node back under the cursor.
            if (pausedRef.current) {
                missedUpdate.current = true;
                return;
            }
            publish();
        });
    }, [engine]);

    useEffect(() => {
        if (paused || !missedUpdate.current) return;
        missedUpdate.current = false;
        const { nodes, edges } = engine.getGraph();
        useCanvasStore.setState({ nodes, connections: edges });
    }, [paused, engine]);
};
