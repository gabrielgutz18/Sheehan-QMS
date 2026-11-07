import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AuthContext } from './authContext.js';
import * as authApi from '../api/authController.js';
import { onUnauthorized } from '../../api/http.js';

// staff stay signed in until they press Sign out, like Facebook: the server ends a sign-in only after a week without
// using the app, or 30 days after signing in (server/api.js), and a new tab carries on as the browser's last sign-in
export default function AuthProvider({ children }) {
    // "loading" until the backend says whether the session cookie is still valid
    const [status, setStatus] = useState("loading");
    const [user, setUser] = useState(null);
    // the signed-in account, for the 401 check below, which runs outside React
    const userRef = useRef(null);
    useEffect(() => {
        userRef.current = user;
    }, [user]);
    // the check already asking the server, so its own 401 doesn't start another
    const checking = useRef(false);

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

    // a 401 means this tab's sign-in is gone; it may only have lost its cookie while the browser is still signed in as
    // the same person (too many tabs open), so it asks once before going back to the sign-in page
    useEffect(() => onUnauthorized(() => {
        const id = userRef.current?.id;
        if (id === undefined) return clearSession();
        if (checking.current) return undefined;
        checking.current = true;
        authApi.getCurrentUser({ as: id })
            .then(setUser)
            .catch(clearSession)
            .finally(() => {
                checking.current = false;
            });
        return undefined;
    }), [clearSession]);

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

    // setUser: My account hands back the updated account, so the name and photo change everywhere at once
    const value = useMemo(() => ({ status, user, login, logout, setUser }), [status, user, login, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
