import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Zap, ChevronDown, ChevronRight, Check, X, Loader2, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import auth from '../services/auth';
import { useBranches } from '../contexts/BranchContext';
import ShortcutCard from '../components/ShortcutCard';
import AddEditShortcutModal from '../components/AddEditShortcutModal';
import PageContainer from '../components/ui/PageContainer';
import './Shortcuts.css';

const ShortcutsPage = () => {
  const navigate = useNavigate();
  const { selectedBranchId } = useBranches();
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin';
  const isFrontOffice = user?.role === 'Front Office';
  const canEdit = isAdmin || isFrontOffice;

  // Sanitize to plain integer — guard against corrupted localStorage values like "4:1"
  const rawBranchId = selectedBranchId || user?.branch_id;
  const branchId = rawBranchId && /^\d+$/.test(String(rawBranchId)) ? String(rawBranchId) : '';

  const [shortcuts, setShortcuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [_loadingSuggestions, setLoadingSuggestions] = useState(false);

  const fetchShortcuts = useCallback(async () => {
    if (!branchId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/shortcuts?branch_id=${branchId}`);
      setShortcuts(data || []);
    } catch {
      toast.error('Failed to load shortcuts');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const fetchSuggestions = useCallback(async () => {
    if (!branchId || !canEdit) return;
    try {
      setLoadingSuggestions(true);
      const { data } = await api.get(`/shortcuts/suggestions?branch_id=${branchId}`);
      setSuggestions(data || []);
    } catch {
      // silently fail for suggestions
    } finally {
      setLoadingSuggestions(false);
    }
  }, [branchId, canEdit]);

  useEffect(() => {
    fetchShortcuts();
    if (canEdit) fetchSuggestions();
  }, [fetchShortcuts, fetchSuggestions]);

  const handleTap = useCallback((shortcut) => {
    navigate('/dashboard/sales/invoices', {
      state: {
        action: 'create',
        fromShortcut: true,
        shortcut: {
          name: shortcut.name,
          price: Number(shortcut.price),
          unit: shortcut.unit,
          product_id: shortcut.product_id,
          customer_type: shortcut.customer_type,
          payment_mode: shortcut.payment_mode,
          branch_id: shortcut.branch_id,
        },
      },
    });
  }, [navigate]);

  const handleAdd = useCallback(() => {
    setEditingShortcut(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((shortcut) => {
    setEditingShortcut(shortcut);
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (shortcut) => {
    if (!window.confirm(`Delete "${shortcut.name}"?`)) return;
    try {
      await api.delete(`/shortcuts/${shortcut.id}`);
      toast.success('Shortcut deleted');
      fetchShortcuts();
    } catch {
      toast.error('Failed to delete shortcut');
    }
  }, [fetchShortcuts]);

  const handleSave = useCallback(async (payload) => {
    if (editingShortcut) {
      await api.put(`/shortcuts/${editingShortcut.id}`, payload);
      toast.success('Shortcut updated');
    } else {
      await api.post('/shortcuts', { branch_id: branchId, shortcuts: [payload] });
      toast.success('Shortcut created');
    }
    fetchShortcuts();
  }, [editingShortcut, branchId, fetchShortcuts]);

  const handleSuggest = useCallback(async (targetBranchId, shortcutData) => {
    await api.post('/shortcuts/suggest', {
      target_branch_id: targetBranchId,
      shortcut_data: shortcutData,
    });
  }, []);

  const handleAcceptSuggestion = useCallback(async (suggestionId) => {
    try {
      await api.put(`/shortcuts/suggestions/${suggestionId}/accept`);
      toast.success('Suggestion accepted');
      fetchSuggestions();
      fetchShortcuts();
    } catch {
      toast.error('Failed to accept suggestion');
    }
  }, [fetchSuggestions, fetchShortcuts]);

  const handleRejectSuggestion = useCallback(async (suggestionId) => {
    try {
      await api.put(`/shortcuts/suggestions/${suggestionId}/reject`);
      toast.success('Suggestion rejected');
      fetchSuggestions();
    } catch {
      toast.error('Failed to reject suggestion');
    }
  }, [fetchSuggestions]);

  const sortedShortcuts = useMemo(() => {
    return [...shortcuts].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [shortcuts]);

  return (
    <PageContainer className="shortcuts-page">
      {/* Header */}
      <div className="shortcuts-header">
        <h1><Zap size={18} style={{ verticalAlign: -3, marginRight: 6 }} /> Quick Bill Shortcuts</h1>
        {canEdit && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
          >
            <Plus size={15} /> Add Shortcut
          </button>
        )}
      </div>

      {/* Suggestions from other branches */}
      {canEdit && suggestions.length > 0 && (
        <div className="shortcuts-suggestions">
          <button
            className="shortcuts-suggestions__toggle"
            onClick={() => setSuggestionsOpen(prev => !prev)}
            type="button"
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>
              Suggestions from other branches
              <span className="shortcuts-suggestions__count">{suggestions.length}</span>
            </span>
            {suggestionsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          {suggestionsOpen && (
            <div className="shortcuts-suggestions__list">
              {suggestions.map(s => {
                let data;
                try {
                  data = typeof s.shortcut_data === 'string' ? JSON.parse(s.shortcut_data) : s.shortcut_data;
                } catch {
                  data = {};
                }
                return (
                  <div key={s.id} className="shortcuts-suggestion-item">
                    <div className="shortcuts-suggestion-item__info">
                      <span className="shortcuts-suggestion-item__name">
                        {data.name || 'Unnamed'} — ₹{Number(data.price || 0).toLocaleString('en-IN')} / {data.unit || 'page'}
                      </span>
                      <span className="shortcuts-suggestion-item__meta">
                        Suggested by {s.suggested_by_name || 'Staff'}
                      </span>
                    </div>
                    <div className="shortcuts-suggestion-item__actions">
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleAcceptSuggestion(s.id)}
                        title="Accept"
                        style={{ color: 'var(--success)' }}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleRejectSuggestion(s.id)}
                        title="Reject"
                        style={{ color: 'var(--error)' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--muted)' }} />
        </div>
      ) : sortedShortcuts.length === 0 ? (
        /* Empty state */
        <div className="shortcuts-empty">
          <div className="shortcuts-empty__icon">
            <Inbox size={28} style={{ color: 'var(--muted)' }} />
          </div>
          <div className="shortcuts-empty__title">No shortcuts yet</div>
          <div className="shortcuts-empty__text">
            Create quick bill shortcuts to speed up your billing workflow. Each shortcut pre-fills item details for one-tap invoicing.
          </div>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>
              <Plus size={15} /> Create First Shortcut
            </button>
          )}
        </div>
      ) : (
        /* Card grid */
        <div className="shortcuts-grid">
          {sortedShortcuts.map(sc => (
            <ShortcutCard
              key={sc.id}
              shortcut={sc}
              onTap={handleTap}
              onEdit={handleEdit}
              onDelete={handleDelete}
              editable={canEdit}
            />
          ))}
          {canEdit && (
            <button className="shortcuts-add-card" onClick={handleAdd} type="button">
              <Plus size={24} />
              Add Shortcut
            </button>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      <AddEditShortcutModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingShortcut(null); }}
        onSave={handleSave}
        editingShortcut={editingShortcut}
        targetBranchId={branchId}
        onSuggest={handleSuggest}
      />
    </PageContainer>
  );
};

export default ShortcutsPage;
