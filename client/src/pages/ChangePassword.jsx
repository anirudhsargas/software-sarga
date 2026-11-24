import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, CheckCircle2, AlertCircle, Mail, KeyRound } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { useConfirm } from '../contexts/ConfirmContext';
import PageContainer from '../components/ui/PageContainer';

// Centre the card horizontally and vertically in the window.
const centeredPage = {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    boxSizing: 'border-box',
};

const ChangePassword = () => {
    useSEO('Change Password');

    const { confirm } = useConfirm();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const _navigate = useNavigate();

    // "Forgot current password?" → verify with a code emailed to the staff member
    const [mode, setMode] = useState('password'); // 'password' | 'otp'
    const [otp, setOtp] = useState('');
    const [otpSentTo, setOtpSentTo] = useState('');
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpInfo, setOtpInfo] = useState('');
    const [resendIn, setResendIn] = useState(0);

    useEffect(() => {
        if (resendIn <= 0) return undefined;
        const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    const switchMode = (next) => {
        setMode(next);
        setError('');
        setOtpInfo('');
    };

    const handleSendOtp = async () => {
        setSendingOtp(true);
        setError('');
        setOtpInfo('');
        try {
            const res = await api.post('/auth/change-password/otp', {});
            if (res.status === 429 || res.data?.message?.startsWith('Please wait')) {
                setError(res.data?.message || 'Please wait before requesting another code.');
            } else {
                setOtpSentTo(res.data?.email || '');
                setOtpInfo(res.data?.message || 'A code was sent to your email.');
                setResendIn(60);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Could not send the code');
        } finally {
            setSendingOtp(false);
        }
    };

    // Password complexity requirements
    const requirements = {
        minLength: newPassword.length >= 8,
        hasUppercase: /[A-Z]/.test(newPassword),
        hasLowercase: /[a-z]/.test(newPassword),
        hasNumber: /[0-9]/.test(newPassword),
        hasSpecial: /[^A-Za-z0-9]/.test(newPassword)
    };

    const allRequirementsMet = Object.values(requirements).every(val => val);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (newPassword !== confirmPassword) {
            return setError('Passwords do not match');
        }

        if (!allRequirementsMet) {
            return setError('Password does not meet all complexity requirements');
        }

        if (mode === 'password' && !currentPassword) {
            return setError('Current password is required');
        }

        if (mode === 'otp' && !/^\d{6}$/.test(otp.trim())) {
            return setError('Enter the 6-digit code sent to your email');
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
            if (mode === 'otp') {
                await api.post('/auth/change-password/otp/verify', { otp: otp.trim(), newPassword });
            } else {
                await api.post('/auth/change-password', { currentPassword, newPassword });
            }

            // Update local user state
            const user = auth.getUser();
            if (user) {
                user.is_first_login = false;
                localStorage.setItem('user', JSON.stringify(user));
            }

            setSuccess(true);
            setTimeout(() => {
                auth.logout();
            }, 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Password change failed');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
        <PageContainer style={centeredPage}>
                <div className="panel text-center container-sm">
                    <CheckCircle2 className="icon-success" size={64} />
                    <h2 className="section-title">Password Changed!</h2>
                    <p className="section-subtitle">Logging you out to refresh your session...</p>
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer style={centeredPage}>
            <div className="auth-card">
                <h1 className="section-title text-center">Change Password</h1>
                <p className="section-subtitle text-center mb-20">
                    {auth.getUser()?.is_first_login
                        ? 'For security reasons, you must change your password before continuing.'
                        : 'Enter your current password and choose a new one.'}
                </p>

                {error && (
                    <div className="alert alert--error mb-16">
                        <AlertCircle size={18} style={{ marginRight: '8px' }} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="stack-lg">
                    {mode === 'password' ? (
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
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="label">Email Verification Code</label>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                                {otpSentTo
                                    ? <>We sent a 6-digit code to <strong>{otpSentTo}</strong>. It expires in 10 minutes.</>
                                    : 'We will email a 6-digit code to the email address saved on your staff account.'}
                            </p>
                            {otpInfo && (
                                <div className="alert alert--success mb-16" style={{ fontSize: 13 }}>
                                    <Mail size={16} style={{ marginRight: 8 }} />
                                    {otpInfo}
                                </div>
                            )}
                            <div className="row gap-sm" style={{ alignItems: 'stretch' }}>
                                <div className="input-group" style={{ flex: 1 }}>
                                    <KeyRound className="input-icon" size={18} />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        name="otp"
                                        placeholder="6-digit code"
                                        className="input-field input-field--icon"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        disabled={!otpSentTo}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleSendOtp}
                                    disabled={sendingOtp || resendIn > 0}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    {sendingOtp
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : resendIn > 0 ? `Resend in ${resendIn}s` : otpSentTo ? 'Resend code' : 'Send code'}
                                </button>
                            </div>
                        </div>
                    )}

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

                    <div style={{ textAlign: 'center', marginTop: -8 }}>
                        <button
                            type="button"
                            onClick={() => switchMode(mode === 'password' ? 'otp' : 'password')}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--primary)',
                            }}
                        >
                            {mode === 'password' ? 'Forgot password?' : 'Use current password instead'}
                        </button>
                    </div>
                </form>
            </div>
        </PageContainer>
    );
};

export default ChangePassword;
