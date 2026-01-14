import { useTranslation } from 'react-i18next';

import { Globe } from 'lucide-react';

import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

const languages = {
    en: { label: 'English', flag: '🇺🇸' },
    ko: { label: '한국어', flag: '🇰🇷' },
};

export const LanguageSwitcher = () => {
    const { i18n } = useTranslation();

    const handleLanguageChange = (language: string) => {
        i18n.changeLanguage(language);
        document.documentElement.lang = language;
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Globe className="h-4 w-4" />
                    <span className="sr-only">Change language</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {Object.entries(languages).map(([code, { label, flag }]) => (
                    <DropdownMenuItem
                        key={code}
                        onClick={() => handleLanguageChange(code)}
                        className={i18n.language === code ? 'bg-accent' : ''}
                    >
                        <span className="mr-2">{flag}</span>
                        {label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
