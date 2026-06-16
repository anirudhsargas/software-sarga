import { useSEO } from '../hooks/useSEO';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ForgotPassword() {
    useSEO('Forgot Password');

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email) return setError('Please enter your email');
        setLoading(true);
        try {
            const res = await fetch(`${API}/auth/forgot-password`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Request failed');
            setSent(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const containerStyle = {
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: 20
    };
    const cardStyle = {
        background: 'var(--card)', borderRadius: 16, padding: 40, maxWidth: 420, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
    };
    const inputStyle = {
        width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--input-border)',
        fontSize: 15, outline: 'none', boxSizing: 'border-box'
    };
    const btnStyle = {
        width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)',
        color: 'var(--card)', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: 8
    };

    if (sent) {
        return (
            <div style={containerStyle}>
                <div style={{ ...cardStyle, textAlign: 'center' }}>
                    <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 16 }} />
                    <h2 style={{ margin: '0 0 8px', color: 'var(--foreground)' }}>Check Your Email</h2>
                    <p style={{ color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
                        If an account exists with <strong>{email}</strong>, we've sent a password reset link.
                        Please check your inbox and spam folder.
                    </p>
                    <p style={{ color: 'var(--muted-foreground)', fontSize: 13, marginTop: 20 }}>The link expires in 1 hour.</p>
                    <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 16 }}>
                        <ArrowLeft size={16} /> Back to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={cardStyle}>
                <h2 style={{ margin: '0 0 8px', color: 'var(--foreground)', textAlign: 'center' }}>Forgot Password?</h2>
                <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', marginBottom: 24 }}>Enter your email and we'll send you a reset link.</p>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 14, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--muted-foreground)' }}>Email Address</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                placeholder="you@example.com" style={{ ...inputStyle, paddingLeft: 40 }} />
                        </div>
                    </div>
                    {error && <div style={{ color: 'var(--destructive)', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>{error}</div>}
                    <button type="submit" disabled={loading} style={btnStyle}>
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                        {loading ? 'Sending...' : 'Send Reset Link'}
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
