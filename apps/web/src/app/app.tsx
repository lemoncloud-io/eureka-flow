import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { SITE_URL } from '@flows/shared';
import { isOAuthEnabled } from '@flows/web-core';

import { KeyCreationPage, KeySuccessPage, LoginPage, OAuthResponsePage } from './features/auth';
import { PublicFlowsPage } from './features/flows';
import { HomePage } from './features/home';
import { PolicyPage } from './features/landing';
import { FlowEditorRouter } from './features/mobile-editor';
import {
    ActorManagerPage,
    DashboardPage,
    ItemBoardPage,
    ItemDetailPage,
    NavigatorLayout,
    ProcessApplyPage,
    ProcessEditorPage,
    ProcessListPage,
    StageFocusPage,
    ToolManagerPage,
} from './features/process';
import { TutorialRouter } from './features/tutorial';

export const App = () => {
    const { i18n } = useTranslation();

    return (
        <BrowserRouter>
            <Helmet defaultTitle="Eureka Flow" titleTemplate="%s — Eureka Flow">
                <html lang={i18n.language === 'ko' ? 'ko' : 'en'} />
                <meta name="description" content="Build, run, and share AI workflows visually. No code required." />
                <meta property="og:site_name" content="Eureka Flow" />
                <meta name="twitter:card" content="summary_large_image" />
                <link rel="alternate" hreflang="en" href={`${SITE_URL}/`} />
                <link rel="alternate" hreflang="ko" href={`${SITE_URL}/`} />
                <link rel="alternate" hreflang="x-default" href={`${SITE_URL}/`} />
            </Helmet>
            <Routes>
                <Route path="/" element={<HomePage />} />

                {/* Focus mode — outside NavigatorLayout (no sidebar) */}
                <Route path="/items/:id/stages/:stageId" element={<StageFocusPage />} />

                {/* Navigator routes */}
                <Route element={<NavigatorLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/items" element={<ItemBoardPage />} />
                    <Route path="/items/:id" element={<ItemDetailPage />} />
                    <Route path="/processes" element={<ProcessListPage />} />
                    <Route path="/processes/:id" element={<ProcessEditorPage />} />
                    <Route path="/processes/:id/apply" element={<ProcessApplyPage />} />
                    <Route path="/actors" element={<ActorManagerPage />} />
                    <Route path="/tools" element={<ToolManagerPage />} />
                </Route>

                {/* Builder routes */}
                <Route path="/flows" element={<PublicFlowsPage />} />
                <Route path="/editor" element={<FlowEditorRouter />} />
                <Route path="/flows/:id" element={<FlowEditorRouter />} />

                {/* Other routes */}
                <Route path="/tutorial" element={<TutorialRouter />} />
                <Route path="/policy/:type" element={<PolicyPage />} />
                {isOAuthEnabled && (
                    <>
                        <Route path="/auth/login" element={<LoginPage />} />
                        <Route path="/auth/oauth-response" element={<OAuthResponsePage />} />
                        <Route path="/auth/create-key" element={<KeyCreationPage />} />
                        <Route path="/auth/key-created" element={<KeySuccessPage />} />
                    </>
                )}
            </Routes>
        </BrowserRouter>
    );
};
