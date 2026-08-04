import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Clock, Calendar, Search, RefreshCw, FileText, FileDown, Copy, AlertCircle, IndianRupee, Layers, Package, Phone, User, Building2, Shield, CheckCircle2, ChevronDown, Trash2, Upload, Eye, ThumbsUp, ThumbsDown, RotateCcw, MessageSquare, CreditCard, XCircle, Activity, Loader2, Users, Plus, Image } from 'lucide-react';
import LoadingButton from '../components/LoadingButton';
import api, { imgUrl } from '../services/api';
import auth from '../services/auth';
import localDb from '../services/localDb';
import SecureImage from '../components/SecureImage';

import toast from 'react-hot-toast';
import { whatsappUrl, workStatusMessage, paymentReminderMessage, orderReadyMessage, invoiceTextMessage } from '../utils/whatsapp';
import { formatCurrency } from '../utils/formatters';
const fmt = formatCurrency;
import './JobDetail.css';
import PageContainer from '../components/ui/PageContainer';
import useAuth from '../hooks/useAuth';
import AssignStaff from '../components/AssignStaff';

const statusColors = {
    Pending: 'var(--warning)',
    Processing: 'var(--accent-2)',
    'Approval Pending': 'var(--accent)',
    Completed: 'var(--success)',
    Delivered: 'var(--accent)',
    Cancelled: 'var(--error)',
};

const paymentColors = {
    Paid: 'var(--success)',
    Partial: 'var(--warning)',
    Unpaid: 'var(--error)',
    Credit: '#f97316',
};

const Badge = ({ label, color }) => {
    const isVar = color?.startsWith('var(');
    return (
        <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: isVar ? `color-mix(in srgb, ${color}, transparent 85%)` : (color + '15'),
            color: color,
            border: `1px solid ${isVar ? `color-mix(in srgb, ${color}, transparent 80%)` : (color + '33')}`,
        }}>{label}</span>
    );
};

const InfoRow = ({ icon: _Icon, label, value, isPhone, whatsappOptions }) => (
    <div className="job-info-row">
        {_Icon && <_Icon size={16} />}
        <span className="job-info-label">{label}</span>
        <div className="job-info-value">
            <span>
                {isPhone && value ? value : (value || '—')}
            </span>
            {isPhone && value && (
                <>
                    <a href={`tel:${value}`} className="job-info-phone-link" title="Call">
                        📞 Call
                    </a>
                    {whatsappOptions && whatsappOptions.length > 0 && <WhatsAppDropdown mobile={value} options={whatsappOptions} />}
                </>
            )}
        </div>
    </div>
);

