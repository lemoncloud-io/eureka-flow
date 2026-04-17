import { useCallback, useState } from 'react';

import { WebPreview } from '../components';
import { usePreviewPublisher, usePreviewSubscriber } from '../hooks';

import type { PreviewMessage } from '../hooks';
import type { FlatTranslations } from '../types';

interface SyncData {
    namespace: string;
    edited: Record<string, FlatTranslations>;
}

export const PreviewPage = () => {
    const [syncData, setSyncData] = useState<SyncData | null>(null);
    const { broadcast } = usePreviewPublisher();

    usePreviewSubscriber(
        useCallback((msg: PreviewMessage) => {
            if (msg.type === 'i18n:sync') {
                setSyncData({ namespace: msg.namespace, edited: msg.edited });
            }
        }, [])
    );

    const handleKeySearch = useCallback(
        (key: string) => {
            broadcast({ type: 'i18n:keyClicked', key });
        },
        [broadcast]
    );

    return (
        <div className="h-screen w-screen bg-background">
            <WebPreview onKeySearch={handleKeySearch} externalData={syncData ?? undefined} />
        </div>
    );
};
