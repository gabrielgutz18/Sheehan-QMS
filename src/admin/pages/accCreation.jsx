import { useEffect, useRef, useState } from 'react';

import { createUser, listUsers, updateUser } from '../api/adminUserController.js';
import { useAuth } from '../auth/authContext.js';
import { ROLE_LABELS } from '../auth/roles.js';
import Avatar from '../components/common/avatar.jsx';
import DepartmentTabs from '../components/accounts/departmentTabs.jsx';
import EmployeeGrid from '../components/accounts/employeeGrid.jsx';
import teams from '../../data/teams.js';

// staff accounts, for admins and developers: create accounts (usually sales staff), set each person's sales team, reset passwords,
// switch accounts off, and see how many customers each person has served
// an account is switched off rather than deleted, so the customers it served stay on record
// the sales team marks the edits they save on Customer order ("Edited by Maria Santos · GIGA")
// a developer can't make an admin account or change one (the backend refuses it too)

const MIN_PASSWORD = 8;
// who's signed in and serving keeps changing, so the list refreshes while the page is open
const REFRESH_MS = 30000;
const whole = new Intl.NumberFormat();
const EMPTY_FORM = { name: "", username: "", password: "", role: "sales", team: "" };
// one row of the create form; key tells React the rows apart when one is removed
let nextRowKey = 0;
const newRow = () => ({ ...EMPTY_FORM, key: nextRowKey++, showPassword: false, error: "" });
const teamNames = teams.map((t) => t.name);
// the roles to pick from on the create form, in the order the dropdown lists them
const ROLE_CHOICES = ["sales", "loading", "tba", "hardware", "security", "cashier", "inventory", "developer", "admin"];

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
    const [rows, setRows] = useState(() => [newRow()]);
    const [department, setDepartment] = useState("all");
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

    // the value and onChange of one input, in the row with this key
    const field = (rowKey, name) => ({
        value: rows.find((r) => r.key === rowKey)[name],
        onChange: (e) => updateRow(rowKey, { [name]: e.target.value }),
    });

    const updateRow = (rowKey, changes) =>
        setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, ...changes, error: "" } : r)));

    const addRow = () => setRows((prev) => [...prev, newRow()]);

    const removeRow = (rowKey) => setRows((prev) => prev.filter((r) => r.key !== rowKey));

    const replace = (saved) => {
        edits.current += 1;
        setAccounts((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    };

    const create = async (e) => {
        e.preventDefault();
        setError("");
        setNotice("");

        // usernames ignore case in the database (COLLATE NOCASE), so "Maria" and "maria" are the same one
        const names = rows.map((r) => r.username.trim().toLowerCase());
        const twice = names.find((u, i) => names.indexOf(u) !== i);
        if (twice) {
            setError(`The username “${twice}” is in the form more than once.`);
            return;
        }

        setCreating(true);
        const made = [];
        const failed = [];
        // one at a time, so each row gets its own answer (e.g. "That username is taken.")
        for (const row of rows) {
            // only the account's details go to the server, not the row's key, Show toggle or error
            const { name, username, password, role, team } = row;
            try {
                made.push(await createUser({ name: name.trim(), username: username.trim(), password, role, team }));
            } catch (err) {
                failed.push({ ...row, error: err.message });
            }
        }

        if (made.length) {
            edits.current += 1;
            setAccounts((prev) => [...prev, ...made]);
            setNotice(made.length === 1
                ? `Account created. ${made[0].name} can sign in with the username “${made[0].username}”.`
                : `${made.length} accounts created: ${made.map((a) => a.username).join(", ")}.`);
        }
        if (failed.length) {
            setError(`${failed.length} of ${rows.length} weren't created. Fix them below and press Create again.`);
        }
        // the ones that saved leave the form; the ones that didn't stay, with their error
        setRows(failed.length ? failed : [newRow()]);
        setCreating(false);
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

    // a tab whose last account moved to another role goes back to All
    const shownTab = department === "all" || accounts?.some((a) => a.role === department) ? department : "all";
    const shown = shownTab === "all" ? accounts : accounts?.filter((a) => a.role === shownTab);

    const isDeveloper = me.role === "developer";
    const roleChoices = isDeveloper ? ROLE_CHOICES.filter((role) => role !== "admin") : ROLE_CHOICES;
    // a developer changes nothing on an admin's account
    const adminOnly = (account) => isDeveloper && account.role === "admin";
    // the built-in admin from .env, and your own account, can't be demoted or switched off
    const locked = (account) => account.builtIn || account.id === me.id || adminOnly(account);

    return (
        <section className="admin-page">
            <h1 className="admin-title">Accounts</h1>

            {error && <p className="field-error" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            {accounts && <DepartmentTabs accounts={accounts} value={shownTab} onChange={setDepartment} />}

            <EmployeeGrid accounts={shown} meId={me.id} />

            <div className="admin-panel">
                <h2>Create accounts</h2>
                <form onSubmit={create}>
                    <div className="account-rows">
                        {rows.map((row, i) => (
                            <fieldset key={row.key} className="account-row" disabled={creating}>
                                <legend className="account-row-title">
                                    Account {i + 1}
                                    {rows.length > 1 && (
                                        <button type="button" className="link-btn" onClick={() => removeRow(row.key)}>
                                            Remove
                                        </button>
                                    )}
                                </legend>
                                <div className="account-form">
                                    <label className="admin-field">
                                        Name
                                        <input type="text" required maxLength={60} placeholder="Maria Santos" {...field(row.key, "name")} />
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
                                            {...field(row.key, "username")}
                                        />
                                    </label>
                                    <label className="admin-field">
                                        Password
                                        <span className="password-row">
                                            <input
                                                type={row.showPassword ? "text" : "password"}
                                                required
                                                minLength={MIN_PASSWORD}
                                                maxLength={128}
                                                autoComplete="new-password"
                                                {...field(row.key, "password")}
                                            />
                                            <button
                                                type="button"
                                                className="admin-btn"
                                                onClick={() => updateRow(row.key, { showPassword: !row.showPassword })}
                                            >
                                                {row.showPassword ? "Hide" : "Show"}
                                            </button>
                                        </span>
                                    </label>
                                    <label className="admin-field">
                                        Role
                                        <select {...field(row.key, "role")}>
                                            {roleChoices.map((role) => (
                                                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="admin-field">
                                        Sales team
                                        <select {...field(row.key, "team")}>
                                            <option value="">No team</option>
                                            {teamNames.map((name) => <option key={name} value={name}>{name}</option>)}
                                        </select>
                                    </label>
                                </div>
                                {row.error && <p className="field-error" role="alert">{row.error}</p>}
                            </fieldset>
                        ))}
                    </div>

                    <button type="button" className="link-btn account-add" onClick={addRow} disabled={creating}>
                        + Add another account
                    </button>

                    <div className="account-form-actions">
                        <button type="submit" className="admin-btn admin-btn-primary" disabled={creating}>
                            {creating
                                ? "Creating..."
                                : rows.length === 1 ? "Create account" : `Create ${rows.length} accounts`}
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
                            <th scope="col">Role and team</th>
                            <th scope="col">Served today</th>
                            <th scope="col">Total served</th>
                            <th scope="col">Status</th>
                            <th scope="col"><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {!shown ? (
                            <tr><td colSpan={7} className="admin-empty">Loading...</td></tr>
                        ) : (
                            shown.map((a) => (
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
                                                {roleChoices.map((role) => (
                                                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                                ))}
                                            </select>
                                        )}
                                        {/* their sales team, under the role: anyone's, yours and the built-in admin's
                                            too, since it only marks the edits they save */}
                                        <select
                                            className="status-select account-team"
                                            aria-label={`Sales team for ${a.name}`}
                                            value={a.team}
                                            disabled={busy === a.id || adminOnly(a)}
                                            onChange={(e) => change(a, { team: e.target.value }, e.target.value
                                                ? `${a.name} is now on team ${e.target.value}.`
                                                : `${a.name} has no sales team now.`)}
                                        >
                                            <option value="">No team</option>
                                            {teamNames.map((name) => <option key={name} value={name}>{name}</option>)}
                                        </select>
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
                                            {!a.builtIn && !adminOnly(a) && (
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
