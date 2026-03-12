import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Briefcase, FileText, Search, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';

const OtherStaffDashboard = () => {
  const navigate = useNavigate();
  const user = auth.getUser();
  const staffId = user?.id;
  const [loading, setLoading] = useState(true);
  const [workHistory, setWorkHistory] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

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

  const handleJobClick = (jobId) => {
    navigate(`/dashboard/jobs/${jobId}`);
  };

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

  // Get unique job types from work history
  const jobTypes = useMemo(() => {
    const types = new Set();
    workHistory.forEach(job => {
      if (job.assignment_role) types.add(job.assignment_role);
    });
    return Array.from(types).sort();
  }, [workHistory]);

  // Filter jobs based on search and filters
  const filteredJobs = useMemo(() => {
    return workHistory.filter(job => {
      const matchesSearch = search === '' || 
        job.job_number?.toLowerCase().includes(search.toLowerCase()) ||
        job.job_name?.toLowerCase().includes(search.toLowerCase()) ||
        job.customer_name?.toLowerCase().includes(search.toLowerCase());
      
      const matchesBranch = selectedBranch === '' || job.branch_id === parseInt(selectedBranch);
      const matchesType = selectedType === '' || job.assignment_role === selectedType;
      
      return matchesSearch && matchesBranch && matchesType;
    });
  }, [workHistory, search, selectedBranch, selectedType]);

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
          <Briefcase size={28} /> Your Assigned Jobs
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Track and manage your assigned work orders</p>
      </div>

      {/* Search and Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {/* Search Box */}
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
            placeholder="Search by Job No, Name"
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
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--accent-rgb), 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Priority Filter (placeholder for future use) */}
        <button style={{
          padding: '8px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
          e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-secondary)';
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
        >
          ⚡ Priority
        </button>

        {/* Branches Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowBranchDropdown(!showBranchDropdown)}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!showBranchDropdown) {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }
            }}
            onMouseLeave={(e) => {
              if (!showBranchDropdown) {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }
            }}
          >
            🏢 {selectedBranch ? branches.find(b => b.id === parseInt(selectedBranch))?.name || 'All Branches' : 'All Branches'}
            <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: showBranchDropdown ? 'rotate(180deg)' : 'rotate(0)' }} />
          </button>
          {showBranchDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              minWidth: '200px',
              zIndex: 10,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              <button
                onClick={() => {
                  setSelectedBranch('');
                  setShowBranchDropdown(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 16px',
                  background: selectedBranch === '' ? 'var(--bg-tertiary)' : 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-primary)'
                }}
              >
                All Branches
              </button>
              {branches.map(branch => (
                <button
                  key={branch.id}
                  onClick={() => {
                    setSelectedBranch(branch.id.toString());
                    setShowBranchDropdown(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 16px',
                    background: selectedBranch === branch.id.toString() ? 'var(--bg-tertiary)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    borderTop: '1px solid var(--border)'
                  }}
                >
                  {branch.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Job Types Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!showTypeDropdown) {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }
            }}
            onMouseLeave={(e) => {
              if (!showTypeDropdown) {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }
            }}
          >
            🏷️ {selectedType || 'All Types'}
            <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: showTypeDropdown ? 'rotate(180deg)' : 'rotate(0)' }} />
          </button>
          {showTypeDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              minWidth: '200px',
              zIndex: 10,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              <button
                onClick={() => {
                  setSelectedType('');
                  setShowTypeDropdown(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 16px',
                  background: selectedType === '' ? 'var(--bg-tertiary)' : 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-primary)'
                }}
              >
                All Types
              </button>
              {jobTypes.map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedType(type);
                    setShowTypeDropdown(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 16px',
                    background: selectedType === type ? 'var(--bg-tertiary)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    borderTop: '1px solid var(--border)'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
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
            gridTemplateColumns: '200px 200px 120px 120px 120px 60px',
            gap: '12px',
            padding: '16px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border)',
            fontWeight: 600,
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--muted)'
          }}>
            <div>Job Details</div>
            <div>Customer</div>
            <div>Branch</div>
            <div>Status</div>
            <div>Delivery</div>
            <div>Actions</div>
          </div>

          {/* Table Rows */}
          {filteredJobs.map((job, idx) => {
            const statusColor = getStatusColor(job.status);
            return (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 200px 120px 120px 120px 60px',
                  gap: '12px',
                  padding: '14px 16px',
                  borderBottom: idx < workHistory.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(255,255,255,0.05))'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {/* Job Details */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: '4px', wordBreak: 'break-word' }}>
                    {job.job_number}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {job.job_name}
                  </div>
                </div>

                {/* Customer */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {job.customer_name || '—'}
                  </div>
                  {job.customer_mobile && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {job.customer_mobile}
                    </div>
                  )}
                </div>

                {/* Branch */}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  MEPPAYUR
                </div>

                {/* Status */}
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 10px',
                  borderRadius: '4px',
                  background: statusColor.bg,
                  color: statusColor.text,
                  textTransform: 'capitalize',
                  textAlign: 'center',
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
                    onClick={() => handleJobClick(job.id)}
                    style={{
                      background: 'var(--error)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
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
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>No jobs found</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>Try adjusting your filters or check back later for new assignments</p>
        </div>
      )}
    </div>
  );
};

export default OtherStaffDashboard;
