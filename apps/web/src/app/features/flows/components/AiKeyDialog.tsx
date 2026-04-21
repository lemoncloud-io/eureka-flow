import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, ExternalLink, Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { saveAiKey } from '@flows/flows';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

type AiProvider = 'gemini' | 'openai';

interface AiKeyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PROVIDER_LINKS: Record<AiProvider, string> = {
    gemini: 'https://aistudio.google.com/apikey',
    openai: 'https://platform.openai.com/api-keys',
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
    gemini: 'Google AI Studio',
    openai: 'OpenAI Platform',
};

export const AiKeyDialog = ({ open, onOpenChange }: AiKeyDialogProps) => {
    const { t } = useTranslation(['flows']);
    const hasGeminiKey = useWebCoreStore(s => s.hasGeminiKey);
    const hasOpenaiKey = useWebCoreStore(s => s.hasOpenaiKey);
    const [expandedProvider, setExpandedProvider] = useState<AiProvider | null>(null);
    const [keyInput, setKeyInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const resetState = () => {
        setExpandedProvider(null);
        setKeyInput('');
        setShowKey(false);
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) resetState();
        onOpenChange(nextOpen);
    };

    const handleToggleProvider = (provider: AiProvider) => {
        if (expandedProvider === provider) {
            resetState();
        } else {
            setExpandedProvider(provider);
            setKeyInput('');
            setShowKey(false);
        }
    };

    const handleSave = async () => {
        if (!expandedProvider || !keyInput.trim()) return;
        setIsSaving(true);
        try {
            const data = await saveAiKey(expandedProvider, keyInput.trim());
            useWebCoreStore.getState().setAiKeyStatus({
                hasGeminiKey: !!data.geminiApiKey,
                hasOpenaiKey: !!data.openaiApiKey,
            });
            toast.success(t('aiKey.saveSuccess'));
            resetState();
        } catch {
            toast.error(t('aiKey.saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const providers: { key: AiProvider; label: string; registered: boolean }[] = [
        { key: 'gemini', label: t('aiKey.geminiConnection'), registered: hasGeminiKey },
        { key: 'openai', label: t('aiKey.openaiConnection'), registered: hasOpenaiKey },
    ];

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-sm p-5">
                <DialogHeader className="space-y-1">
                    <DialogTitle className="text-base">{t('aiKey.dialogTitle')}</DialogTitle>
                    <DialogDescription className="text-xs font-semibold text-foreground">
                        {t('aiKey.dialogDescription')}
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-3 space-y-2">
                    {providers.map(({ key, label, registered }) => (
                        <div
                            key={key}
                            className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20"
                        >
                            <span className="text-sm font-medium">{label}</span>
                            {registered ? (
                                <span className="flex items-center gap-1 text-xs text-status-completed font-medium">
                                    <Check className="w-3.5 h-3.5" />
                                    {t('aiKey.registered')}
                                </span>
                            ) : (
                                <Button
                                    size="sm"
                                    variant={expandedProvider === key ? 'default' : 'outline'}
                                    className="text-xs h-7"
                                    onClick={() => handleToggleProvider(key)}
                                >
                                    {t('aiKey.register')}
                                </Button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Expanded registration form */}
                {expandedProvider && (
                    <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold">
                                {PROVIDER_LABELS[expandedProvider]} API Key {t('aiKey.howToGet')}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {expandedProvider === 'gemini'
                                    ? t('aiKey.geminiInstructions')
                                    : t('aiKey.openaiInstructions')}
                            </p>
                            <div className="text-xs space-y-1">
                                <p className="font-semibold">{t('aiKey.steps')}</p>
                                <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                                    <li>
                                        <a
                                            href={PROVIDER_LINKS[expandedProvider]}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary hover:underline"
                                        >
                                            {PROVIDER_LABELS[expandedProvider]}
                                            <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                        {t(`aiKey.${expandedProvider}Step1`)}
                                    </li>
                                    <li>{t(`aiKey.${expandedProvider}Step2`)}</li>
                                    <li>{t(`aiKey.${expandedProvider}Step3`)}</li>
                                </ol>
                            </div>
                            <div className="text-xs space-y-1">
                                <p className="font-semibold">{t('aiKey.caution')}</p>
                                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                    <li>{t('aiKey.caution1')}</li>
                                    <li>{t('aiKey.caution2')}</li>
                                    <li>{t('aiKey.caution3')}</li>
                                </ul>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-border/50 space-y-2">
                            <label className="text-xs font-medium">{PROVIDER_LABELS[expandedProvider]} API Key</label>
                            <div className="relative">
                                <Input
                                    type={showKey ? 'text' : 'password'}
                                    placeholder={`${PROVIDER_LABELS[expandedProvider]} API ${t('aiKey.keyPlaceholder')}`}
                                    value={keyInput}
                                    onChange={e => setKeyInput(e.target.value)}
                                    autoFocus
                                    disabled={isSaving}
                                    className="h-9 text-sm pr-9"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            className="w-full text-xs gap-1.5"
                            size="sm"
                            disabled={!keyInput.trim() || isSaving}
                            onClick={handleSave}
                        >
                            <KeyRound className="w-3.5 h-3.5" />
                            {isSaving ? t('aiKey.saving') : t('aiKey.save')}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
