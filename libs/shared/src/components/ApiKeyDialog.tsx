import { useState } from 'react';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@flows/ui-kit';

interface ApiKeyDialogProps {
    open: boolean;
    onSubmit: (key: string) => Promise<boolean>;
    error?: string | null;
}

export const ApiKeyDialog = ({ open, onSubmit, error }: ApiKeyDialogProps) => {
    const [apiKey, setApiKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim() || isLoading) return;

        setIsLoading(true);
        await onSubmit(apiKey.trim());
        setIsLoading(false);
    };

    return (
        <Dialog open={open}>
            <DialogContent className="sm:max-w-sm p-5" onPointerDownOutside={e => e.preventDefault()}>
                <DialogHeader className="space-y-1">
                    <DialogTitle className="text-base">API Key</DialogTitle>
                    <DialogDescription className="text-xs">Enter your API key to continue.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
                    <Input
                        type="text"
                        placeholder="API key"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        autoFocus
                        disabled={isLoading}
                        className="h-9 text-sm"
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <Button type="submit" size="sm" className="text-xs" disabled={!apiKey.trim() || isLoading}>
                        {isLoading ? 'Validating...' : 'Continue'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
