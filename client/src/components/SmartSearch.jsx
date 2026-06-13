import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Briefcase, Package, X, ArrowRight, Phone, Hash, Loader2 } from 'lucide-react';
import api from '../services/api';
import './SmartSearch.css';

/**
 * SmartSearch – Global Ctrl+K command-palette style search overlay.
 * Searches across customers, jobs/orders, and products simultaneously.
 */
const SmartSearch = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ customers: [], jobs: [], products: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults({ customers: [], jobs: [], products: [] });
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults({ customers: [], jobs: [], products: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/search', { params: { q } });
      setResults(res.data);
      setSelectedIndex(0);
    } catch {
      setResults({ customers: [], jobs: [], products: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (query.length >= 2) {
      timerRef.current = setTimeout(() => doSearch(query), 300);
    } else {
      setResults({ customers: [], jobs: [], products: [] });
    }
    return () => clearTimeout(timerRef.current);
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
    onClose();
    if (item.type === 'customer') {
      navigate(`/dashboard/customers/${item.data.id}`);
    } else if (item.type === 'job') {
      navigate(`/dashboard/jobs/${item.data.id}`);
    } else if (item.type === 'product') {
      navigate('/dashboard/products');
    }
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
  const noResults = query.length >= 2 && !loading && !hasResults;

  // Counter for flat index rendering
  let flatIdx = -1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="smart-search-backdrop"
        onClick={onClose}
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
          />
          {loading && <Loader2 size={16} className="animate-spin smart-search-spinner" />}
          <button className="smart-search-close" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="smart-search-results">
          {query.length < 2 && (
            <div className="smart-search-hint">
              <Search size={32} style={{ opacity: 0.15, marginBottom: 8 }} />
              <span>Type at least 2 characters to search</span>
              <span style={{ fontSize: 11, opacity: 0.5 }}>Search by customer name, phone, order number, or product</span>
            </div>
          )}

          {noResults && (
            <div className="smart-search-hint">
              <span>No results found for "{query}"</span>
              <span style={{ fontSize: 11, opacity: 0.5 }}>Try a different search term</span>
            </div>
          )}

          {/* Customers */}
          {results.customers.length > 0 && (
            <div className="smart-search-group">
              <div className="smart-search-group-label">
                <User size={14} /> Customers
              </div>
              {results.customers.map(c => {
                flatIdx++;
                const idx = flatIdx;
                return (
                  <div
                    key={`c-${c.id}`}
                    className={`smart-search-item ${idx === selectedIndex ? 'smart-search-item--active' : ''}`}
                    onClick={() => handleNavigate({ type: 'customer', data: c })}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="smart-search-item-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      <User size={16} />
                    </div>
                    <div className="smart-search-item-info">
                      <span className="smart-search-item-title">{c.name}</span>
                      <span className="smart-search-item-sub">
                        {c.mobile && <><Phone size={11} /> {c.mobile}</>}
                        {c.customer_type && <> · {c.customer_type}</>}
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
              </div>
              {results.jobs.map(j => {
                flatIdx++;
                const idx = flatIdx;
                const statusColor = {
                  Pending: 'var(--warning)', Processing: 'var(--accent-2)', Completed: 'var(--success)',
                  Delivered: 'var(--accent)', Cancelled: 'var(--error)',
                }[j.status] || 'var(--muted)';
                return (
                  <div
                    key={`j-${j.id}`}
                    className={`smart-search-item ${idx === selectedIndex ? 'smart-search-item--active' : ''}`}
                    onClick={() => handleNavigate({ type: 'job', data: j })}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="smart-search-item-icon" style={{ background: 'rgba(47,125,74,0.12)', color: 'var(--success)' }}>
                      <Briefcase size={16} />
                    </div>
                    <div className="smart-search-item-info">
                      <span className="smart-search-item-title">
                        <Hash size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        {j.job_number}
                        {j.product_name && <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>— {j.product_name}</span>}
                      </span>
                      <span className="smart-search-item-sub">
                        {j.customer_name}
                        <div className="status-dot" style={{ backgroundColor: statusColor }}></div>
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
              </div>
              {results.products.map(p => {
                flatIdx++;
                const idx = flatIdx;
                return (
                  <div
                    key={`p-${p.id}`}
                    className={`smart-search-item ${idx === selectedIndex ? 'smart-search-item--active' : ''}`}
                    onClick={() => handleNavigate({ type: 'product', data: p })}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="smart-search-item-icon" style={{ background: 'rgba(179,107,0,0.12)', color: 'var(--warning)' }}>
                      <Package size={16} />
                    </div>
                    <div className="smart-search-item-info">
                      <span className="smart-search-item-title">{p.name}</span>
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
