import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';

import Clock from '../../components/clock.jsx';
import { useAuth } from '../auth/authContext.js';
import logo from '../../assets/SheehanLogo.png';

const navItems = [
    { to: "/admin", label: "Dashboard", end: true },
    { to: "/admin/orders", label: "Orders" },
];

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [signingOut, setSigningOut] = useState(false);

    const handleLogout = async () => {
        setSigningOut(true);
        await logout();
        navigate("/admin/login", { replace: true });
    };

    return (
        <div className="admin-shell">
            <header className="admin-header">
                <div className="admin-bar">
                    <div className="brand">
                        <img className="logo" src={logo} alt="Sheehan Inc. logo" />
                        <h2 className="compname">Sheehan Inc.</h2>
                        <span className="admin-badge">Admin</span>
                    </div>

                    <nav className="admin-nav" aria-label="Admin">
                        {navItems.map(({ to, label, end }) => (
                            <NavLink key={to} to={to} end={end} className="admin-nav-link">
                                {label}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="admin-user">
                        <Clock />
                        <span className="admin-user-name">{user?.name}</span>
                        <button type="button" className="admin-btn" onClick={handleLogout} disabled={signingOut}>
                            {signingOut ? "Signing out..." : "Sign out"}
                        </button>
                    </div>
                </div>
            </header>

            <main className="admin-main">
                <Outlet />
            </main>
        </div>
    );
}
