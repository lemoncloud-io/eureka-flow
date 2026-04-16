import React, { useMemo } from 'react';

import { cn } from '@flows/lib/utils';

import { S3Image } from '../../flows/components/S3Image';

interface DataPreviewProps {
    data: { value?: unknown; type?: string };
    expanded?: boolean;
}

export const DataPreview = React.memo(({ data, expanded }: DataPreviewProps) => {
    const jsonStr = useMemo(
        () => (data?.value !== null && typeof data?.value === 'object' ? JSON.stringify(data.value, null, 2) : null),
        [data?.value]
    );

    if (!data?.value) return <span className="text-muted-foreground/40 italic text-[11px]">empty</span>;

    if (data.type === 'image' && typeof data.value === 'string') {
        return (
            <div className="w-full h-32 rounded-lg border border-border bg-black/20 overflow-hidden">
                <S3Image src={data.value} alt="Output" className="w-full h-full object-contain" />
            </div>
        );
    }

    if (jsonStr) {
        return (
            <pre
                className={cn(
                    'text-[11px] font-mono text-foreground whitespace-pre-wrap break-all',
                    !expanded && 'line-clamp-5'
                )}
            >
                {jsonStr}
            </pre>
        );
    }

    return (
        <div className={cn('text-sm text-foreground break-all', !expanded && 'line-clamp-5')}>{String(data.value)}</div>
    );
});

DataPreview.displayName = 'DataPreview';
