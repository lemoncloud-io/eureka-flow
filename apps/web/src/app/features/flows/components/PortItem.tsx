import React from 'react';
import { useTranslation } from 'react-i18next';

import { Braces, Hash, Image, Sparkles, Type } from 'lucide-react';

import { translateField } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { isMarkdownContent } from '@flows/ui-kit';

import { TooltipContentRenderer } from './TooltipContentRenderer';
import { arePortTypesCompatible, getPortStyleKey } from '../utils';

import type { ConnectionDraftInfo } from '../utils';
import type { DataPacket, PortDefinition } from '@flows/flows';

/** Get icon component for port type. An undeclared type is `any`, as elsewhere. */
export const getPortTypeIcon = (portType = 'any'): React.ElementType | null => {
    switch (portType.toLowerCase()) {
        case 'text':
        case 'string':
            return Type;
        case 'image':
            return Image;
        case 'number':
            return Hash;
        case 'json':
            return Braces;
        case 'any':
            return Sparkles;
        default:
            return null;
    }
};

/**
 * Port type style configuration - single source of truth for all port styling
 * IMPORTANT: Use complete static class names for Tailwind's static analyzer.
 * Dynamic interpolation like `bg-${color}` will NOT be detected at build time.
 */
export const PORT_TYPE_STYLES = {
    text: {
        connected: 'bg-port-text border-port-text',
        disconnected: 'bg-background border-port-text',
        drop: 'border-port-text bg-port-text animate-port-glow-text',
        text: 'text-port-text',
    },
    image: {
        connected: 'bg-port-image border-port-image',
        disconnected: 'bg-background border-port-image',
        drop: 'border-port-image bg-port-image animate-port-glow-image',
        text: 'text-port-image',
    },
    number: {
        connected: 'bg-port-number border-port-number',
        disconnected: 'bg-background border-port-number',
        drop: 'border-port-number bg-port-number animate-port-glow-number',
        text: 'text-port-number',
    },
    json: {
        connected: 'bg-port-json border-port-json',
        disconnected: 'bg-background border-port-json',
        drop: 'border-port-json bg-port-json animate-port-glow-json',
        text: 'text-port-json',
    },
    any: {
        connected: 'bg-port-any border-port-any',
        disconnected: 'bg-background border-port-any',
        drop: 'border-port-any bg-port-any animate-port-glow-any',
        text: 'text-port-any',
    },
} as const;

/** Get Tailwind classes for port type coloring - filled when connected, outline when disconnected */
export const getPortTypeColor = (portType = 'any', isConnected: boolean): string => {
    const style = PORT_TYPE_STYLES[getPortStyleKey(portType)];
    return isConnected ? style.connected : style.disconnected;
};

/** Get Tailwind classes for valid drop target highlighting - matches source port's dataType color */
export const getDropTargetColor = (sourceType = 'any'): string => {
    return PORT_TYPE_STYLES[getPortStyleKey(sourceType)].drop;
};

interface PortItemProps {
    port: PortDefinition;
    type: 'input' | 'output';
    nodeId: string;
    isHighlighted: boolean;
    isConnected: boolean;
    /** Port was just updated via WebSocket */
    isUpdated?: boolean;
    /** Port data value if available */
    portData?: DataPacket | null;
    /** Connection being dragged - for compatibility feedback */
    connectionDraft?: ConnectionDraftInfo | null;
    onMouseDown: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.MouseEvent
    ) => void;
    onMouseUp: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
    onTouchStart?: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.TouchEvent
    ) => void;
    onDoubleClick?: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
}

