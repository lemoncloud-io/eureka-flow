import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { GITHUB_URL, ROUTES } from '../consts';

export const FooterSection = () => {
    const { t } = useTranslation('landing');

    return (
        <footer className="border-t border-border/30">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-6 py-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <img
                            src="/logo/purple-symbol.png"
                            alt="Eureka Flow"
                            className="h-4 w-4"
                            width={16}
                            height={16}
                        />
                        {t('footer.brand')}
                    </span>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <Link to={ROUTES.EXPLORE} className="transition-colors hover:text-foreground">
                            {t('footer.explore', 'Explore')}
                        </Link>
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transition-colors hover:text-foreground"
                        >
                            {t('footer.github')}
                        </a>
                        <Link to={ROUTES.TERMS} className="transition-colors hover:text-foreground">
                            {t('footer.terms')}
                        </Link>
                        <Link to={ROUTES.PRIVACY} className="transition-colors hover:text-foreground">
                            {t('footer.privacy')}
                        </Link>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground/60">
                    <a href="mailto:app@lemoncloud.io" className="transition-colors hover:text-foreground">
                        {t('footer.email')}
                    </a>
                    <span>{t('footer.copyright')}</span>
                </div>
            </div>
        </footer>
    );
};
