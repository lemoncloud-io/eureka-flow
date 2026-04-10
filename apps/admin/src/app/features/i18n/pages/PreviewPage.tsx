import { useCallback, useMemo, useState } from 'react';

import { WebPreview } from '../components';
import { usePreviewPublisher, usePreviewSubscriber } from '../hooks';

import type { I18nNamespace } from '../consts';
import type { PreviewMessage } from '../hooks';
import type { FlatTranslations, Language } from '../types';

interface SyncData {
    namespace: I18nNamespace;
    edited: Record<Language, FlatTranslations>;
}

export const PreviewPage = () => {
    const [syncData, setSyncData] = useState<SyncData>({ namespace: 'common', edited: { en: {}, ko: {} } });
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

    const externalData = useMemo(() => syncData, [syncData]);

    return (
        <div className="h-screen w-screen bg-background">
            <WebPreview onKeySearch={handleKeySearch} externalData={externalData} />
        </div>
    );
};
