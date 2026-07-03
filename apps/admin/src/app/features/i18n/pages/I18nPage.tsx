import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    AlertTriangle,
    Download,
    ExternalLink,
    Loader2,
    Monitor,
    PanelRightClose,
    PanelRightOpen,
    RotateCcw,
    Search,
    Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button, Input } from '@flows/ui-kit';

import { NamespaceSelector, TranslationEditor, WebPreview } from '../components';
import { fetchTranslation, flattenJson, parseTranslationFileName } from '../consts';
import { usePreviewPublisher, usePreviewSubscriber } from '../hooks';
import { useI18nStore } from '../stores';

import type { PreviewMessage } from '../hooks';
import type { FlatTranslations } from '../types';

type AllNsData = Record<string, Record<string, FlatTranslations>>;

export const I18nPage = () => {
    const namespace = useI18nStore(s => s.namespace);
    const namespaces = useI18nStore(s => s.namespaces);
    const languages = useI18nStore(s => s.languages);
    const setNamespace = useI18nStore(s => s.setNamespace);
    const loadTranslations = useI18nStore(s => s.loadTranslations);
    const exportTranslations = useI18nStore(s => s.exportTranslations);
    const importTranslations = useI18nStore(s => s.importTranslations);
    const resetChanges = useI18nStore(s => s.resetChanges);
    const updateValue = useI18nStore(s => s.updateValue);
    const addKey = useI18nStore(s => s.addKey);
    const deleteKey = useI18nStore(s => s.deleteKey);
    const isLoading = useI18nStore(s => s.isLoading);
    const error = useI18nStore(s => s.error);
    const isDirty = useI18nStore(s => s.isDirty);
    const edited = useI18nStore(s => s.edited);
    const originals = useI18nStore(s => s.originals);

    const hasChanges = useMemo(() => isDirty(), [isDirty, edited, originals]);
    const [searchQuery, setSearchQuery] = useState('');
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(true);

    const { broadcast } = usePreviewPublisher();
    const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const importInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
        broadcastTimerRef.current = setTimeout(() => {
            broadcast({ type: 'i18n:sync', namespace, edited });
        }, 300);
        return () => {
            if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
        };
    }, [namespace, edited, broadcast]);

    usePreviewSubscriber((msg: PreviewMessage) => {
        if (msg.type === 'i18n:keyClicked') handleKeySearch(msg.key);
    });

    const [allNsData, setAllNsData] = useState<AllNsData | null>(null);
    const allNsDataLoadedRef = useRef(false);

    useEffect(() => {
        if (allNsDataLoadedRef.current || namespaces.length === 0) return;
        allNsDataLoadedRef.current = true;
        const load = async () => {
            const pairs = namespaces.flatMap(ns => languages.map(lang => ({ ns, lang })));
            const results = await Promise.all(
                pairs.map(async ({ ns, lang }) => {
                    try {
                        const data = await fetchTranslation(lang, ns);
                        return { ns, lang, flat: flattenJson(data) };
                    } catch {
                        return { ns, lang, flat: {} as FlatTranslations };
                    }
                })
            );
            const result = {} as AllNsData;
            for (const { ns, lang, flat } of results) {
                if (!result[ns]) result[ns] = {};
                result[ns][lang] = flat;
            }
            setAllNsData(result);
        };
        load();
    }, [namespaces, languages]);

    useEffect(() => {
        loadTranslations();
    }, [namespace, loadTranslations]);

    const searchMatchCounts = useMemo(() => {
        if (!searchQuery || !allNsData) return undefined;
        const query = searchQuery.toLowerCase();
        const counts: Partial<Record<string, number>> = {};
        for (const ns of namespaces) {
            const data = ns === namespace ? edited : allNsData[ns];
            if (!data) continue;
            let count = 0;
            const allKeys = new Set<string>();
            languages.forEach(lang => Object.keys(data[lang] || {}).forEach(k => allKeys.add(k)));
            for (const key of allKeys) {
                if (key.toLowerCase().includes(query)) {
                    count++;
                    continue;
                }
                if (languages.some(lang => (data[lang]?.[key] ?? '').toLowerCase().includes(query))) count++;
            }
            if (count > 0) counts[ns] = count;
        }
        return counts;
    }, [searchQuery, allNsData, edited, namespace, namespaces, languages]);

    const findNamespaceForKey = useCallback(
        (key: string): string | null => {
            if (languages.some(lang => key in edited[lang])) return namespace;
            if (!allNsData) return null;
            for (const ns of namespaces) {
                if (ns === namespace) continue;
                if (languages.some(lang => key in (allNsData[ns]?.[lang] ?? {}))) return ns;
            }
            return null;
        },
        [edited, namespace, allNsData, namespaces, languages]
    );

    const handleNamespaceChange = useCallback(
        (ns: string) => {
            if (hasChanges) {
                const confirmed = window.confirm('You have unsaved changes. Continue?');
                if (!confirmed) return;
            }
            setNamespace(ns);
        },
        [hasChanges, setNamespace]
    );

    const handleExport = useCallback(() => {
        exportTranslations();
        toast.success('Exported — copy files into apps/web/public/locales/{lng}/ and commit');
    }, [exportTranslations]);

    const handleImportFiles = useCallback(
        async (files: FileList | null) => {
            if (!files || files.length === 0) return;
            for (const file of Array.from(files)) {
                const parsed = parseTranslationFileName(file.name, languages);
                if (!parsed) {
                    toast.error(`${file.name}: expected {ns}.{lng}.json (lng: ${languages.join(', ')})`);
                    continue;
                }
                if (parsed.ns && parsed.ns !== namespace) {
                    toast.error(`${file.name}: namespace mismatch (current: ${namespace})`);
                    continue;
                }
                try {
                    const data = JSON.parse(await file.text());
                    importTranslations(parsed.lng, data);
                    toast.success(`${file.name} imported into ${parsed.lng}`);
                } catch {
                    toast.error(`${file.name}: invalid JSON`);
                }
            }
        },
        [languages, namespace, importTranslations]
    );

    const handleReset = useCallback(() => {
        const confirmed = window.confirm('Discard all changes?');
        if (confirmed) resetChanges();
    }, [resetChanges]);

    const handleKeySearch = useCallback(
        (query: string) => {
            const targetNs = findNamespaceForKey(query);
            if (targetNs && targetNs !== namespace) {
                if (hasChanges) {
                    const confirmed = window.confirm('You have unsaved changes. Switch namespace to find this key?');
                    if (!confirmed) {
                        setSearchQuery(query);
                        return;
                    }
                }
                setNamespace(targetNs);
            }
            setSearchQuery(query);
            setFocusKey(query);
        },
        [findNamespaceForKey, namespace, hasChanges, setNamespace]
    );

    const handleOpenPreviewTab = useCallback(() => {
        window.open('/i18n/preview', 'i18n-preview');
    }, []);

    return (
        <div className="flex flex-col gap-3 h-[calc(100vh-theme(spacing.14)-theme(spacing.12))]">
            {/* Toolbar */}
            <div className="flex items-end justify-between gap-4">
                <NamespaceSelector
                    namespaces={namespaces}
                    selected={namespace}
                    onChange={handleNamespaceChange}
                    matchCounts={searchMatchCounts}
                />
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search all namespaces..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 w-56 text-sm"
                        />
                    </div>
                    <div className="w-px h-6 bg-border" />
                    <Button
                        variant={showPreview ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setShowPreview(v => !v)}
                        title={showPreview ? 'Hide preview' : 'Show preview'}
                    >
                        {showPreview ? (
                            <PanelRightClose className="h-3.5 w-3.5 mr-1" />
                        ) : (
                            <PanelRightOpen className="h-3.5 w-3.5 mr-1" />
                        )}
                        <Monitor className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenPreviewTab}
                        title="Open preview in new tab (dual monitor)"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <div className="w-px h-6 bg-border" />
                    <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasChanges}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reset
                    </Button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".json,application/json"
                        multiple
                        className="hidden"
                        onChange={e => {
                            handleImportFiles(e.target.files);
                            e.target.value = '';
                        }}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => importInputRef.current?.click()}
                        title="Import {ns}.{lng}.json files into the editor"
                    >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        Import
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleExport}
                        disabled={isLoading}
                        title="Download {ns}.{lng}.json per language — commit into apps/web/public/locales/"
                    >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={loadTranslations} className="ml-auto h-7">
                        Retry
                    </Button>
                </div>
            )}

            {/* Main content */}
            <div className="flex gap-4 flex-1 min-h-0">
                <div className="flex-1 min-w-0 relative">
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20 rounded-lg">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">Loading...</span>
                        </div>
                    ) : (
                        <TranslationEditor
                            languages={languages}
                            edited={edited}
                            originals={originals}
                            onUpdateValue={updateValue}
                            onAddKey={addKey}
                            onDeleteKey={deleteKey}
                            searchQuery={searchQuery}
                            focusKey={focusKey}
                            onFocusHandled={() => setFocusKey(null)}
                        />
                    )}
                </div>

                {showPreview && (
                    <div className="w-[480px] shrink-0">
                        <WebPreview onKeySearch={handleKeySearch} />
                    </div>
                )}
            </div>
        </div>
    );
};
