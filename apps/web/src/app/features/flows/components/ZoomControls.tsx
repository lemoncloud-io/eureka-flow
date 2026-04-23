import { useTranslation } from 'react-i18next';

import { Maximize, Minus, Plus, RotateCcw } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@flows/ui-kit';

interface ZoomControlsProps {
    zoom: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitToScreen: () => void;
    onReset: () => void;
    className?: string;
}

export const ZoomControls = ({ zoom, onZoomIn, onZoomOut, onFitToScreen, onReset, className }: ZoomControlsProps) => {
    const { t } = useTranslation(['flows']);

    return (
        <div
            className={cn(
                'flex items-center gap-1 px-2 py-1.5 rounded-full',
                'bg-glass-bg backdrop-blur-2xl border border-border/40',
                'shadow-floating',
                className
            )}
        >
            <TooltipProvider delayDuration={300}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-accent/50"
                            onClick={onZoomOut}
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                        {t('canvas.zoomOut')}
                    </TooltipContent>
                </Tooltip>

                <div className="min-w-[52px] text-center text-xs font-mono text-muted-foreground select-none px-1">
                    {Math.round(zoom * 100)}%
                </div>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-accent/50"
                            onClick={onZoomIn}
                        >
                            <Plus className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                        {t('canvas.zoomIn')}
                    </TooltipContent>
                </Tooltip>

                <div className="w-px h-5 bg-border/40 mx-1" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-accent/50"
                            onClick={onFitToScreen}
                        >
                            <Maximize className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                        {t('canvas.fitToScreen')}
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-accent/50"
                            onClick={onReset}
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                        {t('canvas.resetView')}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
};
