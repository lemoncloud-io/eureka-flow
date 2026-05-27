import { useTranslation } from 'react-i18next';

import { Smartphone } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { disableDesktopOverride, hasDesktopOverride, useIsMobileDevice } from '../../mobile-editor/hooks';

/**
 * Bottom CTA that switches back to the mobile editor.
 * Shown only when a mobile-sized device is forcing the desktop view via `?desktop=1`.
 */
export const DesktopMobileSwitchCta = () => {
    const { t } = useTranslation(['flows']);
    const isMobileDevice = useIsMobileDevice();

    if (!isMobileDevice || !hasDesktopOverride()) return null;

    return (
        <button
            onClick={disableDesktopOverride}
            className={cn(
                'fixed left-1/2 -translate-x-1/2 z-40',
                'bottom-[calc(1rem+env(safe-area-inset-bottom))]',
                'flex items-center gap-2 px-4 h-11 rounded-full',
                'bg-primary text-primary-foreground shadow-floating',
                'text-sm font-semibold',
                'active:scale-[0.98] transition-transform'
            )}
        >
            <Smartphone className="w-4 h-4" />
            {t('mobile.switchToMobile', '모바일 버전 보기')}
        </button>
    );
};
