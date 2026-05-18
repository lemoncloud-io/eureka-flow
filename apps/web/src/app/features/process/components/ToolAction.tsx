import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Check, CheckCircle2, ExternalLink, Loader2, Maximize2, Play, RotateCcw } from 'lucide-react';

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
    onFlowReset?: () => void;
}

const STEREO_LABELS: Record<string, string> = {
    link: 'External Link',
    embed: 'Embedded Tool',
    flow: 'Automation',
};

export const ToolAction = ({ toolId, context, onEmbed, onFlowExecute, flowState, onFlowReset }: ToolActionProps) => {
    const { t } = useTranslation();
    const { tool, url } = useToolUrl(toolId, context);
    const [opened, setOpened] = useState(false);

    if (!tool) return null;

    const isFlow = tool.stereo === 'flow';
    const isFlowRunning = isFlow && (flowState?.status === 'loading' || flowState?.status === 'running');
    const isFlowDone = isFlow && flowState?.status === 'completed';
    const isFlowError = isFlow && flowState?.status === 'error';
    const flowId = tool.flowRef?.flowId;

    const handleClick = () => {
        if (tool.stereo === 'link' && url) {
            window.open(url, '_blank', 'noopener,noreferrer');
            setOpened(true);
        } else if (tool.stereo === 'embed' && url) {
            onEmbed(url);
            setOpened(true);
        } else if (isFlow && flowId && onFlowExecute) {
            onFlowExecute(flowId);
        }
    };

    const Icon = isFlowRunning
        ? Loader2
        : !isFlow && opened
          ? Check
          : tool.stereo === 'embed'
            ? Maximize2
            : isFlow
              ? Play
              : ExternalLink;
    const isDisabled = isFlow && (!flowId || isFlowRunning);
    const stereoLabel = STEREO_LABELS[tool.stereo] ?? tool.stereo;

    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <Icon
                            className={`h-4 w-4 shrink-0 ${isFlowRunning ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
                        />
                        <span className="text-sm font-medium truncate">{tool.name}</span>
                        <span className="text-[10px] text-muted-foreground">{stereoLabel}</span>
                    </div>
                    {url && !isFlow && <p className="mt-0.5 truncate text-xs text-muted-foreground/60 pl-6">{url}</p>}
                    {tool.memo && <p className="mt-0.5 truncate text-xs text-muted-foreground pl-6">{tool.memo}</p>}
                </div>
                <Button
                    variant={isFlowDone || (!isFlow && opened) ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={handleClick}
                    disabled={isDisabled}
                    className="shrink-0 gap-1.5"
                    title={isFlow && !flowId ? t('navigator.noFlowRef', 'No flow connected') : undefined}
                >
                    {isFlowRunning
                        ? t('navigator.running', 'Running...')
                        : isFlowDone
                          ? t('navigator.completed', 'Done')
                          : !isFlow && opened
                            ? t('navigator.openAgain', 'Open again')
                            : tool.actionLabel || t('navigator.open', 'Open')}
                </Button>
            </div>

            {/* Flow execution feedback */}
            {isFlowDone && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-green-50 px-2.5 py-1.5 dark:bg-green-500/5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="flex-1 text-xs text-green-700 dark:text-green-400">
                        {t('navigator.flowCompleted', 'Automation completed successfully')}
                    </span>
                    {onFlowReset && (
                        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={onFlowReset}>
                            <RotateCcw className="mr-1 h-3 w-3" />
                            {t('navigator.runAgain', 'Run again')}
                        </Button>
                    )}
                </div>
            )}
            {isFlowError && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-red-50 px-2.5 py-1.5 dark:bg-red-500/5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    <span className="flex-1 text-xs text-red-700 dark:text-red-400">
                        {flowState?.error || t('navigator.flowError', 'Automation failed')}
                    </span>
                    {onFlowReset && (
                        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={onFlowReset}>
                            <RotateCcw className="mr-1 h-3 w-3" />
                            {t('navigator.retry', 'Retry')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};
