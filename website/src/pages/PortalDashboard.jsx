import React, { useEffect, useState } from 'react';
import { getCustomerDashboard } from '../api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function PortalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const id = localStorage.getItem('sarga_customer_id');
    if (!id) {
      navigate('/signin');
      return;
    }
    (async () => {
      try {
        const resp = await getCustomerDashboard(id);
        setData(resp.data);
      } catch (err) {
        console.error(err);
        toast.error('Unable to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = () => {
    localStorage.removeItem('sarga_customer_token');
    localStorage.removeItem('sarga_customer_id');
    navigate('/');
  };

  if (loading) return <div className="container" style={{ marginTop: 40 }}>Loading...</div>;

  return (
    <div className="container" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Customer Dashboard</h2>
        <div>
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </div>

      <section style={{ marginTop: 16 }}>
        <h3>Recent Jobs</h3>
        {data?.jobs?.length ? (
          <ul>
            {data.jobs.map(j => (
              <li key={j.id} style={{ marginBottom: 8 }}>
                <strong>{j.job_code || `Job #${j.id}`}</strong> — {j.status}
              </li>
            ))}
          </ul>
        ) : <p>No recent jobs</p>}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Recent Payments</h3>
        {data?.payments?.length ? (
          <ul>
            {data.payments.map(p => (
              <li key={p.id} style={{ marginBottom: 8 }}>
                {p.payment_mode || 'Payment'} — {p.amount || p.total_amount}
              </li>
            ))}
          </ul>
        ) : <p>No payments</p>}
      </section>
    </div>
  );
}
