import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { 
    History, ArrowLeft, Filter, Search, Download, 
    ArrowUpCircle, ArrowDownCircle, Repeat, RefreshCcw, Briefcase
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const PaperMovementHistory = () => {
    useSEO('Paper Movement History');

    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [movements, setMovements] = useState([]);
    const [branches, setBranches] = useState([]);
    const [filters, setFilters] = useState({
        branch_id: '',
        movement_type: '',
        limit: 50,
        offset: 0
    });

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const [moveRes, branchRes] = await Promise.all([
                api.get('/paperInventory/movements', { params: filters }),
                api.get('/branches')
            ]);
            setMovements(moveRes.data);
            setBranches(branchRes.data);
        } catch (err) {
            toast.error('Failed to load history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [filters]);

    const getMovementBadge = (type) => {
        switch(type) {
            case 'INWARD': return <span className="badge badge-success"><ArrowUpCircle size={12} className="mr-4" /> Inward</span>;
            case 'OUTWARD': return <span className="badge badge-warning"><ArrowDownCircle size={12} className="mr-4" /> Outward</span>;
            case 'TRANSFER_IN': return <span className="badge badge-primary"><Repeat size={12} className="mr-4" /> Transfer In</span>;
            case 'TRANSFER_OUT': return <span className="badge badge-secondary"><Repeat size={12} className="mr-4" /> Transfer Out</span>;
            case 'ADJUSTMENT': return <span className="badge badge-ghost">Adjustment</span>;
            default: return <span className="badge badge-ghost">{type}</span>;
        }
    };

    return (
        <div className="stack-lg p-md">
            {/* Header */}
            <div className="row items-center gap-md">
                <button className="btn btn-ghost p-sm" onClick={() => navigate('/dashboard/paper/stock')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <h1 className="section-title">Inventory History</h1>
                    <p className="section-subtitle">Complete ledger of paper stock movements.</p>
                </div>
                <button className="btn btn-ghost" onClick={() => window.print()}>
                    <Download size={18} /> Export
                </button>
            </div>

            {/* Filters */}
            <div className="panel row gap-md items-center wrap">
                <div className="row gap-sm wrap items-center">
                    <Filter size={18} className="muted" />
                    <select 
                        className="input-field" 
                        style={{ width: 160 }}
                        value={filters.branch_id}
                        onChange={(e) => setFilters({...filters, branch_id: e.target.value})}
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select 
                        className="input-field" 
                        style={{ width: 160 }}
                        value={filters.movement_type}
                        onChange={(e) => setFilters({...filters, movement_type: e.target.value})}
                    >
                        <option value="">All Types</option>
                        <option value="INWARD">Inward</option>
                        <option value="OUTWARD">Outward</option>
                        <option value="TRANSFER_IN">Transfer In</option>
                        <option value="TRANSFER_OUT">Transfer Out</option>
                        <option value="ADJUSTMENT">Adjustment</option>
                    </select>
                </div>
                <div className="flex-1"></div>
                <div className="row gap-xs items-center">
                    <span className="text-xs muted uppercase font-bold">Showing last {filters.limit} entries</span>
                </div>
            </div>

            {/* Table */}
            <div className="panel p-0 overflow-hidden">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Paper Type</th>
                                <th>Branch</th>
                                <th>Type</th>
                                <th>Quantity (Sheets)</th>
                                <th>Details</th>
                                <th>User</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="text-center p-xl">
                                        <RefreshCcw className="animate-spin muted" size={32} />
                                    </td>
                                </tr>
                            ) : movements.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center p-xl muted">
                                        No movement history found.
                                    </td>
                                </tr>
                            ) : (
                                movements.map(m => (
                                    <tr key={m.id}>
                                        <td className="text-sm">
                                            <div className="font-bold">{new Date(m.created_at).toLocaleDateString()}</div>
                                            <div className="text-xs muted">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td>
                                            <div className="font-bold">{m.size_name}</div>
                                            <div className="text-xs muted">{m.gsm} GSM • {m.category}</div>
                                        </td>
                                        <td>{m.branch_name}</td>
                                        <td>{getMovementBadge(m.movement_type)}</td>
                                        <td>
                                            <div className={`font-bold ${['OUTWARD', 'TRANSFER_OUT'].includes(m.movement_type) ? 'text-error' : 'text-success'}`}>
                                                {['OUTWARD', 'TRANSFER_OUT'].includes(m.movement_type) ? '-' : '+'}{m.quantity_sheets.toLocaleString()}
                                            </div>
                                            <div className="text-xs muted">{m.unit_quantity} {m.unit_type}</div>
                                        </td>
                                        <td className="text-sm">
                                            {m.job_number && (
                                                <div className="row items-center gap-xs text-primary font-medium mb-4">
                                                    <Briefcase size={12} /> Job #{m.job_number}
                                                </div>
                                            )}
                                            {m.supplier_name && <div className="text-xs">From: {m.supplier_name}</div>}
                                            {m.notes && <div className="text-xs muted italic truncate" style={{ maxWidth: 200 }}>{m.notes}</div>}
                                        </td>
                                        <td>
                                            <div className="text-xs font-medium">{m.staff_name}</div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PaperMovementHistory;
