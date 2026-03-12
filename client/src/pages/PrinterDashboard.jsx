import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Briefcase, FileText, Search, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';

const PrinterDashboard = () => {
  const navigate = useNavigate();
  const user = auth.getUser();
  const staffId = user?.id;
  const [loading, setLoading] = useState(true);
  const [workHistory, setWorkHistory] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [activeTab, setActiveTab] = useState('active');
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  const fetchDashboard = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const [workRes, branchRes] = await Promise.all([
        api.get(`/staff/${staffId}/work-history`),
        api.get('/branches')
      ]);
      setWorkHistory(Array.isArray(workRes.data) ? workRes.data : []);
      setBranches(Array.isArray(branchRes.data) ? branchRes.data : []);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh when returning to the page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchDashboard();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchDashboard]);

  const handleJobClick = (jobId) => {
    navigate(`/dashboard/jobs/${jobId}`);
  };

  const getBranchName = useCallback((branchId) => {
    if (!branches || branches.length === 0) return `Branch ${branchId}`;
    const idStr = String(branchId).trim();
    for (let b of branches) {
      if (String(b.id).trim() === idStr || parseInt(b.id) === parseInt(branchId)) {
        return b.name || `Branch ${branchId}`;
      }
    }
    return `Branch ${branchId}`;
  }, [branches]);

  const getStatusColor = (status) => {
    const statusMap = {
      'Processing': { bg: '#3b82f6', text: '#ffffff' },
      'Pending': { bg: '#f59e0b', text: '#ffffff' },
      'In Progress': { bg: '#8b5cf6', text: '#ffffff' },
      'Completed': { bg: '#10b981', text: '#ffffff' },
      'Delivered': { bg: '#06b6d4', text: '#ffffff' },
      'Cancelled': { bg: '#ef4444', text: '#ffffff' },
      'Failed': { bg: '#dc2626', text: '#ffffff' }
    };
    return statusMap[status] || { bg: '#6b7280', text: '#ffffff' };
  };

  // Job types and priorities
  const jobTypes = ['All', 'Offset', 'Laser', 'Other'];
  const priorities = ['All', 'High', 'Medium', 'Low'];

  // Filter jobs based on tab, search, branch, type, and priority
  const filteredJobs = useMemo(() => {
    return workHistory.filter(job => {
      // Tab filter - active vs completed/cancelled based on ASSIGNMENT status
      const isActive = ['Pending', 'In Progress'].includes(job.assignment_status);
      const isCompleted = ['Completed', 'Cancelled'].includes(job.assignment_status);
      
      const matchesTab = activeTab === 'active' ? isActive : isCompleted;

      // Search filter
      const matchesSearch = search === '' || 
        job.job_number?.toLowerCase().includes(search.toLowerCase()) ||
        job.job_name?.toLowerCase().includes(search.toLowerCase()) ||
        job.customer_name?.toLowerCase().includes(search.toLowerCase());
      
      // Branch filter
      const matchesBranch = selectedBranch === '' || job.branch_id === parseInt(selectedBranch);
      
      // Type filter - map job type to our categories
      let jobType = 'Other';
      if (job.job_name?.toLowerCase().includes('offset')) jobType = 'Offset';
      else if (job.job_name?.toLowerCase().includes('laser')) jobType = 'Laser';
      const matchesType = selectedType === 'All' || selectedType === jobType;
      
      // Priority filter
      const matchesPriority = selectedPriority === 'All';
      
      return matchesTab && matchesSearch && matchesBranch && matchesType && matchesPriority;
    });
  }, [workHistory, activeTab, search, selectedBranch, selectedType, selectedPriority]);

  const activeCount = useMemo(() => {
    return workHistory.filter(j => ['Pending', 'In Progress'].includes(j.assignment_status)).length;
  }, [workHistory]);

  const completedCount = useMemo(() => {
    return workHistory.filter(j => ['Completed', 'Cancelled'].includes(j.assignment_status)).length;
  }, [workHistory]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          Loading your jobs...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Briefcase size={28} /> Assigned Print Jobs
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>View and manage your assigned printing jobs</p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '24px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '24px',
        paddingBottom: '12px'
      }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '15px',
            fontWeight: activeTab === 'active' ? 600 : 400,
            color: activeTab === 'active' ? 'var(--text-primary)' : 'var(--muted)',
            cursor: 'pointer',
            paddingBottom: '8px',
            borderBottom: activeTab === 'active' ? '2px solid var(--accent)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          My Active Jobs <span style={{ fontSize: 12, marginLeft: '6px', background: activeTab === 'active' ? 'var(--accent)' : 'var(--bg-tertiary)', color: activeTab === 'active' ? '#000' : 'var(--text-primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>{activeCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '15px',
            fontWeight: activeTab === 'completed' ? 600 : 400,
            color: activeTab === 'completed' ? 'var(--text-primary)' : 'var(--muted)',
            cursor: 'pointer',
            paddingBottom: '8px',
            borderBottom: activeTab === 'completed' ? '2px solid var(--accent)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Completed / Cancelled <span style={{ fontSize: 12, marginLeft: '6px', background: activeTab === 'completed' ? 'var(--accent)' : 'var(--bg-tertiary)', color: activeTab === 'completed' ? '#000' : 'var(--text-primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>{completedCount}</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {/* Search Input */}
        <div style={{
          position: 'relative',
          flex: '1 1 300px',
          minWidth: '200px'
        }}>
          <Search size={16} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
            pointerEvents: 'none'
          }} />
          <input
            type="text"
            placeholder="Search by Job No, Name, or Customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border 0.2s'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          />
        </div>

        {/* Branch Filter */}
        {branches.length > 0 && (
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            style={{
              padding: '10px 32px 10px 14px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <option value="">All Branches</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id.toString()}>
                {branch.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Type & Priority Filter Pills */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {/* Type Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>Type:</span>
          {jobTypes.map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                padding: '8px 16px',
                background: selectedType === type ? 'var(--accent)' : 'var(--bg-secondary)',
                color: selectedType === type ? '#000' : 'var(--text-primary)',
                border: selectedType === type ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                opacity: selectedType === type ? 1 : 0.8
              }}
              onMouseEnter={(e) => {
                if (selectedType !== type) {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedType !== type) {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }
              }}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Priority Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>Priority:</span>
          {priorities.map(priority => (
            <button
              key={priority}
              onClick={() => setSelectedPriority(priority)}
              style={{
                padding: '8px 16px',
                background: selectedPriority === priority ? 'var(--accent)' : 'var(--bg-secondary)',
                color: selectedPriority === priority ? '#000' : 'var(--text-primary)',
                border: selectedPriority === priority ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                opacity: selectedPriority === priority ? 1 : 0.8
              }}
              onMouseEnter={(e) => {
                if (selectedPriority !== priority) {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedPriority !== priority) {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }
              }}
            >
              {priority}
            </button>
          ))}
        </div>
      </div>

      {filteredJobs.length > 0 ? (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1.2fr 1fr 0.9fr 1fr 80px',
            gap: '12px',
            padding: '14px 20px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border)',
            fontWeight: 600,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            color: 'var(--muted)'
          }}>
            <div>Job Details</div>
            <div>Customer</div>
            <div>Branch</div>
            <div>Status</div>
            <div>Delivery</div>
            <div style={{ textAlign: 'center' }}>Actions</div>
          </div>

          {/* Table Rows */}
          {filteredJobs.map((job, idx) => {
            const statusColor = getStatusColor(job.status);
            return (
              <div
                key={idx}
                onClick={() => handleJobClick(job.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1.2fr 1fr 0.9fr 1fr 80px',
                  gap: '12px',
                  padding: '14px 20px',
                  borderBottom: idx < filteredJobs.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                  background: 'var(--bg-secondary)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                }}
              >
                {/* Job Number & Name */}
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  <div style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>{job.job_number}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>{job.job_name?.slice(0, 30)}...</div>
                </div>

                {/* Customer */}
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {job.customer_name || '-'}
                </div>

                {/* Branch */}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {getBranchName(job.branch_id)}
                </div>

                {/* Status */}
                <div
                  style={{
                    background: statusColor.bg,
                    color: statusColor.text,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: 11,
                    fontWeight: 600,
                    width: 'fit-content'
                  }}>
                  {job.status}
                </div>

                {/* Delivery */}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {job.delivery_date ? new Date(job.delivery_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' }) : 'Not Set'}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    style={{
                      background: 'var(--error)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    title="View job details"
                  >
                    <FileText size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border)',
          borderRadius: '8px',
          padding: '48px',
          textAlign: 'center'
        }}>
          <Briefcase size={40} color='var(--muted)' style={{ margin: '0 auto 16px', opacity: 0.4 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>No print jobs assigned</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>Try adjusting your filters or check back later for new assignments</p>
        </div>
      )}
    </div>
  );
};

export default PrinterDashboard;
