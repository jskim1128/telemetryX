'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface AuthUser {
    id: number;
    email: string;
    employeeId: string | null;
    displayName: string | null;
    title: string | null;
    role: string;
}

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    refresh: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
    refresh: async () => {},
    logout: async () => {}
});

interface AuthProviderProps {
    children: React.ReactNode;
}

/**
 * Provides the currently logged-in user to the component tree. The user
 * is fetched lazily from /api/auth/me on mount; pages rendered behind
 * the auth middleware are guaranteed to have a session, so a 401 here
 * effectively means "log out".
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
            if (res.ok) {
                const data = await res.json();
                setUser(data?.user ?? null);
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        } catch {
            // Ignore — the cookie may still clear server-side, and even if
            // it doesn't, navigating to /auth/login below moves the user
            // out of the protected area.
        }
        setUser(null);
        window.location.assign('/auth/login');
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return (
        <AuthContext.Provider value={{ user, loading, refresh, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
