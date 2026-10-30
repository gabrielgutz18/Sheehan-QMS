import { Navigate, Route, Routes } from 'react-router';
import './style/admin.css';

import AuthProvider from './auth/authProvider.jsx';
import ProtectedRoute from './auth/protectedRoute.jsx';
import { useAuth } from './auth/authContext.js';
import { ROLE_LABELS } from './auth/roles.js';
import AdminLayout from './components/layout/adminLayout.jsx';
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
import HardwarePage from './pages/hardwarePage.jsx';
import OrderStatusPage from './pages/orderStatusPage.jsx';
import SecurityPage from './pages/securityPage.jsx';
import CashierPage from './pages/cashierPage.jsx';

// the browser tab: "Sheehan Inc. — Staff" until someone signs in, then their role ("Sheehan Inc. — Sales")
function StaffTitle() {
    const { user } = useAuth();
    return <title>{`Sheehan Inc. — ${ROLE_LABELS[user?.role] ?? "Staff"}`}</title>;
}

// mounted at /staff/* — paths below are relative to it
export default function AdminApp() {
    return (
        <AuthProvider>
            <StaffTitle />
            {/* keep admin pages out of search engines if the site is ever public */}
            <meta name="robots" content="noindex, nofollow" />

            <Routes>
                <Route path="login" element={<LoginPage />} />

                {/* every kind of staff account shares the layout; the pages inside are split by role */}
                <Route element={<ProtectedRoute roles={["admin", "sales", "loading", "hardware", "security", "cashier"]} />}>
                    <Route element={<AdminLayout />}>
                        {/* the live queue and their own profile, for everyone; admins' has the day's counts and sales
                            graph too */}
                        <Route index element={<DashboardPage />} />
                        <Route path="account" element={<AccountPage />} />

                        <Route element={<ProtectedRoute roles={["admin", "sales"]} />}>
                            <Route path="customer-order" element={<CustomerOrderPage />} />
                            <Route path="counter" element={<SalesPage />} />
                            {/* sales can set any status here but Now serving (they don't call); Call and Delete stay
                                admin-only */}
                            <Route path="orders" element={<OrdersPage />} />
                            <Route path="history" element={<HistoryPage />} />
                        </Route>

                        {/* the loading crew; no admin rights beyond these pages and My account */}
                        <Route element={<ProtectedRoute roles={["admin", "loading"]} />}>
                            <Route path="loading" element={<LoadingPage />} />
                        </Route>

                        {/* the Hardware department, the same as the loading crew for its own area */}
                        <Route element={<ProtectedRoute roles={["admin", "hardware"]} />}>
                            <Route path="hardware" element={<HardwarePage />} />
                        </Route>

                        {/* where every customer is, for both departments; admins and sales have the same board on
                            Customer order */}
                        <Route element={<ProtectedRoute roles={["admin", "loading", "hardware"]} />}>
                            <Route path="order-status" element={<OrderStatusPage />} />
                        </Route>

                        {/* the security guards at the gate, the last stage: looking only, no admin rights beyond this
                            page and My account */}
                        <Route element={<ProtectedRoute roles={["admin", "security"]} />}>
                            <Route path="security" element={<SecurityPage />} />
                        </Route>

                        {/* changing how each order is paid: the cashier, with no admin rights beyond this page and My
                            account, and sales */}
                        <Route element={<ProtectedRoute roles={["admin", "sales", "cashier"]} />}>
                            <Route path="cashier" element={<CashierPage />} />
                        </Route>

                        <Route element={<ProtectedRoute roles={["admin"]} />}>
                            <Route path="video" element={<VideoPage />} />
                            <Route path="printer" element={<PrinterPage />} />
                            <Route path="announcer" element={<AnnouncerPage />} />
                            <Route path="accounts" element={<AccCreation />} />
                        </Route>
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/staff" replace />} />
            </Routes>
        </AuthProvider>
    );
}
