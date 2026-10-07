import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './authContext.js';

// UI guard only — the backend must still check the session on every /admin request
export default function ProtectedRoute({ role = "admin" }) {
    const { status, user } = useAuth();
    const location = useLocation();

    if (status === "loading") {
        return <p className="admin-status" role="status">Checking your session...</p>;
    }

    if (!user) {
        // remember where they were headed so login can send them back
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    if (role && user.role !== role) {
        return (
            <p className="admin-status" role="alert">
                Your account doesn't have access to this page.
            </p>
        );
    }

    return <Outlet />;
}
