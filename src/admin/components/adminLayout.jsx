import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import Clock from '../../components/clock.jsx';
import { useAuth } from '../auth/authContext.js';
import logo from '../../assets/SheehanLogo.png';

const icon = (d) => (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={d} />
    </svg>
);

const navItems = [
    { to: "/admin", label: "Dashboard", end: true, icon: icon("M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z") },
    { to: "/admin/orders", label: "Orders", icon: icon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01") },
    { to: "/admin/video", label: "Display video", icon: icon("M3 6h13v12H3zM16 10l5-3v10l-5-3") },
    { to: "/admin/printer", label: "Printer", icon: icon("M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z") },
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
                        <span className="admin-badge">Admin</span>
                    </div>
                </div>

                <nav className="admin-nav" aria-label="Admin">
                    {navItems.map(({ to, label, end, icon }) => (
                        <NavLink key={to} to={to} end={end} className="admin-nav-link" onClick={() => setMenuOpen(false)}>
                            {icon}
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className="admin-sidebar-foot">
                    <span className="admin-user-name">{user?.name}</span>
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
