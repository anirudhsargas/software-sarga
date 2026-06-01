import { useState, useRef } from 'react'
import api from '../api'
import toast from 'react-hot-toast'

export default function PreflightChecker({ onCheckComplete, jobId }) {
  const [file, setFile] = useState(null)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) setFile(f)
  }

  const runCheck = async () => {
    if (!file) { toast.error('Please select a file'); return }
    setChecking(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/preflight/check', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(res.data)
      if (onCheckComplete) onCheckComplete(res.data)
      if (!res.data.can_submit) {
        toast.error('Critical errors found. Fix design before submitting.')
      } else if (res.data.status === 'PASS') {
        toast.success('All preflight checks passed!')
      } else {
        toast(res.data.message, { icon: '⚠️' })
      }
    } catch (err) {
      toast.error('Preflight check failed')
    } finally {
      setChecking(false)
    }
  }

  const severityColor = (s) => {
    if (s === 'CRITICAL') return '#dc2626'
    if (s === 'WARNING') return '#f59e0b'
    return '#64748b'
  }

  const statusBadge = (status) => {
    if (status === 'PASS') return { bg: '#dcfce7', text: '#16a34a', label: 'Passed' }
    if (status === 'WARN') return { bg: '#fef3c7', text: '#d97706', label: 'Warnings' }
    return { bg: '#fef2f2', text: '#dc2626', label: 'Critical' }
  }

  const badge = result ? statusBadge(result.status) : null

  return (
    <div className="preflight-checker">
      <div className="preflight-card">
        <h3 className="preflight-title">Preflight Design Check</h3>
        <p className="preflight-desc">Validate your design file before submitting. We check DPI, color mode, bleed area, and more.</p>

        <div className="preflight-upload">
          <input
            type="file"
            ref={fileRef}
            onChange={handleFileChange}
            accept=".jpg,.jpeg,.png,.webp,.tiff,.tif,.pdf"
            className="preflight-file-input"
          />
          <div className="preflight-file-info">
            {file ? (
              <span>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
            ) : (
              <span>Upload PDF, PNG, JPG, TIFF (max 50MB)</span>
            )}
          </div>
          <div className="preflight-actions">
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
              Choose File
            </button>
            <button
              className={`btn btn-primary btn-sm ${checking ? 'disabled' : ''}`}
              onClick={runCheck}
              disabled={!file || checking}
            >
              {checking ? 'Checking...' : 'Run Check'}
            </button>
          </div>
        </div>

        {result && (
          <div className="preflight-result">
            <div className={`preflight-status preflight-status--${result.status.toLowerCase()}`}
                 style={{ background: badge.bg, color: badge.text, padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{badge.label}: {result.label}</span>
              <span>{result.critical_count > 0 ? `${result.critical_count} critical, ` : ''}{result.warning_count > 0 ? `${result.warning_count} warnings` : ''}</span>
            </div>

            {result.issues?.length > 0 && (
              <div className="preflight-issues" style={{ marginTop: 12 }}>
                {result.issues.map((issue, i) => (
                  <div key={i} className="preflight-issue" style={{
                    display: 'flex', gap: 10, padding: '8px 12px',
                    borderLeft: `3px solid ${severityColor(issue.severity)}`,
                    background: '#f8fafc', borderRadius: '0 6px 6px 0', marginBottom: 6
                  }}>
                    <span style={{ color: severityColor(issue.severity), fontWeight: 700, fontSize: '0.75rem', minWidth: 60, textTransform: 'uppercase' }}>
                      {issue.severity}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{issue.message}</div>
                      {issue.fix && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>Fix: {issue.fix}</div>}
                      {issue.current && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Current: {issue.current} | Required: {issue.required}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Info summary */}
            {result.info && (
              <div className="preflight-info" style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748b' }}>
                {result.info.width && <span>Size: {result.info.width}×{result.info.height}px</span>}
                {result.info.dpi && <span>DPI: {result.info.dpi}</span>}
                {result.info.colorSpace && <span>Color: {result.info.colorSpace.toUpperCase()}</span>}
                {result.info.widthMM && <span>Print: {result.info.widthMM}×{result.info.heightMM}mm</span>}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .preflight-card { background: var(--card-bg,#fff); border: 1px solid var(--border-color,#e2e8f0); border-radius: 12px; padding: 24px; }
        .preflight-title { font-size: 1.1rem; font-weight: 600; margin: 0 0 4px; }
        .preflight-desc { font-size: 0.85rem; color: var(--text-muted,#64748b); margin-bottom: 16px; }
        .preflight-file-input { display: none; }
        .preflight-file-info { padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 0.85rem; color: var(--text-muted,#64748b); margin-bottom: 10px; }
        .preflight-actions { display: flex; gap: 8px; }
        .btn-sm { padding: 6px 14px; font-size: 0.8rem; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
        .btn-outline { background: transparent; border: 1px solid var(--border-color,#e2e8f0); }
        .btn-primary { background: var(--primary,#2563eb); color: #fff; border: none; }
        .btn-primary.disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
