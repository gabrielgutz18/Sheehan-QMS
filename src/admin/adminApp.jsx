import { Navigate, Route, Routes } from 'react-router';
import './style/admin.css';

import AuthProvider from './auth/authProvider.jsx';
import ProtectedRoute from './auth/protectedRoute.jsx';
import AdminLayout from './components/adminLayout.jsx';
import LoginPage from './pages/loginPage.jsx';
import DashboardPage from './pages/dashboardPage.jsx';
import OrdersPage from './pages/ordersPage.jsx';
import VideoPage from './pages/videoPage.jsx';
import PrinterPage from './pages/printerPage.jsx';
import AnnouncerPage from './pages/announcerPage.jsx';
import HistoryPage from './pages/historyPage.jsx';
import SalesPage from './pages/salesPage.jsx';
import CustomerOrderPage from './pages/customerOrderPage.jsx';
import AccCreation from './pages/accCreation.jsx';
import AccountPage from './pages/accountPage.jsx';
import LoadingPage from './pages/loadingPage.jsx';
import OrderStatusPage from './pages/orderStatusPage.jsx';

// mounted at /admin/* — paths below are relative to it
export default function AdminApp() {
    return (
        <AuthProvider>
            <title>Sheehan Inc. — Admin</title>
            {/* keep admin pages out of search engines if the site is ever public */}
            <meta name="robots" content="noindex, nofollow" />

            <Routes>
                <Route path="login" element={<LoginPage />} />

                {/* every kind of staff account shares the layout; the pages inside are split by role */}
                <Route element={<ProtectedRoute roles={["admin", "sales", "loading"]} />}>
                    <Route element={<AdminLayout />}>
                        <Route path="account" element={<AccountPage />} />

                        <Route element={<ProtectedRoute roles={["admin", "sales"]} />}>
                            <Route path="customer-order" element={<CustomerOrderPage />} />
                            <Route path="counter" element={<SalesPage />} />
                            {/* sales can set any status here too; Delete stays admin-only */}
                            <Route path="orders" element={<OrdersPage />} />
                            <Route path="history" element={<HistoryPage />} />
                        </Route>

                        {/* the loading crew; no admin rights beyond these pages and My account */}
                        <Route element={<ProtectedRoute roles={["admin", "loading"]} />}>
                            <Route path="loading" element={<LoadingPage />} />
                            {/* where every customer is; admins and sales have the same board on Customer order */}
                            <Route path="order-status" element={<OrderStatusPage />} />
                        </Route>

                        <Route element={<ProtectedRoute roles={["admin"]} />}>
                            <Route index element={<DashboardPage />} />
                            <Route path="video" element={<VideoPage />} />
                            <Route path="printer" element={<PrinterPage />} />
                            <Route path="announcer" element={<AnnouncerPage />} />
                            <Route path="accounts" element={<AccCreation />} />
                        </Route>
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
        </AuthProvider>
    );
}
