import { Navigate, Route, Routes } from "react-router";
import "./style/admin.css";

import AuthProvider from "./auth/authProvider.jsx";
import ProtectedRoute from "./auth/protectedRoute.jsx";
import { useAuth } from "./auth/authContext.js";
import { ROLE_LABELS } from "./auth/roles.js";
import AdminLayout from "./components/layout/adminLayout.jsx";
import LoginPage from "./pages/loginPage.jsx";
import DashboardPage from "./pages/dashboardPage.jsx";
import DisplaySettingsPage from "./pages/displaySettingsPage.jsx";
import SalesPage from "./pages/salesPage.jsx";
import CustomerOrderPage from "./pages/customerOrderPage.jsx";
import AccCreation from "./pages/accCreation.jsx";
import AccountPage from "./pages/accountPage.jsx";
import LoadingPage from "./pages/loadingPage.jsx";
import ServicePage from "./pages/servicePage.jsx";
import HardwarePage from "./pages/hardwarePage.jsx";
import OrderStatusPage from "./pages/orderStatusPage.jsx";
import SecurityPage from "./pages/securityPage.jsx";
import CashierPage from "./pages/cashierPage.jsx";
import DeletedTicketsPage from "./pages/deletedTicketsPage.jsx";
import MessagesPage from "./pages/messagesPage.jsx";
import SettingsPage from "./pages/settingsPage.jsx";

// every kind of staff account but the developers, who are written to from Message developer
const NOT_DEVELOPER = ["admin", "sales", "loading", "service", "hardware", "security", "cashier", "inventory"];

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
                        {/* setting up this device (Install app, Install certificate), for everyone */}
                        <Route path="settings" element={<SettingsPage />} />

                        {/* the live queue, who is in charge of each customer and their own profile, for everyone
                            (admins' has the day's counts and sales graph too, and the developers' the reports staff
                            sent through the bot) */}
                        <Route index element={<DashboardPage />} />

                        {/* SheeChat with one another, for everyone: the staff with the staff and the developers with
                            the developers; for the staff it has Message developer as its second tab */}
                        <Route path="sheechat" element={<MessagesPage />} />

                        {/* writing to the developers when something doesn't go well, for everyone but them */}
                        <Route element={<ProtectedRoute roles={NOT_DEVELOPER} />}>
                            <Route
                                path="message-developer"
                                element={<Navigate to="/staff/sheechat?tab=developer" replace />}
                            />
                        </Route>

                        {/* the developers: answering what staff write, with no rights in the queue beyond the Order
                            status board, and Accounts (not admin accounts) */}
                        <Route element={<ProtectedRoute roles={["developer"]} />}>
                            {/* the developers' old Chat page is SheeChat's Staff concerns tab now */}
                            <Route path="chat" element={<Navigate to="/staff/sheechat?tab=concerns" replace />} />
                        </Route>

                        {/* purging deleted tickets to free up the database: the developers' own page; admins have the
                            same list, with Restore, on Customer order */}
                        <Route element={<ProtectedRoute roles={["admin", "developer"]} />}>
                            <Route path="deleted-tickets" element={<DeletedTicketsPage />} />
                        </Route>

                        <Route element={<ProtectedRoute roles={["admin", "sales"]} />}>
                            <Route path="customer-order" element={<CustomerOrderPage />} />
                            <Route path="counter" element={<SalesPage />} />
                            {/* Orders and History are the Orders & history tab of Customer order now; their old
                                addresses open it (sales can set any status there but Now serving, as they don't call;
                                Call stays admin-only, and Purge is for admins and developers) */}
                            <Route path="orders" element={<Navigate to="/staff/customer-order?tab=orders" replace />} />
                            <Route
                                path="history"
                                element={<Navigate to="/staff/customer-order?tab=history" replace />}
                            />
                        </Route>

                        {/* the loading crew; no admin rights beyond these pages and My account */}
                        <Route element={<ProtectedRoute roles={["admin", "loading"]} />}>
                            <Route path="loading" element={<LoadingPage />} />
                        </Route>

                        {/* the Service department (Tire, Battery), the same as the loading crew for its own area */}
                        <Route element={<ProtectedRoute roles={["admin", "service"]} />}>
                            <Route path="service" element={<ServicePage />} />
                        </Route>

                        {/* the Hardware department, the same as the loading crew for its own area */}
                        <Route element={<ProtectedRoute roles={["admin", "hardware"]} />}>
                            <Route path="hardware" element={<HardwarePage />} />
                        </Route>

                        {/* where every customer is, for the departments and the developers; admins and sales have
                            the same board on Customer order */}
                        <Route
                            element={
                                <ProtectedRoute
                                    roles={["admin", "loading", "service", "hardware", "inventory", "developer"]}
                                />
                            }
                        >
                            <Route path="order-status" element={<OrderStatusPage />} />
                        </Route>

                        {/* the security guards at the gate, the last stage: looking only, no admin rights beyond this
                            page and My account */}
                        <Route element={<ProtectedRoute roles={["admin", "security"]} />}>
                            <Route path="security" element={<SecurityPage />} />
                        </Route>

                        {/* how each order is paid: the cashier, who only looks, with nothing beyond this page and My
                            account, and sales, who change it */}
                        <Route element={<ProtectedRoute roles={["admin", "sales", "cashier"]} />}>
                            <Route path="cashier" element={<CashierPage />} />
                        </Route>

                        <Route element={<ProtectedRoute roles={["admin"]} />}>
                            {/* the display's video and announcer and the receipt printer, as tabs of one page; the old
                                addresses open their tab */}
                            <Route path="display" element={<DisplaySettingsPage />} />
                            <Route path="video" element={<Navigate to="/staff/display?tab=video" replace />} />
                            <Route path="announcer" element={<Navigate to="/staff/display?tab=announcer" replace />} />
                            <Route path="printer" element={<Navigate to="/staff/display?tab=printer" replace />} />
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
