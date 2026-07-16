import React from 'react';
import { useTranslation } from 'react-i18next';

import { ExternalLink } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { gradientOf, initialsOf } from '@flows/shared';

import type { UploadHtmlProductView } from '@flows/flows';

/**
 * An `upload-html` product rendered as a link unfurl. Opens the deployed App in a new tab —
 * unlike AppCard, which navigates in place (see docs/adr/0003-apps-route-ownership.md).
 *
 * Deliberately shows no deployment status: `website` exists before the deploy finishes, so any
 * "ready" affordance derived from it would be a lie.
 */
export const ProductLinkCard: React.FC<{ product: UploadHtmlProductView }> = ({ product }) => {
    const { t } = useTranslation(['nodes']);

    const title = product.name || product.id || t('visualization.product.untitled');
    const subtitle = [product.region, product.workspace$?.code].filter(Boolean).join(' · ');

    return (
        <a
            href={product.website}
            target="_blank"
            rel="noopener noreferrer"
            // Canvas nodes drag on mousedown and the preview opens a modal on click; keep both off the link.
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            title={product.website}
            className={cn(
                'group flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/10 p-2.5',
                'transition-colors hover:border-primary/40 hover:bg-muted/30'
            )}
        >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1">
                    <span className="truncate text-xs font-medium text-foreground">{title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                </div>
                {subtitle && <span className="truncate text-[10px] text-muted-foreground/70">{subtitle}</span>}
            </div>

            <div
                className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br',
                    gradientOf(product.id ?? product.website ?? '')
                )}
            >
                <span className="text-xs font-bold tracking-tight text-foreground/40">{initialsOf(title)}</span>
            </div>
        </a>
    );
};
