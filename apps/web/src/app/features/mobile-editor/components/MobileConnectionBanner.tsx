import { useTranslation } from 'react-i18next';

import { Link2, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface MobileConnectionBannerProps {
    sourceNodeName: string;
    sourcePortName: string;
    onCancel: () => void;
}

export const MobileConnectionBanner = ({ sourceNodeName, sourcePortName, onCancel }: MobileConnectionBannerProps) => {
    const { t } = useTranslation(['flows']);

    return (
        <div
            className={cn(
                'fixed top-[calc(env(safe-area-inset-top)+56px)] left-0 right-0 z-40',
                'bg-primary/95 text-primary-foreground backdrop-blur-sm',
                'px-4 py-3 flex items-center gap-3',
                'animate-in slide-in-from-top-2 duration-200'
            )}
        >
            <Link2 className="w-4 h-4 shrink-0 animate-pulse" />
            <span className="text-sm flex-1 truncate">
                {t('mobile.connectionMode.selectTarget', 'Tap an input port to connect from')}{' '}
                <strong>
                    {sourceNodeName} &rsaquo; {sourcePortName}
                </strong>
            </span>
            <button
                onClick={onCancel}
                className="p-1.5 rounded-lg hover:bg-primary-foreground/20 transition-colors shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};
