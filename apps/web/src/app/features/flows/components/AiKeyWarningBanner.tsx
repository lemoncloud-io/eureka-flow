import { useTranslation } from 'react-i18next';

import { KeyRound } from 'lucide-react';

import { useDebugMode } from '../../../hooks/useDebugMode';

interface AiKeyWarningBannerProps {
    onRegisterKey?: () => void;
}

export const AiKeyWarningBanner: React.FC<AiKeyWarningBannerProps> = ({ onRegisterKey }) => {
    const { t } = useTranslation(['flows']);
    const { isDebugMode } = useDebugMode();

    // AI key alerts are local-only: hidden on deployed DEV/PROD unless debug mode is toggled on.
    const showAiKeyAlerts = import.meta.env.VITE_ENV === 'LOCAL' || isDebugMode;
    if (!showAiKeyAlerts) {
        return null;
    }

    return (
        <div className="mt-2 bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 text-[10px]">
            <p className="font-semibold text-destructive">{t('aiKey.missing')}</p>
            <p className="text-destructive/70 mt-0.5 whitespace-pre-line">{t('aiKey.missingDescription')}</p>
            {onRegisterKey && (
                <button
                    onClick={e => {
                        e.stopPropagation();
                        onRegisterKey();
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 bg-foreground text-background rounded-md py-1.5 px-3 text-[10px] font-medium hover:opacity-90 transition-opacity"
                >
                    <KeyRound className="w-3 h-3" />
                    {t('aiKey.registerButton')}
                </button>
            )}
        </div>
    );
};
