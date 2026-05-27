import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { Sheet, SheetContent } from '@flows/ui-kit';

import { NavigatorHeader } from './NavigatorHeader';
import { NavigatorSidebar } from './NavigatorSidebar';

export const NavigatorLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Desktop sidebar */}
            <aside className="hidden sm:flex">
                <NavigatorSidebar />
            </aside>

            {/* Mobile sidebar sheet */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetContent side="left" className="w-64 p-0">
                    <NavigatorSidebar className="h-full border-r-0" />
                </SheetContent>
            </Sheet>

            {/* Main content area */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <NavigatorHeader onMenuClick={() => setSidebarOpen(true)} />
                <main className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
