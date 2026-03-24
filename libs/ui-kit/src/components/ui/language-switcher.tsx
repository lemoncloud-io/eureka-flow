import { useTranslation } from 'react-i18next';

import { Globe } from 'lucide-react';

import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

const languages = ['en', 'ko'] as const;

const languageFlags: Record<string, string> = {
    en: '🇺🇸',
    ko: '🇰🇷',
};

export const LanguageSwitcher = (): JSX.Element => {
    const { t, i18n } = useTranslation(['common']);

    const handleLanguageChange = (language: string) => {
        i18n.changeLanguage(language);
        document.documentElement.lang = language;
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Globe className="h-4 w-4" />
                    <span className="sr-only">{t('common:language.change')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {languages.map(code => (
                    <DropdownMenuItem
                        key={code}
                        onClick={() => handleLanguageChange(code)}
                        className={i18n.language === code ? 'bg-accent' : ''}
                    >
                        <span className="mr-2">{languageFlags[code]}</span>
                        {t(`common:language.${code}`)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