const WhatsAppDropdown = ({ mobile, options }) => {
    const [open, setOpen] = React.useState(false);
    const btnRef = React.useRef(null);
    const [dropPos, setDropPos] = React.useState({ top: 0, left: 0 });
    const ref = React.useRef(null);

    React.useEffect(() => {
        if (open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
        }
    }, [open]);

    React.useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    return (
        <div className="whatsapp-dropdown">
            <button
                ref={btnRef}
                onClick={() => setOpen(!open)}
                className="whatsapp-button"
                title="WhatsApp"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp ▾
            </button>
            {open && (
                <div className="whatsapp-dropdown-menu" style={{ top: dropPos.top, left: dropPos.left }}>
                    {options.map((opt, i) => (
                        <a
                            key={i}
                            href={whatsappUrl(mobile, opt.message)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOpen(false)}
                            className="whatsapp-dropdown-item"
                        >
                            {opt.icon} {opt.label}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

const Section = ({ title, icon: _Icon, action, children }) => (
    <div className="job-section">
        <div className="job-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <_Icon size={18} />
                <h3>{title}</h3>
            </div>
            {action && <div className="job-section-action">{action}</div>}
        </div>
        {children}
    </div>
);

const StatCard = ({ label, value, icon: _Icon, color, subValue }) => (
    <div className="job-stat-card-inner">
        <div className="job-stat-card-header">
            <span className="job-stat-card-label">{label}</span>
            <div className="job-stat-card-icon" style={{ background: color + '15', color: color }}>
                <_Icon size={16} />
            </div>
        </div>
        <div className="stat-value">{value}</div>
        {subValue && <div className="job-stat-subvalue">{subValue}</div>}
    </div>
);

import { useOptimistic } from '../hooks/useOptimistic';

const ROLES_CAN_ASSIGN = ['Admin', 'Front Office'];
const FINANCIALS_ROLES = ['Admin', 'Accountant', 'Front Office', 'front office'];

const JobDetail = () => {
    useSEO('Job Detail');

    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const userRole = user?.role;
    const { data, setData, optimisticUpdate } = useOptimistic(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [paymentModal, setPaymentModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [cancelModal, setCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [refundModal, setRefundModal] = useState(false);
    const [refundAmount, setRefundAmount] = useState('');
    const [refundMethod, setRefundMethod] = useState('Cash');
    const [refundNote, setRefundNote] = useState('');
    const [refunding, setRefunding] = useState(false);
    const [creditModal, setCreditModal] = useState(false);
    const [creditReason, setCreditReason] = useState('');
    const [submittingCredit, setSubmittingCredit] = useState(false);
    const [_branchUpiId, _setBranchUpiId] = useState('');
    const [branchesData, setBranchesData] = useState([]);

    // Paper tracking state
    const [paperLogs, setPaperLogs] = useState([]);
    const [paperSummary, setPaperSummary] = useState({ required_sheets: 0, used_sheets: 0, paper_size: null, waste_sheets: 0, waste_percent: '0' });
    const [paperLogModal, setPaperLogModal] = useState(false);
    const [paperForm, setPaperForm] = useState({ stage: '', paper_size: '', sheets_used: '', sheets_wasted: '', notes: '' });
    const [loggingPaper, setLoggingPaper] = useState(false);
    const [editingRequired, setEditingRequired] = useState(false);
    const [requiredInput, setRequiredInput] = useState('');



    // Job designs state
    const [jobDesigns, setJobDesigns] = useState([]);
    const [uploadingDesign, setUploadingDesign] = useState(false);
    const designFileRef = React.useRef(null);

    // Matter images state
    const [matterImages, setMatterImages] = useState([]);
    const [uploadingMatter, setUploadingMatter] = useState(false);
    const matterUploadRef = React.useRef(null);
    const matterCaptureRef = React.useRef(null);

    // Proof approval state
    const [proofs, setProofs] = useState([]);
    const [proofModal, setProofModal] = useState(false);
    const [proofNotes, setProofNotes] = useState('');
    const [uploadingProof, setUploadingProof] = useState(false);
    const proofFileRef = React.useRef(null);
    const [reviewModal, setReviewModal] = useState(null); // holds proof object being reviewed
    const [reviewFeedback, setReviewFeedback] = useState('');
    const [reviewing, setReviewing] = useState(false);

    // Plate count state
    const [editingPlates, setEditingPlates] = useState(false);
    const [plateInput, setPlateInput] = useState('');

    const isFrontOffice = userRole === 'Front Office';
    const canAssign = ROLES_CAN_ASSIGN.includes(userRole);

    const fetchJob = async () => {
        try {
            setLoading(true);
            const details = await localDb.getJobDetails(id);
            if (details) {
                setData(details);
                setPaperLogs(details.paper_logs || []);
                // Simple summary calculation if not provided by backend
                const req = details.job?.required_sheets || 0;
                const used = (details.paper_logs || []).reduce((sum, log) => sum + (log.sheets_used || 0), 0);
                const wasted = (details.paper_logs || []).reduce((sum, log) => sum + (log.sheets_wasted || 0), 0);
                setPaperSummary({
                    required_sheets: req,
                    used_sheets: used + wasted,
                    waste_sheets: wasted,
                    waste_percent: req > 0 ? ((wasted / req) * 100).toFixed(1) : '0'
                });
            } else {
                // Fallback: try server when not present in local IndexedDB
                try {
                    const resp = await api.get(`/jobs/${id}`);
                    const srv = resp.data || {};
                    if (srv && srv.job) {
                        setData({
                            job: srv.job,
                            assignments: srv.assignments || [],
                            paper_logs: srv.paper_logs || [],
                            designs: srv.designs || [],
                            proofs: srv.proofs || [],
                            payments: srv.payments || [],
                            statusHistory: srv.statusHistory || []
                        });
                        // Cache the server job locally for offline availability
                        try {
                            await localDb.cacheJob(srv.job);
                            // also cache related details if helper exists
                            if (srv.assignments || srv.paper_logs || srv.designs || srv.proofs) {
                                if (typeof localDb.cacheJobDetails === 'function') {
                                    try { await localDb.cacheJobDetails(srv.job.id, { assignments: srv.assignments, paper_logs: srv.paper_logs, designs: srv.designs, proofs: srv.proofs }); } catch {}
                                }
                            }
                        } catch {
                            // caching failure shouldn't block UI
                        }
                        setPaperLogs(srv.paper_logs || []);
                        const req = srv.job?.required_sheets || 0;
                        const used = (srv.paper_logs || []).reduce((sum, log) => sum + (log.sheets_used || 0), 0);
                        const wasted = (srv.paper_logs || []).reduce((sum, log) => sum + (log.sheets_wasted || 0), 0);
                        setPaperSummary({
                            required_sheets: req,
                            used_sheets: used + wasted,
                            waste_sheets: wasted,
                            waste_percent: req > 0 ? ((wasted / req) * 100).toFixed(1) : '0'
                        });
                    } else {
                        setError('Job not found locally');
                    }
                } catch (e) {
                    if (e?.response?.status === 404) setError('Job not found');
                    else setError('Failed to load job details');
                }
            }
        } catch (err) {
            console.error('Failed to load job details:', err);
            setError('Failed to load job details');
        } finally {
            setLoading(false);
        }
    };

    const fetchPaperLogs = () => fetchJob(); // Unified in getJobDetails

    const handleLogPaper = async () => {
        if (!paperForm.stage) return toast.error('Select a production stage');
        const used = Number(paperForm.sheets_used) || 0;
        const wasted = Number(paperForm.sheets_wasted) || 0;
        if (used === 0 && wasted === 0) return toast.error('Enter sheets used or wasted');
        setLoggingPaper(true);
        try {
            await localDb.logPaperUsage(id, paperForm);
            toast.success('Paper usage logged locally');
            setPaperLogModal(false);
            setPaperForm({ stage: '', paper_size: '', sheets_used: '', sheets_wasted: '', notes: '' });
            fetchJob();
        } catch {
            toast.error('Failed to log paper usage');
        } finally {
            setLoggingPaper(false);
        }
    };

    const handleDeletePaperLog = async (logId) => {
        if (!confirm('Delete this paper log entry?')) return;
        // Optimistic UI Update
        setPaperLogs(prev => prev.filter(log => log.id !== logId));
        try {
            await api.delete(`/jobs/${id}/paper-logs/${logId}`);
            toast.success('Log removed');
            fetchPaperLogs();
        } catch {
            toast.error('Failed to delete log');
            fetchPaperLogs();
        }
    };

    const handleUpdateRequired = async () => {
        const val = Math.max(0, Math.round(Number(requiredInput) || 0));
        try {
            await localDb.updateJobStatus(id, null, { required_sheets: val });
            toast.success('Required sheets updated locally');
            setEditingRequired(false);
            fetchJob();
        } catch {
            toast.error('Failed to update');
        }
    };

    const fetchDesigns = () => {
        api.get(`/jobs/${id}/designs`).then(res => setJobDesigns(res.data || [])).catch(() => { });
    };

    const fetchMatter = () => {
        api.get(`/jobs/${id}/matter`).then(res => setMatterImages(res.data || [])).catch(() => { });
    };

    const handleUploadMatter = async (file, isCamera = false) => {
        if (!file) return;
        setUploadingMatter(true);
        try {
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('notes', isCamera ? 'Captured on-site' : 'Uploaded');
            await api.post(`/jobs/${id}/matter`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success('Matter image uploaded');
            fetchMatter();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        } finally {
            setUploadingMatter(false);
        }
    };

    const handleDeleteMatter = async (matterId) => {
        if (!confirm('Delete this matter image?')) return;
        // Optimistic UI Update
        setMatterImages(prev => prev.filter(img => img.id !== matterId));
        try {
            await api.delete(`/jobs/${id}/matter/${matterId}`);
            toast.success('Deleted');
            fetchMatter();
        } catch {
            toast.error('Failed to delete');
            fetchMatter();
        }
    };

    const fetchProofs = () => {
        api.get(`/jobs/${id}/proofs`).then(res => setProofs(res.data || [])).catch(() => { });
    };

    const handleDesignUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploadingDesign(true);
        try {
            const formData = new FormData();
            for (const file of files) {
                console.log(`Adding file to upload: ${file.name} (${file.type})`);
                formData.append('files', file);
            }
            const response = await api.post(`/jobs/${id}/designs`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            console.log('Design upload response:', response);
            toast.success(`${files.length} design(s) uploaded`);
            fetchDesigns();
        } catch (err) {
            console.error('Design upload error details:', err);
            const errorMsg = err.response?.data?.message || err.message || 'Upload failed';
            console.error('Error message:', errorMsg);
            toast.error(errorMsg);
        } finally {
            setUploadingDesign(false);
            if (designFileRef.current) designFileRef.current.value = '';
        }
    };

    const handleDeleteDesign = async (designId) => {
        if (!confirm('Delete this design file?')) return;
        // Optimistic UI Update
        setJobDesigns(prev => prev.filter(design => design.id !== designId));
        try {
            await api.delete(`/jobs/${id}/designs/${designId}`);
            toast.success('Design deleted');
            fetchDesigns();
        } catch {
            toast.error('Failed to delete design');
            fetchDesigns();
        }
    };

    const handleUploadProof = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingProof(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (proofNotes) formData.append('designer_notes', proofNotes);
            const res = await api.post(`/jobs/${id}/proofs`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success(res.data.message || 'Proof uploaded');

            // Show design check result if available
            const dc = res.data.designCheck;
            if (dc && !dc.error) {
                if (dc.passed) {
                    toast.success(`Design Check PASSED — no issues found`, { duration: 5000 });
                } else {
                    toast.error(`Design Check: ${dc.critical_issues} critical, ${dc.warnings} warnings`, { duration: 8000 });
                }
            } else if (dc?.error) {
                toast('Design check skipped: ' + (dc.message || 'unsupported file type'), { icon: 'ℹ️' });
            }

            setProofModal(false);
            setProofNotes('');
            fetchProofs();
            fetchJob();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        } finally {
            setUploadingProof(false);
            if (proofFileRef.current) proofFileRef.current.value = '';
        }
    };

    const handleReviewProof = async (status) => {
        if (!reviewModal) return;
        setReviewing(true);
        try {
            await api.put(`/jobs/${id}/proofs/${reviewModal.id}/review`, { status, customer_feedback: reviewFeedback || null });
            toast.success(`Proof ${status.toLowerCase()}`);
            setReviewModal(null);
            setReviewFeedback('');
            fetchProofs();
            fetchJob();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Review failed');
        } finally {
            setReviewing(false);
        }
    };

    const handleDeleteProof = async (proofId) => {
        if (!confirm('Delete this proof?')) return;
        // Optimistic UI Update
        setProofs(prev => prev.filter(proof => proof.id !== proofId));
        try {
            await api.delete(`/jobs/${id}/proofs/${proofId}`);
            toast.success('Proof deleted');
            fetchProofs();
        } catch {
            toast.error('Failed to delete proof');
            fetchProofs();
        }
    };

    const handleUpdatePlates = async () => {
        const val = Math.max(0, Math.round(Number(plateInput) || 0));
        try {
            await localDb.updateJobStatus(id, null, { plate_count: val });
            toast.success('Plate count updated locally');
            setEditingPlates(false);
            fetchJob();
        } catch { toast.error('Failed to update'); }
    };

    useEffect(() => {
        fetchJob();
        fetchPaperLogs();
        fetchDesigns();
        fetchProofs();
        fetchMatter();

        // Fetch branch UPI for invoice QR code
        api.get('/branches').then(res => {
            setBranchesData(res.data || []);
        }).catch(() => { });

        // Listen for global payment updates
        const handlePaymentUpdate = () => {
            fetchJob();
        };
        window.addEventListener('paymentRecorded', handlePaymentUpdate);

        return () => {
            window.removeEventListener('paymentRecorded', handlePaymentUpdate);
        };
    }, [id]);

    const isFinancialsVisible = FINANCIALS_ROLES.includes(userRole);

    const handleRepeatOrder = async () => {
        try {
            const res = await api.post(`/jobs/${id}/repeat`);
            toast.success(res.data.message || 'Order repeated!');
            navigate(`/dashboard/jobs/${res.data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to repeat order');
        }
    };

    const handleAssignmentStatus = async (aid, newStatus) => {
        optimisticUpdate({
            updateFn: (prev) => ({
                ...prev,
                assignments: prev.assignments.map(a => a.id === aid ? { ...a, status: newStatus, _updating: true } : a)
            }),
            serverFn: async () => {
                await localDb.updateAssignmentStatus(aid, newStatus);
                return (prev) => ({
                    ...prev,
                    assignments: prev.assignments.map(a => a.id === aid ? { ...a, _updating: false } : a)
                });
            },
            rollbackFn: (prev) => ({
                ...prev,
                assignments: prev.assignments.map(a => a.id === aid ? { ...a, _updating: false } : a)
            }),
            successMsg: `Assignment status: ${newStatus}`,
            errorMsg: 'Failed to update assignment'
        });
    };

    const handleAssignmentsUpdate = (newAssignments) => {
        setData(prev => ({ ...prev, assignments: newAssignments }));
    };

    const handleUpdateStatus = async (newStatus) => {
        optimisticUpdate({
            updateFn: (prev) => ({ ...prev, job: { ...prev.job, status: newStatus }, _updating: true }),
            serverFn: async () => {
                await localDb.updateJobStatus(id, newStatus);

                // Auto-log paper usage when a job is marked Completed/Delivered
                try {
                    if (newStatus === 'Completed' || newStatus === 'Delivered') {
                        // Fetch latest local job record
                        const jobRec = await localDb.getJobById(id);
                        if (jobRec) {
                            const required = Number(jobRec.required_sheets || 0);
                            const used = Number(jobRec.used_sheets || 0);
                            // Only auto-log the remaining required sheets (avoid double-logging)
                            const toLog = Math.max(0, required - used);
                            if (toLog > 0) {
                                const paperSize = jobRec.paper_size || jobRec.size || null;
                                try {
                                    await localDb.logPaperUsage(id, {
                                        stage: 'auto-complete',
                                        paper_size: paperSize,
                                        sheets_used: toLog,
                                        sheets_wasted: 0,
                                        notes: 'Auto-logged on job completion'
                                    });
                                } catch (logErr) {
                                    console.warn('Auto paper log failed:', logErr);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Auto-log paper check failed:', e);
                }

                return (prev) => ({ ...prev, _updating: false });
            },
            rollbackFn: (prev) => ({ ...prev, _updating: false }),
            successMsg: `Status: ${newStatus}`,
            errorMsg: 'Failed to update status'
        });
    };

    const handleRecordPayment = () => {
        if (!paymentAmount || isNaN(paymentAmount)) return toast.success('Enter valid amount');
        setPaymentModal(false);
        setPaymentAmount('');
        // Navigate to customer payment section with prefilled details
        navigate('/dashboard/sales/payments', {
            state: {
                customer_id: data.job.customer_id,
                customer_name: data.job.customer_name,
                customer_mobile: data.job.customer_mobile || data.job.mobile || '',
                job_id: data.job.id,
                amount: paymentAmount
            }
        });
    };

    const handleCancelOrder = async () => {
        if (!cancelReason.trim()) return toast.error('Please provide a cancellation reason');
        setCancelling(true);
        try {
            await localDb.updateJobStatus(id, 'Cancelled', { 
                description: `${data.job.description ? data.job.description + '\n' : ''}[CANCELLED] ${cancelReason.trim()}` 
            });
            toast.success('Order cancelled locally');
            setCancelModal(false);
            setCancelReason('');
            fetchJob();
        } catch {
            toast.error('Failed to cancel order');
        } finally {
            setCancelling(false);
        }
    };

    const handleRefund = async () => {
        const amt = Number(refundAmount);
        if (!amt || amt <= 0) return toast.error('Enter a valid refund amount');
        const maxRefundable = Number(data.job.advance_paid) || 0;
        if (amt > maxRefundable) return toast.error(`Maximum refundable: ₹${maxRefundable.toLocaleString('en-IN')}`);
        setRefunding(true);
        try {
            await api.post('/customer-payments/refund', {
                job_id: Number(id),
                customer_id: data.job.customer_id,
                refund_amount: amt,
                refund_method: refundMethod,
                reason: refundNote.trim() || 'Customer refund'
            });
            toast.success(`₹${amt.toLocaleString('en-IN')} refunded successfully`);
            setRefundModal(false);
            setRefundAmount('');
            setRefundNote('');
            setRefundMethod('Cash');
            fetchJob();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Refund failed');
        } finally {
            setRefunding(false);
        }
    };

    // Navigate back safely: prefer history back, fallback to Jobs list
    const handleBackClick = () => {
        try {
            if (window.history && window.history.length > 1) {
                navigate(-1);
            } else {
                navigate('/dashboard/jobs');
            }
        } catch {
            navigate('/dashboard/jobs');
        }
    };

    if (loading) {
        return (
            <div className="job-loading">
                <Loader2 size={28} className="animate-spin" />
                <span>Loading job dashboard...</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="job-error">
                <button onClick={() => handleBackClick()} className="job-error-back">
                    <ArrowLeft size={18} /> Back
                </button>
                <div className="job-error-message">
                    <AlertCircle size={20} />
                    <span>{error || 'Job not found'}</span>
                </div>
            </div>
        );
    }

    const { job, assignments, payments, statusHistory } = data;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const balance = Number(job.balance_amount || 0);
    const statusColor = statusColors[job.status] || 'var(--muted)';
    const _payColor = paymentColors[job.payment_status] || 'var(--muted)';

    const currentUserAssignment = assignments?.find(a => a.staff_id === auth.getUser()?.id)
        || assignments?.find(a => a.staff_id === null && a.role === auth.getUser()?.role);

    return (
        <PageContainer>
            {/* Header / Dashboard Toolbar */}
            <div className="job-detail-header">
                <div>
                    <button
                        onClick={() => handleBackClick()}
                        className="back-button"
                    >
                        <ArrowLeft size={16} /> Back to Jobs
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h1>Job Dashboard</h1>
                        <span className="job-number-badge">
                            {job.job_number}
                        </span>
                    </div>
                </div>

                <div className="job-detail-actions">
                    {['Admin', 'Front Office', 'front office'].includes(userRole) && (
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                navigate('/dashboard/sales/invoices', {
                                    state: {
                                        action: 'create',
                                        job: job
                                    }
                                });
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)', fontWeight: 600 }}
                        >
                            <FileText size={18} /> Generate Invoice
                        </button>
                    )}

                    {isFinancialsVisible && (
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                navigate('/dashboard/sales/payments', {
                                    state: {
                                        customer_id: job.customer_id,
                                        customer_name: job.customer_name,
                                        customer_mobile: job.customer_mobile,
                                        job_id: job.id,
                                        amount: job.balance_amount
                                    }
                                });
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                            <CreditCard size={18} /> Record Payment
                        </button>
                    )}

                    {/* Download Invoice Button */}
                    {['Admin', 'Front Office', 'front office'].includes(userRole) && (
                        <button
                            className="btn"
                            onClick={async () => {
                                const billData = {
                                    invoiceNumber: job.job_number,
                                    invoiceDate: job.created_at,
                                    customer: {
                                        name: job.customer_name,
                                        mobile: job.customer_mobile,
                                        type: job.customer_type,
                                        email: job.customer_email,
                                        address: job.customer_address,
                                        gst: job.customer_gst,
                                    },
                                    orderLines: [{
                                        product_name: job.product_name || job.job_name,
                                        quantity: job.quantity || 1,
                                        unit_price: job.unit_price || job.total_amount,
                                        total_amount: job.total_amount,
                                        category: job.category,
                                    }],
                                    totals: (() => {
                                        const pmt = payments?.[0];
                                        const discPct = Number(pmt?.discount_percent) || 0;
                                        const subtotal = Number(job.total_amount || 0);
                                        const discAmt = subtotal * discPct / 100;
                                        const gross = subtotal - discAmt;
                                        return {
                                            subtotal,
                                            gross,
                                            net: gross / 1.18,
                                            sgst: (gross / 1.18) * 0.09,
                                            cgst: (gross / 1.18) * 0.09,
                                            effectiveDiscount: discPct,
                                            discountAmount: discAmt,
                                        };
                                    })(),
                                    payment: {
                                        advancePaid: job.advance_paid || 0,
                                        balance: job.balance_amount || 0,
                                        methods: job.payment_mode || 'Cash',
                                    },
                                    jobs: [{ job_number: job.job_number }],
                                    upiId: (() => {
                                        const branch = branchesData.find(b => b.id === job.branch_id);
                                        return branch?.upi_id || undefined;
                                    })(),
                                };
                                const { downloadInvoicePDF } = await import('../utils/invoicePdf');
                                downloadInvoicePDF(billData);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)', fontWeight: 600 }}
                        >
                            <FileDown size={18} /> Download Invoice
                        </button>
                    )}

                    {/* Send Invoice via WhatsApp Button */}
                    {['Admin', 'Front Office', 'front office'].includes(userRole) && job.customer_mobile && (
                        <a
                            className="btn"
                            href={(() => {
                                const msg = invoiceTextMessage({
                                    customerName: job.customer_name,
                                    invoiceNumber: job.job_number,
                                    orderLines: [{ product_name: job.product_name || job.job_name, quantity: job.quantity || 1, total_amount: job.total_amount }],
                                    totals: { gross: job.total_amount || 0 },
                                    payment: { advancePaid: job.advance_paid || 0, methods: job.payment_mode || 'Cash' },
                                    jobs: [{ job_number: job.job_number }],
                                });
                                return whatsappUrl(job.customer_mobile, msg);
                            })()}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                                const msg = invoiceTextMessage({
                                    customerName: job.customer_name,
                                    invoiceNumber: job.job_number,
                                    orderLines: [{ product_name: job.product_name || job.job_name, quantity: job.quantity || 1, total_amount: job.total_amount }],
                                    totals: { gross: job.total_amount || 0 },
                                    payment: { advancePaid: job.advance_paid || 0, methods: job.payment_mode || 'Cash' },
                                    jobs: [{ job_number: job.job_number }],
                                });
                                const url = whatsappUrl(job.customer_mobile, msg);
                                if (!url) {
                                    e.preventDefault();
                                    toast.error('Invalid phone number. Cannot open WhatsApp.');
                                }
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Send Invoice
                        </a>
                    )}

                    {/* Repeat Order Button */}
                    {['Admin', 'Front Office', 'front office'].includes(userRole) && (
                        <button
                            className="btn"
                            onClick={handleRepeatOrder}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)', fontWeight: 600 }}
                        >
                            <Copy size={18} /> Repeat Order
                        </button>
                    )}

                    {/* Cancel Order Button */}
                    {['Admin', 'Front Office', 'front office'].includes(userRole) && !['Cancelled', 'Delivered'].includes(job.status) && (
                        <button
                            className="btn"
                            onClick={() => setCancelModal(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error)', fontWeight: 600 }}
                        >
                            <XCircle size={18} /> Cancel Order
                        </button>
                    )}

                    {/* Authorize Credit Delivery Button */}
                    {Number(job.balance_amount || 0) > 0 && job.status === 'Completed' && ['admin', 'accountant', 'front office'].includes(String(userRole || '').toLowerCase()) && (
                        <button
                            className="btn"
                            onClick={() => {
                                setCreditReason('');
                                setCreditModal(true);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)', fontWeight: 600 }}
                        >
                            <Shield size={18} /> Authorize Credit Delivery
                        </button>
                    )}

                    {/* Refund Button */}
                    {isFinancialsVisible && Number(job.advance_paid) > 0 && ['Cancelled'].includes(job.status) && (
                        <button
                            className="btn"
                            onClick={() => { setRefundAmount(String(job.advance_paid)); setRefundModal(true); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)', fontWeight: 600 }}
                        >
                            <RotateCcw size={18} /> Process Refund
                        </button>
                    )}

                    {/* Staff Action Buttons */}
                    {currentUserAssignment && (
                        <div className="job-staff-actions">
                            {currentUserAssignment.status === 'Pending' && !['Completed', 'Delivered', 'Cancelled'].includes(job.status) && (
                                <button className="btn btn-primary" onClick={async () => {
                                    await handleAssignmentStatus(currentUserAssignment.id, 'In Progress');
                                    if (job.status === 'Pending') await handleUpdateStatus('Processing');
                                }}>
                                    Start Job
                                </button>
                            )}
                            {currentUserAssignment.status === 'In Progress' && job.status !== 'Approval Pending' && auth.getUser()?.role === 'Designer' && (
                                <button className="btn btn-warning" onClick={async () => {
                                    await handleUpdateStatus('Approval Pending');
                                }} style={{ color: 'var(--on-accent)', background: 'var(--warning)', borderColor: 'var(--warning)' }}>
                                    Send for Customer Verification
                                </button>
                            )}
                            {currentUserAssignment.status === 'In Progress' && auth.getUser()?.role !== 'Designer' && (
                                <button className="btn btn-success" onClick={async () => {
                                    await handleAssignmentStatus(currentUserAssignment.id, 'Completed');
                                    const othersCompleted = assignments
                                        .filter(a => a.id !== currentUserAssignment.id)
                                        .every(a => a.status === 'Completed');
                                    if (othersCompleted) {
                                        await handleUpdateStatus('Completed');
                                    }
                                }}>
                                    Complete Job
                                </button>
                            )}
                            {job.status === 'Approval Pending' && !['Completed', 'Delivered'].includes(job.status) && (
                                <>
                                    <span className="badge badge--info">
                                        ✓ Sent for Customer Verification
                                    </span>
                                    <button className="btn btn-success" onClick={async () => {
                                        await handleAssignmentStatus(currentUserAssignment.id, 'Completed');
                                        const othersCompleted = assignments
                                            .filter(a => a.id !== currentUserAssignment.id)
                                            .every(a => a.status === 'Completed');
                                        if (othersCompleted) {
                                            await handleUpdateStatus('Completed');
                                        } else {
                                            await handleUpdateStatus('Processing');
                                        }
                                    }}>
                                        Complete
                                    </button>
                                </>
                            )}
                            {(job.status === 'Completed' || job.status === 'Delivered') && (
                                <span className="badge badge--success">
                                    ✓ Completed
                                </span>
                            )}
                        </div>
                    )}

                    {['Admin', 'Front Office', 'front office'].includes(userRole) ? (
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <select
                                className={`badge ${
                                    job.status === 'Pending' ? 'badge--warning' :
                                    job.status === 'Processing' ? 'badge--info' :
                                    job.status === 'Approval Pending' ? 'badge--warning' :
                                    job.status === 'Completed' ? 'badge--success' :
                                    job.status === 'Delivered' ? 'badge--primary' :
                                    job.status === 'Cancelled' ? 'badge--danger' : ''
                                } job-status-select`}
                                style={{ opacity: job._updating ? 0.6 : 1 }}
                                value={job.status}
                                onChange={(e) => handleUpdateStatus(e.target.value)}
                                disabled={job._updating}
                            >
                                {Object.keys(statusColors).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {job._updating && <Loader2 size={16} className="animate-spin status-spinner" />}
                        </div>
                    ) : (
                        <Badge label={job.status} color={statusColor} />
                    )}
                </div>
            </div>

            {/* Dashboard Overview Cards */}
            <div className="job-stat-cards-row">
                {isFinancialsVisible && (
                    <>
                        <StatCard
                            label="Total Amount"
                            value={fmt(job.total_amount)}
                            icon={IndianRupee}
                            color="var(--accent)"
                            subValue={job.payment_status}
                        />
                        <StatCard
                            label="Advance Paid"
                            value={fmt(job.advance_paid)}
                            icon={CheckCircle2}
                            color="var(--success)"
                            subValue={Number(data?.payments?.[0]?.discount_amount || 0) > 0 ? `Discount: ${fmt(Number(data.payments[0].discount_amount))}` : 'Customer Deposit'}
                        />
                        <StatCard
                            label="Balance Due"
                            value={fmt(balance)}
                            icon={CreditCard}
                            color={balance > 0 ? 'var(--error)' : 'var(--success)'}
                            subValue={balance > 0 ? 'Collection Pending' : 'Order Settled'}
                        />
                    </>
                )}
                {!isFrontOffice && isFinancialsVisible && (
                    <StatCard
                        label="Net Profit"
                        value={fmt(job.profit)}
                        icon={Activity}
                        color={job.margin > 0.3 ? 'var(--success)' : 'var(--accent-2)'}
                        subValue={`Margin: ${(job.margin * 100).toFixed(1)}%`}
                    />
                )}
            </div>

            <div className="job-detail-main-grid">
                <div className="stack-lg">
                    {/* Main Info */}
                    <Section title="Order Overview" icon={FileText}>
                        <div className="job-detail-info-grid">
                            <div className="stack-xs">
                                <InfoRow icon={Briefcase} label="Task Name" value={job.job_name} />
                                <InfoRow icon={Package} label="Product Type" value={job.product_name} />
                                <InfoRow icon={Building2} label="Production Branch" value={job.branch_name || 'Main Office'} />
                                <InfoRow icon={Clock} label="Planned Qty" value={job.quantity} />
                                {/* Offset Plate Count — inline editable */}
                                <div className="job-info-row">
                                    <Shield size={16} />
                                    <span className="job-info-label">Plate Count</span>
                                    {editingPlates ? (
                                        <div className="plate-edit-row">
                                            <input type="number" min="0" value={plateInput} onChange={e => setPlateInput(e.target.value)} autoFocus
                                                className="plate-edit-input"
                                                onKeyDown={e => { if (e.key === 'Enter') handleUpdatePlates(); if (e.key === 'Escape') setEditingPlates(false); }}
                                            />
                                            <button onClick={handleUpdatePlates} className="plate-edit-button">OK</button>
                                        </div>
                                    ) : (
                                        <span onClick={() => { setPlateInput(String(job.plate_count || 0)); setEditingPlates(true); }}
                                            className="plate-edit-value" title="Click to edit">
                                            {job.plate_count || '—'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="stack-xs">
                                <InfoRow icon={Calendar} label="Deadline" value={fmtDate(job.delivery_date)} />
                                <InfoRow icon={Calendar} label="Booked On" value={fmtDateTime(job.created_at)} />
                                <InfoRow icon={User} label="Customer" value={job.customer_name} />
                                <InfoRow icon={Phone} label="Contact" value={job.customer_mobile} isPhone whatsappOptions={[
                                    { label: 'Send Work Status', icon: '📋', message: workStatusMessage({ customerName: job.customer_name, jobNumber: job.job_number, jobName: job.job_name, status: job.status, deliveryDate: job.delivery_date }) },
                                    ...(balance > 0 ? [{ label: 'Payment Reminder', icon: '💰', message: paymentReminderMessage({ customerName: job.customer_name, jobNumber: job.job_number, jobName: job.job_name, totalAmount: job.total_amount, balance, dueDate: job.delivery_date }) }] : []),
                                    ...(['Completed', 'Delivered'].includes(job.status) ? [{ label: 'Order Ready for Pickup', icon: '✅', message: orderReadyMessage({ customerName: job.customer_name, jobNumber: job.job_number, jobName: job.job_name }) }] : []),
                                    { label: 'Send Invoice via WhatsApp', icon: '🧾', message: invoiceTextMessage({
                                        customerName: job.customer_name,
                                        invoiceNumber: job.job_number,
                                        orderLines: [{ product_name: job.product_name || job.job_name, quantity: job.quantity || 1, total_amount: job.total_amount }],
                                        totals: { gross: job.total_amount || 0 },
                                        payment: { advancePaid: job.advance_paid || 0, methods: job.payment_mode || 'Cash' },
                                        jobs: [{ job_number: job.job_number }],
                                    }) },
                                ]} />
                            </div>
                        </div>
                        {job.description && (
                            <div className="job-description-section">
                                <div className="job-description-title">Job Details / Notes</div>
                                <div className="job-description-tags">
                                    {job.description.split(' | ').filter(p => p && p.trim()).map((part, i) => {
                                        const isTagged = part.includes(':');
                                        const [label, ...rest] = isTagged ? part.split(':') : ['', part];
                                        const value = isTagged ? rest.join(':').trim() : part.trim();
                                        const tagLabel = isTagged ? label.trim().toLowerCase() : '';
                                        
                                        const isColour = tagLabel === 'colour' || tagLabel === 'color';
                                        const isNumbering = tagLabel === 'numbering' || tagLabel.includes('from') || tagLabel.includes('to');
                                        const isMatter = tagLabel === 'matter';
                                        
                                        return (
                                            <span key={i} className={`job-tag ${isColour ? 'job-tag--colour' : ''} ${isNumbering ? 'job-tag--numbering' : ''} ${isMatter ? 'job-tag--matter' : ''}`}>
                                                {isColour && <span className="tag-emoji">🎨</span>}
                                                {isNumbering && <span className="tag-emoji">🔢</span>}
                                                {isMatter && <span className="tag-emoji">📝</span>}
                                                {tagLabel && <strong>{tagLabel}:</strong>}
                                                <span>{value}</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Matter Images */}
                        <div className="matter-images-section">
                            <div className="matter-images-header">
                                <div className="matter-images-title">
                                    Matter ({matterImages.length})
                                </div>
                                <div className="matter-images-actions">
                                    {/* Hidden inputs */}
                                    <input ref={matterCaptureRef} type="file" accept="image/*" capture="environment" className="hidden-input"
                                        onChange={(e) => { handleUploadMatter(e.target.files?.[0], true); e.target.value = ''; }} />
                                    <input ref={matterUploadRef} type="file" accept="image/*,.pdf" className="hidden-input"
                                        onChange={(e) => { handleUploadMatter(e.target.files?.[0], false); e.target.value = ''; }} />
                                    <button className="btn btn-ghost btn-sm matter-image-button"
                                        disabled={uploadingMatter}
                                        onClick={() => matterCaptureRef.current?.click()}>
                                        {uploadingMatter ? <Loader2 size={11} className="animate-spin" /> : <Image size={11} />} Capture
                                    </button>
                                    <button className="btn btn-ghost btn-sm matter-image-button"
                                        disabled={uploadingMatter}
                                        onClick={() => matterUploadRef.current?.click()}>
                                        <Upload size={11} /> Upload
                                    </button>
                                </div>
                            </div>
                            {matterImages.length === 0 ? (
                                <div className="matter-images-empty">
                                    No matter images yet. Capture or upload to help staff understand the print content.
                                </div>
                            ) : (
                                <div className="matter-images-grid">
                                    {matterImages.map((m) => {
                                        const isImg = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(m.file_url);
                                        return (
                                            <div key={m.id} className="matter-image-item">
                                                {isImg ? (
                                                    <img loading="lazy"
                                                        src={imgUrl(m.file_url)}
                                                        alt="Matter"
                                                        className="matter-image-preview"
                                                        onClick={() => window.open(imgUrl(m.file_url), '_blank')}
                                                        title={m.original_name}
                                                    />
                                                ) : (
                                                    <a href={imgUrl(m.file_url)} target="_blank" rel="noopener noreferrer"
                                                        className="matter-file-link">
                                                        <Image size={24} />
                                                        <span>{m.original_name?.slice(0, 15)}</span>
                                                    </a>
                                                )}
                                                {!isFrontOffice && (
                                                    <button onClick={() => handleDeleteMatter(m.id)}
                                                        className="matter-image-delete"
                                                        title="Delete">×</button>
                                                )}
                                                {m.notes && <div className="matter-image-note">{m.notes}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* Workforce Tracking */}
                    <Section
                        title="Workforce & Production Status"
                        icon={Users}
                    >
                        <AssignStaff
                            jobId={id}
                            currentAssignments={assignments || []}
                            onAssigned={handleAssignmentsUpdate}
                            canAssign={canAssign}
                        />
                    </Section>

                    {/* Applied Extras */}
                    {job.applied_extras && (() => {
                        try {
                            const extras = typeof job.applied_extras === 'string' ? JSON.parse(job.applied_extras) : job.applied_extras;
                            if (Array.isArray(extras) && extras.length > 0) {
                                return (
                                    <Section title="Applied Extras & Filters" icon={Package}>
                                        <div className="extras-grid">
                                            {extras.map((e, i) => (
                                                <div key={i} className="extra-item">
                                                    <span className="extra-label">{e.name || e.label}</span>
                                                    {!isFrontOffice && <span className="extra-price">{fmt(e.price || e.amount || 0)}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </Section>
                                );
                            }
                        } catch {} return null;
                    })()}

                    {/* Cost Breakdown - Hidden for Front Office and Production Staff */}
                    {isFinancialsVisible && !isFrontOffice && (
                        <Section title="Internal Cost Analysis" icon={Activity}>
                            <div className="job-detail-cost-grid job-detail-cost-grid--3">
                                <div className="cost-card">
                                    <div className="cost-card-label">Paper Cost</div>
                                    <div className="cost-card-value">{fmt(job.paper_cost)}</div>
                                </div>
                                <div className="cost-card">
                                    <div className="cost-card-label">Machine Cost</div>
                                    <div className="cost-card-value">{fmt(job.machine_cost)}</div>
                                </div>
                                <div className="cost-card">
                                    <div className="cost-card-label">Labour Cost</div>
                                    <div className="cost-card-value">{fmt(job.labour_cost)}</div>
                                </div>
                            </div>
                        </Section>
                    )}

                    {/* Paper Consumption Tracking */}
                    <Section title="Paper Consumption" icon={Layers}>
                        {(() => {
                            const req = Number(paperSummary.required_sheets) || 0;
                            const used = Number(paperSummary.used_sheets) || 0;
                            const waste = used > 0 ? Math.max(0, used - req) : 0;
                            const wastePct = req > 0 && used > 0 ? ((waste / req) * 100).toFixed(1) : '0';
                            const wasteColor = Number(wastePct) <= 3 ? 'var(--success)' : Number(wastePct) <= 8 ? 'var(--warning)' : 'var(--error)';

                            return (
                                <>
                                    {/* Summary Cards */}
                                    <div className="paper-summary-grid">
                                        <div className="paper-summary-card">
                                            <div className="paper-summary-label">Required</div>
                                            {editingRequired ? (
                                                <div className="paper-edit-row">
                                                    <input type="number" value={requiredInput} onChange={e => setRequiredInput(e.target.value)} autoFocus
                                                        className="plate-edit-input"
                                                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateRequired(); if (e.key === 'Escape') setEditingRequired(false); }}
                                                    />
                                                    <button onClick={handleUpdateRequired} className="plate-edit-button">OK</button>
                                                </div>
                                            ) : (
                                                <div role="button" tabIndex={0} onClick={() => { setRequiredInput(String(req)); setEditingRequired(true); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRequiredInput(String(req)); setEditingRequired(true); } }} className="paper-summary-value" title="Click to edit">
                                                    {req || '—'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="paper-summary-card">
                                            <div className="paper-summary-label">Used</div>
                                            <div className="paper-summary-value">{used || '—'}</div>
                                        </div>
                                        <div className="paper-summary-card paper-summary-card--waste" style={{ borderColor: wasteColor + '33', background: wasteColor + '08' }}>
                                            <div className="paper-summary-label">Waste</div>
                                            <div className="paper-summary-value" style={{ color: wasteColor }}>{waste > 0 ? waste : '—'}</div>
                                        </div>
                                        <div className="paper-summary-card paper-summary-card--waste" style={{ borderColor: wasteColor + '33', background: wasteColor + '08' }}>
                                            <div className="paper-summary-label">Waste %</div>
                                            <div className="paper-summary-value" style={{ color: wasteColor }}>{used > 0 ? `${wastePct}%` : '—'}</div>
                                        </div>
                                    </div>

                                    {/* Waste Bar */}
                                    {req > 0 && used > 0 && (
                                        <div className="paper-waste-bar">
                                            <div className="paper-waste-bar-track">
                                                <div className="paper-waste-bar-productive" style={{ width: `${Math.min(100, (req / used) * 100)}%` }} />
                                                <div className="paper-waste-bar-waste" style={{ left: `${Math.min(100, (req / used) * 100)}%`, width: `${Math.min(100, 100 - (req / used) * 100)}%`, background: wasteColor }} />
                                            </div>
                                            <div className="paper-waste-bar-labels">
                                                <span style={{ color: 'var(--success)' }}>Productive: {req} sheets</span>
                                                <span style={{ color: wasteColor }}>Waste: {waste} sheets</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Log Button */}
                                    <div className="paper-log-button-container">
                                        <button onClick={() => setPaperLogModal(true)} className="btn btn-outline btn-sm">
                                            <Plus size={14} /> Log Paper Usage
                                        </button>
                                    </div>

                                    {/* Paper Usage Log Table */}
                                    {paperLogs.length > 0 && (
                                        <div className="paper-logs-table-container">
                                            <table className="table paper-logs-table">
                                                <thead>
                                                    <tr>
                                                        <th>Stage</th>
                                                        <th>Paper Size</th>
                                                        <th>Used</th>
                                                        <th>Wasted</th>
                                                        <th>By</th>
                                                        <th>Date</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paperLogs.map(log => (
                                                        <tr key={log.id}>
                                                            <td className="font-semibold">{log.stage}</td>
                                                            <td>{log.paper_size || '—'}</td>
                                                            <td className="text-right font-semibold">{log.sheets_used}</td>
                                                            <td className="text-right font-semibold" style={{ color: log.sheets_wasted > 0 ? 'var(--error)' : 'inherit' }}>{log.sheets_wasted > 0 ? log.sheets_wasted : '—'}</td>
                                                            <td className="text-xs">{log.staff_name || '—'}</td>
                                                            <td className="text-xs">{fmtDateTime(log.created_at)}</td>
                                                            <td className="text-center">
                                                                <button onClick={() => handleDeletePaperLog(log.id)} title="Delete" className="btn btn-ghost btn-icon">
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {paperLogs.length === 0 && !req && !used && (
                                        <div className="paper-logs-empty">
                                            No paper usage logged yet. Click "Log Paper Usage" to start tracking.
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </Section>

                    {/* ─── Proof Approval Workflow ─── */}
                    <Section title={`Proof Approval${proofs.length ? ` (${proofs.length})` : ''}`} icon={Eye}>
                        {/* Upload Button — only Designers can upload proofs */}
                        {userRole === 'Designer' && (
                            <div className="paper-log-button-container">
                                <button onClick={() => setProofModal(true)} className="btn btn-outline btn-sm">
                                    <Upload size={14} /> Upload Proof
                                </button>
                            </div>
                        )}

                        {proofs.length > 0 ? (
                            <div className="stack-md">
                                {proofs.map(p => {
                                    const proofUrl = imgUrl(p.file_url);
                                    const isImg = p.file_type === 'image';
                                    const statusBg = p.status === 'Approved' ? 'var(--secondary)' : p.status === 'Rejected' ? 'var(--error-bg)' : p.status === 'Revision Requested' ? 'var(--secondary)' : 'var(--accent-light)';
                                    const statusColor = p.status === 'Approved' ? 'var(--muted-foreground)' : p.status === 'Rejected' ? 'var(--destructive)' : p.status === 'Revision Requested' ? 'var(--destructive)' : 'var(--primary)';

                                    return (
                                        <div key={p.id} className="proof-card">
                                            <div className="proof-card-content">
                                                {/* Thumbnail */}
                                                <a href={proofUrl} target="_blank" rel="noopener noreferrer"
                                                    className="proof-thumbnail">
                                                    {isImg ? (
                                                        <SecureImage src={p.file_url} alt={`Proof v${p.version}`} className="proof-thumbnail-image" loading="lazy" />
                                                    ) : (
                                                        <div className="proof-thumbnail-file">
                                                            <FileText size={24} />
                                                            <span>{p.file_type}</span>
                                                        </div>
                                                    )}
                                                </a>

                                                {/* Info */}
                                                <div className="proof-info">
                                                    <div className="proof-info-header">
                                                        <div className="proof-info-title">
                                                            <span className="proof-version">Version {p.version}</span>
                                                            <span className="proof-status" style={{ background: statusBg, color: statusColor }}>
                                                                {p.status}
                                                            </span>
                                                        </div>
                                                        <button onClick={() => handleDeleteProof(p.id)} title="Delete" className="btn btn-ghost btn-icon">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    <div className="proof-info-meta">
                                                        Uploaded by {p.uploaded_by_name || 'Unknown'} — {fmtDateTime(p.created_at)}
                                                    </div>
                                                    {/* Auto Design Check Result */}
                                                    {p.designCheck && (
                                                        <div className="design-check-result" style={{
                                                            background: p.designCheck.passed ? 'var(--muted-foreground)' : (p.designCheck.critical_issues > 0 ? 'var(--destructive)' : 'var(--warning)'),
                                                            color: p.designCheck.passed ? 'var(--success)' : (p.designCheck.critical_issues > 0 ? 'var(--error)' : 'var(--warning)'),
                                                            borderColor: p.designCheck.passed ? 'var(--muted-foreground)' : (p.designCheck.critical_issues > 0 ? 'var(--destructive)' : 'var(--warning)')
                                                        }}>
                                                            <span className="design-check-status">
                                                                {p.designCheck.passed ? '✓ Design Check Passed' : '⚠ Design Issues Found'}
                                                            </span>
                                                            {!p.designCheck.passed && (
                                                                <span className="design-check-details">
                                                                    — {p.designCheck.critical_issues} critical, {p.designCheck.warnings} warnings
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {p.designer_notes && (
                                                        <div className="proof-note">
                                                            <MessageSquare size={11} /> {p.designer_notes}
                                                        </div>
                                                    )}
                                                    {p.customer_feedback && (
                                                        <div className="proof-feedback" style={{ background: p.status === 'Approved' ? 'var(--muted-foreground)' : 'var(--destructive)' }}>
                                                            <strong>Feedback:</strong> {p.customer_feedback}
                                                        </div>
                                                    )}
                                                    {p.reviewed_by_name && (
                                                        <div className="proof-reviewer">
                                                            Reviewed by {p.reviewed_by_name} {p.reviewed_at ? `on ${fmtDateTime(p.reviewed_at)}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Bar — show approve/reject for Pending proofs */}
                                            {p.status === 'Pending' && ['Admin', 'Front Office', 'front office'].includes(userRole) && (
                                                <div className="proof-action-bar">
                                                    <button onClick={() => { setReviewModal(p); setReviewFeedback(''); }}
                                                        className="btn btn-success btn-full btn-sm">
                                                        <ThumbsUp size={14} /> Review Proof
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="proof-empty">
                                <Eye size={28} />
                                <div>No proofs uploaded yet. Upload a proof for customer approval.</div>
                            </div>
                        )}
                    </Section>

                    {/* Payment History */}
                    {isFinancialsVisible && (
                        <Section title="Transaction Ledger" icon={CreditCard}>
                            {(payments?.length > 0 || job.advance_paid > 0) ? (
                                <div className="payment-table-container">
                                    <table className="table payment-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Amount</th>
                                                <th>Method</th>
                                                <th>Ref #</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {job.advance_paid > 0 && !payments.some(p => Number(p.amount) === Number(job.advance_paid)) && (
                                                <tr>
                                                    <td>{fmtDate(job.created_at)}</td>
                                                    <td className="text-right font-semibold text-success">{fmt(job.advance_paid)}</td>
                                                    <td>Advance</td>
                                                    <td className="text-muted">—</td>
                                                </tr>
                                            )}
                                            {payments.map((p, i) => (
                                                <tr key={i}>
                                                    <td>{fmtDate(p.payment_date)}</td>
                                                    <td className="text-right font-semibold text-success">{fmt(p.amount)}</td>
                                                    <td>{p.payment_method}</td>
                                                    <td className="text-muted">{p.reference_number || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="payment-empty">No previous payments recorded.</div>
                            )}
                        </Section>
                    )}
                </div>

                {/* Sidebar: Timeline */}
                <div className="stack-md">
                    <Section title="Activity Logs" icon={Activity}>
                        <div className="activity-timeline">
                            <div className="activity-timeline-line" />
                            <div className="stack-lg">
                                {statusHistory?.length > 0 ? statusHistory.map((h, i) => (
                                    <div key={i} className="activity-timeline-item">
                                        <div className="activity-timeline-dot" style={{ background: statusColors[h.status] || 'var(--muted)' }} />
                                        <div className="activity-timeline-status" style={{ color: statusColors[h.status] }}>{h.status}</div>
                                        <div className="activity-timeline-date">{fmtDateTime(h.changed_at)}</div>
                                        {h.staff_name && <div className="activity-timeline-staff">{h.staff_name}</div>}
                                    </div>
                                )) : <div className="activity-timeline-empty">No logs yet.</div>}
                            </div>
                        </div>
                    </Section>

                    {/* Job Designs — with upload */}
                    <Section title={`Design Files${jobDesigns.length ? ` (${jobDesigns.length})` : ''}`} icon={Image}>
                        {/* Hidden file input */}
                        <input type="file" ref={designFileRef} onChange={handleDesignUpload} multiple accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.ai,.eps,.psd,.cdr,.indd,.tiff,.tif,.bmp,.zip,.rar" className="hidden-input" />
                        <div className="paper-log-button-container">
                            <button onClick={() => designFileRef.current?.click()} disabled={uploadingDesign}
                                className="btn btn-outline btn-sm" style={{ opacity: uploadingDesign ? 0.5 : 1 }}>
                                {uploadingDesign ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                            </button>
                        </div>
                        {jobDesigns.length > 0 ? (
                            <div className="design-files-grid">
                                {jobDesigns.slice(0, 8).map(d => {
                                    const url = imgUrl(d.file_url);
                                    const isImg = d.file_type === 'image';
                                    return (
                                        <div key={d.id} className="design-file-item">
                                            <a href={url} target="_blank" rel="noopener noreferrer" className="design-file-link">
                                                {isImg ? (
                                                    <SecureImage src={d.file_url} alt={d.title} className="design-file-image" loading="lazy" />
                                                ) : (
                                                    <div className="design-file-type">
                                                        <FileText size={20} />
                                                        <span>{d.file_type}</span>
                                                    </div>
                                                )}
                                            </a>
                                            <button onClick={() => handleDeleteDesign(d.id)} title="Delete" className="design-file-delete">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="design-files-empty">
                                No design files yet. Click Upload to attach files.
                            </div>
                        )}
                        {jobDesigns.length > 8 && (
                            <div className="design-view-more">
                                <button onClick={() => navigate(`/dashboard/customers/${job.customer_id}`)} className="link-button">
                                    View all {jobDesigns.length} designs →
                                </button>
                            </div>
                        )}
                    </Section>
                </div>
            </div>

            {/* Record Payment Modal */}
            {paymentModal && (
                <div className="modal-overlay">
                    <div className="modal modal--dark">
                        <h2 className="modal-title">Record Payment</h2>
                        <p className="modal-subtitle">Enter the amount received from the customer.</p>

                        <div className="form-group">
                            <label className="form-label">Amount (₹)</label>
                            <input
                                type="number"
                                className="form-input modal-input-large"
                                placeholder="0.00"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-ghost flex-1" onClick={() => setPaymentModal(false)}>Cancel</button>
                            <button className="btn btn-primary flex-1" onClick={handleRecordPayment}>Save Payment</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Order Modal */}
            {cancelModal && (
                <div className="modal-overlay">
                    <div className="modal modal--dark" style={{ maxWidth: 480 }}>
                        <div className="modal-header-with-icon">
                            <div className="modal-icon modal-icon--error" style={{ background: 'var(--error-bg)', width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <XCircle size={22} color="var(--error)" />
                            </div>
                            <h2 className="modal-title" style={{ fontSize: 18, fontWeight: 700 }}>Cancel Order</h2>
                        </div>
                        <p className="modal-subtitle" style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, margin: '8px 0 16px' }}>
                            This will mark order <strong style={{ color: 'var(--text)' }}>{job.job_number}</strong> as <strong style={{ color: 'var(--error)' }}>Cancelled</strong>.
                        </p>
                        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span style={{ color: 'var(--muted)' }}>Customer</span>
                                <span style={{ fontWeight: 600 }}>{job.customer_name || '—'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span style={{ color: 'var(--muted)' }}>Total Amount</span>
                                <span style={{ fontWeight: 600 }}>{fmt(job.total_amount || 0)}</span>
                            </div>
                            {Number(job.advance_paid) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: 'var(--muted)' }}>Advance Paid</span>
                                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>{fmt(job.advance_paid)}</span>
                                </div>
                            )}
                        </div>
                        {Number(job.advance_paid) > 0 && (
                            <div className="alert alert--warning" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, background: 'color-mix(in srgb, var(--warning), transparent 88%)', border: '1px solid color-mix(in srgb, var(--warning), transparent 75%)' }}>
                                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--warning)' }} />
                                <span style={{ color: 'var(--text)', lineHeight: 1.4 }}>
                                    <strong>Advance payment alert:</strong> Customer has paid <strong>{fmt(job.advance_paid)}</strong> in advance. You can process a refund after cancellation.
                                </span>
                            </div>
                        )}
                        <div className="form-group" style={{ marginBottom: 20 }}>
                            <label className="form-label" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Cancellation Reason <span style={{ color: 'var(--error)' }}>*</span></label>
                            <textarea
                                className="form-input"
                                placeholder="Enter reason for cancellation..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                autoFocus
                                rows={3}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)', resize: 'vertical' }}
                            />
                        </div>
                        <div className="modal-actions" style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn-ghost flex-1" onClick={() => { setCancelModal(false); setCancelReason(''); }} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 14 }}>
                                Go Back
                            </button>
                            <LoadingButton
                                onClick={handleCancelOrder}
                                loading={cancelling}
                                disabled={!cancelReason.trim()}
                                className="btn btn-danger flex-1"
                                style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 700, cursor: !cancelReason.trim() ? 'not-allowed' : 'pointer', border: 'none', background: !cancelReason.trim() ? 'var(--disabled-bg)' : 'var(--error)', color: '#fff', fontSize: 14, opacity: !cancelReason.trim() ? 0.5 : 1 }}
                            >
                                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                            </LoadingButton>
                        </div>
                    </div>
                </div>
            )}

            {/* Authorize Credit Delivery Modal */}
            {creditModal && (
                <div className="modal-overlay">
                    <div className="modal modal--dark">
                        <div className="modal-header-with-icon">
                            <div className="modal-icon modal-icon--warning">
                                <Shield size={20} color="var(--warning)" />
                            </div>
                            <h2 className="modal-title">Authorize Credit Delivery</h2>
                        </div>
                        <p className="modal-subtitle">
                            This will authorize delivery of order <strong>{job.job_number}</strong> on credit.
                        </p>
                        
                        <div className="alert alert--warning" style={{ margin: '12px 0', padding: '12px', borderLeft: '4px solid var(--warning)', background: 'var(--warning-bg)' }}>
                            <strong style={{ color: 'var(--warning)' }}>Outstanding Balance: {fmt(job.balance_amount)}</strong>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Reason for Credit Delivery (min 5 characters) *</label>
                            <textarea
                                className="form-input"
                                placeholder="Enter reasoning/authorization details..."
                                value={creditReason}
                                onChange={(e) => setCreditReason(e.target.value)}
                                autoFocus
                                rows={3}
                            />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost flex-1" onClick={() => { setCreditModal(false); setCreditReason(''); }} disabled={submittingCredit}>Cancel</button>
                            <LoadingButton
                                onClick={async () => {
                                    if (creditReason.trim().length < 5) return;
                                    setSubmittingCredit(true);
                                    try {
                                        await api.put(`/jobs/${id}`, {
                                            status: 'Delivered',
                                            credit_override: true,
                                            credit_reason: creditReason.trim()
                                        });
                                        toast.success('Job delivered on credit — recorded for follow-up.');
                                        setCreditModal(false);
                                        setCreditReason('');
                                        await fetchJob();
                                    } catch (err) {
                                        toast.error(err?.response?.data?.message || 'Could not authorize credit delivery.');
                                    } finally {
                                        setSubmittingCredit(false);
                                    }
                                }}
                                loading={submittingCredit}
                                disabled={creditReason.trim().length < 5 || submittingCredit}
                                className="btn btn-warning flex-1"
                                style={{ opacity: (creditReason.trim().length < 5 || submittingCredit) ? 0.5 : 1 }}
                            >
                                Confirm Credit Delivery
                            </LoadingButton>
                        </div>
                    </div>
                </div>
            )}

            {/* Paper Usage Log Modal */}
            {paperLogModal && (
                <div className="modal-overlay">
                    <div className="modal modal--dark modal--wide">
                        <div className="modal-header-with-icon">
                            <div className="modal-icon modal-icon--accent">
                                <Layers size={20} color="var(--accent)" />
                            </div>
                            <h2 className="modal-title">Log Paper Usage</h2>
                        </div>

                        <div className="form-group form-group--compact">
                            <label className="form-label">Production Stage *</label>
                            <select value={paperForm.stage} onChange={e => setPaperForm(p => ({ ...p, stage: e.target.value }))}
                                className="form-select">
                                <option value="">Select stage...</option>
                                <option value="Printing">Printing</option>
                                <option value="Cutting">Cutting</option>
                                <option value="Lamination">Lamination</option>
                                <option value="Binding">Binding</option>
                                <option value="Designing">Designing</option>
                                <option value="Production">Production</option>
                                <option value="Reprinting">Reprinting (waste)</option>
                                <option value="Test Print">Test Print</option>
                            </select>
                        </div>

                        <div className="form-group form-group--compact">
                            <label className="form-label">Paper Size</label>
                            <select value={paperForm.paper_size} onChange={e => setPaperForm(p => ({ ...p, paper_size: e.target.value }))}
                                className="form-select">
                                <option value="">Select size...</option>
                                <option value="A4">A4 (210×297mm)</option>
                                <option value="A3">A3 (297×420mm)</option>
                                <option value="A2">A2 (420×594mm)</option>
                                <option value="A1">A1 (594×841mm)</option>
                                <option value="A0">A0 (841×1189mm)</option>
                                <option value="Legal">Legal (216×356mm)</option>
                                <option value="Letter">Letter (216×279mm)</option>
                                <option value="Tabloid">Tabloid (279×432mm)</option>
                                <option value="12x18">12×18 inch</option>
                                <option value="13x19">13×19 inch</option>
                                <option value="Custom">Custom</option>
                            </select>
                        </div>

                        <div className="form-grid-2 form-group--compact">
                            <div className="form-group">
                                <label className="form-label">Sheets Used *</label>
                                <input type="number" min="0" placeholder="0" value={paperForm.sheets_used}
                                    onChange={e => setPaperForm(p => ({ ...p, sheets_used: e.target.value }))}
                                    className="form-input form-input--large"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Sheets Wasted</label>
                                <input type="number" min="0" placeholder="0" value={paperForm.sheets_wasted}
                                    onChange={e => setPaperForm(p => ({ ...p, sheets_wasted: e.target.value }))}
                                    className="form-input form-input--large"
                                />
                            </div>
                        </div>

                        <div className="form-group form-group--compact">
                            <label className="form-label">Notes (optional)</label>
                            <textarea placeholder="e.g., Misprinted 5 sheets, paper jam..." value={paperForm.notes}
                                onChange={e => setPaperForm(p => ({ ...p, notes: e.target.value }))}
                                rows={2} className="form-input"
                            />
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-ghost flex-1" onClick={() => { setPaperLogModal(false); setPaperForm({ stage: '', paper_size: '', sheets_used: '', sheets_wasted: '', notes: '' }); }}>Cancel</button>
                            <LoadingButton 
                                onClick={handleLogPaper} 
                                loading={loggingPaper}
                                className="btn btn-primary flex-1"
                            >
                                Log Usage
                            </LoadingButton>
                        </div>
                    </div>
                </div>
            )}

            {/* Proof Upload Modal */}
            {proofModal && (
                <div className="modal-overlay">
                    <div className="modal modal--dark modal--wide">
                        <div className="modal-header-with-icon">
                            <div className="modal-icon modal-icon--accent">
                                <Eye size={20} color="var(--accent-2)" />
                            </div>
                            <h2 className="modal-title">Upload Proof for Approval</h2>
                        </div>
                        <p className="modal-subtitle">
                            Upload a design proof. This will be sent for customer verification. Version {proofs.length + 1}.
                        </p>

                        <div className="form-group form-group--compact">
                            <label className="form-label">Proof File *</label>
                            <input type="file" ref={proofFileRef} onChange={handleUploadProof}
                                accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.ai,.eps,.psd,.cdr,.tiff,.tif,.bmp"
                                className="form-input"
                            />
                        </div>

                        <div className="form-group form-group--compact">
                            <label className="form-label">Designer Notes (optional)</label>
                            <textarea placeholder="e.g., Updated font as per feedback..." value={proofNotes}
                                onChange={e => setProofNotes(e.target.value)}
                                rows={2} className="form-input"
                            />
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-ghost flex-1" onClick={() => { setProofModal(false); setProofNotes(''); }}>Cancel</button>
                        </div>
                        {uploadingProof && <div className="modal-uploading"><Loader2 size={16} className="animate-spin" /> Uploading...</div>}
                    </div>
                </div>
            )}

            {/* Proof Review Modal */}
            {reviewModal && (
                <div className="modal-overlay">
                    <div className="modal modal--wide modal--light">
                        <div className="modal-header-with-icon">
                            <div className="modal-icon modal-icon--accent">
                                <Eye size={20} color="var(--accent-2)" />
                            </div>
                            <h2 className="modal-title">Review Proof v{reviewModal.version}</h2>
                        </div>

                        {/* Preview */}
                        {(() => {
                            const pUrl = imgUrl(reviewModal.file_url);
                            return reviewModal.file_type === 'image' ? (
                                <SecureImage src={reviewModal.file_url} alt={`Proof v${reviewModal.version}`} className="proof-preview-image" />
                            ) : (
                                <a href={pUrl} target="_blank" rel="noopener noreferrer" className="proof-preview-link">
                                    <FileText size={28} />
                                    Open {reviewModal.original_name}
                                </a>
                            );
                        })()}

                        {reviewModal.designer_notes && (
                            <div className="proof-designer-notes">
                                <strong>Designer notes:</strong> {reviewModal.designer_notes}
                            </div>
                        )}

                        <div className="form-group form-group--compact">
                            <label className="form-label">Customer Feedback (optional for approval, recommended for rejection)</label>
                            <textarea placeholder="e.g., Change the logo size, wrong color..." value={reviewFeedback}
                                onChange={e => setReviewFeedback(e.target.value)}
                                rows={3} className="form-input"
                            />
                        </div>

                        <div className="modal-actions modal-actions--4">
                            <button className="btn btn-ghost flex-1" onClick={() => { setReviewModal(null); setReviewFeedback(''); }}>Cancel</button>
                            <button onClick={() => handleReviewProof('Revision Requested')} disabled={reviewing}
                                className="badge badge--warning proof-review-button"
                                style={{ opacity: reviewing ? 0.5 : 1 }}>
                                <RotateCcw size={14} /> Revision
                            </button>
                            <button onClick={() => handleReviewProof('Rejected')} disabled={reviewing}
                                className="badge badge--danger proof-review-button"
                                style={{ opacity: reviewing ? 0.5 : 1 }}>
                                <ThumbsDown size={14} /> Reject
                            </button>
                            <button onClick={() => handleReviewProof('Approved')} disabled={reviewing}
                                className="badge badge--success proof-review-button"
                                style={{ opacity: reviewing ? 0.5 : 1 }}>
                                <ThumbsUp size={14} /> Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Refund Modal */}
            {refundModal && (
                <div className="modal-overlay">
                    <div className="modal modal--wide modal--light">
                        <div className="modal-header-with-icon">
                            <div className="modal-icon modal-icon--warning">
                                <RotateCcw size={20} color="var(--warning)" />
                            </div>
                            <h2 className="modal-title">Process Refund</h2>
                        </div>
                        <p className="modal-subtitle">
                            Refund for <strong>{job.job_number}</strong> — {job.customer_name}
                        </p>
                        <div className="refund-max-info">
                            <span className="refund-max-label">Maximum refundable</span>
                            <span className="refund-max-value">₹{Number(job.advance_paid).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="form-group form-group--compact">
                            <label className="form-label">Refund Amount (₹) *</label>
                            <input
                                type="number"
                                className="form-input modal-input-large"
                                placeholder="0.00"
                                value={refundAmount}
                                onChange={(e) => setRefundAmount(e.target.value)}
                                autoFocus
                                max={Number(job.advance_paid)}
                            />
                        </div>
                        <div className="form-group form-group--compact">
                            <label className="form-label">Refund Method</label>
                            <select
                                className="form-select"
                                value={refundMethod}
                                onChange={(e) => setRefundMethod(e.target.value)}
                            >
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Account Transfer">Account Transfer</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Note (optional)</label>
                            <textarea
                                className="form-input"
                                placeholder="Reason for refund..."
                                value={refundNote}
                                onChange={(e) => setRefundNote(e.target.value)}
                                rows={2}
                            />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost flex-1" onClick={() => { setRefundModal(false); setRefundAmount(''); setRefundNote(''); }}>Cancel</button>
                            <LoadingButton
                                onClick={handleRefund}
                                loading={refunding}
                                disabled={!refundAmount || Number(refundAmount) <= 0}
                                className="btn btn-warning flex-1"
                                style={{ opacity: !refundAmount || Number(refundAmount) <= 0 ? 0.5 : 1 }}
                            >
                                Refund ₹{Number(refundAmount || 0).toLocaleString('en-IN')}
                            </LoadingButton>
                        </div>
                    </div>
                </div>
            )}


        </PageContainer>
    );
};

export default JobDetail;
