import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/authContext.js';
import { homeFor } from '../auth/roles.js';
import logo from '../../assets/SheehanLogo.png';

// how long a locked-out computer has to wait, in words; the server says it in seconds
const waitInWords = (seconds) => {
    if (!seconds) return "a few minutes";
    if (seconds <= 60) return "about a minute";
    return `about ${Math.ceil(seconds / 60)} minutes`;
};

// never echo back which part was wrong, so usernames can't be guessed; but do say what to try next,
// since most wrong passwords are Caps Lock or a forgotten one an admin can reset
const loginErrorMessage = (err) => {
    if (err.status === 401) {
        return "Incorrect username or password. Check that Caps Lock is off, or ask an admin to reset your password.";
    }
    if (err.status === 429) return `Too many tries from this computer. Please wait ${waitInWords(err.retryAfter)}, then try again.`;
    return err.message;
};

// the eye on the password box, open to show what was typed and crossed out to hide it again
const EyeIcon = () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.4 3.3" />
        <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        <path d="M2 2l20 20" />
    </svg>
);

export default function LoginPage() {
    const { status, user, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const passwordRef = useRef(/** @type {HTMLInputElement | null} */ (null));
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // only follow redirects back into the admin area; otherwise each role goes to its own home page
    const from = location.state?.from?.pathname;
    const redirectFor = (account) => (from?.startsWith("/staff") ? from : homeFor(account));

    if (status === "authed") return <Navigate to={redirectFor(user)} replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        if (!username.trim() || !password) {
            setError("Please enter your username and password.");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            const account = await login({ username: username.trim(), password });
            navigate(redirectFor(account), { replace: true });
        } catch (err) {
            setError(loginErrorMessage(err));
            setPassword("");
            // the cursor goes straight back to the empty password box, ready to type it again
            passwordRef.current?.focus();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="login-page">
            <form className="login-card" onSubmit={handleSubmit} noValidate>
                <div className="login-brand">
                    <img className="logo" src={logo} alt="" />
                    <h1>Staff sign in</h1>
                </div>

                <label className="admin-field">
                    <span>Username</span>
                    <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={64}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoFocus
                    />
                </label>

                {/* a div, not a wrapping label, so the button's and warning's words don't become part of the box's name */}
                <div className="admin-field">
                    <label htmlFor="login-password">Password</label>
                    <span className="password-field">
                        <input
                            id="login-password"
                            ref={passwordRef}
                            type={showPassword ? "text" : "password"}
                            name="password"
                            autoComplete="current-password"
                            maxLength={128}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                            onBlur={() => setCapsLock(false)}
                        />
                        {/* a word beside the eye, since not everyone knows what the eye means */}
                        <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword((shown) => !shown)}
                        >
                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            <span>{showPassword ? "Hide" : "Show"}</span>
                            <span className="visually-hidden"> password</span>
                        </button>
                    </span>
                    {/* always there (just empty) so screen readers notice when the words appear */}
                    <p className="caps-lock-warning" aria-live="polite">
                        {capsLock ? "Caps Lock is on, so capital and small letters are swapped" : ""}
                    </p>
                </div>

                {error && <p className="field-error" role="alert">{error}</p>}

                <button type="submit" className="admin-btn admin-btn-primary" disabled={submitting || status === "loading"}>
                    {submitting ? "Signing in..." : "Sign in"}
                </button>
            </form>
        </main>
    );
}
