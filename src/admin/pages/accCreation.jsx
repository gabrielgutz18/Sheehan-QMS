import { useEffect, useRef, useState } from 'react';

import { createUser, listUsers, updateUser } from '../api/adminUserController.js';
import { useAuth } from '../auth/authContext.js';
import { ROLE_LABELS } from '../auth/roles.js';
import Avatar from '../components/avatar.jsx';
import EmployeeGrid from '../components/employeeGrid.jsx';

// staff accounts, admins only: create accounts (usually sales staff), reset passwords, switch accounts off,
// and see how many customers each person has served
// an account is switched off rather than deleted, so the customers it served stay on record

const MIN_PASSWORD = 8;
// who's signed in and serving keeps changing, so the list refreshes while the page is open
const REFRESH_MS = 30000;
const whole = new Intl.NumberFormat();
const EMPTY_FORM = { name: "", username: "", password: "", role: "sales" };

// a small dialog for typing someone's new password
function PasswordDialog({ account, busy, error, onSave, onClose }) {
    const dialogRef = useRef(null);
    const [password, setPassword] = useState("");

    useEffect(() => {
        if (!dialogRef.current.open) dialogRef.current.showModal();
    }, []);

    return (
        <dialog ref={dialogRef} className="admin-dialog" aria-labelledby="password-title" onClose={onClose}>
            <form
                className="admin-dialog-body"
                onSubmit={(e) => {
                    e.preventDefault();
                    onSave(password);
                }}
            >
                <h2 id="password-title" className="admin-dialog-title">New password for {account.name}</h2>
                <p className="admin-dialog-sub">They'll be signed out and use this password next time.</p>
                <label className="admin-field">
                    New password
                    <input
                        type="text"
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD}
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                    />
                </label>
                <p className="admin-dialog-hint">At least {MIN_PASSWORD} characters. Tell it to them in person.</p>
                {error && <p className="field-error" role="alert">{error}</p>}
                <div className="admin-dialog-actions">
                    <button type="button" className="admin-btn" onClick={() => dialogRef.current.close()} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="admin-btn admin-btn-primary" disabled={busy || password.length < MIN_PASSWORD}>
                        {busy ? "Saving..." : "Save password"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}

export default function AccCreation() {
    const { user: me } = useAuth();
    const [accounts, setAccounts] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [showPassword, setShowPassword] = useState(false);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(null);
    const [resetting, setResetting] = useState(null);
    const [resetError, setResetError] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    // bumped on every save, so a refresh that started before it doesn't put the old details back
    const edits = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;

        // only the first load reports errors; a failed refresh keeps the list it has
        const load = (quiet) => {
            const seen = edits.current;
            return listUsers({ signal })
                .then((list) => edits.current === seen && setAccounts(list))
                .catch((err) => !quiet && !signal.aborted && setError(err.message));
        };

        load(false);
        const id = setInterval(() => load(true), REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    const field = (key) => ({
        value: form[key],
        onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
    });

    const replace = (saved) => {
        edits.current += 1;
        setAccounts((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    };

    const create = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError("");
        setNotice("");
        try {
            const created = await createUser({ ...form, username: form.username.trim(), name: form.name.trim() });
            edits.current += 1;
            setAccounts((prev) => [...prev, created]);
            setNotice(`Account created. ${created.name} can sign in with the username “${created.username}”.`);
            setForm(EMPTY_FORM);
            setShowPassword(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    };

    const change = async (account, changes, message) => {
        setBusy(account.id);
        setError("");
        setNotice("");
        try {
            replace(await updateUser(account.id, changes));
            setNotice(message);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(null);
        }
    };

    const toggle = (account) => {
        if (!account.disabled && !window.confirm(`Switch off ${account.name}'s account? They'll be signed out and can't sign in until it's switched back on.`)) {
            return;
        }
        change(account, { disabled: !account.disabled }, account.disabled
            ? `${account.name} can sign in again.`
            : `${account.name}'s account is switched off.`);
    };

    const savePassword = async (password) => {
        setBusy(resetting.id);
        setResetError("");
        try {
            replace(await updateUser(resetting.id, { password }));
            setNotice(`New password saved for ${resetting.name}.`);
            setResetting(null);
        } catch (err) {
            setResetError(err.message);
        } finally {
            setBusy(null);
        }
    };

    // the built-in admin from .env, and your own account, can't be demoted or switched off
    const locked = (account) => account.builtIn || account.id === me.id;

    return (
        <section className="admin-page">
            <h1 className="admin-title">Accounts</h1>

            {error && <p className="field-error" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <EmployeeGrid accounts={accounts} meId={me.id} />

            <div className="admin-panel">
                <h2>Create an account</h2>
                <form className="account-form" onSubmit={create}>
                    <label className="admin-field">
                        Name
                        <input type="text" required maxLength={60} placeholder="Maria Santos" {...field("name")} />
                    </label>
                    <label className="admin-field">
                        Username
                        <input
                            type="text"
                            required
                            minLength={3}
                            maxLength={32}
                            pattern="[A-Za-z0-9._\-]+"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="sales_staff2"
                            {...field("username")}
                        />
                    </label>
                    <label className="admin-field">
                        Password
                        <span className="password-row">
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                minLength={MIN_PASSWORD}
                                maxLength={128}
                                autoComplete="new-password"
                                {...field("password")}
                            />
                            <button type="button" className="admin-btn" onClick={() => setShowPassword((s) => !s)}>
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </span>
                    </label>
                    <label className="admin-field">
                        Role
                        <select {...field("role")}>
                            <option value="sales">Sales: serves customers from My counter</option>
                            <option value="loading">Loading: roofing and steel loading, their own page only</option>
                            <option value="admin">Admin: everything, including accounts</option>
                        </select>
                    </label>
                    <div className="account-form-actions">
                        <button type="submit" className="admin-btn admin-btn-primary" disabled={creating}>
                            {creating ? "Creating..." : "Create account"}
                        </button>
                        <span className="video-hint">Usernames: letters, numbers, dots, dashes or underscores. Passwords: at least {MIN_PASSWORD} characters.</span>
                    </div>
                </form>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Name</th>
                            <th scope="col">Username</th>
                            <th scope="col">Role</th>
                            <th scope="col">Served today</th>
                            <th scope="col">Total served</th>
                            <th scope="col">Status</th>
                            <th scope="col"><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {!accounts ? (
                            <tr><td colSpan={7} className="admin-empty">Loading...</td></tr>
                        ) : (
                            accounts.map((a) => (
                                <tr key={a.id} className={a.disabled ? "is-disabled" : undefined}>
                                    <td>
                                        <span className="account-person">
                                            <Avatar account={a} size={32} />
                                            <strong>{a.name}</strong>
                                        </span>
                                        {(a.employeeId || a.department) && (
                                            <span className="history-note">
                                                {[a.employeeId, a.department].filter(Boolean).join(" · ")}
                                            </span>
                                        )}
                                        {a.id === me.id && <span className="history-note">You</span>}
                                        {a.builtIn && <span className="history-note">Built-in admin (password set in .env)</span>}
                                    </td>
                                    <td>{a.username}</td>
                                    <td>
                                        {locked(a) ? (
                                            ROLE_LABELS[a.role]
                                        ) : (
                                            <select
                                                className="status-select"
                                                aria-label={`Role for ${a.name}`}
                                                value={a.role}
                                                disabled={busy === a.id}
                                                onChange={(e) => change(a, { role: e.target.value }, `${a.name} is now ${ROLE_LABELS[e.target.value]}.`)}
                                            >
                                                <option value="sales">Sales</option>
                                                <option value="loading">Loading</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        )}
                                    </td>
                                    <td>{whole.format(a.servedToday)}</td>
                                    <td>{whole.format(a.servedTotal)}</td>
                                    <td>
                                        <span className={`history-badge ${a.disabled ? "history-badge--deleted" : "status-done"}`}>
                                            {a.disabled ? "Switched off" : "Active"}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="row-actions">
                                            {!a.builtIn && (
                                                <button
                                                    type="button"
                                                    className="admin-btn"
                                                    disabled={busy === a.id}
                                                    onClick={() => {
                                                        setResetError("");
                                                        setResetting(a);
                                                    }}
                                                >
                                                    Reset password
                                                </button>
                                            )}
                                            {!locked(a) && (
                                                <button
                                                    type="button"
                                                    className={`admin-btn${a.disabled ? "" : " admin-btn-danger"}`}
                                                    disabled={busy === a.id}
                                                    onClick={() => toggle(a)}
                                                >
                                                    {a.disabled ? "Switch on" : "Switch off"}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {resetting && (
                <PasswordDialog
                    account={resetting}
                    busy={busy === resetting.id}
                    error={resetError}
                    onSave={savePassword}
                    onClose={() => setResetting(null)}
                />
            )}
        </section>
    );
}
