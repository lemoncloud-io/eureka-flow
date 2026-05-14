import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';

import { FileText } from 'lucide-react';

export const ItemDetailPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const stageId = searchParams.get('stage');
    const noteId = searchParams.get('note');

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.itemDetail', 'Item Detail')}</h1>
            </div>
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <p className="text-lg text-muted-foreground">
                    {t('navigator.itemDetailPlaceholder', 'Item Detail — coming in Phase 3')}
                </p>
                <div className="mt-4 space-y-1 text-sm text-muted-foreground/60">
                    <p>Item ID: {id}</p>
                    {stageId && <p>Stage: {stageId}</p>}
                    {noteId && <p>Note: {noteId}</p>}
                </div>
            </div>
        </div>
    );
};
