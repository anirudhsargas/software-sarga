import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, CheckCircle2 } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { useConfirm } from '../contexts/ConfirmContext';

const ChangePassword = () => {
    const { confirm } = useConfirm();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const user = auth.getUser();
    const isFirstLogin = user?.is_first_login;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            return setError('Passwords do not match');
        }
        if (newPassword.length < 8) {
            return setError('Password must be at least 8 characters');
        }
        if (!/[A-Z]/.test(newPassword)) {
            return setError('Password must contain at least one uppercase letter');
        }
        if (!/[0-9]/.test(newPassword)) {
            return setError('Password must contain at least one number');
        }
        if (!isFirstLogin && !currentPassword) {
            return setError('Current password is required');
        }
        const isConfirmed = await confirm({
            title: 'Change Password',
            message: 'Are you sure you want to change your password?',
            confirmText: 'Change',
            type: 'warning'
        });
        if (!isConfirmed) return;

        setLoading(true);
        setError('');

        try {
            await api.post(
                '/auth/change-password',
                { currentPassword, newPassword }
            );

            // Update local user state
            const user = auth.getUser();
            user.is_first_login = false;
            localStorage.setItem('user', JSON.stringify(user));

            setSuccess(true);
            setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Password change failed');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="auth-shell">
                <div className="panel text-center container-sm">
                    <CheckCircle2 className="icon-success" size={64} />
                    <h2 className="section-title">Password Changed!</h2>
                    <p className="section-subtitle">Redirecting to your dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-shell">
            <div className="auth-card">
                <h1 className="section-title text-center">Change Password</h1>
                <p className="section-subtitle text-center mb-20">
                    For security reasons, you must change your password before continuing.
                </p>

                {error && (
                    <div className="alert alert--error mb-16">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="stack-lg">
                    {!isFirstLogin && (
                        <div>
                            <label className="label">Current Password</label>
                            <div className="input-group">
                                <Lock className="input-icon" size={18} />
                                <input
                                    type="password"
                                    placeholder="Current Password"
                                    className="input-field input-field--icon"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="label">New Password</label>
                        <div className="input-group">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                placeholder="New Password"
                                className="input-field input-field--icon"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Confirm Password</label>
                        <div className="input-group">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                placeholder="Confirm New Password"
                                className="input-field input-field--icon"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary btn--full"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Update Password"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChangePassword;
