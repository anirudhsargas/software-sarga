import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Printer, Settings, FileText, Layers, AlertTriangle, CheckCircle2,
  RefreshCw, Save, RotateCcw, Calendar, Search, Clock,
  Hash, CheckSquare, Square, Info
} from 'lucide-react';
import api from '../services/api';
import { serverToday } from '../services/serverTime';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';
import { useSEO } from '../hooks/useSEO';
import './MachineProductionEntry.css';

const PAPER_SIZES = [
  '13x19 (Digital)', '12x18 (Digital)', 'A4', 'A3', 
  '18x23 (Demy)', '20x30 (Double Crown)', '23x36 (Quad Crown)', 
  '10x15', 'Custom Size'
];

const PAPER_GSM = [
  '70 GSM', '80 GSM', '90 GSM', '100 GSM', '120 GSM',
  '130 GSM', '170 GSM', '220 GSM', '250 GSM', '300 GSM', '350 GSM'
];

const PAPER_TYPES = [
  'Art Paper (Gloss)', 'Art Paper (Matt)', 'Maplitho', 
  'Bond Paper', 'Carbonless (NC)', 'Gloss Sticker', 
  'Matt Sticker', 'Metallic Board', 'Kraft Paper', 'Speciality Board'
];

const WASTE_REASONS = [
  'Make-ready / Setup Waste',
  'Color Registration Misalignment',
  'Paper Jam / Feeding Error',
  'Ink Smudge / Streak / Marking',
  'Plate Defect / Scratched Plate',
  'Cutting / Trimming Defect',
  'Proof / Sample Testing',
  'Damaged Raw Paper'
];

