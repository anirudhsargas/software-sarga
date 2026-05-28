import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWebsiteJob, reviewProofCustomer, downloadInvoiceUrl } from '../api';
import toast from 'react-hot-toast';
import ProofReviewModal from '../components/ProofReviewModal';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeProof, setActiveProof] = useState(null);

  const load = async () => {
    try {
      const resp = await getWebsiteJob(id);
      setData(resp.data);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to load job');
      if (err.response?.status === 401) navigate('/signin');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const openModalFor = (proof) => {
    setActiveProof(proof);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setActiveProof(null);
  };

  const handleModalSubmit = async (payload) => {
    try {
      await reviewProofCustomer(id, activeProof.id, payload);
      toast.success('Review submitted');
      handleModalClose();
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Unable to submit review');
    }
  };

  if (loading) return <div className="container">Loading...</div>;
  if (!data) return <div className="container">No data</div>;

  const { job, proofs = [], designs = [], invoices = [], statusHistory = [] } = data;

  return (
    <div className="container" style={{ marginTop: 24 }}>
      <h2>Job {job.job_code || job.id}</h2>
      <p>{job.product_name} — Quantity: {job.quantity}</p>
      <p>Status: <strong>{job.status}</strong></p>

      <section style={{ marginTop: 16 }}>
        <h3>Timeline</h3>
        <ul>
          {statusHistory.map(s => (
            <li key={s.id}>{new Date(s.changed_at).toLocaleString()} — {s.status} {s.staff_name ? `by ${s.staff_name}` : ''}</li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Proofs</h3>
        {proofs.length ? proofs.map(p => (
          <div key={p.id} style={{ border: '1px solid #ddd', padding: 8, marginBottom: 8 }}>
            <div>v{p.version} — {p.status} — {new Date(p.created_at).toLocaleString()}</div>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => openModalFor(p)}>View & Review</button>
            </div>
            {p.customer_feedback ? <div style={{ marginTop: 8 }}><strong>Your notes:</strong> {p.customer_feedback}</div> : null}
          </div>
        )) : <p>No proofs yet</p>}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Designs</h3>
        {designs.length ? designs.map(d => (
          <div key={d.id} style={{ border: '1px solid #eee', padding: 8, marginBottom: 8 }}>
            <div>{d.title} — {d.original_name}</div>
            <div><a href={d.file_url} target="_blank" rel="noreferrer">Open</a></div>
          </div>
        )) : <p>No designs</p>}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Invoices</h3>
        {invoices.length ? (
          <ul>
            {invoices.map(inv => (
              <li key={inv.id} style={{ marginBottom: 8 }}>
                {inv.invoice_number} — ₹{inv.total_amount} — {inv.status}
                <a style={{ marginLeft: 8 }} href={downloadInvoiceUrl(inv.id)}>Download</a>
              </li>
            ))}
          </ul>
        ) : <p>No invoices</p>}
      </section>

      <ProofReviewModal open={modalOpen} proof={activeProof} onClose={handleModalClose} onSubmit={handleModalSubmit} />
    </div>
  );
}
