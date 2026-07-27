import { FileText, LayoutGrid } from 'lucide-react';

import { LottieConfetti } from '../components/tour-visuals/LottieConfetti';
import { MenuPreview } from '../components/tour-visuals/MenuPreview';
import { ShortcutGrid } from '../components/tour-visuals/ShortcutGrid';
import { TourStepIcon } from '../components/tour-visuals/TourStepIcon';

import type { TourStep } from '../types/tour';
import type { TFunction } from 'i18next';

export const GUIDE_TOUR_STORAGE_KEY = 'eureka-flow-guide-tour-completed';

export const createGuideTourSteps = (t: TFunction): TourStep[] => [
    {
        id: 'welcome',
        title: t('tutorial:guideTour.welcome.title'),
        description: t('tutorial:guideTour.welcome.description'),
        arrowDirection: 'none',
        visual: { type: 'logo' },
        showSecondary: false,
    },
    {
        id: 'block-library',
        title: t('tutorial:guideTour.blockLibrary.title'),
        description: t('tutorial:guideTour.blockLibrary.description'),
        targetSelector: '[data-tour="sidebar"]',
        arrowDirection: 'left',
        visual: {
            type: 'icon',
            element: (
                <TourStepIcon icon={<LayoutGrid size={28} />} label={t('tutorial:guideTour.blockLibrary.iconLabel')} />
            ),
        },
    },
    {
        id: 'flow-info',
        title: t('tutorial:guideTour.flowInfo.title'),
        description: t('tutorial:guideTour.flowInfo.description'),
        targetSelector: '[data-tour="header-left"]',
        arrowDirection: 'top',
        visual: {
            type: 'icon',
            element: <TourStepIcon icon={<FileText size={28} />} label={t('tutorial:guideTour.flowInfo.iconLabel')} />,
        },
    },
    {
        id: 'quick-actions',
        title: t('tutorial:guideTour.quickActions.title'),
        description: t('tutorial:guideTour.quickActions.description'),
        targetSelector: '[data-tour="header-toolbar"]',
        arrowDirection: 'top',
        visual: { type: 'icon', element: <ShortcutGrid /> },
    },
    {
        id: 'main-menu',
        title: t('tutorial:guideTour.mainMenu.title'),
        description: t('tutorial:guideTour.mainMenu.description'),
        targetSelector: '[data-tour="header-menu"]',
        arrowDirection: 'top',
        visual: { type: 'icon', element: <MenuPreview /> },
    },
    {
        id: 'ready',
        title: t('tutorial:guideTour.ready.title'),
        description: t('tutorial:guideTour.ready.description'),
        arrowDirection: 'none',
        visual: { type: 'icon', element: <LottieConfetti /> },
        primaryLabel: t('tutorial:cta.start'),
    },
];
