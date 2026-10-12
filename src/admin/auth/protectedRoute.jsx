import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from './authContext.js';
import { homeFor } from './roles.js';

// UI guard only — the backend still checks the session and role on every /admin request
// roles: who may open the pages inside; anyone else is sent to their own home page
export default function ProtectedRoute({ roles = ["admin"] }) {
    const { status, user } = useAuth();
    const location = useLocation();

    if (status === "loading") {
        return <p className="admin-status" role="status">Checking your session...</p>;
    }

    if (!user) {
        // remember where they were headed so login can send them back
        return <Navigate to="/admin/login" replace state={{ from: location }} />;
    }

    if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;

    return <Outlet />;
}
