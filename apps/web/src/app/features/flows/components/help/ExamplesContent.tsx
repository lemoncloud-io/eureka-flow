import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Play, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@flows/lib/utils';

import type { WorkflowTemplate } from './types';

// Template definitions with workflow data
const TEMPLATES: WorkflowTemplate[] = [
    {
        id: 'hello-world',
        nameKey: 'helloWorld',
        category: 'gettingStarted',
        difficulty: 'beginner',
        nodes: [
            {
                id: 'input-1',
                type: 'user-text-input',
                position: { x: 100, y: 200 },
                data: { label: 'User Input' },
            },
            {
                id: 'preview-1',
                type: 'preview',
                position: { x: 400, y: 200 },
                data: { label: 'Preview' },
            },
        ],
        edges: [
            {
                id: 'e1',
                source: 'input-1',
                target: 'preview-1',
                sourceHandle: 'out',
                targetHandle: 'in',
            },
        ],
    },
    {
        id: 'text-transform',
        nameKey: 'textTransform',
        category: 'textProcessing',
        difficulty: 'beginner',
        nodes: [
            {
                id: 'input-1',
                type: 'user-text-input',
                position: { x: 100, y: 200 },
                data: { label: 'User Input' },
            },
            {
                id: 'transform-1',
                type: 'text-transform',
                position: { x: 350, y: 200 },
                data: { label: 'Transform', config: { mode: 'uppercase' } },
            },
            {
                id: 'preview-1',
                type: 'preview',
                position: { x: 600, y: 200 },
                data: { label: 'Preview' },
            },
        ],
        edges: [
            {
                id: 'e1',
                source: 'input-1',
                target: 'transform-1',
                sourceHandle: 'out',
                targetHandle: 'text',
            },
            {
                id: 'e2',
                source: 'transform-1',
                target: 'preview-1',
                sourceHandle: 'result',
                targetHandle: 'in',
            },
        ],
    },
    {
        id: 'delayed-output',
        nameKey: 'delayedOutput',
        category: 'gettingStarted',
        difficulty: 'intermediate',
        nodes: [
            {
                id: 'input-1',
                type: 'user-text-input',
                position: { x: 100, y: 200 },
                data: { label: 'User Input' },
            },
            {
                id: 'buffer-1',
                type: 'buffer-delay',
                position: { x: 350, y: 200 },
                data: { label: 'Delay 2s', config: { delay: 2000 } },
            },
            {
                id: 'preview-1',
                type: 'preview',
                position: { x: 600, y: 200 },
                data: { label: 'Preview' },
            },
        ],
        edges: [
            {
                id: 'e1',
                source: 'input-1',
                target: 'buffer-1',
                sourceHandle: 'out',
                targetHandle: 'in',
            },
            {
                id: 'e2',
                source: 'buffer-1',
                target: 'preview-1',
                sourceHandle: 'out',
                targetHandle: 'in',
            },
        ],
    },
];

const CATEGORIES = ['all', 'gettingStarted', 'textProcessing'] as const;

interface TemplateCardProps {
    template: WorkflowTemplate;
}

const TemplateCard = ({ template }: TemplateCardProps) => {
    const { t } = useTranslation(['flows']);

    const difficultyColors = {
        beginner: 'bg-green-500/10 text-green-600',
        intermediate: 'bg-yellow-500/10 text-yellow-600',
        advanced: 'bg-red-500/10 text-red-600',
    };

    const handleUseTemplate = () => {
        toast.info(t('flows:help.examples.comingSoon'));
    };

    return (
        <div
            className={cn(
                'p-4 rounded-lg border border-border',
                'hover:border-primary/50 hover:bg-muted/30 transition-colors'
            )}
        >
            <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium">{t(`flows:help.examples.templates.${template.nameKey}.name`)}</h3>
                <span className={cn('text-xs px-2 py-0.5 rounded-full', difficultyColors[template.difficulty])}>
                    {t(`flows:help.examples.difficulty.${template.difficulty}`)}
                </span>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
                {t(`flows:help.examples.templates.${template.nameKey}.description`)}
            </p>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{template.nodes.length} blocks</span>
                    <span>•</span>
                    <span>{template.edges.length} connections</span>
                </div>

                <button
                    onClick={handleUseTemplate}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-sm',
                        'bg-primary text-primary-foreground rounded-md',
                        'hover:bg-primary/90 transition-colors'
                    )}
                >
                    <Play className="w-3.5 h-3.5" />
                    {t('flows:help.examples.useTemplate')}
                </button>
            </div>
        </div>
    );
};

export const ExamplesContent = () => {
    const { t } = useTranslation(['flows']);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const filteredTemplates = TEMPLATES.filter(
        template => selectedCategory === 'all' || template.category === selectedCategory
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="w-4 h-4" />
                <p className="text-sm">{t('flows:help.examples.description')}</p>
            </div>

            <div className="flex gap-1">
                {CATEGORIES.map(category => (
                    <button
                        key={category}
                        onClick={() => setSelectedCategory(category)}
                        className={cn(
                            'px-3 py-1.5 text-xs rounded-md transition-colors',
                            selectedCategory === category
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/50 hover:bg-muted'
                        )}
                    >
                        {t(`flows:help.examples.categories.${category}`)}
                    </button>
                ))}
            </div>

            <div className="grid gap-3">
                {filteredTemplates.map(template => (
                    <TemplateCard key={template.id} template={template} />
                ))}
            </div>
        </div>
    );
};
