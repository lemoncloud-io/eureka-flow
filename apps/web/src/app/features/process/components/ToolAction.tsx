import { useTranslation } from 'react-i18next';

import { ExternalLink, Maximize2, Play } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { useToolUrl } from '../hooks/useToolUrl';

import type { ToolContext } from '@flows/flows';

interface ToolActionProps {
    toolId: string;
    context: ToolContext;
    onEmbed: (url: string) => void;
}

export const ToolAction = ({ toolId, context, onEmbed }: ToolActionProps) => {
    const { t } = useTranslation();
    const { tool, url } = useToolUrl(toolId, context);

    if (!tool) return null;

    const handleClick = () => {
        if (tool.stereo === 'link' && url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else if (tool.stereo === 'embed' && url) {
            onEmbed(url);
        }
    };

    const isFlow = tool.stereo === 'flow';
    const Icon = tool.stereo === 'embed' ? Maximize2 : tool.stereo === 'flow' ? Play : ExternalLink;

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={isFlow}
            className="gap-1.5"
            title={isFlow ? t('navigator.flowToolPhase7', 'Flow execution — Phase 7') : undefined}
        >
            <Icon className="h-3.5 w-3.5" />
            {tool.actionLabel}
        </Button>
    );
};
