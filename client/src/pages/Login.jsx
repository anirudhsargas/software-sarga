import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, Loader2, AlertCircle } from 'lucide-react';
import useAuth from '../hooks/useAuth';
import { validatePhone, filterMobile } from '../utils/validators';

const Login = () => {
    useSEO('Login');

    const { login } = useAuth();
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const userIdRef = useRef(null);

    useEffect(() => {
        // Only auto-focus on desktop; on mobile let the user tap
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile && userIdRef.current) {
            userIdRef.current.focus();
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!userId.trim()) {
            setError('Please enter your User ID / Mobile Number');
            return;
        }
        if (!password.trim()) {
            setError('Please enter your password');
            return;
        }

        const { valid, normalized: cleanedUserId, error: phoneError } = validatePhone(userId);
        if (!valid) {
            setError(phoneError);
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
                navigate('/change-password', { replace: true });
            } else {
                navigate('/dashboard', { replace: true });
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
                    <picture>
                      <source type="image/avif" srcSet="/icons/icon-48.avif 48w, /icons/icon-96.avif 96w" sizes="72px" />
                      <source type="image/webp" srcSet="/icons/icon-48.webp 48w, /icons/icon-96.webp 96w" sizes="72px" />
                      <img loading="lazy" src="/icons/icon-192.png" alt="Sarga" className="login-logo" width="72" height="72" />
                    </picture>
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
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                id="user-id"
                                name="userId"
                                autoComplete="tel"
                                placeholder="User ID / Mobile Number"
                                className="input-field input-field--icon"
                                value={userId}
                                onChange={(e) => setUserId(filterMobile(e.target.value))}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Password</label>
                        <div className="input-group input-group--password">
                            <div className="input-icon">
                                <Lock size={18} />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                id="password"
                                name="password"
                                autoComplete="current-password"
                                className="input-field input-field--with-icon input-field--with-toggle"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => setShowPassword(!showPassword)}
                                className="password-toggle"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="form-actions">
                        <div className="checkbox-row">
                            <input type="checkbox" id="remember" />
                            <label htmlFor="remember">Remember Me</label>
                        </div>
                        <a href="/forgot-password" className="forgot-link">Forgot Password?</a>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="btn btn-primary btn--full"
                    >
                        {loading ? (
                            <div className="row gap-sm">
                                <Loader2 className="animate-spin" size={18} />
                                <span>Logging in...</span>
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
