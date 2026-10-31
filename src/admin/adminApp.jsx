import { Navigate, Route, Routes } from 'react-router';
import './style/admin.css';

import AuthProvider from './auth/authProvider.jsx';
import ProtectedRoute from './auth/protectedRoute.jsx';
import { useAuth } from './auth/authContext.js';
import { ROLE_LABELS } from './auth/roles.js';
import AdminLayout from './components/layout/adminLayout.jsx';
import LoginPage from './pages/loginPage.jsx';
import DashboardPage from './pages/dashboardPage.jsx';
import VideoPage from './pages/videoPage.jsx';
import PrinterPage from './pages/printerPage.jsx';
import AnnouncerPage from './pages/announcerPage.jsx';
import SalesPage from './pages/salesPage.jsx';
import CustomerOrderPage from './pages/customerOrderPage.jsx';
import AccCreation from './pages/accCreation.jsx';
import AccountPage from './pages/accountPage.jsx';
import LoadingPage from './pages/loadingPage.jsx';
import TbaPage from './pages/tbaPage.jsx';
import HardwarePage from './pages/hardwarePage.jsx';
import OrderStatusPage from './pages/orderStatusPage.jsx';
import SecurityPage from './pages/securityPage.jsx';
import CashierPage from './pages/cashierPage.jsx';
import ChatPage from './pages/chatPage.jsx';
import MessageDeveloperPage from './pages/messageDeveloperPage.jsx';
import SheeChatPage from './pages/sheeChatPage.jsx';

// every kind of staff account but the developers, who are written to from Message developer and have no Dashboard
const NOT_DEVELOPER = ["admin", "sales", "loading", "tba", "hardware", "security", "cashier", "inventory"];

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
                <Route element={<ProtectedRoute roles={[...NOT_DEVELOPER, "developer"]} />}>
                    <Route element={<AdminLayout />}>
                        <Route path="account" element={<AccountPage />} />

                        {/* the live queue and their own profile, for everyone but the developers (admins' has the
                            day's counts and sales graph too), SheeChat with one another, and writing to the developers
                            when something doesn't go well */}
                        <Route element={<ProtectedRoute roles={NOT_DEVELOPER} />}>
                            <Route index element={<DashboardPage />} />
                            <Route path="sheechat" element={<SheeChatPage />} />
                            <Route path="message-developer" element={<MessageDeveloperPage />} />
                        </Route>

                        {/* the developers: answering what staff write, with no rights in the queue beyond the Order
                            status board, and Accounts (not admin accounts) */}
                        <Route element={<ProtectedRoute roles={["developer"]} />}>
                            <Route path="chat" element={<ChatPage />} />
                        </Route>

                        <Route element={<ProtectedRoute roles={["admin", "sales"]} />}>
                            <Route path="customer-order" element={<CustomerOrderPage />} />
                            <Route path="counter" element={<SalesPage />} />
                            {/* Orders and History are the Orders & history tab of Customer order now; their old
                                addresses open it (sales can set any status there but Now serving, as they don't call;
                                Call and Delete stay admin-only) */}
                            <Route path="orders" element={<Navigate to="/staff/customer-order?tab=orders" replace />} />
                            <Route path="history" element={<Navigate to="/staff/customer-order?tab=history" replace />} />
                        </Route>

                        {/* the loading crew; no admin rights beyond these pages and My account */}
                        <Route element={<ProtectedRoute roles={["admin", "loading"]} />}>
                            <Route path="loading" element={<LoadingPage />} />
                        </Route>

                        {/* the TBA department (Tire, Battery, Chassis), the same as the loading crew for its own area */}
                        <Route element={<ProtectedRoute roles={["admin", "tba"]} />}>
                            <Route path="tba" element={<TbaPage />} />
                        </Route>

                        {/* the Hardware department, the same as the loading crew for its own area */}
                        <Route element={<ProtectedRoute roles={["admin", "hardware"]} />}>
                            <Route path="hardware" element={<HardwarePage />} />
                        </Route>

                        {/* where every customer is, for the departments and the developers; admins and sales have
                            the same board on Customer order */}
                        <Route element={<ProtectedRoute roles={["admin", "loading", "tba", "hardware", "inventory", "developer"]} />}>
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
                        </Route>

                        {/* the developers make and fix staff accounts too, but not admin ones */}
                        <Route element={<ProtectedRoute roles={["admin", "developer"]} />}>
                            <Route path="accounts" element={<AccCreation />} />
                        </Route>
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/staff" replace />} />
            </Routes>
        </AuthProvider>
    );
}
