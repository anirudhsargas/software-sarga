import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { customerSendOtp, customerVerifyOtp } from '../api';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('enter'); // enter, verify
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
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

  return (
    <div className="container" style={{ maxWidth: 560, marginTop: 40 }}>
      <h2>Customer Sign In</h2>
      {step === 'enter' ? (
        <form onSubmit={sendOtp}>
          <div style={{ marginBottom: 12 }}>
            <label>Registered email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
          </div>
          <button className="btn" disabled={loading}>{loading ? 'Sending...' : 'Send OTP'}</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <div style={{ marginBottom: 12 }}>
            <label>Enter OTP</label>
            <input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" disabled={loading}>{loading ? 'Verifying...' : 'Verify OTP'}</button>
            <button className="btn" type="button" onClick={() => { setStep('enter'); setOtp(''); }}>Back</button>
            <div style={{ marginLeft: 12 }}>
              <button className="btn" type="button" onClick={resend} disabled={resendTimer > 0 || loading}>{resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}</button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
