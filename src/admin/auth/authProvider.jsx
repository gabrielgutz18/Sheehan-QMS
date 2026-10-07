import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthContext } from './authContext.js';
import * as authApi from '../api/authController.js';
import { onUnauthorized } from '../../api/http.js';

// shared computers: sign out after this long without mouse/keyboard activity
const IDLE_LIMIT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

export default function AuthProvider({ children }) {
    // "loading" until the backend says whether the session cookie is still valid
    const [status, setStatus] = useState("loading");
    const [user, setUser] = useState(null);

    const clearSession = useCallback(() => {
        setUser(null);
        setStatus("guest");
    }, []);

    // restore an existing session on page load
    useEffect(() => {
        const controller = new AbortController();
        authApi
            .getCurrentUser({ signal: controller.signal })
            .then((me) => {
                setUser(me);
                setStatus("authed");
            })
            .catch(() => {
                if (!controller.signal.aborted) clearSession();
            });
        return () => controller.abort();
    }, [clearSession]);

    // any 401 from the API means the session expired
    useEffect(() => onUnauthorized(clearSession), [clearSession]);

    const login = useCallback(async (credentials) => {
        const me = await authApi.login(credentials);
        setUser(me);
        setStatus("authed");
        return me;
    }, []);

    const logout = useCallback(async () => {
        try {
            await authApi.logout();
        } finally {
            // drop the local session even if the server call fails
            clearSession();
        }
    }, [clearSession]);

    useEffect(() => {
        if (status !== "authed") return;
        let timer = setTimeout(logout, IDLE_LIMIT_MS);
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(logout, IDLE_LIMIT_MS);
        };
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        return () => {
            clearTimeout(timer);
            ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
        };
    }, [status, logout]);

    const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
