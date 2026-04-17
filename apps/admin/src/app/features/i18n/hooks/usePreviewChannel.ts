import { useCallback, useEffect, useRef } from 'react';

import type { FlatTranslations } from '../types';

const CHANNEL_NAME = 'i18n-preview';

export type PreviewMessage =
    | { type: 'i18n:sync'; namespace: string; edited: Record<string, FlatTranslations> }
    | { type: 'i18n:showKeys'; namespace: string; keys: Record<string, unknown> }
    | { type: 'i18n:changeLanguage'; language: string }
    | { type: 'i18n:keyClicked'; key: string };

/** Publish messages to preview tabs via BroadcastChannel */
export const usePreviewPublisher = () => {
    const channelRef = useRef<BroadcastChannel | null>(null);

    useEffect(() => {
        channelRef.current = new BroadcastChannel(CHANNEL_NAME);
        return () => {
            channelRef.current?.close();
            channelRef.current = null;
        };
    }, []);

    const broadcast = useCallback((msg: PreviewMessage) => {
        channelRef.current?.postMessage(msg);
    }, []);

    return { broadcast };
};

/** Subscribe to messages from the editor tab via BroadcastChannel */
export const usePreviewSubscriber = (onMessage: (msg: PreviewMessage) => void) => {
    const callbackRef = useRef(onMessage);
    callbackRef.current = onMessage;

    useEffect(() => {
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (e: MessageEvent<PreviewMessage>) => {
            callbackRef.current(e.data);
        };
        return () => channel.close();
    }, []);
};
