import { useState } from 'react';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@flows/ui-kit';

interface ApiKeyDialogProps {
    open: boolean;
    onSubmit: (key: string) => void;
}

export const ApiKeyDialog = ({ open, onSubmit }: ApiKeyDialogProps) => {
    const [apiKey, setApiKey] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (apiKey.trim()) {
            onSubmit(apiKey.trim());
        }
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
                    />
                    <Button type="submit" disabled={!apiKey.trim()}>
                        Save
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};
