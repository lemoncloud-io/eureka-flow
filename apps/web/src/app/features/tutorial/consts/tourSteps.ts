import type { DriveStep } from 'driver.js';
import type { TFunction } from 'i18next';

export const TOUR_STORAGE_KEY = 'eureka-flow-tour-completed';

export const createTourSteps = (t: TFunction): DriveStep[] => [
    {
        popover: {
            title: t('flows:tour.steps.welcome.title'),
            description: t('flows:tour.steps.welcome.description'),
            side: 'over',
            align: 'center',
        },
    },
    {
        element: '[data-tour="sidebar"]',
        popover: {
            title: t('flows:tour.steps.sidebar.title'),
            description: t('flows:tour.steps.sidebar.description'),
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '[data-tour="canvas"]',
        popover: {
            title: t('flows:tour.steps.canvas.title'),
            description: t('flows:tour.steps.canvas.description'),
            side: 'over',
            align: 'center',
        },
    },
    {
        element: '[data-tour="header-left"]',
        popover: {
            title: t('flows:tour.steps.header.title'),
            description: t('flows:tour.steps.header.description'),
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="header-toolbar"]',
        popover: {
            title: t('flows:tour.steps.toolbar.title'),
            description: t('flows:tour.steps.toolbar.description'),
            side: 'bottom',
            align: 'end',
        },
    },
    {
        element: '[data-tour="header-menu"]',
        popover: {
            title: t('flows:tour.steps.menu.title'),
            description: t('flows:tour.steps.menu.description'),
            side: 'bottom',
            align: 'end',
        },
    },
    {
        popover: {
            title: t('flows:tour.steps.finish.title'),
            description: t('flows:tour.steps.finish.description'),
            side: 'over',
            align: 'center',
        },
    },
];
