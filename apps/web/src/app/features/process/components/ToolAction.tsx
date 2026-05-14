import { useTranslation } from 'react-i18next';

import { ExternalLink, Loader2, Maximize2, Play } from 'lucide-react';

import { Button } from '@flows/ui-kit';

import { useToolUrl } from '../hooks/useToolUrl';

import type { FlowExecutionState } from '../hooks/useFlowExecution';
import type { ToolContext } from '@flows/flows';

interface ToolActionProps {
    toolId: string;
    context: ToolContext;
    onEmbed: (url: string) => void;
    onFlowExecute?: (flowId: string) => void;
    flowState?: FlowExecutionState;
}

export const ToolAction = ({ toolId, context, onEmbed, onFlowExecute, flowState }: ToolActionProps) => {
    const { t } = useTranslation();
    const { tool, url } = useToolUrl(toolId, context);

    if (!tool) return null;

    const isFlow = tool.stereo === 'flow';
    const isFlowRunning = isFlow && (flowState?.status === 'loading' || flowState?.status === 'running');
    const flowId = tool.flowRef?.flowId;

    const handleClick = () => {
        if (tool.stereo === 'link' && url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else if (tool.stereo === 'embed' && url) {
            onEmbed(url);
        } else if (isFlow && flowId && onFlowExecute) {
            onFlowExecute(flowId);
        }
    };

    const Icon = isFlowRunning ? Loader2 : tool.stereo === 'embed' ? Maximize2 : isFlow ? Play : ExternalLink;
    const isDisabled = isFlow && (!flowId || isFlowRunning);

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={isDisabled}
            className="gap-1.5"
            title={isFlow && !flowId ? t('navigator.noFlowRef', 'No flow connected') : undefined}
        >
            <Icon className={isFlowRunning ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            {isFlowRunning ? t('navigator.running', 'Running...') : tool.actionLabel}
        </Button>
    );
};
