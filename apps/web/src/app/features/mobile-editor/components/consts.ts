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

/** Stereo category i18n keys for breadcrumb header */
export const STEREO_I18N_KEY: Record<string, string> = {
    input: 'mobile.stereo.input',
    process: 'mobile.stereo.process',
    output: 'mobile.stereo.output',
};

/** Stereo-based left border stripe color for node cards */
export const STEREO_LEFT_BORDER: Record<string, string> = {
    input: 'border-l-[3px] border-l-pink-300/60',
    process: 'border-l-[3px] border-l-emerald-300/60',
    output: 'border-l-[3px] border-l-violet-300/60',
};

/** Stereo category fallback labels (Korean) */
export const STEREO_FALLBACK_LABEL: Record<string, string> = {
    input: '입력 블록',
    process: '처리 블록',
    output: '출력 블록',
};
