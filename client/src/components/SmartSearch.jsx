import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, User, Briefcase, Package, X, ArrowRight,
  Phone, Hash, Loader2, Clock, Trash2
} from 'lucide-react';
import {
  search as searchApi,
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from '../services/SearchService';
import './SmartSearch.css';

/**
 * Highlight: wraps matched portions of text in <mark>.
 */
function Highlight({ text = '', query = '' }) {
  if (!query || !text) return <span>{text}</span>;
  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safeQuery})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="smart-search-highlight">{part}</mark>
          : part
      )}
    </span>
  );
}

/**
 * SmartSearch – Global Ctrl+K command-palette style search overlay.
 * Searches across customers, jobs/orders, and products simultaneously.
 * Features: recent searches, text highlighting, AbortController, keyboard nav.
 */
const SmartSearch = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ customers: [], jobs: [], products: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const navigate = useNavigate();

  // Focus input and load recent searches when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults({ customers: [], jobs: [], products: [] });
      setSelectedIndex(0);
      setRecentSearches(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search with abort
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults({ customers: [], jobs: [], products: [] });
      setLoading(false);
      return;
    }

    // Cancel previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const data = await searchApi(q, controller.signal);
      setResults(data);
      setSelectedIndex(0);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      setResults({ customers: [], jobs: [], products: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (query.length >= 2) {
      setLoading(true);
      timerRef.current = setTimeout(() => doSearch(query), 300);
    } else {
      // Cancel any pending request when query is cleared
      if (abortRef.current) abortRef.current.abort();
      setResults({ customers: [], jobs: [], products: [] });
      setLoading(false);
    }
    return () => {
      clearTimeout(timerRef.current);
    };
  }, [query, doSearch]);

  // Build flat list for keyboard navigation
  const flatItems = [];
  if (results.customers.length) {
    results.customers.forEach(c => flatItems.push({ type: 'customer', data: c }));
  }
  if (results.jobs.length) {
    results.jobs.forEach(j => flatItems.push({ type: 'job', data: j }));
  }
  if (results.products.length) {
    results.products.forEach(p => flatItems.push({ type: 'product', data: p }));
  }

  const handleNavigate = (item) => {
    // Save to recent searches when user opens a result
    if (query.trim().length >= 2) addRecentSearch(query.trim());
    setRecentSearches(getRecentSearches());
    onClose();
    if (item.type === 'customer') {
      navigate(`/dashboard/customers/${item.data.id}`);
    } else if (item.type === 'job') {
      navigate(`/dashboard/jobs/${item.data.id}`);
    } else if (item.type === 'product') {
      navigate('/dashboard/products');
    }
  };

  const handleRecentClick = (term) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  const handleRemoveRecent = (e, term) => {
    e.stopPropagation();
    removeRecentSearch(term);
    setRecentSearches(getRecentSearches());
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selectedIndex]) {
      e.preventDefault();
      handleNavigate(flatItems[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  const totalResults = flatItems.length;
  const hasResults = totalResults > 0;
  const showRecent = query.length < 2 && recentSearches.length > 0;
  const noResults = query.length >= 2 && !loading && !hasResults;

  // Counter for flat index rendering
  let flatIdx = -1;

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close search"
        className="smart-search-backdrop"
        onClick={onClose}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
      />

      {/* Search Panel */}
      <div className="smart-search-panel" onKeyDown={handleKeyDown}>
        {/* Search Input */}
        <div className="smart-search-input-wrap">
          <Search size={18} className="smart-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="smart-search-input"
            placeholder="Search customers, orders, products..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            aria-label="Global search"
            aria-autocomplete="list"
          />
          {loading && <Loader2 size={16} className="animate-spin smart-search-spinner" />}
          {query && (
            <button
              className="smart-search-clear-query"
              onClick={() => setQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
          <button className="smart-search-close" onClick={onClose} title="Close (Esc)" aria-label="Close search">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="smart-search-results">

          {/* Empty / hint state */}
          {query.length < 2 && !showRecent && (
            <div className="smart-search-hint">
              <Search size={32} style={{ opacity: 0.15, marginBottom: 8 }} />
              <span>Type at least 2 characters to search</span>
              <span className="text-sm text-muted">Search by customer name, phone, order number, or product</span>
            </div>
          )}

          {/* Recent Searches */}
          {showRecent && (
            <div className="smart-search-group">
              <div className="smart-search-group-label" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} /> Recent Searches
                </span>
                <button
                  className="smart-search-clear-recent"
                  onClick={handleClearRecent}
                  title="Clear all recent searches"
                >
                  Clear all
                </button>
              </div>
              {recentSearches.map((term, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  className="smart-search-item smart-search-item--recent"
                  onClick={() => handleRecentClick(term)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRecentClick(term); }}
                >
                  <div className="smart-search-item-icon" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                    <Clock size={15} />
                  </div>
                  <div className="smart-search-item-info">
                    <span className="smart-search-item-title">{term}</span>
                  </div>
                  <button
                    className="smart-search-remove-recent"
                    onClick={(e) => handleRemoveRecent(e, term)}
                    title={`Remove "${term}" from history`}
                    aria-label={`Remove "${term}" from history`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && query.length >= 2 && !hasResults && (
            <div className="smart-search-skeletons">
              {[1, 2, 3].map(i => (
                <div key={i} className="smart-search-skeleton-row">
                  <div className="smart-search-skeleton-icon" />
                  <div className="smart-search-skeleton-lines">
                    <div className="smart-search-skeleton-line smart-search-skeleton-line--title" />
                    <div className="smart-search-skeleton-line smart-search-skeleton-line--sub" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {noResults && (
            <div className="smart-search-hint smart-search-hint--no-results">
              <div className="smart-search-no-results-icon">
                <Search size={28} />
              </div>
              <span>No results for "<strong>{query}</strong>"</span>
              <span className="text-sm text-muted">Try a different name, phone number, or order ID</span>
            </div>
          )}

          {/* Customers */}
          {results.customers.length > 0 && (
            <div className="smart-search-group">
              <div className="smart-search-group-label">
                <User size={14} /> Customers
                <span className="smart-search-group-count">{results.customers.length}</span>
              </div>
              {results.customers.map(c => {
                flatIdx++;
                const idx = flatIdx;
                return (
                  <div role="button" tabIndex={0} key={`c-${c.id}`}
                    className={`smart-search-item ${idx === selectedIndex ? 'smart-search-item--active' : ''}`}
                    onClick={() => handleNavigate({ type: 'customer', data: c })}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onKeyDown={e => { if (e.key === 'Enter') handleNavigate({ type: 'customer', data: c }); }}
                  >
                    <div className="smart-search-item-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      <User size={16} />
                    </div>
                    <div className="smart-search-item-info">
                      <span className="smart-search-item-title">
                        <Highlight text={c.name} query={query} />
                      </span>
                      <span className="smart-search-item-sub">
                        {c.mobile && <><Phone size={11} /> <Highlight text={c.mobile} query={query} /></>}
                        {c.type && <> · {c.type}</>}
                        {c.job_count > 0 && <> · {c.job_count} orders</>}
                      </span>
                    </div>
                    <ArrowRight size={14} className="smart-search-item-arrow" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Jobs / Orders */}
          {results.jobs.length > 0 && (
            <div className="smart-search-group">
              <div className="smart-search-group-label">
                <Briefcase size={14} /> Orders
                <span className="smart-search-group-count">{results.jobs.length}</span>
              </div>
              {results.jobs.map(j => {
                flatIdx++;
                const idx = flatIdx;
                const statusColor = {
                  Pending: 'var(--warning)', Processing: 'var(--accent-2)', Completed: 'var(--success)',
                  Delivered: 'var(--accent)', Cancelled: 'var(--error)',
                }[j.status] || 'var(--muted)';
                return (
                  <div role="button" tabIndex={0} key={`j-${j.id}`}
                    className={`smart-search-item ${idx === selectedIndex ? 'smart-search-item--active' : ''}`}
                    onClick={() => handleNavigate({ type: 'job', data: j })}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onKeyDown={e => { if (e.key === 'Enter') handleNavigate({ type: 'job', data: j }); }}
                  >
                    <div className="smart-search-item-icon" style={{ background: 'var(--surface-2)', color: 'var(--success)' }}>
                      <Briefcase size={16} />
                    </div>
                    <div className="smart-search-item-info">
                      <span className="smart-search-item-title">
                        <Hash size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        <Highlight text={j.job_number} query={query} />
                        {j.product_name && <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>— {j.product_name}</span>}
                      </span>
                      <span className="smart-search-item-sub">
                        <Highlight text={j.customer_name} query={query} />
                        <div className="status-dot" style={{ backgroundColor: statusColor }} />
                        <span className={`status-badge ${j.status === 'Delivered' ? 'status-badge--delivered' : 'status-badge--warning'}`}>
                          {j.status}
                        </span>
                        {j.total_amount && <> · ₹{Number(j.total_amount).toLocaleString('en-IN')}</>}
                      </span>
                    </div>
                    <ArrowRight size={14} className="smart-search-item-arrow" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Products */}
          {results.products.length > 0 && (
            <div className="smart-search-group">
              <div className="smart-search-group-label">
                <Package size={14} /> Products
                <span className="smart-search-group-count">{results.products.length}</span>
              </div>
              {results.products.map(p => {
                flatIdx++;
                const idx = flatIdx;
                return (
                  <div role="button" tabIndex={0} key={`p-${p.id}`}
                    className={`smart-search-item ${idx === selectedIndex ? 'smart-search-item--active' : ''}`}
                    onClick={() => handleNavigate({ type: 'product', data: p })}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onKeyDown={e => { if (e.key === 'Enter') handleNavigate({ type: 'product', data: p }); }}
                  >
                    <div className="smart-search-item-icon" style={{ background: 'var(--warning-soft, rgba(234,179,8,0.12))', color: 'var(--warning)' }}>
                      <Package size={16} />
                    </div>
                    <div className="smart-search-item-info">
                      <span className="smart-search-item-title">
                        <Highlight text={p.name} query={query} />
                      </span>
                      <span className="smart-search-item-sub">
                        {p.category}{p.subcategory ? ` · ${p.subcategory}` : ''}
                        {p.base_price && <> · ₹{Number(p.base_price).toLocaleString('en-IN')}</>}
                      </span>
                    </div>
                    <ArrowRight size={14} className="smart-search-item-arrow" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {hasResults && (
          <div className="smart-search-footer">
            <span>
              <kbd>↑↓</kbd> Navigate &nbsp; <kbd>↵</kbd> Open &nbsp; <kbd>Esc</kbd> Close
            </span>
            <span style={{ opacity: 0.5 }}>{totalResults} result{totalResults !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </>
  );
};

export default SmartSearch;
