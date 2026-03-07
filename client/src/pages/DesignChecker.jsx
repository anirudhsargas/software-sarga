import React, { useState, useRef } from 'react';
import { Upload, FileCheck, AlertTriangle, CheckCircle2, XCircle, Loader2, Image, Eye, Clock } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const SEV_STYLE = {
    error: { bg: 'rgba(176,58,46,0.10)', border: 'rgba(176,58,46,0.28)', color: 'var(--error)', icon: XCircle },
    warning: { bg: 'rgba(179,107,0,0.10)', border: 'rgba(179,107,0,0.28)', color: 'var(--warning)', icon: AlertTriangle },
    info: { bg: 'rgba(47,59,70,0.08)', border: 'rgba(47,59,70,0.18)', color: 'var(--accent-2)', icon: Eye },
};

const DesignChecker = () => {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef(null);

    const handleFile = (f) => {
        if (!f) return;
        setFile(f);
        setResult(null);
        if (f.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => setPreview(e.target.result);
            reader.readAsDataURL(f);
        } else { setPreview(null); }
    };

    const onDrop = (e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files[0]); };
    const onDragOver = (e) => { e.preventDefault(); setDragActive(true); };
    const onDragLeave = () => setDragActive(false);

    const analyze = async () => {
        if (!file) return;
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post('/design-check/analyze', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setResult(res.data);
            setHistory(prev => [{ name: file.name, date: new Date(), errors: (res.data.issues || []).filter(i => i.severity === 'error').length, warnings: (res.data.issues || []).filter(i => i.severity === 'warning').length }, ...prev.slice(0, 9)]);
        } catch { toast.error('Analysis failed'); }
        finally { setLoading(false); }
    };

    const issues = result?.issues || [];
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileCheck size={24} /> Design Pre-flight Check
                    </h1>
                    <p className="section-subtitle">Analyze designs for print & digital quality issues</p>
                </div>
            </div>

            <div className="ai-grid ai-grid--sidebar-lg">
                {/* Main Panel */}
                <div className="panel">
                    {/* Drop zone */}
                    <div
                        onClick={() => inputRef.current?.click()}
                        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                        style={{
                            border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 14, padding: file ? '20px' : '48px 20px',
                            textAlign: 'center', cursor: 'pointer',
                            background: dragActive ? 'rgba(31,42,51,0.04)' : 'var(--surface-2)',
                            transition: 'border-color 0.2s, background 0.2s',
                        }}>
                        <input ref={inputRef} type="file" accept="image/*,.pdf" hidden
                            onChange={e => handleFile(e.target.files?.[0])} />

                        {file ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                {preview ? (
                                    <img src={preview} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                                ) : (
                                    <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
                                        <Image size={24} style={{ color: 'var(--muted)' }} />
                                    </div>
                                )}
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{file.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{(file.size / 1024).toFixed(1)} KB • {file.type || 'Unknown type'}</div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Upload size={32} style={{ color: 'var(--muted)', marginBottom: 10 }} />
                                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Drop a design file here</div>
                                <div style={{ fontSize: 13, color: 'var(--muted)' }}>or click to browse • JPG, PNG, PDF supported</div>
                            </>
                        )}
                    </div>

                    {file && (
                        <button className="btn btn-primary" onClick={analyze} disabled={loading}
                            style={{ marginTop: 16 }}>
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
                            {loading ? 'Analyzing...' : 'Run Check'}
                        </button>
                    )}

                    {/* Results */}
                    {result && (
                        <div style={{ marginTop: 24 }}>
                            {/* Score bar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '16px 18px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 32, fontWeight: 700, color: result.score >= 80 ? 'var(--success)' : result.score >= 50 ? 'var(--warning)' : 'var(--error)' }}>
                                    {result.score || 0}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700 }}>Quality Score</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                        {errors} error{errors !== 1 ? 's' : ''} • {warnings} warning{warnings !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>

                            {/* Properties */}
                            {result.properties && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
                                    {Object.entries(result.properties).map(([key, val]) => (
                                        <div key={key} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 2 }}>{key.replace(/_/g, ' ')}</div>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{String(val)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Issues */}
                            <div style={{ display: 'grid', gap: 8 }}>
                                {issues.map((issue, i) => {
                                    const s = SEV_STYLE[issue.severity] || SEV_STYLE.info;
                                    const Icon = s.icon;
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
                                            <Icon size={16} style={{ color: s.color, marginTop: 1, flexShrink: 0 }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 13, color: s.color }}>{issue.message}</div>
                                                {issue.suggestion && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{issue.suggestion}</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                                {issues.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--success)', fontWeight: 600 }}>
                                        <CheckCircle2 size={28} style={{ marginBottom: 6 }} />
                                        <div>All checks passed!</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* History Sidebar */}
                <div className="panel" style={{ alignSelf: 'start' }}>
                    <h3 className="ai-section-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Clock size={16} /> Recent Checks
                    </h3>
                    {history.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>No checks yet</p>
                    ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {history.map((h, i) => (
                                <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                        {h.errors > 0 && <span style={{ color: 'var(--error)', fontWeight: 600 }}>{h.errors} error{h.errors > 1 ? 's' : ''}</span>}
                                        {h.errors > 0 && h.warnings > 0 && ' • '}
                                        {h.warnings > 0 && <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{h.warnings} warning{h.warnings > 1 ? 's' : ''}</span>}
                                        {h.errors === 0 && h.warnings === 0 && <span style={{ color: 'var(--success)', fontWeight: 600 }}>All passed</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @media (max-width: 900px) {
                    .ai-grid--sidebar-lg { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    );
};

export default DesignChecker;
