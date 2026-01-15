import { useTranslation } from 'react-i18next';

import { Maximize, Minus, Plus, RotateCcw } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button } from '@flows/ui-kit';

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
                'flex items-center gap-1 bg-popover/90 backdrop-blur-sm border border-border rounded-lg p-1 shadow-lg',
                className
            )}
        >
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut} title={t('canvas.zoomOut')}>
                <Minus className="h-4 w-4" />
            </Button>

            <div className="min-w-[60px] text-center text-xs font-mono text-muted-foreground select-none">
                {Math.round(zoom * 100)}%
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn} title={t('canvas.zoomIn')}>
                <Plus className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-border mx-1" />

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onFitToScreen}
                title={t('canvas.fitToScreen')}
            >
                <Maximize className="h-4 w-4" />
            </Button>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onReset} title={t('canvas.resetView')}>
                <RotateCcw className="h-4 w-4" />
            </Button>
        </div>
    );
};
