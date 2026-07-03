import { useSEO } from '../hooks/useSEO';
import './FrontOffice.css';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import usePolling from '../hooks/usePolling';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Clock, CheckCircle2, IndianRupee, TrendingUp, Truck,
  Search, Plus, UserPlus, Phone, AlertTriangle,
  Receipt, RefreshCw, ChevronRight, ChevronLeft, Loader2,
  Wallet, Package, Eye, CreditCard, X, ChevronDown, ChevronUp, List, LayoutGrid,
  BarChart3, Timer
} from 'lucide-react';
import api from '../services/api';
import { whatsappUrl, dueCollectionMessage, paymentReminderMessage } from '../utils/whatsapp';
import localDb from '../services/localDb';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';

import { serverNow, serverToday } from '../services/serverTime';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import DashboardQuickActions from '../components/DashboardQuickActions';
import OpeningSetupModal from '../components/OpeningSetupModal';
import PageContainer from '../components/ui/PageContainer';

const ACTIVE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'OFFSET', label: 'Offset' },
  { id: 'DIGITAL', label: 'Digital' },
  { id: 'LASER', label: 'Laser' },
  { id: 'FRAMES', label: 'Frames' },
  { id: 'MEMENTOS', label: 'Mementos' }
];

const FrontOffice = () => {
  useSEO('Front Office');

  const navigate = useNavigate();
  const user = auth.getUser();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [activeTab, setActiveTab] = useState('queue');
  const [activeJobFilter, setActiveJobFilter] = useState('all');
  const searchRef = useRef(null);
  const searchTimeout = useRef(null);

  const [completedJobs, setCompletedJobs] = useState([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedView, setCompletedView] = useState('grouped');
  const [completedPage, setCompletedPage] = useState(1);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedTotalPages, setCompletedTotalPages] = useState(1);
  const PAGE_SIZE = 50;

  const [activeJobs, setActiveJobs] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [activeTotal, setActiveTotal] = useState(0);
  const [activeTotalPages, setActiveTotalPages] = useState(1);

  const [dueCustomers, setDueCustomers] = useState([]);
  const [dueLoading, setDueLoading] = useState(false);
  const [duePage, setDuePage] = useState(1);
  const [dueTotal, setDueTotal] = useState(0);
  const [dueTotalPages, setDueTotalPages] = useState(1);

  const [overdueJobs, setOverdueJobs] = useState([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [overduePage, setOverduePage] = useState(1);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [overdueTotalPages, setOverdueTotalPages] = useState(1);

  const [recentPayments, setRecentPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);

  const [deliveredJobs, setDeliveredJobs] = useState([]);
  const [deliveredLoading, setDeliveredLoading] = useState(false);
  const [deliveredPage, setDeliveredPage] = useState(1);
  const [deliveredTotal, setDeliveredTotal] = useState(0);
  const [deliveredTotalPages, setDeliveredTotalPages] = useState(1);

  const [showOpeningPrompt, setShowOpeningPrompt] = useState(false);
  const [promptBalances, setPromptBalances] = useState({ Offset: '', Laser: '', Other: '' });
  const [promptMachines, setPromptMachines] = useState([]);
  const [prevClosing, setPrevClosing] = useState({ Offset: 0, Laser: 0, Other: 0 });

  const [expandedCustomers, setExpandedCustomers] = useState(new Set());
  const [editingWorkName, setEditingWorkName] = useState(null);
  const [workNameInput, setWorkNameInput] = useState('');
  const [savingWorkName, setSavingWorkName] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [attendanceReminder, setAttendanceReminder] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      const fresh = await api.get('/front-office/dashboard');
      const serverData = fresh.data;
      try {
        const pendingBills = await localDb.getJobs();
        const localBills = pendingBills.filter(j => j._isLocal && j.syncStatus === 'pending');
        const today = new Date().toDateString();
        const todayLocalBills = localBills.filter(j =>
          j.created_at && new Date(j.created_at).toDateString() === today
        );
        const mergedData = {
          ...serverData,
          stats: {
            ...serverData.stats,
            today_orders: (serverData.stats?.today_orders || 0) + todayLocalBills.length,
            in_progress: (serverData.stats?.in_progress || 0) + localBills.filter(j => j.status === 'pending').length
          }
        };
        setData(mergedData);
      } catch (localErr) {
        console.error('Failed to load local bills for dashboard:', localErr);
        setData(serverData);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(() => loadDashboard(), 30000);

  const fetchAttendanceReminder = useCallback(async () => {
    if (!['Front Office', 'front office'].includes(user?.role)) return;
    try {
      const res = await api.get('/front-office/attendance-reminder');
      setAttendanceReminder(res.data || null);
    } catch (err) {
      void err;
      setAttendanceReminder(null);
    }
  }, [user?.role]);

  useEffect(() => {
    if (!['Front Office', 'front office'].includes(user?.role)) return;
    fetchAttendanceReminder();
    const id = setInterval(fetchAttendanceReminder, 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAttendanceReminder, user?.role]);

  useEffect(() => {
    const user = auth.getUser();
    if (user?.role !== 'Front Office') return;
    const today = serverToday();
    (async () => {
      try {
        let assignedBooks = [];
        try {
          const booksRes = await api.get('/machines/my-books');
          assignedBooks = booksRes.data || [];
        } catch (err) { void err; assignedBooks = []; }

        const res = await api.get('/daily-report/opening-balance', { params: { date: today } });
        const balances = res.data.balances || res.data;
        const locked = res.data.locked || {};
        const relevantBooks = assignedBooks.length > 0 ? assignedBooks : [];
        const anyEntered = relevantBooks.some(b => Number(balances[b]) > 0);
        const anyLocked = relevantBooks.some(b => locked[b]);

        let myMachines = [];
        let machineHasReading = {};
        try {
          const laserRes = await api.get('/daily-report/laser-live', { params: { date: today } });
          myMachines = laserRes.data.machines || [];
          myMachines.forEach(m => { machineHasReading[m.id] = !!m.has_reading; });
        } catch { /* ignore */ }

        let prevData = { Offset: 0, Laser: 0, Other: 0, machines: {} };
        try {
          const prevRes = await api.get('/daily-report/previous-closing', { params: { date: today } });
          prevData = prevRes.data;
        } catch { /* ignore */ }

        const unenteredMachines = myMachines.filter(m => !machineHasReading[m.id]);
        const needsBalances = relevantBooks.length > 0 && !anyEntered && !anyLocked;
        const needsMachines = unenteredMachines.length > 0;

        if (needsBalances || needsMachines) {
          setPrevClosing({ Offset: prevData.Offset || 0, Laser: prevData.Laser || 0, Other: prevData.Other || 0 });
          setPromptMachines(unenteredMachines.map(m => ({
            id: m.id, machine_name: m.machine_name, location: m.location,
            opening_count: prevData.machines?.[m.id] !== undefined ? String(prevData.machines[m.id]) : '',
            error: null
          })));
          const newBalances = {};
          if (needsBalances) {
            relevantBooks.forEach(b => {
              newBalances[b] = prevData[b] > 0 ? String(prevData[b]) : '';
            });
          }
          setPromptBalances(newBalances);
          setShowOpeningPrompt(true);
        }
      } catch (err) { console.error('Opening balance check error:', err); }
    })();
  }, []);

  const fetchCompleted = useCallback(async (pg) => {
    setCompletedLoading(true);
    try {
      const res = await api.get(`front-office/completed?page=${pg}&limit=${PAGE_SIZE}`);
      const d = res.data;
      setCompletedJobs(d.data || []);
      setCompletedTotal(d.total || 0);
      setCompletedTotalPages(d.totalPages || 1);
    } catch {
      toast.error('Failed to load completed work');
    } finally {
      setCompletedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'completed') fetchCompleted(completedPage);
  }, [activeTab, completedPage, fetchCompleted]);

  const fetchActiveJobs = useCallback(async (pg) => {
    setActiveLoading(true);
    try {
      const res = await api.get(`front-office/active-jobs?page=${pg}&limit=${PAGE_SIZE}`);
      const d = res.data;
      let serverJobs = d.data || [];
      try {
        const pendingBills = await localDb.getJobs({ status: 'pending' });
        const localJobs = pendingBills.filter(j => j._isLocal && j.syncStatus === 'pending');
        const allJobs = [...localJobs, ...serverJobs].sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        );
        setActiveJobs(allJobs);
        setActiveTotal(allJobs.length);
        setActiveTotalPages(Math.ceil(allJobs.length / PAGE_SIZE));
      } catch (localErr) {
        console.error('Failed to load local jobs:', localErr);
        setActiveJobs(serverJobs);
        setActiveTotal(d.total || 0);
        setActiveTotalPages(d.totalPages || 1);
      }
    } catch { toast.error('Failed to load active jobs'); }
    finally { setActiveLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'queue') fetchActiveJobs(activePage);
  }, [activeTab, activePage, fetchActiveJobs]);

  const fetchDueCustomers = useCallback(async (pg) => {
    setDueLoading(true);
    try {
      const res = await api.get(`front-office/due-customers?page=${pg}&limit=${PAGE_SIZE}`);
      const d = res.data;
      setDueCustomers(d.data || []);
      setDueTotal(d.total || 0);
      setDueTotalPages(d.totalPages || 1);
    } catch { toast.error('Failed to load due customers'); }
    finally { setDueLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'dues') fetchDueCustomers(duePage);
  }, [activeTab, duePage, fetchDueCustomers]);

  const fetchOverdueJobs = useCallback(async (pg) => {
    setOverdueLoading(true);
    try {
      const res = await api.get(`front-office/overdue-jobs?page=${pg}&limit=${PAGE_SIZE}`);
      const d = res.data;
      setOverdueJobs(d.data || []);
      setOverdueTotal(d.total || 0);
      setOverdueTotalPages(d.totalPages || 1);
    } catch { toast.error('Failed to load overdue jobs'); }
    finally { setOverdueLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'overdue') fetchOverdueJobs(overduePage);
  }, [activeTab, overduePage, fetchOverdueJobs]);

  const fetchRecentPayments = useCallback(async (pg) => {
    setPaymentsLoading(true);
    try {
      const res = await api.get(`front-office/recent-payments?page=${pg}&limit=${PAGE_SIZE}`);
      const d = res.data;
      setRecentPayments(d.data || []);
      setPaymentsTotal(d.total || 0);
      setPaymentsTotalPages(d.totalPages || 1);
    } catch { toast.error('Failed to load recent payments'); }
    finally { setPaymentsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'payments') fetchRecentPayments(paymentsPage);
  }, [activeTab, paymentsPage, fetchRecentPayments]);

  const fetchDeliveredJobs = useCallback(async (pg) => {
    setDeliveredLoading(true);
    try {
      const res = await api.get(`front-office/delivered?page=${pg}&limit=${PAGE_SIZE}`);
      const d = res.data;
      setDeliveredJobs(d.data || []);
      setDeliveredTotal(d.total || 0);
      setDeliveredTotalPages(d.totalPages || 1);
    } catch { toast.error('Failed to load delivered jobs'); }
    finally { setDeliveredLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'delivered') fetchDeliveredJobs(deliveredPage);
  }, [activeTab, deliveredPage, fetchDeliveredJobs]);

  const groupedCompleted = useMemo(() => {
    const map = new Map();
    completedJobs.forEach(job => {
      const key = job.customer_id || 'walk-in';
      if (!map.has(key)) {
        map.set(key, {
          customer_id: job.customer_id,
          customer_name: job.customer_name,
          customer_mobile: job.customer_mobile,
          jobs: [],
          total_amount: 0,
          total_balance: 0
        });
      }
      const group = map.get(key);
      group.jobs.push(job);
      group.total_amount += Number(job.total_amount || 0);
      group.total_balance += Number(job.balance_amount || 0);
    });
    return Array.from(map.values()).sort((a, b) => b.jobs.length - a.jobs.length);
  }, [completedJobs]);

  const toggleCustomerExpand = (customerId) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

  const startEditWorkName = (job) => {
    setEditingWorkName(job.id);
    setWorkNameInput(job.description || '');
  };

  const saveWorkName = async (jobId) => {
    setSavingWorkName(true);
    try {
      await api.patch(`/front-office/jobs/${jobId}/work-name`, { work_name: workNameInput });
      setCompletedJobs(prev => prev.map(j => j.id === jobId ? { ...j, description: workNameInput.trim() } : j));
      setEditingWorkName(null);
      toast.success('Work name saved');
    } catch {
      toast.error('Failed to save work name');
    } finally {
      setSavingWorkName(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const handlePaymentUpdate = () => {
      loadDashboard();
    };
    window.addEventListener('paymentRecorded', handlePaymentUpdate);
    return () => {
      window.removeEventListener('paymentRecorded', handlePaymentUpdate);
    };
  }, [loadDashboard]);

  const handleSearch = (val) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await localDb.searchCustomersLocal(val);
        setSearchResults(results);
        setShowSearchResults(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 150);
  };

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const key = e.key.toLowerCase();
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && key === 'k') {
        e.preventDefault();
        document.getElementById('fo-search')?.focus();
      }
      if (e.altKey && key === 'n') {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigate('/dashboard/sales/invoices/create');
      }
      if (e.altKey && key === 'p') {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigate('/dashboard/sales/payments');
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [navigate]);

  const fmt = (v) => { const n = Number(v); return (v !== null && v !== undefined && v !== '' && !isNaN(n)) ? formatCurrency(n) : '—'; };
  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };
  const daysUntil = (d) => {
    if (!d) return null;
    const diff = Math.ceil((new Date(d) - serverNow()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getStatusBadge = (status) => {
    const map = {
      Pending: 'badge--warning',
      Processing: 'badge--info',
      Completed: 'badge--success',
      Delivered: 'badge--primary',
      Cancelled: 'badge--error'
    };
    return map[status] || '';
  };

  const getPriorityBadge = (job) => {
    if (job.priority === 'urgent' || job.priority === 'high') return 'fo-priority--urgent';
    if (daysUntil(job.delivery_date) !== null && daysUntil(job.delivery_date) < 0) return 'fo-priority--overdue';
    if (daysUntil(job.delivery_date) === 0) return 'fo-priority--today';
    return null;
  };

  const getProgressPercent = (job) => {
    if (!job.progress && !job.status) return 0;
    if (job.progress) return Math.min(job.progress, 100);
    const statusMap = { Pending: 10, Processing: 40, Completed: 100, Delivered: 100, Cancelled: 100 };
    return statusMap[job.status] || 0;
  };

  const matchesCategory = (categoryValue) => {
    if (activeJobFilter === 'all' || !activeJobFilter) return true;
    const cat = String(categoryValue || '').trim().toUpperCase();
    return cat === activeJobFilter;
  };

  const { stats } = data || {};
  const activeQueueJobs = useMemo(
    () => (activeJobs || []).filter(job => !['Completed', 'Delivered', 'Cancelled'].includes(job.status)),
    [activeJobs]
  );

  if (error && !data) {
    return <ServerError onRetry={() => loadDashboard()} message={error} />;
  }

  return (
    <>
    <PageContainer>
      <div className="fo-dashboard">
        {/* ── Header ── */}
        <div className="fo-header">
          <div className="fo-header__left">
            <h1 className="fo-title">Front Office</h1>
            <span className="fo-date">{serverNow().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
          <div className="fo-header__actions">
            <button className="fo-header-btn" aria-label="Refresh dashboard" onClick={() => loadDashboard()}>
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {attendanceReminder?.should_remind && (
          <div className="fo-alert-banner">
            <AlertTriangle size={14} />
            <span>Attendance pending for {attendanceReminder.missing_count} staff</span>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard/daily-report')}>
              <AlertTriangle size={14} aria-hidden="true" /> Add Attendance
            </button>
          </div>
        )}

        {/* ── Search + New Order ── */}
        <div className="fo-toolbar-sticky" ref={searchRef}>
          <div className="fo-search-bar">
            <div className="fo-search-input-wrap">
              <Search size={15} className="fo-search-icon" />
              <input
                id="fo-search"
                type="text"
                className="fo-search-input"
                placeholder="Search customer / order / invoice / phone / barcode..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                autoComplete="off"
              />
              <div className="fo-search-meta">
                <span className="fo-search-kbd">Ctrl+K</span>
              </div>
              {search && (
                <button className="fo-search-clear" aria-label="Clear search" onClick={() => { setSearch(''); setSearchResults([]); setShowSearchResults(false); }}>
                  <X size={14} />
                </button>
              )}
              {searchLoading && <Loader2 size={14} className="spin fo-search-spinner" />}
            </div>
            {showSearchResults && (
              <div className="fo-search-dropdown">
                {searchResults.length === 0 ? (
                  <div className="fo-search-empty">
                    <p>No results found</p>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard/customers/new')}>
                      <UserPlus size={14} aria-hidden="true" /> Add New Customer
                    </button>
                  </div>
                ) : (
                  searchResults.map(c => (
                    <button
                      key={c.id}
                      className="fo-search-result"
                      onClick={() => {
                        setShowSearchResults(false);
                        setSearch('');
                        navigate(`/dashboard/customers/${c.id}`);
                      }}
                    >
                      <div className="fo-search-result__info">
                        <span className="fo-search-result__name">{c.name}</span>
                        <span className="fo-search-result__mobile">{c.mobile}</span>
                      </div>
                      <div className="fo-search-result__meta">
                        <span className="fo-search-result__jobs">{c.job_count} jobs</span>
                        {c.due_amount > 0 && (
                          <span className="fo-search-result__due">{fmt(c.due_amount)} due</span>
                        )}
                      </div>
                      <ChevronRight size={14} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button className="fo-primary-btn" onClick={() => navigate('/dashboard/sales/invoices/create')}>
            <Plus size={16} aria-hidden="true" />
            <span>New Order</span>
            <span className="fo-primary-btn__kbd">Alt+N</span>
          </button>
        </div>

        {/* ── Quick Actions ── */}
        <DashboardQuickActions />

        {/* ── KPI Cards ── */}
        <div className="fo-kpi-grid">
          {loading ? (
            <SkeletonLoader type="cards" count={8} />
          ) : (
            <>
              {/* Fix 3: role=group + aria-label groups value+label for screen readers */}
              <div className="fo-kpi fo-kpi--blue">
                <div className="fo-kpi__icon" aria-hidden="true"><ShoppingBag size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Orders Today">
                  <span className="fo-kpi__value">{stats?.today_orders ?? 0}</span>
                  <span className="fo-kpi__label">Orders Today</span>
                </div>
              </div>
              <div className="fo-kpi fo-kpi--amber">
                <div className="fo-kpi__icon" aria-hidden="true"><Clock size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Active Jobs">
                  <span className="fo-kpi__value">{stats?.in_progress ?? 0}</span>
                  <span className="fo-kpi__label">Active Jobs</span>
                </div>
              </div>
              <div className="fo-kpi fo-kpi--green">
                <div className="fo-kpi__icon" aria-hidden="true"><CheckCircle2 size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Ready Pickup">
                  <span className="fo-kpi__value">{stats?.ready_pickup ?? 0}</span>
                  <span className="fo-kpi__label">Ready Pickup</span>
                </div>
              </div>
              <div className="fo-kpi fo-kpi--red">
                <div className="fo-kpi__icon" aria-hidden="true"><IndianRupee size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Due Collection">
                  <span className="fo-kpi__value">{fmt(stats?.total_due)}</span>
                  <span className="fo-kpi__label">Due Collection</span>
                </div>
              </div>
              <div className="fo-kpi fo-kpi--teal">
                <div className="fo-kpi__icon" aria-hidden="true"><TrendingUp size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Today Collection">
                  <span className="fo-kpi__value">{fmt(stats?.today_collections)}</span>
                  <span className="fo-kpi__label">Today Collection</span>
                </div>
              </div>
              <div className="fo-kpi fo-kpi--purple">
                <div className="fo-kpi__icon" aria-hidden="true"><Truck size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Delivered Today">
                  <span className="fo-kpi__value">{stats?.delivered_today ?? 0}</span>
                  <span className="fo-kpi__label">Delivered Today</span>
                </div>
              </div>
              <div className="fo-kpi fo-kpi--pink">
                <div className="fo-kpi__icon" aria-hidden="true"><Timer size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Pending Approval">
                  <span className="fo-kpi__value">{stats?.pending_approval ?? 0}</span>
                  <span className="fo-kpi__label">Pending Approval</span>
                </div>
              </div>
              <div className="fo-kpi fo-kpi--cyan">
                <div className="fo-kpi__icon" aria-hidden="true"><BarChart3 size={16} /></div>
                <div className="fo-kpi__body" role="group" aria-label="Avg Processing">
                  <span className="fo-kpi__value">{stats?.avg_processing_time ?? '—'}</span>
                  <span className="fo-kpi__label">Avg Processing</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="fo-tabs">
          <button className={`fo-tab ${activeTab === 'queue' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('queue')}>
            <Package size={14} aria-hidden="true" /> Active Jobs{activeTotal > 0 && <span className="fo-tab-count">{activeTotal}</span>}
          </button>
          <button className={`fo-tab ${activeTab === 'dues' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('dues')}>
            <IndianRupee size={14} aria-hidden="true" /> Due Collection{dueTotal > 0 && <span className="fo-tab-count">{dueTotal}</span>}
          </button>
          <button className={`fo-tab ${activeTab === 'overdue' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('overdue')}>
            <AlertTriangle size={14} aria-hidden="true" /> Overdue{overdueTotal > 0 && <span className="fo-tab-count fo-tab-count--red">{overdueTotal}</span>}
          </button>
          <button className={`fo-tab ${activeTab === 'completed' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('completed')}>
            <CheckCircle2 size={14} aria-hidden="true" /> Completed
          </button>
          <button className={`fo-tab ${activeTab === 'payments' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('payments')}>
            <Receipt size={14} aria-hidden="true" /> Payments
          </button>
          <button className={`fo-tab ${activeTab === 'delivered' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('delivered')}>
            <Truck size={14} aria-hidden="true" /> Delivered
          </button>
        </div>

        {/* ── Tab Content ── */}
        <div className="fo-tab-content">

          {/* ── Active Jobs Queue ── */}
          {activeTab === 'queue' && (
            <div className="fo-panel">
              <div className="fo-panel__header">
                <div className="fo-panel__title-row">
                  <Package size={14} />
                  <span>Active Jobs</span>
                </div>
                <div className="fo-panel__header-right">
                  <div className="fo-active-tabs">
                    {ACTIVE_TABS.map(t => (
                      <button
                        key={t.id}
                        className={`fo-active-tab ${activeJobFilter === t.id ? 'fo-active-tab--active' : ''}`}
                        onClick={() => setActiveJobFilter(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="fo-panel__nav">
                    {activeTotal > 0 && (
                      <span className="fo-panel__total">
                        {((activePage - 1) * PAGE_SIZE) + 1}–{Math.min(activePage * PAGE_SIZE, activeTotal)} of {activeTotal.toLocaleString()}
                      </span>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setActivePage(p => Math.max(1, p - 1))} disabled={activePage <= 1 || activeLoading}><ChevronLeft size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setActivePage(p => Math.min(activeTotalPages, p + 1))} disabled={activePage >= activeTotalPages || activeLoading}><ChevronRight size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-sm" aria-label="Refresh active jobs" onClick={() => fetchActiveJobs(activePage)} disabled={activeLoading}>
                      {activeLoading ? <Loader2 size={12} className="spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              {activeLoading ? (
                <SkeletonLoader type="table" count={5} columns={[
                  { header: 'Job', width: '2fr', lines: 2 },
                  { header: 'Customer', width: '1.5fr', lines: 2 },
                  { header: 'Status', width: '1fr', pill: true },
                  { header: 'Progress', width: '1fr' },
                  { header: 'Amount', width: '1fr' },
                  { header: 'Due', width: '1.2fr' },
                  { header: 'Delivery', width: '1.2fr' },
                  { header: 'Actions', width: '1.5fr' }
                ]} />
              ) : (() => {
                const filteredJobs = activeQueueJobs.filter(job => matchesCategory(job.category));
                return filteredJobs.length === 0 ? (
                  <div className="fo-empty"><Package size={32} aria-hidden="true" /><p>{activeJobFilter !== 'all' ? 'No jobs in this category' : 'No active jobs right now'}</p></div>
                ) : (
                  <div className="fo-table-wrap">
                    <table className="fo-table">
                      <thead>
                        <tr>
                          <th scope="col">Job</th>
                          <th scope="col">Customer</th>
                          <th scope="col">Status</th>
                          <th scope="col">Progress</th>
                          <th scope="col">Amount</th>
                          <th scope="col">Due</th>
                          <th scope="col">Delivery</th>
                          <th scope="col"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredJobs.map(job => {
                          const due = daysUntil(job.delivery_date);
                          const overdue = due !== null && due < 0;
                          const dueToday = due === 0;
                          const balance = Number(job.balance_amount ?? job.balance ?? 0);
                          const progress = getProgressPercent(job);
                          const priority = getPriorityBadge(job);
                          return (
                            <tr
                              key={job.id}
                              className={`${overdue ? 'fo-row--overdue' : dueToday ? 'fo-row--due-today' : ''}`}
                              onClick={() => navigate(`/dashboard/jobs/${job.id}`)}
                            >
                              <td>
                                <div className="fo-job-cell">
                                  <span className="fo-job-number">{job.job_number || job.id?.slice(0, 8)}</span>
                                  <span className="fo-job-name">{job.job_name || job.description || ''}</span>
                                </div>
                              </td>
                              <td>
                                <div className="fo-customer-cell">
                                  <span>{job.customer_name || 'Walk-in'}</span>
                                  {job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}
                                </div>
                              </td>
                              <td>
                                <div className="fo-status-group">
                                  <span className={`fo-badge ${getStatusBadge(job.status)}`}>{job.status}</span>
                                  {priority && <span className={`fo-priority-dot ${priority}`} aria-hidden="true" />}
                                </div>
                              </td>
                              <td>
                                <div className="fo-progress-bar">
                                  <div className="fo-progress-fill" style={{ width: `${progress}%` }} aria-hidden="true" />
                                  <span className="fo-progress-text">{progress}%</span>
                                </div>
                              </td>
                              <td className="fo-amount">{fmt(job.total_amount)}</td>
                              <td>
                                {balance > 0 ? (
                                  <span className="fo-due-amount">{fmt(balance)}</span>
                                ) : (
                                  <span className="fo-paid-tag"><CheckCircle2 size={12} aria-hidden="true" /> Paid</span>
                                )}
                              </td>
                              <td>
                                <div className={`fo-delivery ${overdue ? 'fo-delivery--overdue' : dueToday ? 'fo-delivery--today' : ''}`}>
                                  {job.delivery_date ? (
                                    <>
                                      <span>{fmtDate(job.delivery_date)}</span>
                                      {overdue && <span className="fo-overdue-tag">Overdue</span>}
                                      {dueToday && <span className="fo-today-tag">Today</span>}
                                      {due !== null && due > 0 && due <= 3 && <span className="fo-countdown-tag">{due}d</span>}
                                    </>
                                  ) : '—'}
                                </div>
                              </td>
                              <td>
                                <div className="fo-row-actions">
                                  {balance > 0 && (
                                    <button
                                      className="fo-action-btn fo-action-btn--pay"
                                      aria-label="Quick payment"
                                      onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/sales/payments?job=${job.id}`); }}
                                    >
                                      <CreditCard size={13} aria-hidden="true" />
                                    </button>
                                  )}
                                  {job.status !== 'Completed' && (
                                    <button
                                      className="fo-action-btn fo-action-btn--complete"
                                      aria-label="Mark as complete"
                                      onClick={(e) => { e.stopPropagation(); /* mark complete */ }}
                                    >
                                      <CheckCircle2 size={13} aria-hidden="true" />
                                    </button>
                                  )}
                                  <button
                                    className="fo-action-btn fo-action-btn--view"
                                    aria-label="View job"
                                    onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/jobs/${job.id}`); }}
                                  >
                                    <Eye size={13} aria-hidden="true" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Due Collection */}
          {activeTab === 'dues' && (
            <div className="fo-panel">
              <div className="fo-panel__header">
                <div className="fo-panel__title-row"><IndianRupee size={14} aria-hidden="true" /><span>Due Collection</span></div>
                <div className="fo-panel__header-right">
                  <div className="fo-panel__nav">
                    {dueTotal > 0 && <span className="fo-panel__total">{((duePage - 1) * PAGE_SIZE) + 1}–{Math.min(duePage * PAGE_SIZE, dueTotal)} of {dueTotal.toLocaleString()}</span>}
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setDuePage(p => Math.max(1, p - 1))} disabled={duePage <= 1 || dueLoading}><ChevronLeft size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setDuePage(p => Math.min(dueTotalPages, p + 1))} disabled={duePage >= dueTotalPages || dueLoading}><ChevronRight size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-sm" aria-label="Refresh due customers" onClick={() => fetchDueCustomers(duePage)} disabled={dueLoading}>
                      {dueLoading ? <Loader2 size={12} className="spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              {dueLoading ? (
                <SkeletonLoader type="table" count={4} columns={[
                  { header: 'Customer', width: '2fr', lines: 2 },
                  { header: 'Billed', width: '1.2fr' },
                  { header: 'Paid', width: '1.2fr' },
                  { header: 'Due', width: '1.2fr' },
                  { header: 'Actions', width: '2fr' }
                ]} />
              ) : (!dueCustomers || dueCustomers.length === 0) ? (
                <div className="fo-empty"><CheckCircle2 size={32} aria-hidden="true" /><p>No pending dues — all clear!</p></div>
              ) : (
                <div className="fo-due-list">
                  {dueCustomers.map(c => (
                    <div key={c.id} className="fo-due-card">
                      <div className="fo-due-card__info">
                        <span className="fo-due-card__name">{c.name}</span>
                        <span className="fo-due-card__mobile"><Phone size={12} aria-hidden="true" /> {c.mobile}</span>
                        <span className="fo-due-card__jobs">{c.job_count} job{c.job_count > 1 ? 's' : ''}</span>
                      </div>
                      <div className="fo-due-card__amounts">
                        <div><span className="fo-due-card__label">Billed</span><span>{fmt(c.total_billed)}</span></div>
                        <div><span className="fo-due-card__label">Paid</span><span>{fmt(c.total_paid)}</span></div>
                        <div className="fo-due-card__due"><span className="fo-due-card__label">Due</span><span className="fo-due-amount">{fmt(c.due_amount)}</span></div>
                      </div>
                      <div className="fo-due-card__actions">
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/dashboard/customer-payments?customer=${c.id}`)}>
                          <CreditCard size={13} aria-hidden="true" /> Collect
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dashboard/customers/${c.id}`)}>
                          <Eye size={13} aria-hidden="true" /> View
                        </button>
                        {c.mobile && (
                          <>
                            <a href={`tel:${c.mobile}`} className="btn btn-ghost btn-sm btn-icon" aria-label={`Call ${c.name}`}><Phone size={13} aria-hidden="true" /></a>
                            <a href={whatsappUrl(c.mobile, dueCollectionMessage({ customerName: c.name, totalDue: c.due_amount, jobCount: c.job_count }))} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm btn-icon" aria-label={`WhatsApp ${c.name}`} style={{ color: 'var(--success)' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Overdue Jobs */}
          {activeTab === 'overdue' && (
            <div className="fo-panel">
              <div className="fo-panel__header">
                <div className="fo-panel__title-row"><AlertTriangle size={14} aria-hidden="true" /><span>Overdue</span></div>
                <div className="fo-panel__header-right">
                  <div className="fo-panel__nav">
                    {overdueTotal > 0 && <span className="fo-panel__total">{((overduePage - 1) * PAGE_SIZE) + 1}–{Math.min(overduePage * PAGE_SIZE, overdueTotal)} of {overdueTotal.toLocaleString()}</span>}
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setOverduePage(p => Math.max(1, p - 1))} disabled={overduePage <= 1 || overdueLoading}><ChevronLeft size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setOverduePage(p => Math.min(overdueTotalPages, p + 1))} disabled={overduePage >= overdueTotalPages || overdueLoading}><ChevronRight size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-sm" aria-label="Refresh overdue jobs" onClick={() => fetchOverdueJobs(overduePage)} disabled={overdueLoading}>
                      {overdueLoading ? <Loader2 size={12} className="spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              {overdueLoading ? (
                <SkeletonLoader type="table" count={4} />
              ) : (!overdueJobs || overdueJobs.length === 0) ? (
                <div className="fo-empty"><CheckCircle2 size={32} aria-hidden="true" /><p>No overdue jobs!</p></div>
              ) : (
                <div className="fo-table-wrap">
                  <table className="fo-table">
                    <thead><tr><th scope="col">Job</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Delivery Was</th><th scope="col">Overdue By</th><th scope="col">Balance</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {overdueJobs.filter(job => !categoryFilter || matchesCategory(job.category)).map(job => {
                        const days = Math.abs(daysUntil(job.delivery_date));
                        const balance = Number(job.balance_amount ?? job.balance ?? 0);
                        return (
                          <tr key={job.id} className="fo-row--overdue" onClick={() => navigate(`/dashboard/jobs/${job.id}`)}>
                            <td><div className="fo-job-cell"><span className="fo-job-number">{job.job_number}</span><span className="fo-job-name">{job.job_name}</span></div></td>
                            <td><div className="fo-customer-cell"><span>{job.customer_name}</span>{job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}</div></td>
                            <td><span className={`fo-badge ${getStatusBadge(job.status)}`}>{job.status}</span></td>
                            <td>{fmtDate(job.delivery_date)}</td>
                            <td><span className="fo-overdue-days">{days} day{days > 1 ? 's' : ''}</span></td>
                            <td>{balance > 0 ? <span className="fo-due-amount">{fmt(balance)}</span> : <span className="fo-paid-tag"><CheckCircle2 size={12} aria-hidden="true" /> Paid</span>}</td>
                            <td>
                              <div className="fo-row-actions">
                                {job.customer_mobile && <a href={`tel:${job.customer_mobile}`} className="fo-action-btn" aria-label="Call customer"><Phone size={13} aria-hidden="true" /></a>}
                                <button className="fo-action-btn fo-action-btn--view" aria-label="View job" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/jobs/${job.id}`); }}><Eye size={13} aria-hidden="true" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Completed Jobs */}
          {activeTab === 'completed' && (
            <div className="fo-panel">
              <div className="fo-panel__header">
                <div className="fo-panel__title-row"><CheckCircle2 size={14} aria-hidden="true" /><span>Completed Jobs</span></div>
                <div className="fo-panel__header-right">
                  <div className="row gap-xs items-center">
                    <button className={`btn btn-sm ${completedView === 'grouped' ? 'btn-primary' : 'btn-ghost'}`} aria-label="Grouped view" aria-pressed={completedView === 'grouped'} onClick={() => setCompletedView('grouped')}><LayoutGrid size={13} aria-hidden="true" /></button>
                    <button className={`btn btn-sm ${completedView === 'list' ? 'btn-primary' : 'btn-ghost'}`} aria-label="List view" aria-pressed={completedView === 'list'} onClick={() => setCompletedView('list')}><List size={13} aria-hidden="true" /></button>
                  </div>
                  <div className="fo-panel__nav">
                    {completedTotal > 0 && <span className="fo-panel__total">{((completedPage - 1) * PAGE_SIZE) + 1}–{Math.min(completedPage * PAGE_SIZE, completedTotal)} of {completedTotal.toLocaleString()}</span>}
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setCompletedPage(p => Math.max(1, p - 1))} disabled={completedPage <= 1 || completedLoading}><ChevronLeft size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setCompletedPage(p => Math.min(completedTotalPages, p + 1))} disabled={completedPage >= completedTotalPages || completedLoading}><ChevronRight size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-sm" aria-label="Refresh completed jobs" onClick={() => fetchCompleted(completedPage)} disabled={completedLoading}>
                      {completedLoading ? <Loader2 size={12} className="spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              {completedLoading ? <SkeletonLoader type="table" count={4} /> : !completedJobs || completedJobs.length === 0 ? (
                <div className="fo-empty"><CheckCircle2 size={32} aria-hidden="true" /><p>No completed jobs yet</p></div>
              ) : completedView === 'list' ? (
                <div className="fo-table-wrap">
                  <table className="fo-table">
                    <thead><tr><th scope="col">Job</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Amount</th><th scope="col">Balance</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {completedJobs.map(job => (
                        <tr key={job.id} onClick={() => navigate(`/dashboard/jobs/${job.id}`)}>
                          <td><div className="fo-job-cell"><span className="fo-job-number">{job.job_number}</span><span className="fo-job-name">{job.job_name}</span></div></td>
                          <td><div className="fo-customer-cell"><span>{job.customer_name}</span>{job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}</div></td>
                          <td><span className={`fo-badge ${getStatusBadge(job.status)}`}>{job.status}</span></td>
                          <td className="fo-amount">{fmt(job.total_amount)}</td>
                          <td>{(Number(job.balance_amount ?? job.balance ?? 0)) > 0 ? <span className="fo-due-amount">{fmt(Number(job.balance_amount ?? job.balance ?? 0))}</span> : <span className="fo-paid-tag"><CheckCircle2 size={12} aria-hidden="true" /> Paid</span>}</td>
                          <td>{fmtDate(job.updated_at || job.delivery_date)}</td>
                          <td><button className="fo-action-btn fo-action-btn--view" aria-label="View job" onClick={() => navigate(`/dashboard/jobs/${job.id}`)}><Eye size={13} aria-hidden="true" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="stack-md" style={{ padding: '8px' }}>
                  {groupedCompleted.map(group => {
                    const customerKey = group.customer_id || `walkin-${group.customer_name}`;
                    const isExpanded = expandedCustomers.has(customerKey);
                    return (
                      <div key={customerKey} className="fo-group-card">
                        <button className="fo-group-card__header" onClick={() => toggleCustomerExpand(customerKey)} aria-expanded={isExpanded}>
                          <div className="fo-group-card__info">
                            <strong className="fo-group-card__name">{group.customer_name || 'Walk-in'}</strong>
                            <span className="fo-group-card__meta">{group.jobs.length} job{group.jobs.length > 1 ? 's' : ''} • Total {fmt(group.total_amount)}</span>
                          </div>
                          <div className="fo-group-card__right">
                            <span className="fo-badge badge--success" style={{ fontSize: 11 }}>Completed</span>
                            {isExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="fo-group-card__body">
                            {group.jobs.map(job => (
                              <div key={job.id} className="fo-group-job" onClick={() => navigate(`/dashboard/jobs/${job.id}`)}>
                                <div className="fo-group-job__info">
                                  <strong>{job.job_number} - {job.job_name}</strong>
                                  <span className="muted" style={{ fontSize: 11 }}>{job.description || 'No work name'}</span>
                                </div>
                                <div className="fo-group-job__right">
                                  <span style={{ fontWeight: 700, fontSize: 12 }}>{fmt(job.total_amount)}</span>
                                  <button className="fo-action-btn fo-action-btn--view" aria-label="View job"><Eye size={12} aria-hidden="true" /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Recent Payments */}
          {activeTab === 'payments' && (
            <div className="fo-panel">
              <div className="fo-panel__header">
                <div className="fo-panel__title-row"><Receipt size={14} aria-hidden="true" /><span>Recent Payments</span></div>
                <div className="fo-panel__header-right">
                  <div className="fo-panel__nav">
                    {paymentsTotal > 0 && <span className="fo-panel__total">{((paymentsPage - 1) * PAGE_SIZE) + 1}–{Math.min(paymentsPage * PAGE_SIZE, paymentsTotal)} of {paymentsTotal.toLocaleString()}</span>}
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setPaymentsPage(p => Math.max(1, p - 1))} disabled={paymentsPage <= 1 || paymentsLoading}><ChevronLeft size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setPaymentsPage(p => Math.min(paymentsTotalPages, p + 1))} disabled={paymentsPage >= paymentsTotalPages || paymentsLoading}><ChevronRight size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-sm" aria-label="Refresh payments" onClick={() => fetchRecentPayments(paymentsPage)} disabled={paymentsLoading}>
                      {paymentsLoading ? <Loader2 size={12} className="spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              {paymentsLoading ? <SkeletonLoader type="table" count={4} /> : (!recentPayments || recentPayments.length === 0) ? (
                <div className="fo-empty"><Receipt size={32} aria-hidden="true" /><p>No recent payments</p></div>
              ) : (
                <div className="fo-payments-list">
                  {recentPayments.map(p => (
                    <div key={p.id} className="fo-payment-item">
                      <div className="fo-payment-item__icon"><Wallet size={16} aria-hidden="true" /></div>
                      <div className="fo-payment-item__info">
                        <span className="fo-payment-item__name">{p.customer_name}</span>
                        <span className="fo-payment-item__method">{p.payment_method} • {fmtDate(p.payment_date)}</span>
                      </div>
                      <span className="fo-payment-item__amount">+ {fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Delivered Jobs */}
          {activeTab === 'delivered' && (
            <div className="fo-panel">
              <div className="fo-panel__header">
                <div className="fo-panel__title-row"><Truck size={14} aria-hidden="true" /><span>Delivered</span></div>
                <div className="fo-panel__header-right">
                  <div className="fo-panel__nav">
                    {deliveredTotal > 0 && <span className="fo-panel__total">{((deliveredPage - 1) * PAGE_SIZE) + 1}–{Math.min(deliveredPage * PAGE_SIZE, deliveredTotal)} of {deliveredTotal.toLocaleString()}</span>}
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setDeliveredPage(p => Math.max(1, p - 1))} disabled={deliveredPage <= 1 || deliveredLoading}><ChevronLeft size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setDeliveredPage(p => Math.min(deliveredTotalPages, p + 1))} disabled={deliveredPage >= deliveredTotalPages || deliveredLoading}><ChevronRight size={14} aria-hidden="true" /></button>
                    <button className="btn btn-ghost btn-sm" aria-label="Refresh delivered jobs" onClick={() => fetchDeliveredJobs(deliveredPage)} disabled={deliveredLoading}>
                      {deliveredLoading ? <Loader2 size={12} className="spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              {deliveredLoading ? <SkeletonLoader type="table" count={4} /> : (!deliveredJobs || deliveredJobs.length === 0) ? (
                <div className="fo-empty"><Truck size={32} aria-hidden="true" /><p>No delivered jobs yet</p></div>
              ) : (
                <div className="fo-table-wrap">
                  <table className="fo-table">
                    <thead><tr><th scope="col">Job</th><th scope="col">Customer</th><th scope="col">Amount</th><th scope="col">Balance</th><th scope="col">Delivery Date</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {deliveredJobs.map(job => (
                        <tr key={job.id} onClick={() => navigate(`/dashboard/jobs/${job.id}`)}>
                          <td><div className="fo-job-cell"><span className="fo-job-number">{job.job_number}</span><span className="fo-job-name">{job.job_name}</span></div></td>
                          <td><div className="fo-customer-cell"><span>{job.customer_name}</span>{job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}</div></td>
                          <td className="fo-amount">{fmt(job.total_amount)}</td>
                          <td>{(Number(job.balance_amount ?? job.balance ?? 0)) > 0 ? <span className="fo-due-amount">{fmt(Number(job.balance_amount ?? job.balance ?? 0))}</span> : <span className="fo-paid-tag"><CheckCircle2 size={12} /> Paid</span>}</td>
                          <td>{fmtDate(job.delivery_date || job.updated_at)}</td>
                          <td><button className="fo-action-btn fo-action-btn--view" onClick={() => navigate(`/dashboard/jobs/${job.id}`)}><Eye size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageContainer>

      {showOpeningPrompt && (
        <OpeningSetupModal
          balances={promptBalances}
          machines={promptMachines}
          prevClosing={prevClosing}
          branchName={user?.branch_name}
          onSave={() => { setShowOpeningPrompt(false); loadDashboard(); }}
          onSkip={() => setShowOpeningPrompt(false)}
        />
      )}
    </>
  );
};

export default FrontOffice;
