import { useEffect } from 'react';

import { X } from 'lucide-react';

import { Button } from '@flows/ui-kit';

interface EmbedBrowserProps {
    url: string;
    onClose: () => void;
}

export const EmbedBrowser = ({ url, onClose }: EmbedBrowserProps) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <div className="flex h-12 items-center justify-between border-b border-border px-4">
                <p className="truncate text-sm text-muted-foreground">{url}</p>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
            {/* allow-scripts + allow-same-origin: accepted risk for SSO-dependent tools. URLs are admin-configured via Tool records. */}
            <iframe
                src={url}
                className="flex-1"
                sandbox="allow-scripts allow-same-origin allow-forms"
                title="Embedded tool"
            />
        </div>
    );
};
