import { useTranslation } from 'react-i18next';

import { Code2, Globe, Sparkles } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

const ICON_SIZE = 14;

const PROOF_ITEMS: { key: string; Icon: LucideIcon }[] = [
    { key: 'open_source', Icon: Code2 },
    { key: 'tech_stack', Icon: Globe },
    { key: 'ai_powered', Icon: Sparkles },
];

const MarqueeContent = ({ items }: { items: typeof PROOF_ITEMS }) => {
    const { t } = useTranslation('landing');

    return (
        <>
            {items.map(({ key, Icon }) => (
                <div key={key} className="flex shrink-0 items-center gap-2 px-8 text-sm text-muted-foreground">
                    <Icon size={ICON_SIZE} className="text-primary/60" />
                    <span className="whitespace-nowrap font-medium">{t(`social_proof.${key}`)}</span>
                </div>
            ))}
        </>
    );
};

export const SocialProofBar = () => (
    <div className="landing-marquee overflow-hidden border-y border-border/30 py-4">
        <div className="landing-marquee-track flex animate-marquee" style={{ width: 'max-content' }}>
            <MarqueeContent items={PROOF_ITEMS} />
            <MarqueeContent items={PROOF_ITEMS} />
            <MarqueeContent items={PROOF_ITEMS} />
            <MarqueeContent items={PROOF_ITEMS} />
            <MarqueeContent items={PROOF_ITEMS} />
            <MarqueeContent items={PROOF_ITEMS} />
        </div>
    </div>
);
