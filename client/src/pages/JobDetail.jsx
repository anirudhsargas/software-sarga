import React, { useEffect, useState } from 'react';
import usePolling from '../hooks/usePolling';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Briefcase, IndianRupee, User, Clock, AlertCircle,
    Loader2, CheckCircle2, Calendar, Building2, Package, Phone,
    Mail, MapPin, Hash, FileText, Users, CreditCard, Activity,
    XCircle, RotateCcw, Layers, Plus, Trash2, Image, Copy,
    Upload, Eye, ThumbsUp, ThumbsDown, MessageSquare, Shield,
    FileDown
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import { downloadInvoicePDF } from '../utils/invoicePdf';
import './JobDetail.css';

const statusColors = {
    Pending: 'var(--warning)',
    Processing: 'var(--accent-2)',
    'Approval Pending': '#0ea5e9',
    Completed: 'var(--success)',
    Delivered: '#8b5cf6',
    Cancelled: 'var(--error)',
};

const paymentColors = {
    Paid: 'var(--success)',
    Partial: 'var(--warning)',
    Unpaid: 'var(--error)',
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

const InfoRow = ({ icon: Icon, label, value, isPhone }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
        <Icon size={16} style={{ marginTop: 2, color: 'var(--muted, var(--muted))', flexShrink: 0 }} />
        <span className="job-info-label" style={{ color: 'var(--muted, var(--muted))', fontSize: '13px', minWidth: 110, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, wordBreak: 'break-word', overflow: 'hidden' }}>
            {isPhone && value ? (
                <>
                    {value} {' '}
                    <a href={`tel:${value}`} style={{ marginLeft: 8, color: 'var(--success)', textDecoration: 'none', fontWeight: 600 }} title="Call">
                        Call
                    </a>
                </>
            ) : (value || '—')}
        </span>
    </div>
);

const Section = ({ title, icon: Icon, children }) => (
    <div className="job-section" style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon size={18} style={{ color: 'var(--accent, var(--accent))' }} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{title}</h3>
        </div>
        {children}
    </div>
);

const StatCard = ({ label, value, icon: Icon, color, subValue }) => (
    <div className="job-stat-card-inner" style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 12,
        padding: '20px',
        flex: 1,
        minWidth: '160px'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '12px', color: 'var(--muted, var(--muted))', fontWeight: 500 }}>{label}</span>
            <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: color + '15', color: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <Icon size={16} />
            </div>
        </div>
        <div className="stat-value" style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0' }}>{value}</div>
        {subValue && <div style={{ fontSize: '11px', color: 'var(--muted, var(--muted))' }}>{subValue}</div>}
    </div>
);

const JobDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const userRole = auth.getUser()?.role;
    const [data, setData] = useState(null);
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
    const [branchUpiId, setBranchUpiId] = useState('');
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

    const fetchJob = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/jobs/${id}`);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load job details');
        } finally {
            setLoading(false);
        }
    };

    const fetchPaperLogs = async () => {
        try {
            const res = await api.get(`/jobs/${id}/paper-logs`);
            setPaperLogs(res.data.logs || []);
            setPaperSummary(res.data.summary || {});
        } catch { /* ignore if table not ready */ }
    };

    const handleLogPaper = async () => {
        if (!paperForm.stage) return toast.error('Select a production stage');
        const used = Number(paperForm.sheets_used) || 0;
        const wasted = Number(paperForm.sheets_wasted) || 0;
        if (used === 0 && wasted === 0) return toast.error('Enter sheets used or wasted');
        setLoggingPaper(true);
        try {
            await api.post(`/jobs/${id}/paper-logs`, paperForm);
            toast.success('Paper usage logged');
            setPaperLogModal(false);
            setPaperForm({ stage: '', paper_size: '', sheets_used: '', sheets_wasted: '', notes: '' });
            fetchPaperLogs();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to log paper usage');
        } finally {
            setLoggingPaper(false);
        }
    };

    const handleDeletePaperLog = async (logId) => {
        if (!confirm('Delete this paper log entry?')) return;
        try {
            await api.delete(`/jobs/${id}/paper-logs/${logId}`);
            toast.success('Log removed');
            fetchPaperLogs();
        } catch (err) {
            toast.error('Failed to delete log');
        }
    };

    const handleUpdateRequired = async () => {
        const val = Math.max(0, Math.round(Number(requiredInput) || 0));
        try {
            await api.put(`/jobs/${id}`, { required_sheets: val });
            toast.success('Required sheets updated');
            setEditingRequired(false);
            fetchJob();
            fetchPaperLogs();
        } catch (err) {
            toast.error('Failed to update');
        }
    };

    const fetchDesigns = () => {
        api.get(`/jobs/${id}/designs`).then(res => setJobDesigns(res.data || [])).catch(() => { });
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
        try {
            await api.delete(`/jobs/${id}/designs/${designId}`);
            toast.success('Design deleted');
            fetchDesigns();
        } catch { toast.error('Failed to delete design'); }
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
        try {
            await api.delete(`/jobs/${id}/proofs/${proofId}`);
            toast.success('Proof deleted');
            fetchProofs();
        } catch { toast.error('Failed to delete proof'); }
    };

    const handleUpdatePlates = async () => {
        const val = Math.max(0, Math.round(Number(plateInput) || 0));
        try {
            await api.put(`/jobs/${id}`, { plate_count: val });
            toast.success('Plate count updated');
            setEditingPlates(false);
            fetchJob();
        } catch { toast.error('Failed to update'); }
    };

    usePolling(fetchJob, 15000);

    useEffect(() => {
        fetchJob();
        fetchPaperLogs();
        fetchDesigns();
        fetchProofs();

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

    const isFinancialsVisible = ['Admin', 'Accountant', 'Front Office', 'front office'].includes(userRole);

    const handleRepeatOrder = async () => {
        try {
            const res = await api.post(`/jobs/${id}/repeat`);
            toast.success(res.data.message || 'Order repeated!');
            navigate(`/dashboard/jobs/${res.data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to repeat order');
        }
    };

    const handleAssignmentStatus = async (assignmentId, newStatus) => {
        try {
            await api.put(`/jobs/assignments/${assignmentId}/status`, { status: newStatus });
            fetchJob();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || err.message || 'Failed to update assignment status');
        }
    };

    const handleUpdateStatus = async (newStatus) => {
        try {
            await api.put(`/jobs/${id}`, { status: newStatus });
            fetchJob();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || err.message || 'Failed to update status');
        }
    };

    const handleRecordPayment = () => {
        if (!paymentAmount || isNaN(paymentAmount)) return toast.success('Enter valid amount');
        setPaymentModal(false);
        setPaymentAmount('');
        // Navigate to customer payment section with prefilled details
        navigate('/dashboard/customer-payments', {
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
            await api.put(`/jobs/${id}`, { status: 'Cancelled', description: `${data.job.description ? data.job.description + '\n' : ''}[CANCELLED] ${cancelReason.trim()}` });
            toast.success('Order cancelled successfully');
            setCancelModal(false);
            setCancelReason('');
            fetchJob();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel order');
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

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
                <Loader2 size={28} className="animate-spin" />
                <span>Loading job dashboard...</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ padding: 24 }}>
                <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, var(--accent))', marginBottom: 16 }}>
                    <ArrowLeft size={18} /> Back
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--error)', padding: 16, background: '#fee2e2', borderRadius: 8 }}>
                    <AlertCircle size={20} />
                    <span>{error || 'Job not found'}</span>
                </div>
            </div>
        );
    }

    const { job, assignments, payments, statusHistory } = data;
    const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const balance = Number(job.balance_amount || 0);
    const statusColor = statusColors[job.status] || 'var(--muted)';
    const payColor = paymentColors[job.payment_status] || 'var(--muted)';

    const currentUserAssignment = assignments?.find(a => a.staff_id === auth.getUser()?.id)
        || assignments?.find(a => a.staff_id === null && a.role === auth.getUser()?.role);

    return (
        <div className="job-detail-container" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>
            {/* Header / Dashboard Toolbar */}
            <div className="job-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted, var(--muted))', marginBottom: 8, padding: 0 }}
                    >
                        <ArrowLeft size={16} /> Back to Jobs
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Job Dashboard</h1>
                        <span style={{ fontSize: '14px', color: 'var(--muted, var(--muted))', fontFamily: 'monospace', background: 'var(--bg, #f3f4f6)', padding: '2px 8px', borderRadius: 4 }}>
                            {job.job_number}
                        </span>
                    </div>
                </div>

                <div className="job-detail-actions" style={{ display: 'flex', gap: 12 }}>
                    {isFinancialsVisible && (
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                navigate('/dashboard/customer-payments', {
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
                            onClick={() => {
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
                                downloadInvoicePDF(billData);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)', fontWeight: 600 }}
                        >
                            <FileDown size={18} /> Download Invoice
                        </button>
                    )}

                    {/* Repeat Order Button */}
                    {['Admin', 'Front Office', 'front office'].includes(userRole) && (
                        <button
                            className="btn"
                            onClick={handleRepeatOrder}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', color: 'var(--success)', border: '1px solid #bbf7d0', fontWeight: 600 }}
                        >
                            <Copy size={18} /> Repeat Order
                        </button>
                    )}

                    {/* Cancel Order Button */}
                    {['Admin', 'Front Office', 'front office'].includes(userRole) && !['Cancelled', 'Delivered'].includes(job.status) && (
                        <button
                            className="btn"
                            onClick={() => setCancelModal(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef2f2', color: 'var(--error)', border: '1px solid #fecaca', fontWeight: 600 }}
                        >
                            <XCircle size={18} /> Cancel Order
                        </button>
                    )}

                    {/* Refund Button */}
                    {isFinancialsVisible && Number(job.advance_paid) > 0 && ['Cancelled'].includes(job.status) && (
                        <button
                            className="btn"
                            onClick={() => { setRefundAmount(String(job.advance_paid)); setRefundModal(true); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fefce8', color: 'var(--warning)', border: '1px solid #fde68a', fontWeight: 600 }}
                        >
                            <RotateCcw size={18} /> Process Refund
                        </button>
                    )}

                    {/* Staff Action Buttons */}
                    {currentUserAssignment && (
                        <div className="job-staff-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {currentUserAssignment.status === 'Pending' && !['Completed', 'Delivered', 'Cancelled'].includes(job.status) && (
                                <button className="btn btn-primary" onClick={async () => {
                                    await handleAssignmentStatus(currentUserAssignment.id, 'In Progress');
                                    if (job.status === 'Pending') await handleUpdateStatus('Processing');
                                }} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600 }}>
                                    Start Job
                                </button>
                            )}
                            {currentUserAssignment.status === 'In Progress' && job.status !== 'Approval Pending' && auth.getUser()?.role === 'Designer' && (
                                <button className="btn btn-warning" onClick={async () => {
                                    await handleUpdateStatus('Approval Pending');
                                }} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600, color: '#fff', background: 'var(--warning)', borderColor: 'var(--warning)' }}>
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
                                }} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600 }}>
                                    Complete Job
                                </button>
                            )}
                            {job.status === 'Approval Pending' && !['Completed', 'Delivered'].includes(job.status) && (
                                <>
                                    <span className="badge badge--info" style={{ padding: '8px 16px', borderRadius: 8 }}>
                                        ✓ Sent for Customer Verification
                                    </span>
                                    <button className="btn btn-success" onClick={async () => {
                                        await handleAssignmentStatus(currentUserAssignment.id, 'Completed');
                                        // Check if ALL other assignments are also completed
                                        const othersCompleted = assignments
                                            .filter(a => a.id !== currentUserAssignment.id)
                                            .every(a => a.status === 'Completed');
                                        if (othersCompleted) {
                                            await handleUpdateStatus('Completed');
                                        } else {
                                            await handleUpdateStatus('Processing');
                                        }
                                    }} style={{ padding: '8px 16px', borderRadius: 8, fontWeight: 600 }}>
                                        Complete
                                    </button>
                                </>
                            )}
                            {(job.status === 'Completed' || job.status === 'Delivered') && (
                                <span className="badge badge--success" style={{ padding: '8px 16px', borderRadius: 8 }}>
                                    ✓ Completed
                                </span>
                            )}
                        </div>
                    )}

                    {['Admin', 'Front Office', 'front office'].includes(userRole) ? (
                        <select
                            className={`badge ${
                                job.status === 'Pending' ? 'badge--warning' :
                                job.status === 'Processing' ? 'badge--info' :
                                job.status === 'Approval Pending' ? 'badge--warning' :
                                job.status === 'Completed' ? 'badge--success' :
                                job.status === 'Delivered' ? 'badge--primary' :
                                job.status === 'Cancelled' ? 'badge--danger' : ''
                            }`}
                            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, outline: 'none' }}
                            value={job.status}
                            onChange={(e) => handleUpdateStatus(e.target.value)}
                        >
                            {Object.keys(statusColors).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    ) : (
                        <Badge label={job.status} color={statusColor} />
                    )}
                </div>
            </div>

            {/* Dashboard Overview Cards */}
            <div className="job-stat-cards-row" style={{ display: 'flex', gap: 12, marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}>
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
                            subValue="Customer Deposit"
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

            <div className="job-detail-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
                <div className="stack-lg">
                    {/* Main Info */}
                    <Section title="Order Overview" icon={FileText}>
                        <div className="job-detail-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <div className="stack-xs">
                                <InfoRow icon={Briefcase} label="Task Name" value={job.job_name} />
                                <InfoRow icon={Package} label="Product Type" value={job.product_name} />
                                <InfoRow icon={Building2} label="Production Branch" value={job.branch_name || 'Main Office'} />
                                <InfoRow icon={Clock} label="Planned Qty" value={job.quantity} />
                                {/* Offset Plate Count — inline editable */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                                    <Shield size={16} style={{ marginTop: 2, color: 'var(--muted, var(--muted))', flexShrink: 0 }} />
                                    <span className="job-info-label" style={{ color: 'var(--muted, var(--muted))', fontSize: '13px', minWidth: 110, flexShrink: 0 }}>Plate Count</span>
                                    {editingPlates ? (
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <input type="number" min="0" value={plateInput} onChange={e => setPlateInput(e.target.value)} autoFocus
                                                style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '2px solid var(--accent)', outline: 'none', fontSize: '13px', fontWeight: 700, textAlign: 'center', background: 'var(--bg, #f3f4f6)' }}
                                                onKeyDown={e => { if (e.key === 'Enter') handleUpdatePlates(); if (e.key === 'Escape') setEditingPlates(false); }}
                                            />
                                            <button onClick={handleUpdatePlates} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>OK</button>
                                        </div>
                                    ) : (
                                        <span onClick={() => { setPlateInput(String(job.plate_count || 0)); setEditingPlates(true); }}
                                            style={{ fontSize: '13px', fontWeight: 500, cursor: 'pointer' }} title="Click to edit">
                                            {job.plate_count || '—'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="stack-xs">
                                <InfoRow icon={Calendar} label="Deadline" value={fmtDate(job.delivery_date)} />
                                <InfoRow icon={Calendar} label="Booked On" value={fmtDateTime(job.created_at)} />
                                <InfoRow icon={User} label="Customer" value={job.customer_name} />
                                <InfoRow icon={Phone} label="Contact" value={job.customer_mobile} isPhone />
                            </div>
                        </div>
                        {job.description && (
                            <div style={{ marginTop: 20, padding: 16, background: 'var(--bg, #f9fafb)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Description / Notes</div>
                                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{job.description}</div>
                            </div>
                        )}
                    </Section>

                    {/* Workforce Tracking */}
                    <Section title="Workforce & Production Status" icon={Users}>
                        {assignments?.length > 0 ? (
                            <div className="job-workforce-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                                {assignments.map((a, i) => {
                                    const isCompleted = a.status === 'Completed';
                                    const isProcessing = a.status === 'Processing' || a.status === 'In Progress';
                                    const statusColor = isCompleted ? 'var(--success)' : isProcessing ? 'var(--accent)' : 'var(--muted)';

                                    return (
                                        <div key={i} style={{
                                            display: 'flex', gap: 16, padding: 16,
                                            background: 'var(--surface-2)',
                                            borderRadius: 12, border: isProcessing ? '2px solid var(--accent)' : '1px solid var(--border)',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}>
                                            {isProcessing && (
                                                <div style={{
                                                    position: 'absolute', top: 0, left: 0, width: 4, height: '100%',
                                                    background: 'var(--accent)'
                                                }} />
                                            )}

                                            <div style={{
                                                width: 44, height: 44, borderRadius: 10,
                                                background: statusColor + '15', color: statusColor,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 800, fontSize: '18px', border: `1px solid ${statusColor}33`
                                            }}>
                                                {a.staff_name?.[0] || (a.staff_id ? '?' : '👥')}
                                            </div>

                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <div style={{ fontSize: '15px', fontWeight: 700 }}>{a.staff_name || `All ${a.role || a.staff_role}s`}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{a.staff_name ? a.staff_role : 'Role-based Assignment'}</div>
                                                    </div>
                                                    <div className={`badge ${isCompleted ? 'badge--success' : isProcessing ? 'badge--info' : 'badge--neutral'}`}>
                                                        {isCompleted && <CheckCircle2 size={10} />}
                                                        {isProcessing && <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                                                        {a.status || 'Assigned'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ padding: '32px', textAlign: 'center', background: 'var(--bg, #f9fafb)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                                <Users size={32} style={{ color: 'var(--muted)', marginBottom: 12, opacity: 0.5 }} />
                                <div style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: 500 }}>No production staff assigned to this job yet.</div>
                            </div>
                        )}
                    </Section>

                    {/* Applied Extras */}
                    {job.applied_extras && (() => {
                        try {
                            const extras = typeof job.applied_extras === 'string' ? JSON.parse(job.applied_extras) : job.applied_extras;
                            if (Array.isArray(extras) && extras.length > 0) {
                                return (
                                    <Section title="Applied Extras & Filters" icon={Package}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {extras.map((e, i) => (
                                                <div key={i} style={{ padding: '6px 12px', background: 'var(--bg, #f3f4f6)', borderRadius: 6, fontSize: '13px', display: 'flex', gap: 8 }}>
                                                    <span style={{ color: 'var(--muted)' }}>{e.name || e.label}</span>
                                                    {!isFrontOffice && <span style={{ fontWeight: 600 }}>{fmt(e.price || e.amount || 0)}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </Section>
                                );
                            }
                        } catch (e) { } return null;
                    })()}

                    {/* Cost Breakdown - Hidden for Front Office and Production Staff */}
                    {isFinancialsVisible && !isFrontOffice && (
                        <Section title="Internal Cost Analysis" icon={Activity}>
                            <div className="job-detail-cost-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                                <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 10 }}>
                                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Paper Cost</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, marginTop: 4 }}>{fmt(job.paper_cost)}</div>
                                </div>
                                <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 10 }}>
                                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Machine Cost</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, marginTop: 4 }}>{fmt(job.machine_cost)}</div>
                                </div>
                                <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 10 }}>
                                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Labour Cost</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, marginTop: 4 }}>{fmt(job.labour_cost)}</div>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                                        <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Required</div>
                                            {editingRequired ? (
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                                                    <input type="number" value={requiredInput} onChange={e => setRequiredInput(e.target.value)} autoFocus
                                                        style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '2px solid var(--accent)', outline: 'none', fontSize: '14px', fontWeight: 700, textAlign: 'center', background: 'var(--bg, #f3f4f6)' }}
                                                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateRequired(); if (e.key === 'Escape') setEditingRequired(false); }}
                                                    />
                                                    <button onClick={handleUpdateRequired} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>OK</button>
                                                </div>
                                            ) : (
                                                <div onClick={() => { setRequiredInput(String(req)); setEditingRequired(true); }} style={{ fontSize: '20px', fontWeight: 700, cursor: 'pointer' }} title="Click to edit">
                                                    {req || '—'}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Used</div>
                                            <div style={{ fontSize: '20px', fontWeight: 700 }}>{used || '—'}</div>
                                        </div>
                                        <div style={{ padding: 14, border: `1px solid ${wasteColor}33`, borderRadius: 10, textAlign: 'center', background: wasteColor + '08' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Waste</div>
                                            <div style={{ fontSize: '20px', fontWeight: 700, color: wasteColor }}>{waste > 0 ? waste : '—'}</div>
                                        </div>
                                        <div style={{ padding: 14, border: `1px solid ${wasteColor}33`, borderRadius: 10, textAlign: 'center', background: wasteColor + '08' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Waste %</div>
                                            <div style={{ fontSize: '20px', fontWeight: 700, color: wasteColor }}>{used > 0 ? `${wastePct}%` : '—'}</div>
                                        </div>
                                    </div>

                                    {/* Waste Bar */}
                                    {req > 0 && used > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ height: 8, background: 'var(--bg, #e5e7eb)', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
                                                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, (req / used) * 100)}%`, background: 'var(--success)', borderRadius: 99, transition: 'width 0.5s' }} />
                                                <div style={{ position: 'absolute', left: `${Math.min(100, (req / used) * 100)}%`, top: 0, height: '100%', width: `${Math.min(100, 100 - (req / used) * 100)}%`, background: wasteColor, borderRadius: '0 99px 99px 0', transition: 'width 0.5s' }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginTop: 4 }}>
                                                <span style={{ color: 'var(--success)' }}>Productive: {req} sheets</span>
                                                <span style={{ color: wasteColor }}>Waste: {waste} sheets</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Log Button */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                        <button onClick={() => setPaperLogModal(true)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--accent, var(--accent))', background: 'transparent', color: 'var(--accent, var(--accent))', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                            <Plus size={14} /> Log Paper Usage
                                        </button>
                                    </div>

                                    {/* Paper Usage Log Table */}
                                    {paperLogs.length > 0 && (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                                        <th style={{ textAlign: 'left', padding: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Stage</th>
                                                        <th style={{ textAlign: 'left', padding: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Paper Size</th>
                                                        <th style={{ textAlign: 'right', padding: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Used</th>
                                                        <th style={{ textAlign: 'right', padding: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Wasted</th>
                                                        <th style={{ textAlign: 'left', padding: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>By</th>
                                                        <th style={{ textAlign: 'left', padding: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Date</th>
                                                        <th style={{ textAlign: 'center', padding: '10px', width: 40 }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paperLogs.map(log => (
                                                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '10px', fontWeight: 600 }}>{log.stage}</td>
                                                            <td style={{ padding: '10px' }}>{log.paper_size || '—'}</td>
                                                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>{log.sheets_used}</td>
                                                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: log.sheets_wasted > 0 ? 'var(--error)' : 'inherit' }}>{log.sheets_wasted > 0 ? log.sheets_wasted : '—'}</td>
                                                            <td style={{ padding: '10px', fontSize: '12px' }}>{log.staff_name || '—'}</td>
                                                            <td style={{ padding: '10px', fontSize: '12px' }}>{fmtDateTime(log.created_at)}</td>
                                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                                <button onClick={() => handleDeletePaperLog(log.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
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
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', background: 'var(--bg, #f9fafb)', borderRadius: 8, border: '1px dashed var(--border)' }}>
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
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                <button onClick={() => setProofModal(true)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--accent, var(--accent))', background: 'transparent', color: 'var(--accent, var(--accent))', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                    <Upload size={14} /> Upload Proof
                                </button>
                            </div>
                        )}

                        {proofs.length > 0 ? (
                            <div className="stack-md">
                                {proofs.map(p => {
                                    const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
                                    const proofUrl = `${base}${p.file_url}`;
                                    const isImg = p.file_type === 'image';
                                    const statusBg = p.status === 'Approved' ? '#dcfce7' : p.status === 'Rejected' ? '#fee2e2' : p.status === 'Revision Requested' ? '#fef3c7' : '#dbeafe';
                                    const statusColor = p.status === 'Approved' ? '#166534' : p.status === 'Rejected' ? '#991b1b' : p.status === 'Revision Requested' ? '#92400e' : '#1e40af';

                                    return (
                                        <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', gap: 16, padding: 16, alignItems: 'flex-start' }}>
                                                {/* Thumbnail */}
                                                <a href={proofUrl} target="_blank" rel="noopener noreferrer"
                                                    style={{ display: 'block', width: 100, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg, #f3f4f6)', flexShrink: 0, textDecoration: 'none' }}>
                                                    {isImg ? (
                                                        <img src={proofUrl} alt={`Proof v${p.version}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', gap: 2 }}>
                                                            <FileText size={24} style={{ opacity: 0.5 }} />
                                                            <span style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 700 }}>{p.file_type}</span>
                                                        </div>
                                                    )}
                                                </a>

                                                {/* Info */}
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ fontSize: '15px', fontWeight: 700 }}>Version {p.version}</span>
                                                            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: 6, background: statusBg, color: statusColor, fontWeight: 700, textTransform: 'uppercase' }}>
                                                                {p.status}
                                                            </span>
                                                        </div>
                                                        <button onClick={() => handleDeleteProof(p.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: 4 }}>
                                                        Uploaded by {p.uploaded_by_name || 'Unknown'} — {fmtDateTime(p.created_at)}
                                                    </div>
                                                    {/* Auto Design Check Result */}
                                                    {p.designCheck && (
                                                        <div style={{
                                                            fontSize: '12px', padding: '6px 10px', borderRadius: 6, marginBottom: 4,
                                                            display: 'flex', alignItems: 'center', gap: 6,
                                                            background: p.designCheck.passed ? 'rgba(47,125,74,0.08)' : (p.designCheck.critical_issues > 0 ? 'rgba(176,58,46,0.08)' : 'rgba(179,107,0,0.08)'),
                                                            color: p.designCheck.passed ? 'var(--success)' : (p.designCheck.critical_issues > 0 ? 'var(--error)' : 'var(--warning)'),
                                                            border: `1px solid ${p.designCheck.passed ? 'rgba(47,125,74,0.25)' : (p.designCheck.critical_issues > 0 ? 'rgba(176,58,46,0.25)' : 'rgba(179,107,0,0.25)')}`
                                                        }}>
                                                            <span style={{ fontWeight: 700 }}>
                                                                {p.designCheck.passed ? '✓ Design Check Passed' : '⚠ Design Issues Found'}
                                                            </span>
                                                            {!p.designCheck.passed && (
                                                                <span style={{ fontSize: '11px', opacity: 0.85 }}>
                                                                    — {p.designCheck.critical_issues} critical, {p.designCheck.warnings} warnings
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {p.designer_notes && (
                                                        <div style={{ fontSize: '12px', padding: '6px 8px', background: 'var(--bg, #f9fafb)', borderRadius: 6, marginBottom: 4, fontStyle: 'italic' }}>
                                                            <MessageSquare size={11} style={{ display: 'inline', marginRight: 4 }} /> {p.designer_notes}
                                                        </div>
                                                    )}
                                                    {p.customer_feedback && (
                                                        <div style={{ fontSize: '12px', padding: '6px 8px', background: p.status === 'Approved' ? 'rgba(47,125,74,0.08)' : 'rgba(176,58,46,0.08)', borderRadius: 6, marginBottom: 4 }}>
                                                            <strong>Feedback:</strong> {p.customer_feedback}
                                                        </div>
                                                    )}
                                                    {p.reviewed_by_name && (
                                                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                                            Reviewed by {p.reviewed_by_name} {p.reviewed_at ? `on ${fmtDateTime(p.reviewed_at)}` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Bar — show approve/reject for Pending proofs */}
                                            {p.status === 'Pending' && ['Admin', 'Front Office', 'front office'].includes(userRole) && (
                                                <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg, #f9fafb)' }}>
                                                    <button onClick={() => handleReviewProof.bind(null, 'Approved')() || setReviewModal(p)}
                                                        style={{ display: 'none' }} />
                                                    <button onClick={() => { setReviewModal(p); setReviewFeedback(''); }}
                                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: 'var(--success)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                                        <ThumbsUp size={14} /> Review Proof
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', background: 'var(--bg, #f9fafb)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                                <Eye size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                                <div>No proofs uploaded yet. Upload a proof for customer approval.</div>
                            </div>
                        )}
                    </Section>

                    {/* Payment History */}
                    {isFinancialsVisible && (
                        <Section title="Transaction Ledger" icon={CreditCard}>
                            {(payments?.length > 0 || job.advance_paid > 0) ? (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: 400 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Date</th>
                                                <th style={{ textAlign: 'right', padding: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Amount</th>
                                                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Method</th>
                                                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Ref #</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {job.advance_paid > 0 && !payments.some(p => Number(p.amount) === Number(job.advance_paid)) && (
                                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '12px' }}>{fmtDate(job.created_at)}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmt(job.advance_paid)}</td>
                                                    <td style={{ padding: '12px' }}>Advance</td>
                                                    <td style={{ padding: '12px', color: 'var(--muted)' }}>—</td>
                                                </tr>
                                            )}
                                            {payments.map((p, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '12px' }}>{fmtDate(p.payment_date)}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmt(p.amount)}</td>
                                                    <td style={{ padding: '12px' }}>{p.payment_method}</td>
                                                    <td style={{ padding: '12px', color: 'var(--muted)' }}>{p.reference_number || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>No previous payments recorded.</div>
                            )}
                        </Section>
                    )}
                </div>

                {/* Sidebar: Timeline */}
                <div className="stack-md">
                    <Section title="Activity Logs" icon={Activity}>
                        <div style={{ position: 'relative', paddingLeft: 20 }}>
                            <div style={{ position: 'absolute', left: 4, top: 10, bottom: 10, width: 2, background: 'var(--border)' }} />
                            <div className="stack-lg">
                                {statusHistory?.length > 0 ? statusHistory.map((h, i) => (
                                    <div key={i} style={{ position: 'relative', zIndex: 1 }}>
                                        <div style={{
                                            position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%',
                                            background: statusColors[h.status] || 'var(--muted)', boxShadow: '0 0 0 4px var(--surface)'
                                        }} />
                                        <div style={{ fontSize: '14px', fontWeight: 700, color: statusColors[h.status] }}>{h.status}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: 2 }}>{fmtDateTime(h.changed_at)}</div>
                                        {h.staff_name && <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: 4, fontWeight: 500 }}>{h.staff_name}</div>}
                                    </div>
                                )) : <div style={{ padding: 10, color: 'var(--muted)', fontSize: '13px' }}>No logs yet.</div>}
                            </div>
                        </div>
                    </Section>

                    {/* Job Designs — with upload */}
                    <Section title={`Design Files${jobDesigns.length ? ` (${jobDesigns.length})` : ''}`} icon={Image}>
                        {/* Hidden file input */}
                        <input type="file" ref={designFileRef} onChange={handleDesignUpload} multiple accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.ai,.eps,.psd,.cdr,.indd,.tiff,.tif,.bmp,.zip,.rar" style={{ display: 'none' }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button onClick={() => designFileRef.current?.click()} disabled={uploadingDesign}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--accent, var(--accent))', background: 'transparent', color: 'var(--accent, var(--accent))', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: uploadingDesign ? 0.5 : 1 }}>
                                {uploadingDesign ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
                            </button>
                        </div>
                        {jobDesigns.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                                {jobDesigns.slice(0, 8).map(d => {
                                    const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
                                    const url = `${base}${d.file_url}`;
                                    const isImg = d.file_type === 'image';
                                    return (
                                        <div key={d.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', height: 80, background: 'var(--bg, #f3f4f6)' }}>
                                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', height: '100%', textDecoration: 'none' }}>
                                                {isImg ? (
                                                    <img src={url} alt={d.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', gap: 2 }}>
                                                        <FileText size={20} style={{ opacity: 0.5 }} />
                                                        <span style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 700 }}>{d.file_type}</span>
                                                    </div>
                                                )}
                                            </a>
                                            <button onClick={() => handleDeleteDesign(d.id)} title="Delete" style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 4, padding: 2, cursor: 'pointer', lineHeight: 0 }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px', background: 'var(--bg, #f9fafb)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                                No design files yet. Click Upload to attach files.
                            </div>
                        )}
                        {jobDesigns.length > 8 && (
                            <div style={{ textAlign: 'center', marginTop: 8 }}>
                                <button onClick={() => navigate(`/dashboard/customers/${job.customer_id}`)}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent, var(--accent))', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                    View all {jobDesigns.length} designs →
                                </button>
                            </div>
                        )}
                    </Section>
                </div>
            </div>

            {/* Record Payment Modal */}
            {paymentModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#222', borderRadius: 16, width: '100%', maxWidth: 400, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Record Payment</h2>
                        <p style={{ margin: '0 0 24px', color: 'var(--muted)', fontSize: '14px' }}>Enter the amount received from the customer.</p>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '13px', fontWeight: 600 }}>Amount (₹)</label>
                            <input
                                type="number"
                                className="form-input"
                                placeholder="0.00"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                autoFocus
                                style={{
                                    fontSize: '20px',
                                    color: '#eee',
                                    background: '#333',
                                    border: '2px solid #555',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
                                    width: '100%',
                                    outline: 'none',
                                    fontWeight: 600,
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                            <button className="btn btn-ghost flex-1" onClick={() => setPaymentModal(false)}>Cancel</button>
                            <button className="btn btn-primary flex-1" onClick={handleRecordPayment}>Save Payment</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Order Modal */}
            {cancelModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#222', borderRadius: 16, width: '100%', maxWidth: 440, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <XCircle size={20} color="var(--error)" />
                            </div>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>Cancel Order</h2>
                        </div>
                        <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: '14px' }}>
                            This will mark order <strong>{job.job_number}</strong> as Cancelled. This action can be reversed by changing the status.
                        </p>
                        {Number(job.advance_paid) > 0 && (
                            <div style={{ padding: 12, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 16, fontSize: '13px', color: '#92400e' }}>
                                <strong>Note:</strong> Customer has paid ₹{Number(job.advance_paid).toLocaleString('en-IN')} in advance. You can process a refund after cancellation.
                            </div>
                        )}
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '13px', fontWeight: 600 }}>Cancellation Reason *</label>
                            <textarea
                                className="form-input"
                                placeholder="Enter reason for cancellation..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                autoFocus
                                rows={3}
                                style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                            <button className="btn btn-ghost flex-1" onClick={() => { setCancelModal(false); setCancelReason(''); }}>Go Back</button>
                            <button
                                className="btn flex-1"
                                onClick={handleCancelOrder}
                                disabled={cancelling || !cancelReason.trim()}
                                style={{ background: 'var(--error)', color: '#fff', border: 'none', fontWeight: 600, opacity: cancelling || !cancelReason.trim() ? 0.5 : 1 }}
                            >
                                {cancelling ? <><Loader2 size={16} className="animate-spin" /> Cancelling...</> : 'Confirm Cancellation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Paper Usage Log Modal */}
            {paperLogModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#222', borderRadius: 16, width: '100%', maxWidth: 440, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Layers size={20} color="var(--accent)" />
                            </div>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>Log Paper Usage</h2>
                        </div>

                        <div className="form-group" style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Production Stage *</label>
                            <select value={paperForm.stage} onChange={e => setPaperForm(p => ({ ...p, stage: e.target.value }))}
                                style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', width: '100%', outline: 'none' }}>
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

                        <div className="form-group" style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Paper Size</label>
                            <select value={paperForm.paper_size} onChange={e => setPaperForm(p => ({ ...p, paper_size: e.target.value }))}
                                style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', width: '100%', outline: 'none' }}>
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                            <div className="form-group">
                                <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Sheets Used *</label>
                                <input type="number" min="0" placeholder="0" value={paperForm.sheets_used}
                                    onChange={e => setPaperForm(p => ({ ...p, sheets_used: e.target.value }))}
                                    style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', width: '100%', outline: 'none', fontSize: '16px', fontWeight: 600 }}
                                />
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Sheets Wasted</label>
                                <input type="number" min="0" placeholder="0" value={paperForm.sheets_wasted}
                                    onChange={e => setPaperForm(p => ({ ...p, sheets_wasted: e.target.value }))}
                                    style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', width: '100%', outline: 'none', fontSize: '16px', fontWeight: 600 }}
                                />
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Notes (optional)</label>
                            <textarea placeholder="e.g., Misprinted 5 sheets, paper jam..." value={paperForm.notes}
                                onChange={e => setPaperForm(p => ({ ...p, notes: e.target.value }))}
                                rows={2} style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                            <button className="btn btn-ghost flex-1" onClick={() => { setPaperLogModal(false); setPaperForm({ stage: '', paper_size: '', sheets_used: '', sheets_wasted: '', notes: '' }); }}>Cancel</button>
                            <button className="btn btn-primary flex-1" onClick={handleLogPaper} disabled={loggingPaper}
                                style={{ opacity: loggingPaper ? 0.5 : 1 }}>
                                {loggingPaper ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Log Usage'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Proof Upload Modal */}
            {proofModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: '#222', borderRadius: 16, width: '100%', maxWidth: 440, padding: 32, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Eye size={20} color="var(--accent-2)" />
                            </div>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>Upload Proof for Approval</h2>
                        </div>
                        <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: '13px' }}>
                            Upload a design proof. This will be sent for customer verification. Version {proofs.length + 1}.
                        </p>

                        <div className="form-group" style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Proof File *</label>
                            <input type="file" ref={proofFileRef} onChange={handleUploadProof}
                                accept=".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.ai,.eps,.psd,.cdr,.tiff,.tif,.bmp"
                                style={{ color: '#eee', fontSize: '13px' }} />
                        </div>

                        <div className="form-group" style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Designer Notes (optional)</label>
                            <textarea placeholder="e.g., Updated font as per feedback..." value={proofNotes}
                                onChange={e => setProofNotes(e.target.value)}
                                rows={2} style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                            <button className="btn btn-ghost flex-1" onClick={() => { setProofModal(false); setProofNotes(''); }}>Cancel</button>
                        </div>
                        {uploadingProof && <div style={{ textAlign: 'center', marginTop: 12, color: 'var(--accent)', fontSize: '13px' }}><Loader2 size={16} className="animate-spin" style={{ display: 'inline' }} /> Uploading...</div>}
                    </div>
                </div>
            )}

            {/* Proof Review Modal */}
            {reviewModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 480, padding: 32, boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Eye size={20} color="var(--accent-2)" />
                            </div>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>Review Proof v{reviewModal.version}</h2>
                        </div>

                        {/* Preview */}
                        {(() => {
                            const base = (api.defaults.baseURL || '').replace(/\/api\/?$/, '');
                            const pUrl = `${base}${reviewModal.file_url}`;
                            return reviewModal.file_type === 'image' ? (
                                <img src={pUrl} alt={`Proof v${reviewModal.version}`} style={{ width: '100%', maxHeight: 250, objectFit: 'contain', borderRadius: 8, marginBottom: 16, background: 'var(--bg-2)', border: '1px solid var(--border)' }} />
                            ) : (
                                <a href={pUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: 20, textAlign: 'center', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 16, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, border: '1px solid var(--border)' }}>
                                    <FileText size={28} style={{ marginBottom: 6, display: 'block', margin: '0 auto 6px' }} />
                                    Open {reviewModal.original_name}
                                </a>
                            );
                        })()}

                        {reviewModal.designer_notes && (
                            <div style={{ padding: '8px 12px', background: 'var(--accent-light)', border: '1px solid var(--accent-soft)', borderRadius: 8, marginBottom: 12, fontSize: '13px', fontStyle: 'italic' }}>
                                <strong>Designer notes:</strong> {reviewModal.designer_notes}
                            </div>
                        )}

                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px', fontWeight: 600 }}>Customer Feedback (optional for approval, recommended for rejection)</label>
                            <textarea placeholder="e.g., Change the logo size, wrong color..." value={reviewFeedback}
                                onChange={e => setReviewFeedback(e.target.value)}
                                rows={3} style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px', width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn-ghost" onClick={() => { setReviewModal(null); setReviewFeedback(''); }} style={{ flex: 1 }}>Cancel</button>
                            <button onClick={() => handleReviewProof('Revision Requested')} disabled={reviewing}
                                className="badge badge--warning"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, cursor: 'pointer', opacity: reviewing ? 0.5 : 1 }}>
                                <RotateCcw size={14} /> Revision
                            </button>
                            <button onClick={() => handleReviewProof('Rejected')} disabled={reviewing}
                                className="badge badge--danger"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, cursor: 'pointer', opacity: reviewing ? 0.5 : 1 }}>
                                <ThumbsDown size={14} /> Reject
                            </button>
                            <button onClick={() => handleReviewProof('Approved')} disabled={reviewing}
                                className="badge badge--success"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, cursor: 'pointer', opacity: reviewing ? 0.5 : 1 }}>
                                <ThumbsUp size={14} /> Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Refund Modal */}
            {refundModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 440, padding: 32, boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <RotateCcw size={20} color="var(--warning)" />
                            </div>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>Process Refund</h2>
                        </div>
                        <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: '14px' }}>
                            Refund for <strong>{job.job_number}</strong> — {job.customer_name}
                        </p>
                        <div style={{ padding: 12, background: '#1e293b', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span style={{ color: 'var(--muted)' }}>Maximum refundable</span>
                            <span style={{ fontWeight: 700, color: 'var(--success)' }}>₹{Number(job.advance_paid).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '13px', fontWeight: 600 }}>Refund Amount (₹) *</label>
                            <input
                                type="number"
                                className="form-input"
                                placeholder="0.00"
                                value={refundAmount}
                                onChange={(e) => setRefundAmount(e.target.value)}
                                autoFocus
                                max={Number(job.advance_paid)}
                                style={{ fontSize: '20px', color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', width: '100%', outline: 'none', fontWeight: 600 }}
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '13px', fontWeight: 600 }}>Refund Method</label>
                            <select
                                className="form-input"
                                value={refundMethod}
                                onChange={(e) => setRefundMethod(e.target.value)}
                                style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', width: '100%', outline: 'none' }}
                            >
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Account Transfer">Account Transfer</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: 8, fontSize: '13px', fontWeight: 600 }}>Note (optional)</label>
                            <textarea
                                className="form-input"
                                placeholder="Reason for refund..."
                                value={refundNote}
                                onChange={(e) => setRefundNote(e.target.value)}
                                rows={2}
                                style={{ color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                            <button className="btn btn-ghost flex-1" onClick={() => { setRefundModal(false); setRefundAmount(''); setRefundNote(''); }}>Cancel</button>
                            <button
                                className="btn flex-1"
                                onClick={handleRefund}
                                disabled={refunding || !refundAmount || Number(refundAmount) <= 0}
                                style={{ background: 'var(--warning)', color: '#fff', border: 'none', fontWeight: 600, opacity: refunding || !refundAmount || Number(refundAmount) <= 0 ? 0.5 : 1 }}
                            >
                                {refunding ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : `Refund ₹${Number(refundAmount || 0).toLocaleString('en-IN')}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JobDetail;
