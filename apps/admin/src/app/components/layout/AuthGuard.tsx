import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../../features/auth';

export const AuthGuard = () => {
    const isLoggedIn = useAuthStore(s => s.isLoggedIn);

    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};
