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
    // Fallback for components outside AuthProvider (backward compatibility)
    if (!context) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const [user, setUser] = useState(auth.getUser());
        return {
            user,
            logout: () => auth.logout(),
            updateUser: (u) => { auth.setUser(u); setUser(u); }
        };
    }
    return context;
};

export default useAuth;
