import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import { getPolicyContent } from '@flows/policy';

import type { PolicyType, SupportedLanguage } from '@flows/policy';

const POLICY_TYPES = new Set<PolicyType>(['terms', 'privacy']);

const isPolicyType = (value: string): value is PolicyType => POLICY_TYPES.has(value as PolicyType);

export const PolicyPage = () => {
    const { type } = useParams<{ type: string }>();
    const { i18n } = useTranslation();

    useEffect(() => {
        window.scrollTo(0, 0);
        document.documentElement.style.overflowY = 'scroll';
        return () => {
            document.documentElement.style.overflowY = '';
        };
    }, [type]);

    if (!type || !isPolicyType(type)) {
        return <Navigate to="/" replace />;
    }

    const lang: SupportedLanguage = i18n.language === 'ko' ? 'ko' : 'en';
    const result = getPolicyContent(type, lang);

    if (!result) {
        return <Navigate to="/" replace />;
    }

    const { content, currentVersion } = result;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="border-b border-border">
                <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-6">
                    <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">{content.title}</h1>
                        <p className="text-sm text-muted-foreground">{content.subtitle}</p>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-6 py-10">
                <p className="mb-8 text-right text-sm text-muted-foreground">{currentVersion.effectiveDate}</p>
                <div className="space-y-8">
                    {currentVersion.sections.map(section => (
                        <section key={section.title}>
                            <h3 className="mb-3 text-lg font-semibold">{section.title}</h3>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                {section.content}
                            </p>
                        </section>
                    ))}
                </div>
            </main>
        </div>
    );
};
