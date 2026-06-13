import React, { useState, useEffect } from 'react';
import { 
    AlertTriangle, ArrowLeft, Layers, MapPin, 
    RefreshCcw, ShoppingCart, Plus, Bell
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const PaperAlerts = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState([]);
    const [stock, setStock] = useState([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [alertsRes, stockRes] = await Promise.all([
                api.get('/paperInventory/alerts'),
                api.get('/paperInventory/stock')
            ]);
            setAlerts(alertsRes.data);
            // Filter stock items that are below reorder level
            const lowStock = stockRes.data.filter(item => Number(item.current_sheets) < Number(item.reorder_level));
            setStock(lowStock);
        } catch (err) {
            toast.error('Failed to load alerts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    return (
        <div className="stack-lg p-md">
            {/* Header */}
            <div className="row items-center gap-md">
                <button className="btn btn-ghost p-sm" onClick={() => navigate('/dashboard/paper/stock')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Bell size={28} className="text-error" /> Inventory Alerts
                    </h1>
                    <p className="section-subtitle">Items that require immediate attention or restocking.</p>
                </div>
            </div>

            <div className="grid grid--2 gap-lg wrap">
                {/* Critical Low Stock Items */}
                <div className="stack-md">
                    <h3 className="row items-center gap-sm font-bold text-lg mb-8">
                        <AlertTriangle size={20} className="text-error" /> Critical Restock Needed
                    </h3>
                    
                    {loading ? (
                        <div className="panel p-xl text-center"><RefreshCcw className="animate-spin muted" /></div>
                    ) : stock.length === 0 ? (
                        <div className="panel p-xl text-center muted border-dashed">
                            <Layers size={48} className="mb-12 opacity-20" />
                            <div>All stock levels are healthy.</div>
                        </div>
                    ) : (
                        stock.map(item => (
                            <div key={`${item.paper_type_id}-${item.branch_id}`} className="panel border-l-4 border-error stack-sm relative overflow-hidden">
                                <div style={{ position: 'absolute', right: -10, top: -10, opacity: 0.05 }}>
                                    <AlertTriangle size={80} />
                                </div>
                                
                                <div className="row space-between items-start">
                                    <div>
                                        <div className="font-bold text-lg">{item.size_name}</div>
                                        <div className="text-sm muted">{item.gsm} GSM • {item.category}</div>
                                        <div className="row items-center gap-xs text-xs mt-4">
                                            <MapPin size={12} className="muted" /> {item.branch_name}
                                        </div>
                                    </div>
                                    <button 
                                        className="btn btn-primary btn-sm"
                                        onClick={() => navigate('/dashboard/paper/inward', { state: { paper_type_id: item.paper_type_id, branch_id: item.branch_id } })}
                                    >
                                        <Plus size={14} /> Restock
                                    </button>
                                </div>

                                <div className="row gap-lg mt-md">
                                    <div>
                                        <div className="text-xs muted uppercase font-bold">Current Stock</div>
                                        <div className="text-xl font-black text-error">{item.current_sheets.toLocaleString()}</div>
                                    </div>
                                    <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
                                        <div className="text-xs muted uppercase font-bold">Reorder Level</div>
                                        <div className="text-xl font-bold">{item.reorder_level.toLocaleString()}</div>
                                    </div>
                                    <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
                                        <div className="text-xs muted uppercase font-bold">Deficit</div>
                                        <div className="text-xl font-bold text-primary">{(item.reorder_level - item.current_sheets).toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* System Notifications */}
                <div className="stack-md">
                    <h3 className="row items-center gap-sm font-bold text-lg mb-8">
                        <Bell size={20} className="text-primary" /> System Notifications
                    </h3>
                    
                    <div className="panel p-0 overflow-hidden">
                        {loading ? (
                            <div className="p-xl text-center"><RefreshCcw className="animate-spin muted" /></div>
                        ) : alerts.length === 0 ? (
                            <div className="p-xl text-center muted">No new notifications.</div>
                        ) : (
                            <div className="stack-0">
                                {alerts.map((a, idx) => (
                                    <div key={a.id} className="p-md" style={{ borderBottom: idx < alerts.length - 1 ? '1px solid var(--border)' : 'none', background: a.is_read ? 'transparent' : 'rgba(var(--primary-rgb), 0.03)' }}>
                                        <div className="row gap-md">
                                            <div className="p-sm bg-error-light rounded text-error" style={{ height: 'fit-content' }}>
                                                <AlertTriangle size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-medium">{a.message}</div>
                                                <div className="text-xs muted mt-4">{new Date(a.created_at).toLocaleString()}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaperAlerts;
