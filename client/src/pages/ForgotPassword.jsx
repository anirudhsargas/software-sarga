import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, KeyRound, Lock, User } from 'lucide-react';
import { API_URL } from '../services/api';
import auth from '../services/auth';

const Req = ({ ok, children }) => (
    <div style={{ color: ok ? 'var(--success)' : 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{ok ? '✓' : '○'}</span>{children}
    </div>
);

// Steps: 'identify' → 'code' → 'password'
export default function ForgotPassword() {
    useSEO('Forgot Password');

    const [step, setStep] = useState('identify');
    const [identifier, setIdentifier] = useState('');
    const [channel, setChannel] = useState('email');
    const [otp, setOtp] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [resendIn, setResendIn] = useState(0);

    useEffect(() => {
        if (resendIn <= 0) return undefined;
        const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    const post = async (path, body) => {
        const res = await fetch(`${API_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (data.message) throw new Error(data.message);
            if (res.status === 404) throw new Error('This feature is not available on the server yet (404). Please restart or update the server.');
            throw new Error(`Request failed (HTTP ${res.status}). Please try again.`);
        }
        return data;
    };

    const looksLikeEmail = identifier.includes('@');

    const sendCode = async () => {
        setError('');
        setInfo('');
        const value = identifier.trim();
        if (!value) return setError('Enter your mobile number or email');
        if (!looksLikeEmail && value.replace(/\D/g, '').length < 10) {
            return setError('Enter a valid 10-digit mobile number or email address');
        }
        setLoading(true);
        try {
            const data = await post('auth/forgot-password/otp', { identifier: value });
            setChannel(data.channel || (looksLikeEmail ? 'email' : 'sms'));
            setInfo(data.message);
            setResendIn(60);
            setStep('code');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async () => {
        setError('');
        if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code');
        setLoading(true);
        try {
            const data = await post('auth/forgot-password/verify', { identifier: identifier.trim(), otp });
            setResetToken(data.resetToken);
            setInfo('');
            setStep('password');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const requirements = {
        minLength: newPassword.length >= 8,
        hasUppercase: /[A-Z]/.test(newPassword),
        hasLowercase: /[a-z]/.test(newPassword),
        hasNumber: /[0-9]/.test(newPassword),
        hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
    };
    const allMet = Object.values(requirements).every(Boolean);

    const resetPassword = async () => {
        setError('');
        if (!allMet) return setError('Password does not meet all requirements');
        if (newPassword !== confirmPassword) return setError('Passwords do not match');
        setLoading(true);
        try {
            const data = await post('auth/forgot-password/reset', { resetToken, newPassword, remember_me: true });
            auth.storeSession(data, true);
            // Full reload so every part of the app picks up the new session
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err.message);
            if (/expired|start again/i.test(err.message)) {
                setStep('identify');
                setOtp('');
                setResetToken('');
            }
            setLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (loading) return;
        if (step === 'identify') sendCode();
        else if (step === 'code') verifyCode();
        else resetPassword();
    };

    const containerStyle = {
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20
    };
    const cardStyle = {
        background: 'var(--card)', borderRadius: 16, padding: 40, maxWidth: 420, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)', boxSizing: 'border-box'
    };
    const inputStyle = {
        width: '100%', padding: '12px 16px 12px 40px', borderRadius: 10, border: '1px solid var(--input-border)',
        fontSize: 15, outline: 'none', boxSizing: 'border-box'
    };
    const labelStyle = { fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--muted-foreground)' };
    const iconStyle = { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' };
    const btnStyle = {
        width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)',
        color: 'var(--card)', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1
    };
    const linkBtnStyle = {
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13,
        fontWeight: 600, color: 'var(--accent)'
    };

    const subtitle = {
        identify: 'Enter your mobile number or email. We will send you a 6-digit code.',
        code: channel === 'sms'
            ? `Enter the 6-digit code sent by SMS to ${identifier.trim()}.`
            : `Enter the 6-digit code sent to ${identifier.trim()}.`,
        password: 'Choose a new password for your account.',
    }[step];

    return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <h2 style={{ margin: '0 0 8px', color: 'var(--foreground)', textAlign: 'center' }}>
                    {step === 'password' ? 'Set New Password' : 'Forgot Password?'}
                </h2>
                <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', marginBottom: 24 }}>{subtitle}</p>

                <form onSubmit={handleSubmit}>
                    {step === 'identify' && (
                        <div style={{ marginBottom: 16 }}>
                            <label htmlFor="fp-identifier" style={labelStyle}>Mobile Number or Email</label>
                            <div style={{ position: 'relative' }}>
                                {looksLikeEmail ? <Mail size={18} style={iconStyle} /> : <User size={18} style={iconStyle} />}
                                <input
                                    id="fp-identifier"
                                    type="text"
                                    autoComplete="username"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    placeholder="10-digit mobile or you@example.com"
                                    style={inputStyle}
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}

                    {step === 'code' && (
                        <div style={{ marginBottom: 16 }}>
                            {info && (
                                <div style={{ fontSize: 13, color: 'var(--success)', marginBottom: 12, textAlign: 'center' }}>{info}</div>
                            )}
                            <label htmlFor="fp-otp" style={labelStyle}>6-digit Code</label>
                            <div style={{ position: 'relative' }}>
                                <KeyRound size={18} style={iconStyle} />
                                <input
                                    id="fp-otp"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="••••••"
                                    style={{ ...inputStyle, letterSpacing: 6, fontSize: 18 }}
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                                <button type="button" style={linkBtnStyle} onClick={() => { setStep('identify'); setOtp(''); setError(''); setInfo(''); }}>
                                    Change {channel === 'sms' ? 'number' : 'email'}
                                </button>
                                <button
                                    type="button"
                                    style={{ ...linkBtnStyle, opacity: resendIn > 0 || loading ? 0.5 : 1, cursor: resendIn > 0 ? 'default' : 'pointer' }}
                                    disabled={resendIn > 0 || loading}
                                    onClick={sendCode}
                                >
                                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'password' && (
                        <>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="fp-new" style={labelStyle}>New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={18} style={iconStyle} />
                                    <input id="fp-new" type="password" autoComplete="new-password" value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" style={inputStyle} autoFocus />
                                </div>
                                {newPassword && (
                                    <div style={{ display: 'grid', gap: 4, fontSize: 13, marginTop: 10 }}>
                                        <Req ok={requirements.minLength}>At least 8 characters</Req>
                                        <Req ok={requirements.hasUppercase}>Uppercase letter (A-Z)</Req>
                                        <Req ok={requirements.hasLowercase}>Lowercase letter (a-z)</Req>
                                        <Req ok={requirements.hasNumber}>Number (0-9)</Req>
                                        <Req ok={requirements.hasSpecial}>Special character (@$!%*?&^#...)</Req>
                                    </div>
                                )}
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="fp-confirm" style={labelStyle}>Confirm Password</label>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={18} style={iconStyle} />
                                    <input id="fp-confirm" type="password" autoComplete="new-password" value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" style={inputStyle} />
                                </div>
                                {confirmPassword && newPassword !== confirmPassword && (
                                    <div style={{ color: 'var(--destructive)', fontSize: 13, marginTop: 4 }}>Passwords do not match</div>
                                )}
                            </div>
                        </>
                    )}

                    {error && <div style={{ color: 'var(--destructive)', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>{error}</div>}

                    <button type="submit" disabled={loading} aria-busy={loading} style={btnStyle}>
                        {loading && <Loader2 size={18} className="animate-spin" />}
                        {step === 'identify' && (loading ? 'Sending…' : 'Send Code')}
                        {step === 'code' && (loading ? 'Verifying…' : 'Verify Code')}
                        {step === 'password' && (loading ? 'Saving…' : 'Save & Log In')}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ArrowLeft size={16} /> Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
