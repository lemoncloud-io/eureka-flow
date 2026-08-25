import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Building2, Check, ExternalLink, Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@flows/ui-kit';
import { isOAuthEnabled, maskKey, useWebCoreStore } from '@flows/web-core';

import { useApiKeyPopup } from '../hooks/useApiKeyPopup';

import type { StoredApiKey } from '@flows/web-core';

interface ApiKeyDialogProps {
    open: boolean;
    onSubmit: (key: string) => Promise<boolean>;
    onOpenChange?: (open: boolean) => void;
    error?: string | null;
    codesUrl?: string;
    initialValue?: string;
    hideCreateButton?: boolean;
}

const resolveError = (err: string | null | undefined, t: (key: string) => string): string | null => {
    if (!err) return null;
    return err === 'POPUP_BLOCKED' ? t('apiKeyDialog.errors.popupBlocked') : err;
};

export const ApiKeyDialog = ({
    open,
    onSubmit,
    onOpenChange,
    error,
    codesUrl,
    initialValue,
    hideCreateButton,
}: ApiKeyDialogProps) => {
    const { t } = useTranslation(['common']);
    const [newKey, setNewKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showNewKey, setShowNewKey] = useState(false);

    const activeKey = useWebCoreStore(s => s.apiKey);
    const apiKeys = useWebCoreStore(s => s.apiKeys);
    const switchApiKey = useWebCoreStore(s => s.switchApiKey);
    const removeApiKey = useWebCoreStore(s => s.removeApiKey);
    const workspace = useWebCoreStore(s => s.workspace);
    const project = useWebCoreStore(s => s.project);

    // Only pre-fill initialValue when no saved keys exist (first-time use)
    useEffect(() => {
        if (open && initialValue && apiKeys.length === 0) {
            setNewKey(initialValue);
        }
    }, [open, initialValue, apiKeys.length]);

    const {
        openPopup,
        isLoading: isPopupLoading,
        error: popupError,
    } = useApiKeyPopup({
        codesUrl: codesUrl || '',
        onSuccess: setNewKey,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKey.trim() || isLoading) return;

        setIsLoading(true);
        const success = await onSubmit(newKey.trim());
        setIsLoading(false);
        if (success) {
            setNewKey('');
        } else {
            toast.error(t('apiKeyDialog.invalidKey', 'Invalid API key'));
        }
    };

    const handleSwitch = (key: string) => {
        switchApiKey(key);
        onOpenChange?.(false);
        // Reload to re-boot with new key
        window.location.reload();
    };

    const handleRemove = (key: string) => {
        removeApiKey(key);
        // If removed active key, stay open for new input
    };

    const displayError = resolveError(error, t) || resolveError(popupError, t);
    const isDisabled = isLoading || isPopupLoading;
    const hasSavedKeys = apiKeys.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-tour="apikey-dialog"
                className="sm:max-w-sm p-5"
                onPointerDownOutside={e => !onOpenChange && e.preventDefault()}
            >
                <DialogHeader className="space-y-1">
                    <DialogTitle className="text-base">{t('apiKeyDialog.title')}</DialogTitle>
                    <DialogDescription className="text-xs">{t('apiKeyDialog.description')}</DialogDescription>
                </DialogHeader>

                {/* Workspace / project context (single-line breadcrumb; parent then current project) */}
                {workspace && project && (
                    <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] text-muted-foreground font-medium">
                            {t('apiKeyDialog.context', 'Workspace & Project')}
                        </p>
                        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/40 bg-muted/30 min-w-0">
                            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="flex items-center gap-1.5 min-w-0 text-xs whitespace-nowrap overflow-hidden">
                                <span
                                    className="shrink-0 max-w-[48%] truncate font-medium text-foreground"
                                    title={`${t('apiKeyDialog.workspace', 'Workspace')} · #${workspace.id}`}
                                >
                                    {workspace.name}
                                </span>
                                {workspace.stereo && (
                                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/70">
                                        {workspace.stereo}
                                    </span>
                                )}
                                <span className="shrink-0 text-muted-foreground/40">/</span>
                                <span
                                    className="flex-1 min-w-0 truncate font-medium text-foreground"
                                    title={`${t('apiKeyDialog.project', 'Project')} · #${project.id}`}
                                >
                                    {project.name}
                                </span>
                                {project.stereo && (
                                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/70">
                                        {project.stereo}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                )}

                {/* Saved keys list */}
                {hasSavedKeys && (
                    <SavedKeyList
                        keys={apiKeys}
                        activeKey={activeKey}
                        onSwitch={handleSwitch}
                        onRemove={handleRemove}
                    />
                )}

                {/* New key input */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-1">
                    {hasSavedKeys && (
                        <p className="text-[11px] text-muted-foreground font-medium">
                            {t('apiKeyDialog.addNewKey', 'Add new key')}
                        </p>
                    )}
                    <div className="relative">
                        <Input
                            type={showNewKey ? 'text' : 'password'}
                            placeholder={t('apiKeyDialog.placeholder')}
                            value={newKey}
                            onChange={e => setNewKey(e.target.value)}
                            autoFocus={!hasSavedKeys}
                            disabled={isDisabled}
                            className="h-9 text-sm pr-9"
                        />
                        <button
                            type="button"
                            onClick={() => setShowNewKey(!showNewKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showNewKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {displayError && <p className="text-xs text-destructive">{displayError}</p>}
                    <Button type="submit" size="sm" className="text-xs" disabled={!newKey.trim() || isDisabled}>
                        {isLoading ? t('apiKeyDialog.validating') : t('apiKeyDialog.continue')}
                    </Button>
                    {hideCreateButton ? null : isOAuthEnabled ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5"
                            onClick={() => {
                                window.location.href = `/auth/login?from=${encodeURIComponent(window.location.pathname)}`;
                            }}
                        >
                            <KeyRound className="w-3.5 h-3.5" />
                            {t('apiKeyDialog.createNewKey', '키 생성하기')}
                        </Button>
                    ) : codesUrl ? (
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
                    ) : null}
                    {!hideCreateButton && (
                        <p className="text-[11px] text-muted-foreground text-center">{t('apiKeyDialog.hint')}</p>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
};

// ============================================================================
// Saved Key List (inline sub-component)
// ============================================================================

const SavedKeyList = ({
    keys,
    activeKey,
    onSwitch,
    onRemove,
}: {
    keys: StoredApiKey[];
    activeKey: string | null;
    onSwitch: (key: string) => void;
    onRemove: (key: string) => void;
}) => {
    const { t } = useTranslation(['common']);

    return (
        <div className="flex flex-col gap-1.5 mt-2">
            <p className="text-[11px] text-muted-foreground font-medium">{t('apiKeyDialog.savedKeys', 'Saved keys')}</p>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {keys.map(entry => {
                    const isActive = entry.key === activeKey;
                    return (
                        <div
                            key={entry.key}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                                isActive ? 'border-primary/40 bg-primary/5' : 'border-border/40 hover:bg-accent/40'
                            }`}
                        >
                            {/* Active indicator */}
                            <div
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isActive ? 'bg-primary' : 'bg-muted-foreground/30'
                                }`}
                            />

                            {/* Key info */}
                            <div className="flex-1 min-w-0">
                                <div className="text-foreground truncate">
                                    {entry.label !== maskKey(entry.key) ? entry.label : maskKey(entry.key)}
                                </div>
                                {entry.label !== maskKey(entry.key) && (
                                    <div className="font-mono text-[10px] text-muted-foreground/60 truncate">
                                        {maskKey(entry.key)}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {isActive ? (
                                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onSwitch(entry.key)}
                                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-primary/10 shrink-0"
                                >
                                    {t('apiKeyDialog.switch', 'Switch')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onRemove(entry.key)}
                                className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
