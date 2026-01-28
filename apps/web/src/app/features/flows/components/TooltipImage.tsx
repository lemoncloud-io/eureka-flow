import { useState } from 'react';

import { S3Image } from './S3Image';

interface TooltipImageProps {
    src: string;
    altText: string;
}

export const TooltipImage = ({ src, altText }: TooltipImageProps) => {
    const [dims, setDims] = useState<string | null>(null);

    return (
        <div className="relative inline-block">
            <S3Image
                src={src}
                alt={altText}
                className="max-w-[140px] max-h-[140px] rounded border border-border bg-background/50 block"
                onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
            />
            {dims && (
                <div className="absolute bottom-1 right-1 bg-popover/80 text-[9px] text-foreground px-1.5 py-0.5 rounded backdrop-blur-md border border-border/10 font-mono shadow-sm">
                    {dims}
                </div>
            )}
        </div>
    );
};
