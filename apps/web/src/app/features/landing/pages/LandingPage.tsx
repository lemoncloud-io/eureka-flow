import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { SITE_URL } from '@flows/shared';

import {
    CtaSection,
    FeaturesSection,
    FooterSection,
    HeroSection,
    HowItWorksSection,
    ModePickerSection,
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
        <div className="landing-grain min-h-screen overflow-x-hidden bg-background text-foreground">
            <Helmet>
                <title>Eureka Flow — Workflows for People and Machines</title>
                <meta
                    name="description"
                    content="Navigate team workflows and build AI pipelines on one platform. Track progress, assign teams, and automate with AI — no code required."
                />
                <link rel="canonical" href={`${SITE_URL}/`} />
                <meta property="og:title" content="Eureka Flow — Workflows for People and Machines" />
                <meta
                    property="og:description"
                    content="Navigate team workflows and build AI pipelines on one platform."
                />
                <meta property="og:url" content={`${SITE_URL}/`} />
                <meta property="og:type" content="website" />
                <meta property="og:image" content={`${SITE_URL}/images/screenshot-light.jpg`} />
                <meta name="twitter:title" content="Eureka Flow — Workflows for People and Machines" />
                <meta
                    name="twitter:description"
                    content="Navigate team workflows and build AI pipelines on one platform."
                />
                <meta name="twitter:image" content={`${SITE_URL}/images/screenshot-light.jpg`} />
            </Helmet>
            <NavBar />
            <main>
                <HeroSection />
                <ModePickerSection />
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
