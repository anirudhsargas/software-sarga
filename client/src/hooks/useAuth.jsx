/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import auth from '../services/auth';
import { useTheme } from '../theme/ThemeProvider';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => auth.getUser());
    const { setTheme } = useTheme();

    const login = useCallback(async (userId, password) => {
        const data = await auth.login(userId, password);
        setUser(data.user);
        
        // Apply backend theme preference on login if it exists
        let backendTheme = null;
        if (data.user?.settings) {
            try {
                const settingsObj = typeof data.user.settings === 'string'
                    ? JSON.parse(data.user.settings)
                    : data.user.settings;
                backendTheme = settingsObj?.theme;
            } catch {}
        }
        if (backendTheme) {
            setTheme(backendTheme, false);
        }
        
        return data;
    }, [setUser, setTheme]);

    const logout = useCallback(() => {
        auth.logout();
        setUser(null);
    }, [setUser]);

    const updateUser = useCallback((nextUser) => {
        auth.setUser(nextUser);
        setUser(nextUser);
    }, [setUser]);

    const value = useMemo(
        () => ({ user, login, logout, updateUser }),
        [user, login, logout, updateUser]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default useAuth;
