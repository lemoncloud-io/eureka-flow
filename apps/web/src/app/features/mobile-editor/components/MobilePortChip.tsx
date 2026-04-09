import { useCallback, useEffect, useRef, useState } from 'react';

import { Unlink } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import { getPortStyleKey } from '../../flows/utils';

import type { PortStyleKey } from '../../flows/utils';

const PORT_TYPE_COLORS: Record<PortStyleKey, string> = {
    text: 'border-port-type-text/60 bg-port-type-text/10 text-port-type-text',
    image: 'border-port-type-image/60 bg-port-type-image/10 text-port-type-image',
    number: 'border-port-type-number/60 bg-port-type-number/10 text-port-type-number',
    json: 'border-port-type-json/60 bg-port-type-json/10 text-port-type-json',
    any: 'border-port-type-any/60 bg-port-type-any/10 text-port-type-any',
};

interface MobilePortChipProps {
    portId: string;
    portName: string;
    portDataType: string;
    direction: 'input' | 'output';
    connectedNodeName: string | null;
    connectionId: string | null;
    isConnectionMode: boolean;
    isCompatible: boolean;
    isSource: boolean;
    onTap: () => void;
    onDisconnect?: (connectionId: string) => void;
}

export const MobilePortChip = ({
    portId,
    portName,
    portDataType,
    direction,
    connectedNodeName,
    connectionId,
    isConnectionMode,
    isCompatible,
    isSource,
    onTap,
    onDisconnect,
}: MobilePortChipProps) => {
    const [showDisconnect, setShowDisconnect] = useState(false);
    const longPressTimer = useRef<number | null>(null);

    const styleKey = getPortStyleKey(portDataType);
    const colors = PORT_TYPE_COLORS[styleKey];

    const handleTouchStart = useCallback(() => {
        if (!connectedNodeName || !connectionId) return;
        longPressTimer.current = window.setTimeout(() => {
            setShowDisconnect(true);
        }, 500);
    }, [connectedNodeName, connectionId]);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
        };
    }, []);

    const handleDisconnect = useCallback(() => {
        if (connectionId && onDisconnect) {
            onDisconnect(connectionId);
        }
        setShowDisconnect(false);
    }, [connectionId, onDisconnect]);

    const isOutputTappable = direction === 'output' && !isConnectionMode;
    const isInputTappable = direction === 'input' && isConnectionMode && isCompatible;
    const isTappable = isOutputTappable || isInputTappable;
    const isDimmed = isConnectionMode && !isCompatible && !isSource && direction === 'input';

    return (
        <div className="relative">
            <button
                onClick={isTappable ? onTap : undefined}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                disabled={!isTappable && isConnectionMode}
                className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs',
                    'transition-all duration-200 min-h-[32px]',
                    colors,
                    isTappable && 'cursor-pointer active:scale-95',
                    isSource && 'ring-2 ring-primary ring-offset-1 animate-pulse',
                    isInputTappable && 'ring-2 ring-accent ring-offset-1 shadow-md',
                    isDimmed && 'opacity-30 pointer-events-none',
                    !isConnectionMode && !connectedNodeName && direction === 'output' && 'border-dashed'
                )}
            >
                <span className="font-medium truncate max-w-[60px]">{portName}</span>
                {connectedNodeName && (
                    <>
                        <span className="text-muted-foreground/60">{direction === 'output' ? '→' : '←'}</span>
                        <span className="truncate max-w-[80px] text-foreground/70">{connectedNodeName}</span>
                    </>
                )}
            </button>

            {/* Disconnect popover */}
            {showDisconnect && (
                <>
                    <div className="fixed inset-0 z-50" onClick={() => setShowDisconnect(false)} />
                    <div
                        className={cn(
                            'absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2',
                            'bg-popover border border-border rounded-lg shadow-lg p-2',
                            'animate-in fade-in zoom-in-95 duration-150',
                            'whitespace-nowrap'
                        )}
                    >
                        <button
                            onClick={handleDisconnect}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        >
                            <Unlink className="w-3.5 h-3.5" />
                            Disconnect
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
