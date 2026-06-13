import React, { useState, useEffect } from 'react';
import useAuth from '../hooks/useAuth';
import api from '../services/api';
import { useConfirm } from '../contexts/ConfirmContext';
import { Save, CheckCircle, Search, Calendar, FileText, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import './StockVerification.css';

const StockVerification = () => {
    const { user } = useAuth();
    const { confirm } = useConfirm();
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [verification, setVerification] = useState(null);
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    useEffect(() => {
        fetchVerification();
        fetchHistory();
    }, [month]);

    const fetchVerification = async () => {
        if (!month) return;
        setLoading(true);
        try {
            const res = await api.get(`/stock-verification/${month}`);
            setVerification(res.data.verification);
            setItems(res.data.items);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load stock verification data');
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await api.get('/stock-verification/history/list');
            setHistory(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleQtyChange = (inventoryItemId, value) => {
        if (verification?.status === 'Completed') return;

        setItems(prev => prev.map(item => {
            if (item.inventory_item_id === inventoryItemId) {
                return { ...item, physical_quantity: value };
            }
            return item;
        }));
    };

    const handleNotesChange = (inventoryItemId, value) => {
        if (verification?.status === 'Completed') return;

        setItems(prev => prev.map(item => {
            if (item.inventory_item_id === inventoryItemId) {
                return { ...item, notes: value };
            }
            return item;
        }));
    };

    const handleSave = async (status) => {
        if (status === 'Completed') {
            const isConfirmed = await confirm({
                title: 'Complete Verification?',
                message: 'This will update the main inventory counts based on the physical quantities you entered. Empty physical quantities will be ignored. This action cannot be undone for this month.',
                confirmText: 'Yes, Complete Verification',
                type: 'warning'
            });
            if (!isConfirmed) return;
        }

        setSaving(true);
        try {
            await api.post('/stock-verification', {
                month,
                status,
                items
            });
            toast.success(`Stock verification ${status === 'Completed' ? 'completed' : 'draft saved'} successfully`);
            fetchVerification();
            if (status === 'Completed') fetchHistory();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || 'Failed to save verification');
        } finally {
            setSaving(false);
        }
    };

    const filteredItems = items.filter(item => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (item.name?.toLowerCase().includes(s)) ||
            (item.sku?.toLowerCase().includes(s)) ||
            (item.category?.toLowerCase().includes(s));
    });

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const isCompleted = verification?.status === 'Completed';

    return (
        <div className="section sv-container">
            {/* ── Page Header ── */}
            <div className="sv-header">
                <div>
                    <h1 className="page-title sv-header-title">Monthly Stock Verification</h1>
                    <p className="muted sv-header-subtitle">Enter physical counts to adjust system inventory.</p>
                </div>
                <div className="sv-header-actions">
                    <button
                        className={`btn ${showHistory ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setShowHistory(!showHistory)}
                    >
                        <FileText size={15} />
                        {showHistory ? 'Hide History' : 'View History'}
                    </button>
                    {!isCompleted && !showHistory && (
                        <>
                            <button
                                className="btn btn-outline sv-action-btn"
                                onClick={() => handleSave('Draft')}
                                disabled={saving || loading}
                            >
                                <Save size={15} /> Save Draft
                            </button>
                            <button
                                className="btn btn-primary sv-action-btn"
                                onClick={() => handleSave('Completed')}
                                disabled={saving || loading}
                            >
                                <CheckCircle size={15} /> Complete Verification
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showHistory ? (
                <div className="card p-16 sv-history-card">
                    <h2 className="section-title sv-history-title">Verification History</h2>
                    {history.length > 0 ? (
                        <div className="table-scroll">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Month</th>
                                        <th>Status</th>
                                        <th>Verified By</th>
                                        <th>Date Submitted</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(h => (
                                        <tr key={h.id}>
                                            <td className="sv-history-month">{h.month}</td>
                                            <td>
                                                <span className={`badge badge--${h.status === 'Completed' ? 'success' : 'warning'}`}>
                                                    {h.status}
                                                </span>
                                            </td>
                                            <td>{h.verified_by_name || '-'}</td>
                                            <td>{new Date(h.updated_at).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state">No verification history found.</div>
                    )}
                </div>
            ) : (
                <div className="card p-16 sv-verification-card">
                    {/* ── Controls Row ── */}
                    <div className="sv-controls">
                        {/* Month picker */}
                        <div className="sv-control-group sv-control-group--month">
                            <label className="sv-label">
                                <Calendar size={13} /> Verification Month
                            </label>
                            <input
                                type="month"
                                className="input-field sv-month-input"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                disabled={loading || saving}
                            />
                        </div>

                        {/* Search */}
                        <div className="sv-control-group sv-control-group--search">
                            <label className="sv-label">
                                <Search size={13} /> Search
                            </label>
                            <div className="sv-search-wrapper">
                                <Search size={14} className="sv-search-icon" />
                                <input
                                    type="text"
                                    className="input-field sv-search-input"
                                    placeholder="Search by name, SKU or category..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Status badge */}
                        {verification && (
                            <div className={`sv-status-badge ${isCompleted ? 'sv-status-badge--completed' : 'sv-status-badge--draft'}`}>
                                {isCompleted ? <CheckCircle size={15} className="sv-status-icon sv-status-icon--completed" /> : <AlertTriangle size={15} className="sv-status-icon sv-status-icon--draft" />}
                                <span className={`sv-status-text ${isCompleted ? 'sv-status-text--completed' : 'sv-status-text--draft'}`}>
                                    Status: {verification.status}
                                </span>
                            </div>
                        )}
                    </div>

                    {loading ? (
                        <div className="sv-loading">Loading inventory data...</div>
                    ) : (
                        <div className="table-scroll sv-table-scroll">
                            <table className="table sv-table">
                                <thead>
                                    <tr>
                                        <th>Item Name & SKU</th>
                                        <th>Category</th>
                                        <th className="sv-table-th--right">System Qty</th>
                                        <th className="sv-table-th--qty">Physical Qty</th>
                                        <th className="sv-table-th--right">Variance</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedItems.length > 0 ? paginatedItems.map(item => {
                                        const sysQty = Number(item.system_quantity) || 0;
                                        const physQty = item.physical_quantity !== null && item.physical_quantity !== '' ? Number(item.physical_quantity) : null;
                                        const variance = physQty !== null ? physQty - sysQty : null;

                                        let varianceColor = '';
                                        if (variance < 0) varianceColor = 'var(--error)';
                                        if (variance > 0) varianceColor = 'var(--success)';

                                        return (
                                            <tr key={item.inventory_item_id}>
                                                <td>
                                                    <div className="sv-item-name">{item.name}</div>
                                                    <div className="sv-item-sku">{item.sku || 'No SKU'}</div>
                                                </td>
                                                <td>{item.category || '-'}</td>
                                                <td className="sv-sys-qty">
                                                    {sysQty} {item.unit}
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        className={`input-field sv-phys-qty-input ${physQty !== null && variance !== 0 ? (variance < 0 ? 'sv-phys-qty-input--error' : 'sv-phys-qty-input--success') : ''}`}
                                                        value={item.physical_quantity !== null ? item.physical_quantity : ''}
                                                        onChange={(e) => handleQtyChange(item.inventory_item_id, e.target.value)}
                                                        disabled={isCompleted}
                                                        placeholder="Count"
                                                    />
                                                </td>
                                                <td className={`sv-variance ${varianceColor ? (variance < 0 ? 'sv-variance--error' : 'sv-variance--success') : ''}`} style={{ color: varianceColor }}>
                                                    {variance !== null ? (variance > 0 ? `+${variance}` : variance) : '-'}
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="input-field sv-notes-input"
                                                        value={item.notes || ''}
                                                        onChange={(e) => handleNotesChange(item.inventory_item_id, e.target.value)}
                                                        disabled={isCompleted}
                                                        placeholder="Notes..."
                                                    />
                                                </td>
                                            </tr>
                                        )
                                    }) : (
                                        <tr>
                                            <td colSpan="6" className="empty-state">No inventory items found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {!loading && totalPages > 1 && (
                        <div className="sv-pagination">
                            <div className="sv-pagination-info">
                                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length} items
                            </div>
                            <div className="sv-pagination-controls">
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </button>
                                <div className="sv-page-indicator">
                                    Page {currentPage} of {totalPages}
                                </div>
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default StockVerification;
