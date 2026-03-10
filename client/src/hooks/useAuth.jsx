import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import auth from '../services/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => auth.getUser());

    const login = useCallback(async (userId, password) => {
        const data = await auth.login(userId, password);
        setUser(data.user);
        return data;
    }, []);

    const logout = useCallback(() => {
        auth.logout();
        setUser(null);
    }, []);

    const updateUser = useCallback((nextUser) => {
        auth.setUser(nextUser);
        setUser(nextUser);
    }, []);

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
