import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, Loader2, AlertCircle } from 'lucide-react';
import useAuth from '../hooks/useAuth';

const Login = () => {
    const { login } = useAuth();
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const userIdRef = useRef(null);

    useEffect(() => {
        if (userIdRef.current) {
            userIdRef.current.focus();
        }
    }, []);

    const validateMobile = (value) => {
        return value.replace(/\D/g, '').slice(-10);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const cleanedUserId = validateMobile(userId);
        if (cleanedUserId.length !== 10) {
            setError('Please enter a valid 10-digit mobile number');
            return;
        }

        if (!password) {
            setError('Please enter your password');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const data = await login(cleanedUserId, password);
            if (data.user.is_first_login) {
                navigate('/change-password');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-shell">
            <div className="auth-card">
                <div className="brand">
                    <h1>SARGA</h1>
                    <p>Printing Management System</p>
                </div>

                <div className="mb-20">
                    <h2 className="section-title">Sign In</h2>
                    <p className="section-subtitle">Enter your credentials to access your account</p>
                </div>

                {error && (
                    <div className="alert alert--error mb-16">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="stack-lg">
                    <div>
                        <label className="label">User ID / Mobile Number</label>
                        <div className="input-group">
                            <div className="input-icon">
                                <User size={18} />
                            </div>
                            <input
                                ref={userIdRef}
                                type="text"
                                placeholder="User ID / Mobile Number"
                                className="input-field input-field--icon"
                                value={userId}
                                onChange={(e) => setUserId(validateMobile(e.target.value))}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Password</label>
                        <div className="input-group">
                            <div className="input-icon">
                                <Lock size={18} />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                className="input-field input-field--icon input-field--icon-right"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                className="input-action"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="checkbox-row">
                        <input type="checkbox" id="remember" />
                        <label htmlFor="remember">Remember Me</label>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary btn--full"
                    >
                        {loading ? (
                            <div className="row gap-sm">
                                <Loader2 className="animate-spin" size={18} />
                                <span>Signing In...</span>
                            </div>
                        ) : "Sign In"}
                    </button>
                </form>

                <div className="text-sm muted mt-24 text-center">
                    © 2025 SARGA Printing Management. All rights reserved.
                </div>
            </div>
        </div>
    );
};

export default Login;
