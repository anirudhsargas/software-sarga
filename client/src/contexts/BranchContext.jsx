/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import auth from '../services/auth';
import useAuth from '../hooks/useAuth';

const BranchContext = createContext(null);

export const useBranches = () => {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranches must be used within BranchProvider');
  return ctx;
};

export const BranchProvider = ({ children }) => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    try {
      const stored = localStorage.getItem('sargaSelectedBranchId') || '';
      // Only accept plain positive integers — discard anything else (e.g. "4:1", "all", etc.)
      return /^\d+$/.test(stored) ? stored : '';
    } catch {
      return '';
    }
  });

  const selectBranch = useCallback((id) => {
    // Sanitize: only store if empty ("All Branches") or a valid integer string
    const safe = (!id || /^\d+$/.test(String(id))) ? String(id || '') : '';
    setSelectedBranchId(safe);
    try {
      if (safe) {
        localStorage.setItem('sargaSelectedBranchId', safe);
      } else {
        localStorage.removeItem('sargaSelectedBranchId');
      }
    } catch (e) {
      console.error('Failed to save selected branch:', e);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/branches');
      setBranches(res.data?.data || res.data || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      setLoading(false);
      return;
    }
    fetchBranches();
  }, [fetchBranches]);

  const getBranchName = useCallback((id) => {
    if (!id) return '';
    const branch = branches.find(b => b.id === id || b.id === Number(id));
    return branch?.name || branch?.short_name || '';
  }, [branches]);

  const getUserBranch = useCallback((user) => {
    if (!user?.branch_id) return null;
    return branches.find(b => b.id === user.branch_id || b.id === Number(user.branch_id)) || null;
  }, [branches]);

  const { user } = useAuth();
  const isFrontOffice = auth.normalizeRole(user?.role) === 'Front Office';
  const assignedBranchName = getBranchName(user?.branch_id);

  const contextValue = React.useMemo(() => ({
    branches,
    loading,
    error,
    refetch: fetchBranches,
    getBranchName,
    getUserBranch,
    selectedBranchId,
    selectBranch,
    isFrontOffice,
    assignedBranchName
  }), [
    branches,
    loading,
    error,
    fetchBranches,
    getBranchName,
    getUserBranch,
    selectedBranchId,
    selectBranch,
    isFrontOffice,
    assignedBranchName
  ]);

  return (
    <BranchContext.Provider value={contextValue}>
      {children}
    </BranchContext.Provider>
  );
};

export default BranchContext;
