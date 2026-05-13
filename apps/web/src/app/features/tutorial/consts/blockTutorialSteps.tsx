import React from 'react';

import { Eye, FileInput, HelpCircle, Image, RefreshCw, Search, Type } from 'lucide-react';

import { TourStepIcon } from '../components/tour-visuals/TourStepIcon';

import type { TourStep } from '../types/tour';
import type { TFunction } from 'i18next';

export const BLOCK_TUTORIAL_STORAGE_KEY = 'eureka-flow-block-tutorial-completed';

export const createBlockTutorialSteps = (t: TFunction): TourStep[] => [
    {
        id: 'intro',
        title: t('tutorial:blockTutorial.intro.title'),
        description: t('tutorial:blockTutorial.intro.description'),
        arrowDirection: 'none',
        visual: { type: 'logo' },
        showSecondary: false,
    },
    {
        id: 'input-block',
        title: t('tutorial:blockTutorial.inputBlock.title'),
        description: t('tutorial:blockTutorial.inputBlock.description'),
        targetSelector: '[data-block-category="inputs"]',
        arrowDirection: 'left',
        visual: {
            type: 'icon',
            element: (
                <TourStepIcon icon={<FileInput size={28} />} label={t('tutorial:blockTutorial.inputBlock.iconLabel')} />
            ),
        },
    },
    {
        id: 'input-text',
        title: t('tutorial:blockTutorial.inputText.title'),
        description: t('tutorial:blockTutorial.inputText.description'),
        targetSelector: '[data-block-item="0008"]',
        arrowDirection: 'left',
        visual: {
            type: 'icon',
            element: <TourStepIcon icon={<Type size={28} />} label={t('tutorial:blockTutorial.inputText.iconLabel')} />,
        },
    },
    {
        id: 'process-block',
        title: t('tutorial:blockTutorial.processBlock.title'),
        description: t('tutorial:blockTutorial.processBlock.description'),
        targetSelector: '[data-block-category="process"]',
        arrowDirection: 'left',
        visual: {
            type: 'icon',
            element: (
                <TourStepIcon
                    icon={<RefreshCw size={28} />}
                    label={t('tutorial:blockTutorial.processBlock.iconLabel')}
                />
            ),
        },
    },
    {
        id: 'process-ai-image',
        title: t('tutorial:blockTutorial.processAiImage.title'),
        description: t('tutorial:blockTutorial.processAiImage.description'),
        targetSelector: '[data-block-item="0006"]',
        arrowDirection: 'left',
        visual: {
            type: 'icon',
            element: (
                <TourStepIcon icon={<Image size={28} />} label={t('tutorial:blockTutorial.processAiImage.iconLabel')} />
            ),
        },
    },
    {
        id: 'output-block',
        title: t('tutorial:blockTutorial.outputBlock.title'),
        description: t('tutorial:blockTutorial.outputBlock.description'),
        targetSelector: '[data-block-category="outputs"]',
        arrowDirection: 'left',
        visual: {
            type: 'icon',
            element: (
                <TourStepIcon icon={<Eye size={28} />} label={t('tutorial:blockTutorial.outputBlock.iconLabel')} />
            ),
        },
    },
    {
        id: 'output-preview',
        title: t('tutorial:blockTutorial.outputPreview.title'),
        description: t('tutorial:blockTutorial.outputPreview.description'),
        targetSelector: '[data-block-item="0015"]',
        arrowDirection: 'left',
        visual: {
            type: 'icon',
            element: (
                <TourStepIcon icon={<Search size={28} />} label={t('tutorial:blockTutorial.outputPreview.iconLabel')} />
            ),
        },
    },
    {
        id: 'help',
        title: t('tutorial:blockTutorial.help.title'),
        description: '',
        arrowDirection: 'none',
        visual: {
            type: 'icon',
            element: (
                <TourStepIcon icon={<HelpCircle size={28} />} label={t('tutorial:blockTutorial.help.iconLabel')} />
            ),
        },
        primaryLabel: t('tutorial:cta.done'),
        secondaryLabel: t('tutorial:cta.goToHelp'),
    },
];
