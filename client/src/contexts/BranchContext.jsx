import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

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

  return (
    <BranchContext.Provider value={{ branches, loading, error, refetch: fetchBranches, getBranchName, getUserBranch }}>
      {children}
    </BranchContext.Provider>
  );
};

export default BranchContext;
