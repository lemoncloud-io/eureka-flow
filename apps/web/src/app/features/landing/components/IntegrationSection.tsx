import { useTranslation } from 'react-i18next';

import { Badge } from '@flows/ui-kit';

import { useInView } from '../hooks';

// Brand names — no translation needed
const INTEGRATIONS = ['OpenAI', 'Claude', 'Gemini', 'Stable Diffusion', 'DALL-E', 'LangChain', 'Whisper', 'GPT-4o'];

export const IntegrationSection = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <section ref={ref} className="py-24">
            <div className="mx-auto max-w-4xl px-6 text-center">
                <div
                    className={`transition-all duration-700 ${
                        isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                    }`}
                >
                    <Badge className="mb-4">{t('integrations.badge')}</Badge>
                    <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">{t('integrations.title')}</h2>
                    <p className="mx-auto mb-12 max-w-2xl text-muted-foreground">{t('integrations.subtitle')}</p>
                </div>

                <div
                    className={`flex flex-wrap items-center justify-center gap-3 transition-all duration-700 delay-200 ${
                        isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                    }`}
                >
                    {INTEGRATIONS.map(name => (
                        <span
                            key={name}
                            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                        >
                            {name}
                        </span>
                    ))}
                    <span className="rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground/60">
                        {t('integrations.more')}
                    </span>
                </div>
            </div>
        </section>
    );
};
