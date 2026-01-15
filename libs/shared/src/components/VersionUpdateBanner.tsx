import { RefreshCw, X } from 'lucide-react';

import { Button, cn } from '@flows/ui-kit';

export interface VersionUpdateBannerProps {
    isVisible: boolean;
    currentVersion: string;
    latestVersion: string | null;
    onDismiss: () => void;
    className?: string;
}

export const VersionUpdateBanner = ({
    isVisible,
    currentVersion,
    latestVersion,
    onDismiss,
    className,
}: VersionUpdateBannerProps): JSX.Element | null => {
    if (!isVisible) {
        return null;
    }

    return (
        <div
            className={cn('fixed left-0 right-0 top-0 z-[60] animate-in slide-in-from-top p-4 duration-300', className)}
        >
            <div className="mx-auto max-w-2xl rounded-lg border border-border bg-background p-4 shadow-lg">
                <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
                        <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-foreground">새 버전이 있습니다</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                            새 버전({latestVersion})이 출시되었습니다. 현재 버전: {currentVersion}
                        </p>
                        <div className="mt-3 flex gap-2">
                            <Button
                                size="sm"
                                onClick={() => window.location.reload()}
                                className="bg-orange-500 text-white hover:bg-orange-600"
                            >
                                <RefreshCw className="mr-2 h-3 w-3" />
                                새로고침
                            </Button>
                            <Button size="sm" variant="outline" onClick={onDismiss}>
                                나중에
                            </Button>
                        </div>
                    </div>
                    <button onClick={onDismiss} className="shrink-0 rounded-md p-1 hover:bg-muted" aria-label="닫기">
                        <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
            </div>
        </div>
    );
};
