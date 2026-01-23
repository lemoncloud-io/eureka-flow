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
            <DialogContent className="sm:max-w-md" onPointerDownOutside={e => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>API Key Required</DialogTitle>
                    <DialogDescription>Please enter your API key to continue.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <Input
                        type="text"
                        placeholder="Enter your API key"
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        autoFocus
                        disabled={isLoading}
                    />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" disabled={!apiKey.trim() || isLoading}>
                        {isLoading ? 'Validating...' : 'Save'}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
