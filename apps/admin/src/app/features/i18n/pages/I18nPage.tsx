import { useCallback, useEffect, useState } from 'react';

import { AlertTriangle, Loader2, RotateCcw, Save, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Input } from '@flows/ui-kit';

import { NamespaceSelector, TranslationEditor, WebPreview } from '../components';
import { isS3Configured } from '../consts';
import { useI18nStore } from '../stores';

import type { I18nNamespace } from '../consts';

export const I18nPage = () => {
    const namespace = useI18nStore(s => s.namespace);
    const setNamespace = useI18nStore(s => s.setNamespace);
    const loadFromS3 = useI18nStore(s => s.loadFromS3);
    const saveToS3 = useI18nStore(s => s.saveToS3);
    const resetChanges = useI18nStore(s => s.resetChanges);
    const updateValue = useI18nStore(s => s.updateValue);
    const addKey = useI18nStore(s => s.addKey);
    const deleteKey = useI18nStore(s => s.deleteKey);
    const isLoading = useI18nStore(s => s.isLoading);
    const isSaving = useI18nStore(s => s.isSaving);
    const error = useI18nStore(s => s.error);
    const isDirty = useI18nStore(s => s.isDirty);
    const editedEn = useI18nStore(s => s.editedEn);
    const editedKo = useI18nStore(s => s.editedKo);
    const originalEn = useI18nStore(s => s.originalEn);
    const originalKo = useI18nStore(s => s.originalKo);

    const [searchQuery, setSearchQuery] = useState('');

    // Load translations when namespace changes
    useEffect(() => {
        if (isS3Configured()) {
            loadFromS3();
        }
    }, [namespace, loadFromS3]);

    const handleNamespaceChange = useCallback(
        (ns: I18nNamespace) => {
            if (isDirty()) {
                const confirmed = window.confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?');
                if (!confirmed) return;
            }
            setNamespace(ns);
        },
        [isDirty, setNamespace]
    );

    const handleSave = useCallback(async () => {
        await saveToS3();
        toast.success('S3에 저장되었습니다.');
    }, [saveToS3]);

    const handleReset = useCallback(() => {
        const confirmed = window.confirm('변경사항을 모두 되돌리시겠습니까?');
        if (confirmed) resetChanges();
    }, [resetChanges]);

    if (!isS3Configured()) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
                <AlertTriangle className="h-12 w-12 text-yellow-500" />
                <h2 className="text-lg font-semibold">S3 설정 필요</h2>
                <p className="text-muted-foreground text-center max-w-md">
                    VITE_I18N_BUCKET_URL 환경변수를 설정해주세요.
                    <br />
                    예:{' '}
                    <code className="text-xs bg-muted px-1 rounded">
                        https://bucket.s3.ap-northeast-2.amazonaws.com/i18n
                    </code>
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 h-[calc(100vh-theme(spacing.14)-theme(spacing.12))]">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-foreground">번역 관리</h1>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleReset} disabled={!isDirty() || isSaving}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        되돌리기
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={!isDirty() || isSaving}>
                        {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5 mr-1" />
                        )}
                        S3에 저장
                    </Button>
                </div>
            </div>

            {/* Namespace tabs + Search */}
            <div className="flex items-end justify-between gap-4">
                <NamespaceSelector selected={namespace} onChange={handleNamespaceChange} />
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="키 또는 값 검색..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 w-64 text-sm"
                    />
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={loadFromS3} className="ml-auto h-7">
                        재시도
                    </Button>
                </div>
            )}

            {/* Main content: Editor + Preview */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">로딩 중...</span>
                </div>
            ) : (
                <div className="flex gap-4 flex-1 min-h-0">
                    {/* Left: Translation Editor */}
                    <div className="flex-1 min-w-0">
                        <TranslationEditor
                            editedEn={editedEn}
                            editedKo={editedKo}
                            originalEn={originalEn}
                            originalKo={originalKo}
                            onUpdateValue={updateValue}
                            onAddKey={addKey}
                            onDeleteKey={deleteKey}
                            searchQuery={searchQuery}
                        />
                    </div>

                    {/* Right: Web Preview */}
                    <div className="w-[420px] shrink-0">
                        <WebPreview
                            namespace={namespace}
                            editedEn={editedEn}
                            editedKo={editedKo}
                            onKeySearch={setSearchQuery}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
