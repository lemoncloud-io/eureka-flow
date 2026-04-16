import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pencil } from 'lucide-react';

import { DEFAULT_TEXTAREA_HEIGHT, clampHeight, getNodeHeight } from '@flows/flows';

import type { EditableVisualizationProps } from './types';

export const InputTextVisualizationEditable: React.FC<EditableVisualizationProps> = ({ node, onConfigChange }) => {
    const { t } = useTranslation(['nodes']);
    const [isEditing, setIsEditing] = useState(false);
    const [localHeight, setLocalHeight] = useState<number | undefined>(undefined);
    const heightRef = useRef<number>(0);
    // Server uses 'value' key for input-text config
    const text = (node.config?.text as string) || '';
    const savedHeight = getNodeHeight(node);

    // Initialize height from saved value
    const currentHeight = localHeight ?? savedHeight ?? DEFAULT_TEXTAREA_HEIGHT;

    // Handle drag resize
    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startHeight = currentHeight;
        heightRef.current = currentHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientY - startY;
            const newHeight = clampHeight(startHeight + delta);
            heightRef.current = newHeight;
            setLocalHeight(newHeight);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            // Save height at node level (not in config)
            if (heightRef.current !== savedHeight) {
                onConfigChange('height', heightRef.current);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    if (isEditing) {
        return (
            <div
                className="flex flex-col"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
            >
                <textarea
                    autoFocus
                    className="w-full p-2.5 bg-background/80 border border-primary/50 rounded-t-lg text-xs resize-none font-mono focus:outline-none focus:border-primary text-foreground"
                    style={{
                        height: `${currentHeight}px`,
                    }}
                    value={text}
                    onChange={e => onConfigChange('text', e.target.value)}
                    onBlur={e => {
                        // Don't close if clicking resize handle
                        if (e.relatedTarget?.closest('.resize-handle')) return;
                        setIsEditing(false);
                    }}
                    onKeyDown={e => {
                        // Allow Enter for newlines, Escape to exit
                        if (e.key === 'Escape') {
                            setIsEditing(false);
                        }
                        e.stopPropagation();
                    }}
                    placeholder={t('visualization.enterText')}
                />
                {/* Resize handle bar */}
                <div
                    className="resize-handle h-3 bg-primary/10 hover:bg-primary/20 border border-t-0 border-primary/50 rounded-b-lg cursor-ns-resize flex items-center justify-center transition-colors"
                    onMouseDown={handleResizeStart}
                    tabIndex={-1}
                >
                    <div className="w-8 h-1 bg-primary/30 rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div
            className="p-2.5 bg-muted/30 rounded-lg border border-border hover:border-primary/40 cursor-text transition-all group overflow-hidden"
            style={{
                minHeight: savedHeight ? `${savedHeight}px` : undefined,
            }}
            onClick={e => {
                e.stopPropagation();
                setIsEditing(true);
            }}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
            title={t('visualization.clickToEdit')}
        >
            <div className="text-[9px] text-muted-foreground/60 mb-1 uppercase tracking-wider font-medium flex items-center gap-1">
                <Pencil className="w-2.5 h-2.5" />
                {t('visualization.value')}
            </div>
            <div
                className="text-xs text-foreground/70 font-mono whitespace-pre-wrap break-all group-hover:text-foreground/90 transition-colors"
                style={{
                    maxHeight: savedHeight ? `${savedHeight - 30}px` : '60px',
                    overflow: 'hidden',
                }}
                title={text}
            >
                {text ? (
                    <span>"{text}"</span>
                ) : (
                    <span className="text-muted-foreground/50 italic">{t('visualization.clickToAddText')}</span>
                )}
            </div>
        </div>
    );
};
