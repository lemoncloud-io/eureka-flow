import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AdminLayout, AuthGuard } from './components/layout';
import { LoginPage } from './features/auth';
import { BlockDetailPage, BlockListPage } from './features/blocks';
import { DashboardPage } from './features/dashboard';
import { I18nPage, PreviewPage } from './features/i18n';
import { SkillsPage } from './features/skills';
import { ToolsPage } from './features/tools';

export const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<AuthGuard />}>
                    <Route path="/i18n/preview" element={<PreviewPage />} />
                    <Route element={<AdminLayout />}>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/blocks" element={<BlockListPage />} />
                        <Route path="/blocks/:id" element={<BlockDetailPage />} />
                        <Route path="/tools" element={<ToolsPage />} />
                        <Route path="/skills" element={<SkillsPage />} />
                        <Route path="/i18n" element={<I18nPage />} />
                    </Route>
                </Route>
            </Routes>
        </BrowserRouter>
    );
};
