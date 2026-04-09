import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { TOUR_STORAGE_KEY, createBaseDriverConfig, createTourSteps, importDriver } from '../consts/tourSteps';
import { TUTORIAL_STORAGE_KEY } from '../consts/tutorialSteps';

const TOUR_START_DELAY_MS = 800;

export const useTour = () => {
    const { t } = useTranslation(['flows']);
    const driverRef = useRef<{ destroy: () => void } | null>(null);

    const startTour = useCallback(async () => {
        const driver = await importDriver();

        const driverInstance = driver({
            ...createBaseDriverConfig(t),
            steps: createTourSteps(t),
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
