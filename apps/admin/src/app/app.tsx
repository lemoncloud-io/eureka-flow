import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { DashboardPage } from './features/dashboard';

export const App = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<DashboardPage />} />
            </Routes>
        </BrowserRouter>
    );
};
