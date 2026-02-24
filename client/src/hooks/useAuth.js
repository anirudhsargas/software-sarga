import { useState } from 'react';
import auth from '../services/auth';

const useAuth = () => {
    const [user, setUser] = useState(auth.getUser());

    const logout = () => {
        auth.logout();
    };

    const updateUser = (nextUser) => {
        auth.setUser(nextUser);
        setUser(nextUser);
    };

    return { user, logout, updateUser };
};

export default useAuth;
