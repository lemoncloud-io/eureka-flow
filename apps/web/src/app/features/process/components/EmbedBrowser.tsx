import { useEffect, useRef, useState } from 'react';

import { ExternalLink, RefreshCw, X } from 'lucide-react';

import { Button } from '@flows/ui-kit';

interface EmbedBrowserProps {
    url: string;
    onClose: () => void;
}

export const EmbedBrowser = ({ url, onClose }: EmbedBrowserProps) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1 rounded-md bg-muted px-3 py-1">
                    <p className="truncate text-xs text-muted-foreground">{url}</p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setReloadKey(k => k + 1)}
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </Button>
            </div>
            {/* allow-scripts + allow-same-origin: accepted risk for SSO-dependent tools. URLs are admin-configured via Tool records. */}
            <iframe
                key={reloadKey}
                ref={iframeRef}
                src={url}
                className="flex-1"
                sandbox="allow-scripts allow-same-origin allow-forms"
                title="Embedded tool"
            />
        </div>
    );
};
