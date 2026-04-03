import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { FlowEditorPage, FlowExamplesPage, PublicFlowsPage } from './features/flows';
import { LandingPage, PolicyPage } from './features/landing';

export const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/explore" element={<PublicFlowsPage />} />
                <Route path="/editor" element={<FlowEditorPage />} />
                <Route path="/flows/:id" element={<FlowEditorPage />} />
                <Route path="/flow/examples" element={<FlowExamplesPage />} />
                <Route path="/policy/:type" element={<PolicyPage />} />
            </Routes>
        </BrowserRouter>
    );
};
