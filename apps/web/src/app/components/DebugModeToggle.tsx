import { useTranslation } from 'react-i18next';

import { Bug } from 'lucide-react';

import { Button } from '@flows/ui-kit';

export const DebugModeToggle: React.FC<{ onDisable: () => void }> = ({ onDisable }) => {
    const { t } = useTranslation(['flows']);

    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-warning hover:text-warning"
            onClick={onDisable}
            title={t('header.debugModeOn', 'Debug Mode ON')}
        >
            <Bug className="h-4 w-4" />
        </Button>
    );
};
