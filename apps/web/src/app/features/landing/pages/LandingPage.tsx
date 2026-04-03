import { useEffect } from 'react';

import {
    CtaSection,
    FeaturesSection,
    FooterSection,
    HeroSection,
    HowItWorksSection,
    NavBar,
    ScreenshotSection,
    SocialProofBar,
} from '../components';

export const LandingPage = () => {
    useEffect(() => {
        document.documentElement.classList.add('landing-scroll');
        return () => {
            document.documentElement.classList.remove('landing-scroll');
        };
    }, []);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <NavBar />
            <main>
                <HeroSection />
                <ScreenshotSection />
                <SocialProofBar />
                <HowItWorksSection />
                <FeaturesSection />
                <CtaSection />
            </main>
            <FooterSection />
        </div>
    );
};
