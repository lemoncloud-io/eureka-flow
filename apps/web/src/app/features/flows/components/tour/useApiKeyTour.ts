import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { TOUR_STORAGE_KEY } from './consts';

const TOUR_START_DELAY_MS = 500;

export const useApiKeyTour = () => {
    const { t } = useTranslation(['flows']);
    const driverRef = useRef<{ destroy: () => void } | null>(null);

    useEffect(() => {
        if (localStorage.getItem(TOUR_STORAGE_KEY) === 'true') return;

        let cancelled = false;

        const timer = setTimeout(async () => {
            const { driver } = await import('driver.js');
            await import('driver.js/dist/driver.css');

            if (cancelled) return;

            const driverInstance = driver({
                showProgress: false,
                showButtons: ['next', 'close'],
                animate: true,
                allowClose: true,
                overlayOpacity: 0,
                stagePadding: 0,
                popoverClass: 'eureka-tour-popover',
                doneBtnText: t('flows:tour.done'),
                steps: [
                    {
                        element: '[data-tour="apikey-dialog"]',
                        popover: {
                            title: t('flows:tour.steps.apiKey.title'),
                            description: t('flows:tour.steps.apiKey.description'),
                            side: 'bottom',
                            align: 'center',
                        },
                    },
                ],
                onDestroyStarted: () => {
                    driverInstance.destroy();
                    driverRef.current = null;
                },
            });

            driverRef.current = driverInstance;
            driverInstance.drive();
        }, TOUR_START_DELAY_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            driverRef.current?.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once on mount; t staleness in 500ms window is acceptable
    }, []);
};
