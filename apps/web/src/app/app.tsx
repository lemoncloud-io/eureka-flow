import { Helmet } from 'react-helmet-async';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { PublicFlowsPage } from './features/flows';
import { LandingPage, PolicyPage } from './features/landing';
import { FlowEditorRouter } from './features/mobile-editor';
import { TutorialRouter } from './features/tutorial';

export const App = () => {
    return (
        <BrowserRouter>
            <Helmet defaultTitle="Eureka Flow" titleTemplate="%s — Eureka Flow">
                <meta name="description" content="Build, run, and share AI workflows visually. No code required." />
                <meta property="og:site_name" content="Eureka Flow" />
                <meta name="twitter:card" content="summary_large_image" />
            </Helmet>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/tutorial" element={<TutorialRouter />} />
                <Route path="/flows" element={<PublicFlowsPage />} />
                <Route path="/editor" element={<FlowEditorRouter />} />
                <Route path="/flows/:id" element={<FlowEditorRouter />} />
                <Route path="/policy/:type" element={<PolicyPage />} />
            </Routes>
        </BrowserRouter>
    );
};