const MachineProductionEntry = () => {
  useSEO('Waste & Proof Log');

  const [date, setDate] = useState(serverToday());
  const [machines, setMachines] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState([]);

  // Form State
  const [form, setForm] = useState({
    machine_id: '',
    job_id: '',
    work_name: '',
    paper_type: 'Art Paper (Gloss)',
    paper_size: '13x19 (Digital)',
    paper_gsm: '130 GSM',
    paper_source: 'In-House Stock',
    quantity: '',
    is_count_marked: true, // Count marked vs Just paper wasted
    waste_reason: 'Make-ready / Setup Waste',
    notes: ''
  });

  const [jobSearch, setJobSearch] = useState('');
  const [filteredJobs, setFilteredJobs] = useState([]);

  // Load machines and active jobs
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, jRes] = await Promise.allSettled([
        api.get('/machines'),
        api.get('/front-office/active-jobs?limit=100')
      ]);

      if (mRes.status === 'fulfilled') {
        const mList = Array.isArray(mRes.value.data) ? mRes.value.data : (mRes.value.data?.data || []);
        setMachines(mList);
        if (mList.length > 0 && !form.machine_id) {
          setForm(prev => ({ ...prev, machine_id: mList[0].id }));
        }
      }

      if (jRes.status === 'fulfilled') {
        const jList = jRes.value.data?.data || jRes.value.data || [];
        setActiveJobs(jList);
        setFilteredJobs(jList);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
      toast.error('Failed to load machines list');
    } finally {
      setLoading(false);
    }
  }, [form.machine_id]);

  // Load today's machine work / waste entries
  const fetchLogs = useCallback(async () => {
    if (!form.machine_id) return;
    try {
      const res = await api.get(`/daily-report/unified?date=${date}`);
      const d = res.data;
      const mLogs = d?.machines?.[form.machine_id]?.work_entries || d?.work_entries || [];
      setLogs(mLogs);
    } catch {
      setLogs([]);
    }
  }, [date, form.machine_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Search jobs filter
  useEffect(() => {
    if (!jobSearch.trim()) {
      setFilteredJobs(activeJobs);
      return;
    }
    const q = jobSearch.toLowerCase();
    setFilteredJobs(
      activeJobs.filter(j =>
        (j.job_number || '').toLowerCase().includes(q) ||
        (j.job_name || '').toLowerCase().includes(q) ||
        (j.customer_name || '').toLowerCase().includes(q)
      )
    );
  }, [jobSearch, activeJobs]);

  // Job selection handler
  const handleJobSelect = (jobId) => {
    if (!jobId) {
      setForm(prev => ({ ...prev, job_id: '', work_name: '' }));
      return;
    }
    const selected = activeJobs.find(j => String(j.id) === String(jobId));
    if (selected) {
      setForm(prev => ({
        ...prev,
        job_id: selected.id,
        work_name: selected.job_name || `Job #${selected.job_number}`,
        paper_size: selected.paper_size || prev.paper_size
      }));
    }
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.machine_id) {
      toast.error('Please select a machine');
      return;
    }

    const qty = parseInt(form.quantity) || 0;
    if (qty <= 0) {
      toast.error('Please enter a valid waste/proof quantity');
      return;
    }

    setSubmitting(true);
    try {
      const selectedMachine = machines.find(m => String(m.id) === String(form.machine_id));
      const selectedJob = activeJobs.find(j => String(j.id) === String(form.job_id));

      const paperSpecStr = `${form.paper_type} · ${form.paper_size} · ${form.paper_gsm} (${form.paper_source})`;
      const detailsStr = `${form.waste_reason} - ${paperSpecStr}`;

      if (form.is_count_marked) {
        // COUNT MARKED: Submit directly to machine work entries so it reflects in the Daily Cash Book
        await api.post(`/machines/${form.machine_id}/work`, {
          work_date: date,
          customer_name: selectedJob?.customer_name || 'Waste / Proof Entry',
          work_details: form.work_name ? `${form.work_name} [${detailsStr}]` : detailsStr,
          copies: qty,
          waste_copies: qty,
          proof_copies: 0,
          payment_type: 'Cash',
          cash_amount: 0,
          total_amount: 0,
          remarks: form.notes ? `Count Marked Waste: ${form.notes}` : 'Count Marked Waste'
        });

        toast.success(`Logged ${qty} copies as Waste in Daily Book!`);
      } else {
        // JUST PAPER WASTED (Raw Spoilage / Off-Counter)
        await api.post(`/machines/${form.machine_id}/readings`, {
          reading_date: date,
          waste_prints: qty,
          notes: `[Paper Waste Only - No Counter Mark] ${detailsStr} | ${form.notes || ''}`
        });

        toast.success(`Logged ${qty} sheets as Paper Waste (Not counter-marked)`);
      }

      // Reset form quantity and notes
      setForm(prev => ({
        ...prev,
        quantity: '',
        notes: ''
      }));

      fetchLogs();
    } catch (err) {
      console.error('Error logging waste entry:', err);
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to log waste entry');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMachineObj = useMemo(() => {
    return machines.find(m => String(m.id) === String(form.machine_id));
  }, [machines, form.machine_id]);

  return (
    <PageContainer>
      <div className="mpe-container">
        {/* Page Header */}
        <div className="mpe-header">
          <div className="mpe-header__title-group">
            <div className="mpe-header__icon" style={{ background: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#f59e0b' }}>
              <Layers size={22} />
            </div>
            <div>
              <h1 className="mpe-header__title">Waste & Proof Log Entry</h1>
              <p className="mpe-header__subtitle">Log paper waste and proof counts for machines. Count-marked entries sync directly with the Daily Cash Book.</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="mpe-form-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Calendar size={16} className="text-muted" />
              <input
                type="date"
                className="mpe-input"
                style={{ width: 'auto', padding: '0.4rem 0.75rem' }}
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { fetchData(); fetchLogs(); }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="mpe-grid">
          {/* Main Form */}
          <form onSubmit={handleSubmit}>
            {/* Step 1: Machine & Paper Selection */}
            <div className="mpe-card">
              <div className="mpe-card__header">
                <h2 className="mpe-card__title">
                  <Printer size={18} /> 1. Select Machine & Paper Specifications
                </h2>
              </div>

              <div className="mpe-form-grid">
                <div className="mpe-form-group">
                  <label className="mpe-label"><Printer size={14} /> Select Machine *</label>
                  <select
                    className="mpe-select"
                    value={form.machine_id}
                    onChange={e => handleChange('machine_id', e.target.value)}
                    required
                  >
                    <option value="">-- Select Machine --</option>
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.machine_name || m.name} ({m.book_type || m.type || 'Machine'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mpe-form-group">
                  <label className="mpe-label"><Hash size={14} /> Link Active Job (Optional)</label>
                  <select
                    className="mpe-select"
                    value={form.job_id}
                    onChange={e => handleJobSelect(e.target.value)}
                  >
                    <option value="">-- General / No Specific Job --</option>
                    {filteredJobs.map(j => (
                      <option key={j.id} value={j.id}>
                        Job #{j.job_number} - {j.job_name} ({j.customer_name || 'Walk-in'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mpe-form-group">
                  <label className="mpe-label">Paper Type / Material *</label>
                  <select
                    className="mpe-select"
                    value={form.paper_type}
                    onChange={e => handleChange('paper_type', e.target.value)}
                  >
                    {PAPER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="mpe-form-group">
                  <label className="mpe-label">Paper Size *</label>
                  <select
                    className="mpe-select"
                    value={form.paper_size}
                    onChange={e => handleChange('paper_size', e.target.value)}
                  >
                    {PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="mpe-form-group">
                  <label className="mpe-label">Paper Weight / GSM *</label>
                  <select
                    className="mpe-select"
                    value={form.paper_gsm}
                    onChange={e => handleChange('paper_gsm', e.target.value)}
                  >
                    {PAPER_GSM.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div className="mpe-form-group">
                  <label className="mpe-label">Paper Stock Source</label>
                  <select
                    className="mpe-select"
                    value={form.paper_source}
                    onChange={e => handleChange('paper_source', e.target.value)}
                  >
                    <option value="In-House Stock">In-House Stock</option>
                    <option value="Customer Supplied">Customer Supplied Paper</option>
                    <option value="Vendor Stock">Vendor Supplied</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Step 2: Quantity & Count Marked Options */}
            <div className="mpe-card">
              <div className="mpe-card__header">
                <h2 className="mpe-card__title">
                  <AlertTriangle size={18} /> 2. Quantity & Waste Marking
                </h2>
              </div>

              <div className="mpe-form-grid">
                <div className="mpe-form-group">
                  <label className="mpe-label text-danger" style={{ color: '#dc2626', fontWeight: '600' }}>
                    Waste / Proof Quantity (Sheets/Prints) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="mpe-input"
                    style={{ fontSize: '1.1rem', fontWeight: '600' }}
                    placeholder="Enter count (e.g. 25)"
                    value={form.quantity}
                    onChange={e => handleChange('quantity', e.target.value)}
                    required
                  />
                </div>

                <div className="mpe-form-group">
                  <label className="mpe-label">Reason / Spoilage Type</label>
                  <select
                    className="mpe-select"
                    value={form.waste_reason}
                    onChange={e => handleChange('waste_reason', e.target.value)}
                  >
                    {WASTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {/* Count Marked Checkbox Option */}
              <div
                style={{
                  marginTop: '1.25rem',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1.5px solid',
                  borderColor: form.is_count_marked ? '#f59e0b' : 'var(--border, #e2e8f0)',
                  background: form.is_count_marked ? 'color-mix(in srgb, #f59e0b 8%, transparent)' : 'var(--surface-subtle, #f8fafc)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleChange('is_count_marked', !form.is_count_marked)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ marginTop: '2px', color: form.is_count_marked ? '#f59e0b' : 'var(--muted)' }}>
                    {form.is_count_marked ? <CheckSquare size={20} /> : <Square size={20} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem', color: form.is_count_marked ? 'var(--text-main, #0f172a)' : 'var(--text-muted)' }}>
                      Count Marked on Machine (Record as Machine Waste in Daily Book)
                    </div>
                    <div style={{ fontSize: '0.825rem', color: 'var(--muted, #64748b)', marginTop: '2px' }}>
                      {form.is_count_marked 
                        ? '✅ Checked: This count will be posted directly to the Daily Cash Book machine report as Waste Prints.'
                        : '⬜ Unchecked: Just raw paper wasted (spoilage / setup sheet) without counter marking in Daily Book.'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mpe-form-group mpe-form-group--full" style={{ marginTop: '1.25rem' }}>
                <label className="mpe-label">Additional Notes / Remarks</label>
                <textarea
                  className="mpe-textarea"
                  rows="2"
                  placeholder="Optional details, job name, operator name or reason..."
                  value={form.notes}
                  onChange={e => handleChange('notes', e.target.value)}
                />
              </div>

              <div className="mpe-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setForm(prev => ({ ...prev, quantity: '', notes: '' }))}
                >
                  <RotateCcw size={14} /> Clear
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  <Save size={16} /> {submitting ? 'Saving Log...' : 'Save Waste Entry'}
                </button>
              </div>
            </div>
          </form>

          {/* Right Sidebar: Today's Machine Logs */}
          <div>
            <div className="mpe-card">
              <div className="mpe-card__header">
                <h2 className="mpe-card__title">
                  <Clock size={18} /> Logged Entries for Selected Machine
                </h2>
              </div>

              {selectedMachineObj && (
                <div style={{ padding: '0.75rem 1rem', background: 'var(--surface-subtle)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <strong>Selected Machine:</strong> {selectedMachineObj.machine_name || selectedMachineObj.name}
                </div>
              )}

              {logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted, #64748b)' }}>
                  <CheckCircle2 size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>No waste/work entries logged yet for this machine today.</p>
                </div>
              ) : (
                <div className="mpe-table-container">
                  <table className="mpe-table">
                    <thead>
                      <tr>
                        <th>Details</th>
                        <th>Copies</th>
                        <th>Waste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((item, idx) => (
                        <tr key={item.id || idx}>
                          <td>
                            <strong>{item.work_details || item.description || 'Waste Entry'}</strong>
                            {item.customer_name && <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{item.customer_name}</div>}
                          </td>
                          <td>{(item.copies || item.quantity || 0).toLocaleString()}</td>
                          <td>
                            <span style={{ color: (item.waste_copies || item.waste_prints) > 0 ? '#dc2626' : 'inherit', fontWeight: '600' }}>
                              {item.waste_copies || item.waste_prints || 0}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default MachineProductionEntry;
