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
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    try {
      const stored = localStorage.getItem('sargaSelectedBranchId') || '';
      return /^\d+$/.test(stored) ? stored : '';
    } catch {
      return '';
    }
  });

  const selectBranch = useCallback((id) => {
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

  // Fetch branches the current user is assigned to
  const fetchAssignedBranches = useCallback(async () => {
    const user = auth.getUser();
    if (!user) return;
    try {
      if (user.role === 'Admin') {
        // Admin sees all branches
        const res = await api.get('/branches');
        setAssignedBranches(res.data?.data || res.data || []);
        return;
      }
      const res = await api.get('/staff/my-branches');
      const data = res.data || [];
      // Map to full branch objects
      if (data.length > 0) {
        const fullRes = await api.get('/branches');
        const allBranches = fullRes.data?.data || fullRes.data || [];
        const assigned = data.map(a => {
          const branch = allBranches.find(b => b.id === a.branch_id || String(b.id) === String(a.branch_id));
          return branch || { id: a.branch_id, name: a.branch_name, short_name: '' };
        });
        setAssignedBranches(assigned);
      } else {
        setAssignedBranches([]);
      }
    } catch {
      // Fallback to all branches
      try {
        const res = await api.get('/branches');
        setAssignedBranches(res.data?.data || res.data || []);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      setLoading(false);
      return;
    }
    fetchBranches();
    fetchAssignedBranches();
  }, [fetchBranches, fetchAssignedBranches]);

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

  // Determine which branches to show in the switcher
  const visibleBranches = useCallback(() => {
    if (!user) return branches;
    if (user.role === 'Admin') return branches;
    if (assignedBranches.length > 0) return assignedBranches;
    return branches;
  }, [branches, assignedBranches, user]);

  const contextValue = React.useMemo(() => ({
    branches,
    assignedBranches,
    loading,
    error,
    refetch: fetchBranches,
    refetchAssigned: fetchAssignedBranches,
    getBranchName,
    getUserBranch,
    selectedBranchId,
    selectBranch,
    isFrontOffice,
    assignedBranchName,
    visibleBranches: visibleBranches()
  }), [
    branches,
    assignedBranches,
    loading,
    error,
    fetchBranches,
    fetchAssignedBranches,
    getBranchName,
    getUserBranch,
    selectedBranchId,
    selectBranch,
    isFrontOffice,
    assignedBranchName,
    visibleBranches
  ]);

  return (
    <BranchContext.Provider value={contextValue}>
      {children}
    </BranchContext.Provider>
  );
};

export default BranchContext;
