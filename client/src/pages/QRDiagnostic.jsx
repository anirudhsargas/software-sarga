import React, { useState } from 'react';
import { Search, ScanLine, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import api from '../services/api';
import ScannerModal from '../components/ScannerModal';

const QRDiagnostic = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const runCheck = async (inputCode) => {
    const raw = String(inputCode ?? code);
    const trimmed = raw.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const { data } = await api.get(`/inventory/qr-diagnostic/${encodeURIComponent(trimmed)}`);
      setResult(data);
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        setResult(data);
        setError(data.message || 'No match found for this code');
      } else {
        setError('Failed to run QR diagnostic');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div>
          <h1 className="section-title">QR Diagnostic</h1>
          <p className="section-subtitle">Verify product label scan codes against inventory lookup.</p>
        </div>
      </div>

      <div className="panel panel--tight stack-md" style={{ padding: 16 }}>
        <label className="label">Enter / Scan Code</label>
        <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input
            className="input-field"
            placeholder="Example: MEM-0042 or ITEM-123"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runCheck();
              }
            }}
            style={{ minWidth: 260, flex: 1 }}
          />
          <button className="btn btn-ghost" type="button" onClick={() => setShowScanner(true)}>
            <ScanLine size={16} />
            <span>Scan</span>
          </button>
          <button className="btn btn-primary" type="button" onClick={() => runCheck()} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            <span>{loading ? 'Checking...' : 'Check'}</span>
          </button>
        </div>

        {error && (
          <div className="alert alert--error">
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div className="row gap-sm items-center" style={{ marginBottom: 10 }}>
              {result.found ? <CheckCircle2 size={18} color="#16a34a" /> : <XCircle size={18} color="#dc2626" />}
              <strong>{result.found ? 'Match Found' : 'No Match'}</strong>
            </div>

            <div className="stack-sm" style={{ fontSize: 14 }}>
              <div><span className="muted">Input:</span> {result.input || code}</div>
              <div><span className="muted">Normalized:</span> {result.normalized || '-'}</div>
              <div><span className="muted">Match Type:</span> {result.match_type || '-'}</div>
              {result.item && (
                <>
                  <div><span className="muted">Item:</span> {result.item.name}</div>
                  <div><span className="muted">SKU:</span> {result.item.sku || '-'}</div>
                  <div><span className="muted">Category:</span> {result.item.category || '-'}</div>
                  <div><span className="muted">Stock:</span> {result.item.quantity ?? '-'} </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(scanned) => {
          setCode(scanned);
          runCheck(scanned);
        }}
      />
    </div>
  );
};

export default QRDiagnostic;
