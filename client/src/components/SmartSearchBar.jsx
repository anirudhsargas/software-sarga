import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, ArrowRight, User, Briefcase, CreditCard, ChevronRight } from 'lucide-react';
import api from '../services/api';

const CATEGORY_META = {
    customers: { icon: User, label: 'Customers' },
    jobs: { icon: Briefcase, label: 'Jobs' },
    payments: { icon: CreditCard, label: 'Payments' },
};

const SmartSearchBar = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
            if (e.key === 'Escape') { setOpen(false); setQuery(''); setResults(null); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);

    const fetchSuggestions = useCallback((q) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (!q || q.length < 2) { setSuggestions([]); return; }
            try {
                const res = await api.get(`/ai/search/suggest?q=${encodeURIComponent(q)}`);
                setSuggestions(res.data.suggestions || []);
            } catch { setSuggestions([]); }
        }, 250);
    }, []);

    const doSearch = async (searchQuery) => {
        const q = searchQuery || query;
        if (!q.trim()) return;
        setLoading(true); setSuggestions([]);
        try {
            const res = await api.post('/ai/search', { query: q });
            setResults(res.data);
        } catch { setResults({ error: true }); }
        finally { setLoading(false); }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            if (selectedIdx >= 0 && suggestions[selectedIdx]) {
                setQuery(suggestions[selectedIdx]);
                doSearch(suggestions[selectedIdx]);
            } else { doSearch(); }
            setSelectedIdx(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(i => Math.max(i - 1, -1));
        }
    };

    if (!open) {
        return (
            <button onClick={() => setOpen(true)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                    borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                    transition: 'background 0.2s, border-color 0.2s',
                }}>
                <Search size={14} />
                <span>Search...</span>
                <kbd style={{
                    marginLeft: 'auto', padding: '2px 6px', borderRadius: 4,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: 'var(--muted)'
                }}>Ctrl K</kbd>
            </button>
        );
    }

    const totalResults = results
        ? Object.values(results).filter(Array.isArray).reduce((s, a) => s + a.length, 0)
        : 0;

    return (
        <div className="modal-backdrop" style={{ alignItems: 'flex-start', paddingTop: 80 }} onClick={() => { setOpen(false); setQuery(''); setResults(null); }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 560, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 16, boxShadow: 'var(--shadow-lg)', overflow: 'hidden'
            }}>
                {/* Search Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                    <Search size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <input ref={inputRef} value={query}
                        onChange={e => { setQuery(e.target.value); fetchSuggestions(e.target.value); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search customers, jobs, payments..."
                        style={{
                            flex: 1, border: 'none', outline: 'none', background: 'transparent',
                            fontSize: 15, color: 'var(--text)', fontFamily: 'inherit'
                        }} />
                    {loading && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} />}
                    <button onClick={() => { setOpen(false); setQuery(''); setResults(null); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Suggestions */}
                {suggestions.length > 0 && !results && (
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                        {suggestions.map((s, i) => (
                            <div key={i}
                                onClick={() => { setQuery(s); doSearch(s); }}
                                style={{
                                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: i === selectedIdx ? 'var(--surface-2)' : 'transparent',
                                    color: i === selectedIdx ? 'var(--accent)' : 'var(--text)',
                                    transition: 'background 0.1s',
                                }}>
                                <ArrowRight size={12} style={{ color: 'var(--muted)' }} />
                                {s}
                            </div>
                        ))}
                    </div>
                )}

                {/* Results */}
                {results && (
                    <div style={{ maxHeight: 400, overflowY: 'auto', padding: 8 }}>
                        {results.error ? (
                            <p style={{ padding: 20, textAlign: 'center', color: 'var(--error)', fontSize: 13 }}>Search failed. Try again.</p>
                        ) : totalResults === 0 ? (
                            <p style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results found for "{query}"</p>
                        ) : (
                            Object.entries(results)
                                .filter(([, v]) => Array.isArray(v) && v.length > 0)
                                .map(([key, items]) => {
                                    const meta = CATEGORY_META[key] || { icon: Briefcase, label: key };
                                    const Icon = meta.icon;
                                    return (
                                        <div key={key} style={{ marginBottom: 6 }}>
                                            <div style={{
                                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                                letterSpacing: '0.08em', color: 'var(--muted)', padding: '8px 8px 4px'
                                            }}>
                                                {meta.label} ({items.length})
                                            </div>
                                            {items.slice(0, 5).map((item, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '10px 10px', borderRadius: 10, cursor: 'pointer',
                                                    transition: 'background 0.1s',
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div style={{
                                                        width: 30, height: 30, borderRadius: 8,
                                                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                                                        display: 'grid', placeItems: 'center', color: 'var(--accent-2)', flexShrink: 0
                                                    }}>
                                                        <Icon size={14} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.name || item.job_name || item.customer_name || `#${item.id}`}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                            {item.mobile || item.job_number || item.invoice_number || ''}
                                                        </div>
                                                    </div>
                                                    <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })
                        )}
                    </div>
                )}

                {/* Footer */}
                <div style={{
                    padding: '8px 14px', borderTop: '1px solid var(--border)',
                    fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 12
                }}>
                    <span>↑↓ navigate</span>
                    <span>↵ search</span>
                    <span>esc close</span>
                </div>
            </div>
        </div>
    );
};

export default SmartSearchBar;
