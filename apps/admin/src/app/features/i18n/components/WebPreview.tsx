import { useCallback, useEffect, useRef, useState } from 'react';

import { Monitor, RefreshCw } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { unflattenJson } from '../consts';
import { LANGUAGE_LABELS } from '../types';

import type { I18nNamespace } from '../consts';
import type { FlatTranslations, Language } from '../types';

const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL as string | undefined;
const PREVIEW_URL = WEB_APP_URL || 'http://localhost:3000';

interface WebPreviewProps {
    namespace: I18nNamespace;
    editedEn: FlatTranslations;
    editedKo: FlatTranslations;
    onKeySearch?: (query: string) => void;
}

export const WebPreview = ({ namespace, editedEn, editedKo, onKeySearch }: WebPreviewProps) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [language, setLanguage] = useState<Language>('ko');
    const [refreshKey, setRefreshKey] = useState(0);
    const [showKeys, setShowKeys] = useState(false);

    const postToIframe = useCallback((message: Record<string, unknown>) => {
        iframeRef.current?.contentWindow?.postMessage(message, PREVIEW_URL);
    }, []);

    // Send updated translations to iframe whenever edited data changes
    useEffect(() => {
        if (!iframeRef.current?.contentWindow) return;

        if (showKeys) return; // Don't send values in showKeys mode

        const enNested = unflattenJson(editedEn);
        const koNested = unflattenJson(editedKo);

        postToIframe({ type: 'i18n:update', namespace, language: 'en', resources: enNested });
        postToIframe({ type: 'i18n:update', namespace, language: 'ko', resources: koNested });
    }, [editedEn, editedKo, namespace, showKeys, postToIframe]);

    // Toggle show keys mode
    useEffect(() => {
        if (!iframeRef.current?.contentWindow) return;

        if (showKeys) {
            // Build nested object where every leaf value = its dot-notation key
            const keyMap: Record<string, string> = {};
            const allKeys = new Set([...Object.keys(editedEn), ...Object.keys(editedKo)]);
            for (const key of allKeys) {
                keyMap[key] = `[${key}]`;
            }
            const keysNested = unflattenJson(keyMap);
            postToIframe({ type: 'i18n:showKeys', namespace, keys: keysNested });
        } else {
            // Restore actual values
            const enNested = unflattenJson(editedEn);
            const koNested = unflattenJson(editedKo);
            postToIframe({ type: 'i18n:update', namespace, language: 'en', resources: enNested });
            postToIframe({ type: 'i18n:update', namespace, language: 'ko', resources: koNested });
        }
    }, [showKeys, editedEn, editedKo, namespace, postToIframe]);

    // Change language in iframe
    const handleLanguageChange = useCallback(
        (lang: Language) => {
            setLanguage(lang);
            postToIframe({ type: 'i18n:changeLanguage', language: lang });
        },
        [postToIframe]
    );

    // Listen for messages from iframe (text click → key search)
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'i18n:keyClicked' && event.data.key) {
                onKeySearch?.(event.data.key);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [onKeySearch]);

    return (
        <div className="flex flex-col h-full rounded-lg border bg-card">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">미리보기</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant={showKeys ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => setShowKeys(!showKeys)}
                        className="text-xs h-7"
                    >
                        값 보기
                    </Button>
                    {(['ko', 'en'] as Language[]).map(lang => (
                        <Button
                            key={lang}
                            variant={language === lang ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleLanguageChange(lang)}
                            className="text-xs h-7"
                        >
                            {LANGUAGE_LABELS[lang]}
                        </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setRefreshKey(k => k + 1)} className="h-7 w-7 p-0">
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Info bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs">
                <span role="img" aria-label="hint">
                    💡
                </span>
                <span>미리보기 화면의 텍스트를 클릭하면 해당 번역이 테이블에서 검색됩니다</span>
            </div>

            {/* iframe */}
            <div className="flex-1 min-h-0">
                <iframe
                    ref={iframeRef}
                    key={refreshKey}
                    src={`${PREVIEW_URL}?lng=${language}`}
                    className="w-full h-full border-0"
                    title="Web Preview"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                />
            </div>
        </div>
    );
};
