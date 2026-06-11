import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
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

    // Password complexity requirements
    const requirements = useMemo(() => ({
        minLength: newPassword.length >= 8,
        hasUppercase: /[A-Z]/.test(newPassword),
        hasLowercase: /[a-z]/.test(newPassword),
        hasNumber: /[0-9]/.test(newPassword),
        hasSpecial: /[^A-Za-z0-9]/.test(newPassword)
    }), [newPassword]);

    const allRequirementsMet = useMemo(() => Object.values(requirements).every(val => val), [requirements]);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        
        if (newPassword !== confirmPassword) {
            return setError('Passwords do not match');
        }

        if (!allRequirementsMet) {
            return setError('Password does not meet all complexity requirements');
        }

        if (!currentPassword) {
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
    });

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
                        <AlertCircle size={18} style={{ marginRight: '8px' }} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="stack-lg">
                    <div>
                        <label className="label">Current Password</label>
                        <div className="input-group">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                name="currentPassword"
                                placeholder="Current Password"
                                className="input-field input-field--icon"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">New Password</label>
                        <div className="input-group">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                name="newPassword"
                                placeholder="New Password"
                                className="input-field input-field--icon"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        
                        {/* Password Requirements Checklist */}
                        {newPassword && (
                            <div className="password-requirements" style={{
                                marginTop: '12px',
                                padding: '12px',
                                backgroundColor: 'var(--surface-2)',
                                borderRadius: '4px',
                                fontSize: '13px'
                            }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text)' }}>Password Requirements:</div>
                                <div style={{ display: 'grid', gap: '6px' }}>
                                    <div style={{ color: requirements.minLength ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '16px' }}>{requirements.minLength ? '✓' : '○'}</span>
                                        At least 8 characters
                                    </div>
                                    <div style={{ color: requirements.hasUppercase ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '16px' }}>{requirements.hasUppercase ? '✓' : '○'}</span>
                                        Uppercase letter (A-Z)
                                    </div>
                                    <div style={{ color: requirements.hasLowercase ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '16px' }}>{requirements.hasLowercase ? '✓' : '○'}</span>
                                        Lowercase letter (a-z)
                                    </div>
                                    <div style={{ color: requirements.hasNumber ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '16px' }}>{requirements.hasNumber ? '✓' : '○'}</span>
                                        Number (0-9)
                                    </div>
                                    <div style={{ color: requirements.hasSpecial ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '16px' }}>{requirements.hasSpecial ? '✓' : '○'}</span>
                                        Special character (@$!%*?&^#...)
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="label">Confirm Password</label>
                        <div className="input-group">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                name="confirmPassword"
                                placeholder="Confirm New Password"
                                className="input-field input-field--icon"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                        {confirmPassword && newPassword !== confirmPassword && (
                            <p style={{ color: 'var(--error)', fontSize: '13px', marginTop: '4px' }}>
                                ✗ Passwords do not match
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading || (newPassword && !allRequirementsMet) || (newPassword !== confirmPassword)}
                        className="btn btn-primary btn--full"
                        style={{
                            opacity: (loading || (newPassword && !allRequirementsMet) || (newPassword !== confirmPassword)) ? 0.6 : 1
                        }}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Update Password"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default React.memo(ChangePassword);
