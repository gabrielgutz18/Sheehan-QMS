import { useEffect, useState } from 'react';
import { matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import Clock from '../../../components/clock.jsx';
import { useAuth } from '../../auth/authContext.js';
import { ROLE_LABELS } from '../../auth/roles.js';
import { NAV_GROUPS, navFor, withFolders } from '../../data/navItems.js';
import useMediaQuery from '../../hooks/useMediaQuery.js';
import Avatar from '../common/avatar.jsx';
import Icon from '../common/icon.jsx';
import OrderStatusDrawer, { BOARD_DOCKS } from '../orderStatus/orderStatusDrawer.jsx';
import logo from '../../../assets/SheehanLogo.png';

// windows this narrow have no room for the sidebar beside the page: it slides over it from the menu button instead
const SIDEBAR_SLIDES = "(max-width: 900px)";
const SIDEBAR_ICON = "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9.5 4v16";
const SIGN_OUT_ICON = "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4";
const CHEVRON_ICON = "M9 6l6 6-6 6";

// one sidebar link; onNavigate puts the sliding sidebar away on narrow screens
function NavItem({ item: { to, label, end, icon }, onNavigate }) {
    return (
        <NavLink to={to} end={end} className="admin-nav-link" onClick={onNavigate}>
            <Icon d={icon} className="admin-nav-icon" />
            {label}
        </NavLink>
    );
}

// a sidebar folder (Department: Loading, Security, Cashier) that opens and closes on a click; it starts open when the
// page on screen is one of its links, and stays however it was left after that
function NavFolder({ folder, icon, links, onNavigate }) {
    const { pathname } = useLocation();
    // null until it's clicked
    const [open, setOpen] = useState(null);
    const holdsCurrent = links.some(({ to, end = false }) => matchPath({ path: to, end }, pathname));
    const isOpen = open ?? holdsCurrent;
    const listId = `nav-folder-${folder.toLowerCase().replace(/\s+/g, "-")}`;

    return (
        <div className="admin-nav-folder">
            <button
                type="button"
                className={`admin-nav-link admin-nav-folder-btn${holdsCurrent && !isOpen ? " holds-current" : ""}`}
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setOpen(!isOpen)}
            >
                <Icon d={icon} className="admin-nav-icon" />
                {folder}
                <Icon d={CHEVRON_ICON} className="admin-nav-icon admin-nav-chevron" />
            </button>
            <div id={listId} className="admin-nav-folder-links" hidden={!isOpen}>
                {links.map((item) => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}
            </div>
        </div>
    );
}

export default function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [signingOut, setSigningOut] = useState(false);
    const slides = useMediaQuery(SIDEBAR_SLIDES);
    // on narrow screens, whether the sidebar is out over the page
    const [menuOpen, setMenuOpen] = useState(false);
    // on wider ones, whether it's tucked away to give the page the whole width (the Order sheet, say)
    const [collapsed, setCollapsed] = useState(false);
    const { pathname } = useLocation();
    const boardDocks = useMediaQuery(BOARD_DOCKS);
    // the Order status board is already on the page: the loading crews' Order status page, the Security page (the
    // board with what each customer bought), or beside Customer order in a window wide enough for it; everywhere else
    // the top bar's drawer opens it
    const boardOnPage = pathname === "/staff/order-status" || pathname === "/staff/security" ||
        (pathname === "/staff/customer-order" && boardDocks);

    const links = navFor(user?.role);
    // the page open now, named in the top bar
    const current = links.find(({ to, end = false }) => matchPath({ path: to, end }, pathname));
    const sidebarShown = slides ? menuOpen : !collapsed;

    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [menuOpen]);

    const handleLogout = async () => {
        setSigningOut(true);
        await logout();
        navigate("/staff/login", { replace: true });
    };

    return (
        <div className={`admin-shell${collapsed ? " is-collapsed" : ""}`}>
            <aside id="admin-sidebar" className={`admin-sidebar${menuOpen ? " is-open" : ""}`}>
                <div className="admin-sidebar-brand">
                    <img className="admin-logo" src={logo} alt="Sheehan Inc. logo" />
                    <span className="admin-compname">Sheehan Inc.</span>
                </div>

                <nav className="admin-nav" aria-label="Admin">
                    {NAV_GROUPS.map((group) => {
                        const items = links.filter((item) => item.group === group);
                        if (items.length === 0) return null;
                        const headingId = `nav-group-${group.toLowerCase().replace(/\s+/g, "-")}`;
                        return (
                            <div key={group} className="admin-nav-group" role="group" aria-labelledby={headingId}>
                                <p id={headingId} className="admin-nav-heading">{group}</p>
                                {withFolders(items).map((entry) => entry.links
                                    ? <NavFolder key={entry.folder} {...entry} onNavigate={() => setMenuOpen(false)} />
                                    : <NavItem key={entry.to} item={entry} onNavigate={() => setMenuOpen(false)} />)}
                            </div>
                        );
                    })}
                </nav>

                <div className="admin-sidebar-foot">
                    <NavLink to="/staff/account" className="admin-user" onClick={() => setMenuOpen(false)}>
                        <Avatar account={user} size={36} />
                        <span className="admin-user-text">
                            <span className="admin-user-name">{user?.name}</span>
                            <span className="admin-user-role">{ROLE_LABELS[user?.role] ?? "Staff"}</span>
                        </span>
                    </NavLink>
                    <button type="button" className="admin-signout" onClick={handleLogout} disabled={signingOut}>
                        <Icon d={SIGN_OUT_ICON} className="admin-nav-icon" />
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
                        aria-label={slides ? "Open menu" : collapsed ? "Show sidebar" : "Hide sidebar"}
                        aria-controls="admin-sidebar"
                        aria-expanded={sidebarShown}
                        onClick={() => (slides ? setMenuOpen(true) : setCollapsed((was) => !was))}
                    >
                        <Icon d={SIDEBAR_ICON} className="admin-nav-icon" />
                    </button>
                    {current && (
                        <p className="admin-topbar-title">
                            <Icon d={current.icon} className="admin-nav-icon" />
                            <span>{current.label}</span>
                        </p>
                    )}
                    <div className="admin-topbar-end">
                        <Clock />
                        {!boardOnPage && <OrderStatusDrawer />}
                    </div>
                </header>

                <main className="admin-main">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
