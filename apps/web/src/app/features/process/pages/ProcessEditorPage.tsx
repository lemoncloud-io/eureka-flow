import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { GitBranch } from 'lucide-react';

export const ProcessEditorPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <GitBranch className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.processEditor', 'Process Editor')}</h1>
            </div>
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <p className="text-lg text-muted-foreground">
                    {t('navigator.processEditorPlaceholder', 'Process Editor — coming in Phase 6')}
                </p>
                <p className="mt-2 text-sm text-muted-foreground/60">Process ID: {id}</p>
            </div>
        </div>
    );
};
