import { useCallback, useEffect, useRef, useState } from 'react';

import { Eye, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

import { I18N_NAMESPACES, fetchTranslation, flattenJson, unflattenJson } from '../consts';
import { useI18nStore } from '../stores';
import { LANGUAGES, LANGUAGE_LABELS } from '../types';

import type { I18nNamespace } from '../consts';
import type { FlatTranslations, Language } from '../types';

const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL as string | undefined;
const PREVIEW_URL = WEB_APP_URL || 'http://localhost:3000';

const DEVICE_PRESETS = [
    { name: 'Mobile', width: 375, height: 667, icon: Smartphone },
    { name: 'Tablet', width: 768, height: 1024, icon: Tablet },
    { name: 'Desktop', width: 1280, height: 800, icon: Monitor },
] as const;

type DevicePreset = (typeof DEVICE_PRESETS)[number]['name'];

/** Build a `{ key: "[key]" }` map from flat translations, then unflatten for i18next */
const buildKeyOverlay = (flatKeys: string[]): Record<string, unknown> => {
    const keyMap: Record<string, string> = {};
    for (const key of flatKeys) keyMap[key] = `[${key}]`;
    return unflattenJson(keyMap);
};

interface ExternalData {
    namespace: I18nNamespace;
    edited: Record<Language, FlatTranslations>;
}

interface WebPreviewProps {
    onKeySearch?: (query: string) => void;
    /** When provided, use this data instead of Zustand store (standalone/external tab mode) */
    externalData?: ExternalData;
}

export const WebPreview = ({ onKeySearch, externalData }: WebPreviewProps) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [language, setLanguage] = useState<Language>('ko');
    const [refreshKey, setRefreshKey] = useState(0);
    const [showKeys, setShowKeys] = useState(false);
    const [device, setDevice] = useState<DevicePreset>('Desktop');
    const [containerWidth, setContainerWidth] = useState(0);
    const [syncTrigger, setSyncTrigger] = useState(0);
    const [allNsKeys, setAllNsKeys] = useState<Record<I18nNamespace, string[]> | null>(null);
    const [allNsValues, setAllNsValues] = useState<Record<I18nNamespace, Record<string, unknown>> | null>(null);

    const storeNamespace = useI18nStore(s => s.namespace);
    const storeEdited = useI18nStore(s => s.edited);
    const namespace = externalData?.namespace ?? storeNamespace;
    const edited = externalData?.edited ?? storeEdited;

    const preset = DEVICE_PRESETS.find(d => d.name === device) ?? DEVICE_PRESETS[2];
    const scale = containerWidth > 0 ? Math.min(1, containerWidth / preset.width) : 1;

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let rafId = 0;
        const observer = new ResizeObserver(entries => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                setContainerWidth(entries[0].contentRect.width);
            });
        });
        observer.observe(el);
        return () => {
            cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        setSyncTrigger(0);
    }, [refreshKey]);

    const handleIframeLoad = useCallback(() => {
        setTimeout(() => setSyncTrigger(c => (c === 0 ? 1 : c)), 500);
    }, []);

    const postToIframe = useCallback((message: Record<string, unknown>) => {
        iframeRef.current?.contentWindow?.postMessage(message, '*');
    }, []);

    // Fetch all namespace keys+values when showKeys is toggled on
    useEffect(() => {
        if (!showKeys) return;
        let cancelled = false;
        const load = async () => {
            const keys = {} as Record<I18nNamespace, string[]>;
            const values = {} as Record<I18nNamespace, Record<string, unknown>>;
            await Promise.all(
                I18N_NAMESPACES.map(async ns => {
                    try {
                        const data = await fetchTranslation('en', ns);
                        keys[ns] = Object.keys(flattenJson(data));
                        values[ns] = data;
                    } catch {
                        keys[ns] = [];
                        values[ns] = {};
                    }
                })
            );
            if (!cancelled) {
                setAllNsKeys(keys);
                setAllNsValues(values);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [showKeys]);

    const syncEditedToIframe = useCallback(
        (ns: I18nNamespace, data: Record<Language, FlatTranslations>) => {
            LANGUAGES.forEach(lang => {
                postToIframe({
                    type: 'i18n:update',
                    namespace: ns,
                    language: lang,
                    resources: unflattenJson(data[lang]),
                });
            });
        },
        [postToIframe]
    );

    // Refs for full sync to read current values without re-triggering
    const editedRef = useRef(edited);
    const namespaceRef = useRef(namespace);
    editedRef.current = edited;
    namespaceRef.current = namespace;

    // Full sync to iframe (initial load, refresh, showKeys toggle only)
    useEffect(() => {
        if (syncTrigger === 0) return;
        const ns = namespaceRef.current;
        const ed = editedRef.current;

        if (showKeys && allNsKeys) {
            for (const targetNs of I18N_NAMESPACES) {
                const keys =
                    targetNs === ns
                        ? [...new Set(LANGUAGES.flatMap(lang => Object.keys(ed[lang])))]
                        : (allNsKeys[targetNs] ?? []);
                if (keys.length > 0) {
                    postToIframe({ type: 'i18n:showKeys', namespace: targetNs, keys: buildKeyOverlay(keys) });
                }
            }
        } else if (!showKeys) {
            syncEditedToIframe(ns, ed);
            if (allNsValues) {
                for (const targetNs of I18N_NAMESPACES) {
                    if (targetNs === ns) continue;
                    LANGUAGES.forEach(lang => {
                        postToIframe({
                            type: 'i18n:update',
                            namespace: targetNs,
                            language: lang,
                            resources: allNsValues[targetNs] ?? {},
                        });
                    });
                }
                setAllNsKeys(null);
                setAllNsValues(null);
            }
        }
    }, [syncTrigger, showKeys, allNsKeys, allNsValues, postToIframe, syncEditedToIframe]);

    // Live sync: push edited translations to iframe on every change (debounced)
    const liveSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (syncTrigger === 0 || showKeys) return;

        if (liveSyncTimerRef.current) clearTimeout(liveSyncTimerRef.current);
        liveSyncTimerRef.current = setTimeout(() => {
            syncEditedToIframe(namespace, edited);
        }, 150);

        return () => {
            if (liveSyncTimerRef.current) clearTimeout(liveSyncTimerRef.current);
        };
    }, [edited, namespace, syncTrigger, showKeys, syncEditedToIframe]);

    const handleLanguageChange = useCallback(
        (lang: Language) => {
            setLanguage(lang);
            postToIframe({ type: 'i18n:changeLanguage', language: lang });
        },
        [postToIframe]
    );

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (!event.data || typeof event.data.type !== 'string') return;
            switch (event.data.type) {
                case 'i18n:ready':
                    setSyncTrigger(c => c + 1);
                    break;
                case 'i18n:keyClicked':
                    if (event.data.key) onKeySearch?.(event.data.key);
                    break;
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [onKeySearch]);

    return (
        <div className="flex flex-col h-full rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="text-sm font-medium">Preview</span>
                <div className="flex items-center gap-1">
                    {DEVICE_PRESETS.map(d => (
                        <Button
                            key={d.name}
                            variant={device === d.name ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setDevice(d.name)}
                            className="h-7 w-7 p-0"
                            title={`${d.name} (${d.width}px)`}
                        >
                            <d.icon className="h-3.5 w-3.5" />
                        </Button>
                    ))}
                    <div className="w-px h-4 bg-border mx-1" />
                    <Button
                        variant={showKeys ? 'destructive' : 'ghost'}
                        size="sm"
                        onClick={() => setShowKeys(!showKeys)}
                        className="text-xs h-7"
                        title="Show translation keys"
                    >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Keys
                    </Button>
                    {LANGUAGES.map(lang => (
                        <Button
                            key={lang}
                            variant={language === lang ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleLanguageChange(lang)}
                            className={cn('text-xs h-7', language === lang && 'pointer-events-none')}
                        >
                            {LANGUAGE_LABELS[lang]}
                        </Button>
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRefreshKey(k => k + 1)}
                        className="h-7 w-7 p-0"
                        title="Refresh"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {scale < 1 && (
                <div className="px-3 py-1 text-[10px] text-muted-foreground border-b bg-muted/30">
                    {preset.width}px &middot; {Math.round(scale * 100)}%
                </div>
            )}

            <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden bg-muted/20">
                <div
                    style={{
                        width: preset.width,
                        height: preset.height,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                    }}
                >
                    <iframe
                        ref={iframeRef}
                        key={refreshKey}
                        src={`${PREVIEW_URL}?lng=${language}`}
                        className="w-full h-full border-0 bg-white"
                        title="Web Preview"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                        onLoad={handleIframeLoad}
                    />
                </div>
            </div>
        </div>
    );
};
