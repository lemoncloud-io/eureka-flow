import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Compass, Plus } from 'lucide-react';

import { Button, Card, CardContent } from '@flows/ui-kit';

interface EmptyStateProps {
    onTrySample: () => void;
    isLoading?: boolean;
}

export const EmptyState = ({ onTrySample, isLoading }: EmptyStateProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-5 p-8 text-center sm:p-10">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Compass className="h-7 w-7 text-primary" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold tracking-tight">
                        {t('navigator.emptyTitle', 'No items yet')}
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                        {t(
                            'navigator.emptyDescription',
                            'Start with a sample workflow to see how Navigator works, or create your own process.'
                        )}
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={onTrySample} disabled={isLoading} className="gap-2">
                        {isLoading
                            ? t('navigator.creating', 'Creating...')
                            : t('navigator.trySample', 'Try Sample Workflow')}
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/processes')} className="gap-2">
                        <Plus className="h-4 w-4" />
                        {t('navigator.createProcess', 'Create Process')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