export const PortItem: React.FC<PortItemProps> = ({
    port,
    type,
    nodeId,
    isHighlighted,
    isConnected,
    isUpdated,
    portData,
    connectionDraft,
    onMouseDown,
    onMouseUp,
    onTouchStart,
    onDoubleClick,
}) => {
    const { t } = useTranslation(['flows', 'blocks']);
    // Determine if this input port is a valid drop target for the current connection draft
    const isDraggingConnection = !!connectionDraft;
    const isInputPort = type === 'input';
    const isSourceNode = connectionDraft?.sourceNodeId === nodeId;

    // Only input ports can be drop targets, and not on the same node
    const isValidDropTarget =
        isDraggingConnection &&
        isInputPort &&
        !isSourceNode &&
        arePortTypesCompatible(connectionDraft.sourceType, port.type);

    const isIncompatibleTarget = isDraggingConnection && isInputPort && !isSourceNode && !isValidDropTarget;

    const portClasses = cn(
        'w-3 h-3 rounded-full border-2 transition-all duration-200',
        // Highlighted state (selected connection) - thicker border only, no ring
        isHighlighted && 'scale-110 border-primary border-[3px] z-20',
        // Updated state (port data just received) - subtle cyan ring
        !isHighlighted && isUpdated && 'scale-110 ring-2 ring-cyan-400 z-20',
        // Valid drop target - uses source port's dataType color with matching glow animation
        !isHighlighted && isValidDropTarget && [getDropTargetColor(connectionDraft.sourceType), 'z-20 cursor-copy'],
        // Incompatible target - dimmed with not-allowed cursor
        !isHighlighted && isIncompatibleTarget && 'opacity-30 cursor-not-allowed',
        // Normal state
        !isHighlighted &&
            !isValidDropTarget &&
            !isIncompatibleTarget &&
            'cursor-crosshair hover:scale-125 hover:ring-2 hover:ring-white/20',
        !isHighlighted && !isValidDropTarget && getPortTypeColor(port.type, isConnected)
    );

    // A port that declares no type accepts anything, which is the same convention the
    // engine's compatibility check uses. Resolved once here so the handlers below take a
    // concrete type rather than each deciding what a missing one means.
    const portType = port.type ?? 'any';
    const PortIcon = getPortTypeIcon(portType);

    const portCircle = (
        <div
            className={cn('relative')}
            data-port-node-id={nodeId}
            data-port-id={port.id}
            data-port-type={type}
            data-port-data-type={port.type}
            onMouseDown={e => {
                e.stopPropagation();
                onMouseDown(nodeId, port.id, type, portType, e);
            }}
            onMouseUp={e => {
                e.stopPropagation();
                onMouseUp(nodeId, port.id, type, portType);
            }}
            onTouchStart={e => {
                e.stopPropagation();
                onTouchStart?.(nodeId, port.id, type, portType, e);
            }}
            onDoubleClick={e => {
                e.stopPropagation();
                onDoubleClick?.(nodeId, port.id, type, portType);
            }}
            onTouchEnd={e => {
                // For output ports, let the event bubble to canvas for connection drop handling
                // Touch events fire touchend on the element where touch STARTED, not where it ended
                if (type === 'output') {
                    // Don't stop propagation - let canvas handle the connection drop
                    return;
                }
                e.stopPropagation();
                onMouseUp(nodeId, port.id, type, portType);
            }}
        >
            {/* Extended hit area - transparent 24x24px */}
            <div
                className={cn('absolute -inset-1.5', isIncompatibleTarget ? 'cursor-not-allowed' : 'cursor-crosshair')}
            />
            {/* Visual port circle */}
            <div className={portClasses} />
        </div>
    );

    // Tooltip positioning: input ports show tooltip to LEFT, output ports show tooltip to RIGHT
    // This prevents tooltip from visually covering the port, making drag operations easier
    const hasRichContent =
        portData &&
        (portData.type === 'json' ||
            portData.type === 'markdown' ||
            (portData.value !== null && typeof portData.value === 'object') ||
            isMarkdownContent(portData.value));

    // Horizontal positioning based on port type
    const horizontalPosition = isInputPort
        ? 'right-full mr-2' // Input ports: tooltip to the left
        : 'left-full ml-2'; // Output ports: tooltip to the right

    // Width constraints based on content type
    const widthConstraint =
        !portData || portData.type === 'image'
            ? 'whitespace-nowrap'
            : hasRichContent
              ? 'min-w-[150px] max-w-[400px]'
              : 'min-w-[100px] max-w-[400px]';

    return (
        <div className="relative group flex items-center justify-center w-3 h-6">
            {portCircle}

            {/* Tooltip showing port label and data on hover - positioned away from port */}
            <div
                className={cn(
                    'absolute top-1/2 -translate-y-1/2 bg-popover/95 backdrop-blur-sm text-popover-foreground text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none border border-border z-50 shadow-lg transition-opacity duration-150',
                    horizontalPosition,
                    widthConstraint
                )}
            >
                <div className="flex items-center gap-1">
                    {PortIcon && <PortIcon className="w-2.5 h-2.5 shrink-0" />}
                    <span className="font-semibold uppercase tracking-wider">
                        {translateField(t, port, 'label') || port.id}
                    </span>
                </div>
                {portData && (
                    <div className="mt-1 pt-1 border-t border-border/50">
                        <TooltipContentRenderer
                            content={portData.value}
                            type={portData.type}
                            maxHeight={80}
                            collapsed={1}
                            textLimit={100}
                            markdownClassName="text-[10px] [&_h1]:text-xs [&_h2]:text-[11px] [&_h3]:text-[10px] [&_p]:text-[10px] [&_code]:text-[9px]"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
