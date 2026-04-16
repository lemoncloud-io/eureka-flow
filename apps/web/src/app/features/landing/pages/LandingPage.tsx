import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { SITE_URL } from '@flows/shared';

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
            <Helmet>
                <title>Eureka Flow — Visual AI Workflow Builder</title>
                <meta
                    name="description"
                    content="Build, run, and share AI workflows visually. No code required. Drag, connect, and run AI pipelines on a visual canvas."
                />
                <link rel="canonical" href={`${SITE_URL}/`} />
                <meta property="og:title" content="Eureka Flow — Visual AI Workflow Builder" />
                <meta
                    property="og:description"
                    content="Build, run, and share AI workflows visually. No code required."
                />
                <meta property="og:url" content={`${SITE_URL}/`} />
                <meta property="og:type" content="website" />
                <meta property="og:image" content={`${SITE_URL}/images/screenshot-light.jpg`} />
                <meta name="twitter:title" content="Eureka Flow — Visual AI Workflow Builder" />
                <meta
                    name="twitter:description"
                    content="Build, run, and share AI workflows visually. No code required."
                />
                <meta name="twitter:image" content={`${SITE_URL}/images/screenshot-light.jpg`} />
            </Helmet>
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
