import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { TOUR_STORAGE_KEY, createTourSteps } from '../consts/tourSteps';
import { TUTORIAL_STORAGE_KEY } from '../consts/tutorialSteps';

const TOUR_START_DELAY_MS = 800;

export const useTour = () => {
    const { t } = useTranslation(['flows']);
    const driverRef = useRef<{ destroy: () => void } | null>(null);

    const startTour = useCallback(async () => {
        const { driver } = await import('driver.js');
        await import('driver.js/dist/driver.css');

        const steps = createTourSteps(t);

        const driverInstance = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            overlayColor: 'rgba(0, 0, 0, 0.6)',
            stagePadding: 8,
            stageRadius: 12,
            popoverClass: 'eureka-tour-popover',
            nextBtnText: t('flows:tour.next'),
            prevBtnText: t('flows:tour.prev'),
            doneBtnText: t('flows:tour.done'),
            progressText: t('flows:tour.progress'),
            steps,
            onDestroyStarted: () => {
                localStorage.setItem(TOUR_STORAGE_KEY, 'true');
                driverInstance.destroy();
                driverRef.current = null;
            },
        });

        driverRef.current = driverInstance;
        driverInstance.drive();
    }, [t]);

    const startTourIfFirstVisit = useCallback(() => {
        if (localStorage.getItem(TOUR_STORAGE_KEY) === 'true') return;
        if (localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true') return;

        const timer = setTimeout(() => {
            startTour();
        }, TOUR_START_DELAY_MS);

        return () => clearTimeout(timer);
    }, [startTour]);

    useEffect(() => {
        return () => {
            driverRef.current?.destroy();
        };
    }, []);

    return { startTour, startTourIfFirstVisit };
};
