import { useTranslation } from 'react-i18next';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@flows/theme';

import { Button } from './button';

export const ThemeToggle = () => {
    const { t } = useTranslation(['common']);
    const { theme, setTheme } = useTheme();

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    return (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">{t('common:theme.toggle')}</span>
        </Button>
    );
};
