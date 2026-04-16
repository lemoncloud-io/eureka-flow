import React from 'react';

import { AlertCircle, Check, Loader2 } from 'lucide-react';

import type { PortStyleKey } from '../../flows/utils';

/** Port type → Tailwind dot color class. Shared between MobileStepCard and MobileConnectionSheet. */
export const TYPE_DOT: Record<PortStyleKey, string> = {
    text: 'bg-port-type-text',
    image: 'bg-port-type-image',
    number: 'bg-port-type-number',
    json: 'bg-port-type-json',
    any: 'bg-port-type-any',
};

/** State → visual style mapping shared across step card and step detail */
export const STATE_STYLES: Record<
    string,
    { bg: string; text: string; border: string; label: string; icon: React.ReactNode }
> = {
    IDLE: { bg: 'bg-muted', text: 'text-muted-foreground', border: '', label: 'Idle', icon: null },
    READY: {
        bg: 'bg-primary/15',
        text: 'text-primary',
        border: 'border-l-primary',
        label: 'Ready',
        icon: null,
    },
    RUNNING: {
        bg: 'bg-warning/15',
        text: 'text-warning',
        border: 'border-l-warning',
        label: 'Running',
        icon: React.createElement(Loader2, { className: 'w-3 h-3 animate-spin' }),
    },
    COMPLETED: {
        bg: 'bg-success/15',
        text: 'text-success',
        border: 'border-l-success',
        label: 'Done',
        icon: React.createElement(Check, { className: 'w-3 h-3' }),
    },
    ERROR: {
        bg: 'bg-destructive/15',
        text: 'text-destructive',
        border: 'border-l-destructive',
        label: 'Error',
        icon: React.createElement(AlertCircle, { className: 'w-3 h-3' }),
    },
};

/** Category-based icon container background */
export const STEREO_ICON_BG: Record<string, string> = {
    input: 'bg-primary/10',
    process: 'bg-muted/50',
    output: 'bg-success/10',
};
