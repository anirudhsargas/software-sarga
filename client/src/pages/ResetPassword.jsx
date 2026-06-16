import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, ArrowLeft, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ResetPassword() {
    useSEO('Reset Password');

    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [valid, setValid] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) { setVerifying(false); return; }
        fetch(`${API}/auth/reset-password/verify?token=${encodeURIComponent(token)}`)
            .then(r => { if (r.ok) setValid(true); setVerifying(false); })
            .catch(() => setVerifying(false));
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 6) return setError('Password must be at least 6 characters');
        if (password !== confirm) return setError('Passwords do not match');
        setLoading(true);
        try {
            const res = await fetch(`${API}/auth/reset-password`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Reset failed');
            setDone(true);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    const containerStyle = {
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20
    };
    const cardStyle = {
        background: 'var(--color-surface)', borderRadius: 16, padding: 40, maxWidth: 420, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
    };
    const inputStyle = {
        width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #d1d5db',
        fontSize: 15, outline: 'none', boxSizing: 'border-box'
    };
    const btnStyle = {
        width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--color-info)',
        color: 'var(--color-surface)', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: 8
    };

    if (verifying) return <div style={containerStyle}><div style={cardStyle}><Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', display: 'block' }} /></div></div>;

    if (!token || !valid) {
        return (
            <div style={containerStyle}>
                <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <AlertCircle size={48} style={{ color: 'var(--color-danger)', marginBottom: 16 }} />
                    <h2 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>Invalid or Expired Link</h2>
                    <p style={{ color: 'var(--color-textMuted)' }}>This password reset link is invalid or has expired. Please request a new one.</p>
                    <Link to="/forgot-password" style={{ color: 'var(--color-info)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 16 }}>
                        Request New Link
                    </Link>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div style={containerStyle}>
                <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <CheckCircle size={48} style={{ color: 'var(--color-success)', marginBottom: 16 }} />
                    <h2 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>Password Reset!</h2>
                    <p style={{ color: 'var(--color-textMuted)' }}>Your password has been successfully reset. You can now login with your new password.</p>
                    <Link to="/login" style={{ ...btnStyle, textDecoration: 'none', marginTop: 20, width: 'auto', display: 'inline-flex', padding: '10px 24px' }}>
                        <ArrowLeft size={16} /> Go to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <h2 style={{ margin: '0 0 8px', color: 'var(--color-text)', textAlign: 'center' }}>Reset Password</h2>
                <p style={{ color: 'var(--color-textMuted)', textAlign: 'center', marginBottom: 24 }}>Enter your new password below.</p>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--color-textSecondary)' }}>New Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-disabled)' }} />
                            <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="Minimum 6 characters" style={{ ...inputStyle, paddingLeft: 40, paddingRight: 40 }} />
                            <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-disabled)' }}>
                                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--color-textSecondary)' }}>Confirm Password</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-disabled)' }} />
                            <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                                placeholder="Re-enter your password" style={{ ...inputStyle, paddingLeft: 40 }} />
                        </div>
                    </div>
                    {error && <div style={{ color: 'var(--color-danger)', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>{error}</div>}
                    <button type="submit" disabled={loading} style={btnStyle}>
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                        {loading ? 'Resetting...' : 'Reset Password'}
                    </button>
                </form>
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <Link to="/login" style={{ color: 'var(--color-info)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ArrowLeft size={16} /> Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
