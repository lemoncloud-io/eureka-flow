import { useTranslation } from 'react-i18next';

import { Code2, Globe, Sparkles } from 'lucide-react';

import { useInView } from '../hooks';

import type { LucideIcon } from 'lucide-react';

const ICON_SIZE = 16;

const PROOF_ITEMS: { key: string; Icon: LucideIcon }[] = [
    { key: 'open_source', Icon: Code2 },
    { key: 'tech_stack', Icon: Globe },
    { key: 'ai_powered', Icon: Sparkles },
];

export const SocialProofBar = () => {
    const { t } = useTranslation('landing');
    const { ref, isInView } = useInView();

    return (
        <div
            ref={ref}
            className={`border-y border-border/50 bg-muted/20 py-6 transition-all duration-700 ${
                isInView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`}
        >
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-6 px-6 sm:gap-10">
                {PROOF_ITEMS.map(({ key, Icon }) => (
                    <div key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon size={ICON_SIZE} className="text-primary/70" />
                        <span>{t(`social_proof.${key}`)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
