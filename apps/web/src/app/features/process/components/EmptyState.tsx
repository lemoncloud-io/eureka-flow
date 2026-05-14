import { useTranslation } from 'react-i18next';

import { Compass } from 'lucide-react';

import { Button, Card, CardContent } from '@flows/ui-kit';

interface EmptyStateProps {
    onTrySample: () => void;
    isLoading?: boolean;
}

export const EmptyState = ({ onTrySample, isLoading }: EmptyStateProps) => {
    const { t } = useTranslation();

    return (
        <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                <Compass className="h-12 w-12 text-muted-foreground/40" />
                <div>
                    <h3 className="text-lg font-medium">{t('navigator.emptyTitle', 'No items yet')}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('navigator.emptyDescription', 'Try a sample workflow to see how Navigator works.')}
                    </p>
                </div>
                <Button onClick={onTrySample} disabled={isLoading}>
                    {isLoading
                        ? t('navigator.creating', 'Creating...')
                        : t('navigator.trySample', 'Try Sample Workflow')}
                </Button>
            </CardContent>
        </Card>
    );
};
