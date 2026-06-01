import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { customerSendOtp, customerVerifyOtp, customerLookup, customerLogin, customerRegister, customerGoogleSignIn } from '../api';
import SEO from '../components/SEO';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('enter'); // enter, verify
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [mode, setMode] = useState('email'); // email | mobile

  // Mobile flow
  const [mobile, setMobile] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [customerFound, setCustomerFound] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const navigate = useNavigate();

  const sendOtp = async (e) => {
    e && e.preventDefault();
    if (!email) return toast.error('Enter your registered email');
    if (resendTimer > 0) return toast.error('Please wait before resending OTP');
    setLoading(true);
    try {
      const resp = await customerSendOtp(email);
      toast.success(resp.data?.message || 'OTP sent');
      if (resp.data?.otp) {
        toast('Debug OTP: ' + resp.data.otp, { duration: 8000 });
      }
      setStep('verify');
      setResendTimer(60);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Unable to send OTP');
    } finally { setLoading(false); }
  };

  const verify = async (e) => {
    e && e.preventDefault();
    if (!otp) return toast.error('Enter OTP');
    setLoading(true);
    try {
      const resp = await customerVerifyOtp(email, otp);
      const { token, customerId } = resp.data;
      localStorage.setItem('sarga_customer_token', token);
      localStorage.setItem('sarga_customer_id', customerId);
      toast.success('Signed in');
      navigate('/portal/dashboard');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'OTP verification failed');
    } finally { setLoading(false); }
  };

  // Countdown for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  const resend = async () => {
    if (resendTimer > 0) return;
    await sendOtp();
  };

  // Mobile lookup and login
  const lookupMobile = async (e) => {
    e && e.preventDefault();
    if (!mobile) return toast.error('Enter mobile number');
    try {
      const resp = await customerLookup({ mobile, countryCode });
      setCustomerFound(resp.data.customer);
      // Autofill register fields if present
      setRegName(resp.data.customer.name || '');
      setRegEmail(resp.data.customer.email || '');
      // Auto-login if customer exists
      const loginResp = await customerLogin({ phone: mobile, countryCode });
      const { token, customerId } = loginResp.data;
      localStorage.setItem('sarga_customer_token', token);
      localStorage.setItem('sarga_customer_id', customerId);
      toast.success('Signed in');
      navigate('/portal/dashboard');
    } catch (err) {
      if (err.response && err.response.status === 404 && err.response.data?.canRegister) {
        setCustomerFound(null);
        setRegistering(true);
        setRegName('');
        setRegEmail('');
        // if backend provided suggested mobile, use it
        if (err.response.data.suggestedMobile) setMobile(err.response.data.suggestedMobile);
        return;
      }
      console.error(err);
      toast.error(err.response?.data?.message || 'Lookup failed');
    }
  };

  const submitRegister = async (e) => {
    e && e.preventDefault();
    if (!mobile) return toast.error('Mobile required');
    setLoading(true);
    try {
      const resp = await customerRegister({ mobile, countryCode, name: regName, email: regEmail });
      const { token, customer } = resp.data;
      localStorage.setItem('sarga_customer_token', token);
      localStorage.setItem('sarga_customer_id', customer.id);
      toast.success('Registered and signed in');
      navigate('/portal/dashboard');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  // Placeholder for Google sign-in token handling (requires Google Identity integration)
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Initialize Google Identity Services and render the button into #g_id_signin
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const scriptId = 'google-identity-script';
    if (document.getElementById(scriptId)) {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        tryInitGSI();
      }
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.id = scriptId;
    s.async = true;
    s.defer = true;
    s.onload = () => tryInitGSI();
    document.head.appendChild(s);

    function tryInitGSI() {
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            const id_token = response?.credential;
            if (!id_token) return toast.error('Google sign-in failed');
            setLoading(true);
            try {
              const resp = await customerGoogleSignIn(id_token);
              const { token, customer } = resp.data;
              localStorage.setItem('sarga_customer_token', token);
              localStorage.setItem('sarga_customer_id', customer.id);
              toast.success('Signed in with Google');
              navigate('/portal/dashboard');
            } catch (err) {
              console.error('Google signin error', err);
              toast.error(err.response?.data?.message || 'Google sign-in failed');
            } finally {
              setLoading(false);
            }
          }
        });

        // Render button if container exists
        const el = document.getElementById('g_id_signin');
        if (el) {
          window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large' });
        }
      } catch (e) {
        console.warn('GSI init failed', e && e.message);
      }
    }
    // cleanup not strictly necessary for GSI
  }, [GOOGLE_CLIENT_ID]);

  return (
    <div className="container" style={{ maxWidth: 560, marginTop: 40 }}>
      <SEO 
        title="Customer Sign In" 
        description="Sign in to the Sarga Prints customer portal to manage orders, review design proofs, and view active order statuses." 
      />
      <h2>Customer Sign In</h2>
      <div style={{ marginBottom: 12 }}>
        <small>New customer? <a href="/contact">Request access</a></small>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className={`btn ${mode === 'email' ? 'active' : ''}`} type="button" onClick={() => setMode('email')}>Email OTP</button>
        <button className={`btn ${mode === 'mobile' ? 'active' : ''}`} type="button" onClick={() => setMode('mobile')}>Mobile</button>
        <div id="g_id_signin" />
        <button className="btn btn-primary" type="button" onClick={() => { if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.prompt(); else toast.error('Google Identity not loaded'); }}>Google (prompt)</button>
      </div>

      {mode === 'email' && (
        <>
          {step === 'enter' ? (
            <form onSubmit={sendOtp}>
              <div style={{ marginBottom: 12 }}>
                <label>Registered email</label>
                <input className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
              </div>
              <button className="btn btn-primary" disabled={loading}>{loading ? 'Sending...' : 'Send OTP'}</button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <div style={{ marginBottom: 12 }}>
                <label>Enter OTP</label>
                <input className="form-input" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-primary" disabled={loading}>{loading ? 'Verifying...' : 'Verify OTP'}</button>
                <button className="btn btn-primary" type="button" onClick={() => { setStep('enter'); setOtp(''); }}>Back</button>
                <div style={{ marginLeft: 12 }}>
                  <button className="btn btn-primary" type="button" onClick={resend} disabled={resendTimer > 0 || loading}>{resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}</button>
                </div>
              </div>
            </form>
          )}
        </>
      )}

      {mode === 'mobile' && (
        <>
          {!registering ? (
            <form onSubmit={lookupMobile}>
              <div style={{ marginBottom: 12 }}>
                <label>Mobile number</label>
                <input className="form-input" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. +919876543210 or 9876543210" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Country code (optional)</label>
                <input className="form-input" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="e.g. IN or +91" />
              </div>
              <button className="btn btn-primary">Continue</button>
            </form>
          ) : (
            <form onSubmit={submitRegister}>
              <div style={{ marginBottom: 12 }}>
                <label>Mobile</label>
                <input className="form-input" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Name</label>
                <input className="form-input" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Full name" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Email (optional)</label>
                <input className="form-input" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="you@domain.com" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={loading}>{loading ? 'Registering...' : 'Register & Sign in'}</button>
                <button className="btn btn-primary" type="button" onClick={() => { setRegistering(false); setRegName(''); setRegEmail(''); }}>Back</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
