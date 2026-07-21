import { useTranslation } from 'react-i18next';

import { AlertTriangle, LayoutGrid, RefreshCw } from 'lucide-react';

import { Button, Card, CardContent } from '@flows/ui-kit';

import type { LucideIcon } from 'lucide-react';

interface PlaceholderProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: React.ReactNode;
    tone?: 'muted' | 'danger';
}

const Placeholder = ({ icon: Icon, title, description, action, tone = 'muted' }: PlaceholderProps) => (
    <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center sm:p-10">
            <div
                className={
                    tone === 'danger'
                        ? 'flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10'
                        : 'flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10'
                }
            >
                <Icon className={tone === 'danger' ? 'h-7 w-7 text-destructive' : 'h-7 w-7 text-primary'} />
            </div>
            <div>
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
            {action}
        </CardContent>
    </Card>
);

/**
 * Shown when no Apps are published.
 *
 * No call to action: flow cannot create an App — an App is produced by the Injection
 * pipeline and owned by codes (see `CONTEXT.md`). Offering a "create" button here would
 * promise something this app cannot do.
 */
export const AppsEmptyState = () => {
    const { t } = useTranslation();

    return (
        <Placeholder
            icon={LayoutGrid}
            title={t('apps.empty', 'No apps published yet')}
            description={t('apps.emptyDescription', 'Published apps will appear here.')}
        />
    );
};

/** Shown when the list request fails. */
export const AppsErrorState = ({ onRetry }: { onRetry: () => void }) => {
    const { t } = useTranslation();

    return (
        <Placeholder
            tone="danger"
            icon={AlertTriangle}
            title={t('apps.loadFailed', "Couldn't load apps")}
            description={t('apps.loadFailedDescription', 'Something went wrong while fetching the list.')}
            action={
                <Button variant="outline" size="sm" onClick={onRetry} className="h-8 gap-1.5 rounded-xl text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('actions.retry', 'Retry')}
                </Button>
            }
        />
    );
};
