import { Outlet } from 'react-router-dom';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const AdminLayout = () => {
    return (
        <div className="flex h-screen bg-background">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="admin-content flex-1 overflow-auto p-5">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
