import { Navigate, Route, Routes } from 'react-router';
import './style/admin.css';

import AuthProvider from './auth/authProvider.jsx';
import ProtectedRoute from './auth/protectedRoute.jsx';
import AdminLayout from './components/adminLayout.jsx';
import LoginPage from './pages/loginPage.jsx';
import DashboardPage from './pages/dashboardPage.jsx';
import OrdersPage from './pages/ordersPage.jsx';
import VideoPage from './pages/videoPage.jsx';

// mounted at /admin/* — paths below are relative to it
export default function AdminApp() {
    return (
        <AuthProvider>
            <title>Sheehan Inc. — Admin</title>
            {/* keep admin pages out of search engines if the site is ever public */}
            <meta name="robots" content="noindex, nofollow" />

            <Routes>
                <Route path="login" element={<LoginPage />} />

                <Route element={<ProtectedRoute role="admin" />}>
                    <Route element={<AdminLayout />}>
                        <Route index element={<DashboardPage />} />
                        <Route path="orders" element={<OrdersPage />} />
                        <Route path="video" element={<VideoPage />} />
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
        </AuthProvider>
    );
}
