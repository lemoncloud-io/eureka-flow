import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { GITHUB_URL, ROUTES } from '../consts';

export const FooterSection = () => {
    const { t } = useTranslation('landing');

    return (
        <footer className="border-t border-border/20 bg-muted/5">
            <div className="mx-auto max-w-[1200px] px-6 py-10 sm:py-14">
                <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
                    {/* Brand */}
                    <div className="flex items-center gap-2.5">
                        <img
                            src="/logo/purple-symbol.png"
                            alt="Eureka Flow"
                            className="h-5 w-5"
                            width={20}
                            height={20}
                        />
                        <span className="text-sm font-semibold tracking-tight">{t('footer.brand')}</span>
                    </div>

                    {/* Links */}
                    <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
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

                {/* Bottom bar */}
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border/15 pt-6 text-xs text-muted-foreground/50">
                    <a href="mailto:app@lemoncloud.io" className="transition-colors hover:text-foreground">
                        {t('footer.email')}
                    </a>
                    <span>{t('footer.copyright')}</span>
                </div>
            </div>
        </footer>
    );
};
