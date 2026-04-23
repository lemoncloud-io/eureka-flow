import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ExternalLink, Eye, EyeOff, KeyRound, X } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { useApiKeyPopup } from '@flows/shared';
import { Button, Input } from '@flows/ui-kit';

import type { TutorialStep } from '../consts/tutorialSteps';

const CODES_URL = import.meta.env.VITE_CODES_URL;

interface CompletionScreenProps {
    step: TutorialStep;
    onSubmitKey: (key: string) => Promise<boolean>;
    onClose: () => void;
}

export const CompletionScreen = ({ step, onSubmitKey, onClose }: CompletionScreenProps) => {
    const { t } = useTranslation(['tutorial', 'common']);
    const navigate = useNavigate();

    const [showKeyInput, setShowKeyInput] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        openPopup,
        isLoading: isPopupLoading,
        error: popupError,
    } = useApiKeyPopup({
        codesUrl: CODES_URL || '',
        onSuccess: (key: string) => {
            setApiKey(key);
            setShowKeyInput(true);
        },
    });

    const handleSubmitKey = async () => {
        if (!apiKey.trim() || isValidating) return;
        setIsValidating(true);
        setError(null);

        const success = await onSubmitKey(apiKey.trim());
        if (!success) {
            setError(t('tutorial:steps.done.invalidKey'));
        }
        setIsValidating(false);
    };

    const resolvedPopupError =
        popupError === 'POPUP_BLOCKED' ? t('common:apiKeyDialog.errors.popupBlocked') : popupError;
    const displayError = resolvedPopupError || error;

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div
                className={cn(
                    'relative mx-4 w-full max-w-md rounded-2xl p-8 text-center',
                    'border border-border/40 bg-glass-bg shadow-floating backdrop-blur-2xl',
                    'animate-in fade-in-0 zoom-in-95 duration-300'
                )}
            >
                <button
                    onClick={onClose}
                    className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <img src="/logo/purple-symbol.png" alt="Eureka Flow" className="h-8 w-8" />
                </div>
                <h2 className="mb-1 text-lg font-semibold">{t(step.titleKey)}</h2>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{t(step.descriptionKey)}</p>

                {showKeyInput ? (
                    <div className="flex flex-col gap-3">
                        <div className="relative">
                            <Input
                                type={showApiKey ? 'text' : 'password'}
                                placeholder={t('tutorial:steps.done.keyPlaceholder')}
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSubmitKey()}
                                autoFocus
                                disabled={isValidating}
                                className="h-9 pr-9 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {displayError && <p className="text-xs text-destructive">{displayError}</p>}
                        <Button className="gap-2" onClick={handleSubmitKey} disabled={!apiKey.trim() || isValidating}>
                            {isValidating ? t('tutorial:steps.done.validating') : t('tutorial:steps.done.continue')}
                        </Button>
                        <Button
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={openPopup}
                            disabled={isPopupLoading}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {isPopupLoading ? t('common:apiKeyDialog.waitingForKey') : t('tutorial:steps.done.getKey')}
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <Button className="gap-2" onClick={openPopup} disabled={isPopupLoading}>
                            <KeyRound className="h-4 w-4" />
                            {isPopupLoading ? t('common:apiKeyDialog.waitingForKey') : t('tutorial:steps.done.getKey')}
                        </Button>
                        <Button variant="outline" className="gap-2" onClick={() => setShowKeyInput(true)}>
                            {t('tutorial:steps.done.enterKey')}
                        </Button>
                        <div className="my-1 flex items-center gap-3">
                            <div className="h-px flex-1 bg-border/50" />
                            <span className="text-[10px] text-muted-foreground/50">{t('tutorial:steps.done.or')}</span>
                            <div className="h-px flex-1 bg-border/50" />
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-xs text-muted-foreground"
                            onClick={() => navigate('/flows')}
                        >
                            {t('tutorial:cta.later')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
