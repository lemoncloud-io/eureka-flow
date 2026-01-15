import { useTranslation } from 'react-i18next';

/**
 * Loading state fallback component
 * Used for Suspense boundaries and loading states
 */
export const LoadingFallback = () => {
    const { t } = useTranslation(['common']);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">{t('common:status.loading')}</span>
            </div>
        </div>
    );
};
