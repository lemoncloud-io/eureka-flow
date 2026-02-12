import { useState } from 'react';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@flows/ui-kit';

import { useApiKeyPopup } from '../hooks/useApiKeyPopup';

interface ApiKeyDialogProps {
    open: boolean;
    onSubmit: (key: string) => Promise<boolean>;
    error?: string | null;
    codesUrl?: string;
}

export const ApiKeyDialog = ({ open, onSubmit, error, codesUrl }: ApiKeyDialogProps) => {
    const [apiKey, setApiKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const {
        openPopup,
        isLoading: isPopupLoading,
        error: popupError,
    } = useApiKeyPopup({
        codesUrl: codesUrl || '',
        onSuccess: (key: string) => {
            setApiKey(key);
        },
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim() || isLoading) return;

        setIsLoading(true);
        await onSubmit(apiKey.trim());
        setIsLoading(false);
    };

    const handleCreateKey = () => {
        if (!codesUrl) return;
        openPopup();
    };

    const displayError = error || popupError;
    const isDisabled = isLoading || isPopupLoading;

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
                        disabled={isDisabled}
                        className="h-9 text-sm"
                    />
                    {displayError && <p className="text-xs text-destructive">{displayError}</p>}
                    <Button type="submit" size="sm" className="text-xs" disabled={!apiKey.trim() || isDisabled}>
                        {isLoading ? 'Validating...' : 'Continue'}
                    </Button>
                    {codesUrl && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={handleCreateKey}
                            disabled={isDisabled}
                        >
                            {isPopupLoading ? 'Waiting for key...' : 'Create New Key'}
                        </Button>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
};
