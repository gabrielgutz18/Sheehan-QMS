import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import Clock from '../../../components/clock.jsx';
import { useAuth } from '../../auth/authContext.js';
import { ROLE_LABELS } from '../../auth/roles.js';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import Avatar from '../common/avatar.jsx';
import OrderStatusDrawer, { BOARD_DOCKS } from '../orderStatus/orderStatusDrawer.jsx';
import logo from '../../../assets/SheehanLogo.png';

const icon = (d) => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={d} />
    </svg>
);

// roles: who sees the link (the routes in adminApp.jsx and the backend check the same)
const navItems = [
    { to: "/admin", label: "Dashboard", end: true, roles: ["admin"], icon: icon("M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z") },
    { to: "/admin/customer-order", label: "Customer order", roles: ["admin", "sales"], icon: icon("M9 3h6v3H9zM9 4.5H5V21h14V4.5h-4M12 10v7M8.5 13.5h7") },
    { to: "/admin/counter", label: "My counter", roles: ["admin", "sales"], icon: icon("M3 10h18M5 10v10h14V10M8 10V6a4 4 0 0 1 8 0v4") },
    { to: "/admin/orders", label: "Orders", roles: ["admin", "sales"], icon: icon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01") },
    { to: "/admin/loading", label: "Loading", roles: ["admin", "loading"], icon: icon("M3 6h11v10H3zM14 10h4l3 3v3h-7M5 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0") },
    // admins and sales have the same board on Customer order
    { to: "/admin/order-status", label: "Order status", roles: ["loading"], icon: icon("M4 6h3M4 12h3M4 18h3M11 6h9M11 12h9M11 18h9M5.5 4.5v3M5.5 10.5v3M5.5 16.5v3") },
    { to: "/admin/security", label: "Security", roles: ["admin", "security"], icon: icon("M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5") },
    { to: "/admin/history", label: "History", roles: ["admin", "sales"], icon: icon("M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2") },
    { to: "/admin/video", label: "Display video", roles: ["admin"], icon: icon("M3 6h13v12H3zM16 10l5-3v10l-5-3") },
    { to: "/admin/announcer", label: "Announcer", roles: ["admin"], icon: icon("M4 9v6h4l5 4V5L8 9zM16 9a3 3 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11") },
    { to: "/admin/printer", label: "Printer", roles: ["admin"], icon: icon("M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z") },
    { to: "/admin/account", label: "My account", roles: ["admin", "sales", "loading", "security"], icon: icon("M20 21v-1a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8") },
    { to: "/admin/accounts", label: "Accounts", roles: ["admin"], icon: icon("M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 8v6M22 11h-6") },
];

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [signingOut, setSigningOut] = useState(false);
    // only matters on narrow screens, where the sidebar slides over the page
    const [menuOpen, setMenuOpen] = useState(false);
    const { pathname } = useLocation();
    const boardDocks = useMediaQuery(BOARD_DOCKS);
    // the Order status board is already on the page: the loading crews' Order status page, the Security page (the
    // board with what each customer bought), or beside Customer order in a window wide enough for it; everywhere else
    // the top bar's drawer opens it
    const boardOnPage = pathname === "/admin/order-status" || pathname === "/admin/security" ||
        (pathname === "/admin/customer-order" && boardDocks);

    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [menuOpen]);

    const handleLogout = async () => {
        setSigningOut(true);
        await logout();
        navigate("/admin/login", { replace: true });
    };

    return (
        <div className="admin-shell">
            <aside id="admin-sidebar" className={`admin-sidebar${menuOpen ? " is-open" : ""}`}>
                <div className="admin-sidebar-brand">
                    <img className="admin-logo" src={logo} alt="Sheehan Inc. logo" />
                    <div>
                        <span className="admin-compname">Sheehan Inc.</span>
                        <span className="admin-badge">{ROLE_LABELS[user?.role] ?? "Staff"}</span>
                    </div>
                </div>

                <nav className="admin-nav" aria-label="Admin">
                    {navItems.filter(({ roles }) => roles.includes(user?.role)).map(({ to, label, end, icon }) => (
                        <NavLink key={to} to={to} end={end} className="admin-nav-link" onClick={() => setMenuOpen(false)}>
                            {icon}
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className="admin-sidebar-foot">
                    <NavLink to="/admin/account" className="admin-user" onClick={() => setMenuOpen(false)}>
                        <Avatar account={user} size={36} />
                        <span className="admin-user-name">{user?.name}</span>
                    </NavLink>
                    <button type="button" className="admin-btn" onClick={handleLogout} disabled={signingOut}>
                        {signingOut ? "Signing out..." : "Sign out"}
                    </button>
                </div>
            </aside>

            {menuOpen && <div className="admin-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

            <div className="admin-body">
                <header className="admin-topbar">
                    <button
                        type="button"
                        className="admin-menu-btn"
                        aria-label="Open menu"
                        aria-controls="admin-sidebar"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen(true)}
                    >
                        {icon("M4 6h16M4 12h16M4 18h16")}
                    </button>
                    <Clock />
                    {!boardOnPage && <OrderStatusDrawer />}
                </header>

                <main className="admin-main">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
