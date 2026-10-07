import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/authContext.js';
import logo from '../../assets/SheehanLogo.png';

// never echo back which part was wrong, so usernames can't be guessed
const loginErrorMessage = (err) => {
    if (err.status === 401) return "Incorrect username or password.";
    if (err.status === 429) return "Too many attempts. Please wait a moment and try again.";
    return err.message;
};

export default function LoginPage() {
    const { status, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // only follow redirects back into the admin area
    const from = location.state?.from?.pathname;
    const redirectTo = from?.startsWith("/admin") ? from : "/admin";

    if (status === "authed") return <Navigate to={redirectTo} replace />;

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
            await login({ username: username.trim(), password });
            navigate(redirectTo, { replace: true });
        } catch (err) {
            setError(loginErrorMessage(err));
            setPassword("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="login-page">
            <form className="login-card" onSubmit={handleSubmit} noValidate>
                <div className="login-brand">
                    <img className="logo" src={logo} alt="" />
                    <h1>Admin sign in</h1>
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

                <label className="admin-field">
                    <span>Password</span>
                    <input
                        type="password"
                        name="password"
                        autoComplete="current-password"
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>

                {error && <p className="field-error" role="alert">{error}</p>}

                <button type="submit" className="admin-btn admin-btn-primary" disabled={submitting || status === "loading"}>
                    {submitting ? "Signing in..." : "Sign in"}
                </button>
            </form>
        </main>
    );
}
