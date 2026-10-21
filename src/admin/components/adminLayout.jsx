import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import Clock from '../../components/clock.jsx';
import { useAuth } from '../auth/authContext.js';
import { ROLE_LABELS } from '../auth/roles.js';
import Avatar from './avatar.jsx';
import logo from '../../assets/SheehanLogo.png';

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
    { to: "/admin/orders", label: "Orders", roles: ["admin"], icon: icon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01") },
    { to: "/admin/history", label: "History", roles: ["admin", "sales"], icon: icon("M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2") },
    { to: "/admin/video", label: "Display video", roles: ["admin"], icon: icon("M3 6h13v12H3zM16 10l5-3v10l-5-3") },
    { to: "/admin/announcer", label: "Announcer", roles: ["admin"], icon: icon("M4 9v6h4l5 4V5L8 9zM16 9a3 3 0 0 1 0 6M18.5 6.5a7 7 0 0 1 0 11") },
    { to: "/admin/printer", label: "Printer", roles: ["admin"], icon: icon("M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z") },
    { to: "/admin/account", label: "My account", roles: ["admin", "sales"], icon: icon("M20 21v-1a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8") },
    { to: "/admin/accounts", label: "Accounts", roles: ["admin"], icon: icon("M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 8v6M22 11h-6") },
];

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [signingOut, setSigningOut] = useState(false);
    // only matters on narrow screens, where the sidebar slides over the page
    const [menuOpen, setMenuOpen] = useState(false);

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
                </header>

                <main className="admin-main">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
