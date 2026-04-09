import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ExternalLink, Eye, EyeOff } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@flows/ui-kit';

import { useApiKeyPopup } from '../hooks/useApiKeyPopup';

interface ApiKeyDialogProps {
    open: boolean;
    onSubmit: (key: string) => Promise<boolean>;
    onOpenChange?: (open: boolean) => void;
    error?: string | null;
    codesUrl?: string;
    initialValue?: string;
}

const resolveError = (err: string | null, t: (key: string) => string): string | null => {
    if (!err) return null;
    return err === 'POPUP_BLOCKED' ? t('apiKeyDialog.errors.popupBlocked') : err;
};

export const ApiKeyDialog = ({ open, onSubmit, onOpenChange, error, codesUrl, initialValue }: ApiKeyDialogProps) => {
    const { t } = useTranslation(['common']);
    const [apiKey, setApiKey] = useState(initialValue ?? '');
    const [isLoading, setIsLoading] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);

    // Sync with initialValue when dialog opens
    useEffect(() => {
        if (open && initialValue) {
            setApiKey(initialValue);
        }
    }, [open, initialValue]);

    const {
        openPopup,
        isLoading: isPopupLoading,
        error: popupError,
    } = useApiKeyPopup({
        codesUrl: codesUrl || '',
        onSuccess: setApiKey,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey.trim() || isLoading) return;

        setIsLoading(true);
        await onSubmit(apiKey.trim());
        setIsLoading(false);
    };

    const displayError = resolveError(error, t) || resolveError(popupError, t);
    const isDisabled = isLoading || isPopupLoading;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm p-5" onPointerDownOutside={e => !onOpenChange && e.preventDefault()}>
                <DialogHeader className="space-y-1">
                    <DialogTitle className="text-base">{t('apiKeyDialog.title')}</DialogTitle>
                    <DialogDescription className="text-xs">{t('apiKeyDialog.description')}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
                    <div className="relative">
                        <Input
                            type={showApiKey ? 'text' : 'password'}
                            placeholder={t('apiKeyDialog.placeholder')}
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            autoFocus
                            disabled={isDisabled}
                            className="h-9 text-sm pr-9"
                        />
                        <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {displayError && <p className="text-xs text-destructive">{displayError}</p>}
                    <Button type="submit" size="sm" className="text-xs" disabled={!apiKey.trim() || isDisabled}>
                        {isLoading ? t('apiKeyDialog.validating') : t('apiKeyDialog.continue')}
                    </Button>
                    {codesUrl && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5"
                            onClick={openPopup}
                            disabled={isDisabled}
                        >
                            {isPopupLoading ? (
                                t('apiKeyDialog.waitingForKey')
                            ) : (
                                <>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    {t('apiKeyDialog.createKey')}
                                </>
                            )}
                        </Button>
                    )}
                    <p className="text-[11px] text-muted-foreground text-center">{t('apiKeyDialog.hint')}</p>
                </form>
            </DialogContent>
        </Dialog>
    );
};
