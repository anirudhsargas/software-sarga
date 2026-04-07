import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

/**
 * useOptimistic Hook
 * Helps implement optimistic UI updates by updating local state immediately
 * and rolling back if the server call fails.
 */
export const useOptimistic = (initialState) => {
  const [data, setData] = useState(initialState);
  const [pending, setPending] = useState(false);

  const optimisticUpdate = useCallback(async ({
    updateFn,      // How to update local state immediately
    serverFn,      // API call to make in background
    rollbackFn,    // How to undo if server fails (optional if updateFn is simple enough to reverse)
    successMsg,    // Toast on success
    errorMsg,      // Toast on failure
  }) => {
    // 1. Snapshot previous state
    const previousData = data;
    
    // 2. Update UI immediately
    setData(prev => updateFn(prev));
    setPending(true);

    try {
      // 3. Send to server in background
      await serverFn();
      if (successMsg) {
        toast.success(successMsg);
      }
    } catch (err) {
      // 4. Rollback on failure
      console.error("Optimistic update failed:", err);
      setData(previousData);
      if (rollbackFn) rollbackFn(previousData);
      toast.error(errorMsg || err.response?.data?.message || 'Action failed. Please try again.');
    } finally {
      setPending(false);
    }
  }, [data]);

  return { data, setData, pending, optimisticUpdate };
};
