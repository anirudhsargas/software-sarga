import React, { useState, useEffect } from 'react';
import useAuth from '../hooks/useAuth';
import api from '../services/api';
import { useConfirm } from '../contexts/ConfirmContext';
import { Save, CheckCircle, Search, Calendar, FileText, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

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

    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

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

    const isCompleted = verification?.status === 'Completed';

    return (
        <div className="section">
            <div className="row space-between items-center mb-16">
                <div>
                    <h1 className="page-title">Monthly Stock Verification</h1>
                    <p className="muted">Enter physical counts to adjust system inventory.</p>
                </div>
                <div className="row gap-md">
                    <button
                        className={`btn ${showHistory ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setShowHistory(!showHistory)}
                    >
                        <FileText size={16} className="mr-8" />
                        {showHistory ? 'Hide History' : 'View History'}
                    </button>
                    {!isCompleted && !showHistory && (
                        <>
                            <button
                                className="btn btn-outline"
                                onClick={() => handleSave('Draft')}
                                disabled={saving || loading}
                            >
                                <Save size={16} className="mr-8" /> Save Draft
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleSave('Completed')}
                                disabled={saving || loading}
                            >
                                <CheckCircle size={16} className="mr-8" /> Complete Verification
                            </button>
                        </>
                    )}
                </div>
            </div>

            {showHistory ? (
                <div className="card p-16">
                    <h2 className="section-title mb-16">Verification History</h2>
                    {history.length > 0 ? (
                        <div className="table-responsive">
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
                                            <td style={{ fontWeight: 600 }}>{h.month}</td>
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
                <div className="card p-16">
                    <div className="row gap-md items-center mb-16" style={{ flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <label className="label">Verification Month</label>
                            <div className="search-group" style={{ maxWidth: '300px' }}>
                                <Calendar size={18} className="search-icon" />
                                <input
                                    type="month"
                                    className="input-field"
                                    value={month}
                                    onChange={(e) => setMonth(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                    disabled={loading || saving}
                                />
                            </div>
                        </div>

                        {verification && (
                            <div style={{ padding: '8px 16px', background: isCompleted ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)', borderRadius: '8px', border: `1px solid ${isCompleted ? 'var(--success)' : 'var(--warning)'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isCompleted ? <CheckCircle size={18} className="text-success" /> : <AlertTriangle size={18} className="text-warning" />}
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: isCompleted ? 'var(--success)' : 'var(--warning)' }}>
                                        Status: {verification.status}
                                    </div>
                                    {isCompleted && (
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            Inventory counts have been updated for this month.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="row gap-md items-center mb-16">
                        <div className="search-group" style={{ flex: 1 }}>
                            <Search size={18} className="search-icon" />
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Search by name, SKU or category..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ paddingLeft: '40px' }}
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading inventory data...</div>
                    ) : (
                        <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                    <tr>
                                        <th>Item Name & SKU</th>
                                        <th>Category</th>
                                        <th style={{ textAlign: 'right' }}>System Qty</th>
                                        <th style={{ width: '150px' }}>Physical Qty</th>
                                        <th style={{ textAlign: 'right' }}>Variance</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.length > 0 ? filteredItems.map(item => {
                                        const sysQty = Number(item.system_quantity) || 0;
                                        const physQty = item.physical_quantity !== null && item.physical_quantity !== '' ? Number(item.physical_quantity) : null;
                                        const variance = physQty !== null ? physQty - sysQty : null;

                                        let varianceColor = '';
                                        if (variance < 0) varianceColor = 'var(--error)';
                                        if (variance > 0) varianceColor = 'var(--success)';

                                        return (
                                            <tr key={item.inventory_item_id}>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.sku || 'No SKU'}</div>
                                                </td>
                                                <td>{item.category || '-'}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 500 }}>
                                                    {sysQty} {item.unit}
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        className="input-field"
                                                        value={item.physical_quantity !== null ? item.physical_quantity : ''}
                                                        onChange={(e) => handleQtyChange(item.inventory_item_id, e.target.value)}
                                                        disabled={isCompleted}
                                                        placeholder="Count"
                                                        style={{ padding: '6px 12px', borderColor: physQty !== null && variance !== 0 ? varianceColor : undefined }}
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: varianceColor }}>
                                                    {variance !== null ? (variance > 0 ? `+${variance}` : variance) : '-'}
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="input-field"
                                                        value={item.notes || ''}
                                                        onChange={(e) => handleNotesChange(item.inventory_item_id, e.target.value)}
                                                        disabled={isCompleted}
                                                        placeholder="Notes..."
                                                        style={{ padding: '6px 12px' }}
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
                </div>
            )}
        </div>
    );
};

export default StockVerification;
