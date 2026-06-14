import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { 
    Plus, ArrowLeft, Package, MapPin, Layers, 
    Calendar, User, FileText, ShoppingCart, Info
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const PaperInward = () => {
    useSEO('Paper Inward');

    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [paperTypes, setPaperTypes] = useState([]);
    const [branches, setBranches] = useState([]);
    
    const [formData, setFormData] = useState({
        paper_type_id: location.state?.paper_type_id || '',
        branch_id: location.state?.branch_id || '',
        quantity: '',
        unit: 'Reams',
        purchase_rate: '',
        supplier_name: '',
        notes: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [typesRes, branchesRes] = await Promise.all([
                    api.get('/paperInventory/types'),
                    api.get('/branches')
                ]);
                setPaperTypes(typesRes.data);
                setBranches(branchesRes.data);
            } catch (err) {
                toast.error('Failed to load initial data');
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/paperInventory/inward', {
                ...formData,
                quantity: Number(formData.quantity),
                purchase_rate: Number(formData.purchase_rate) || 0
            });
            toast.success('Stock inward recorded');
            navigate('/dashboard/paper/stock');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to record inward stock');
        } finally {
            setLoading(false);
        }
    };

    const selectedPaper = paperTypes.find(t => t.id === Number(formData.paper_type_id));

    return (
        <div className="stack-lg p-md" style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Header */}
            <div className="row items-center gap-md">
                <button className="btn btn-ghost p-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="section-title">Record Inward Stock</h1>
                    <p className="section-subtitle">Add new paper stock to inventory.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="stack-md">
                <div className="panel stack-md">
                    <div className="row gap-md items-center mb-8">
                        <div className="badge badge-primary">
                            <ShoppingCart size={14} /> Stock Details
                        </div>
                    </div>

                    <div className="grid grid--2 gap-md">
                        <div className="span-2">
                            <label className="label">Select Paper Type *</label>
                            <select 
                                className="input-field" 
                                required
                                value={formData.paper_type_id}
                                onChange={(e) => setFormData({...formData, paper_type_id: e.target.value})}
                            >
                                <option value="">-- Select Paper Type --</option>
                                {paperTypes.map(t => (
                                    <option key={t.id} value={t.id}>
                                        [{t.category}] {t.size_name} {t.gsm ? `${t.gsm} GSM` : ''} {t.brand ? `• ${t.brand}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="label">Branch *</label>
                            <select 
                                className="input-field" 
                                required
                                value={formData.branch_id}
                                onChange={(e) => setFormData({...formData, branch_id: e.target.value})}
                            >
                                <option value="">-- Select Branch --</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="label">Supplier Name</label>
                            <input 
                                className="input-field" 
                                placeholder="e.g. ABC Paper Mill"
                                value={formData.supplier_name}
                                onChange={(e) => setFormData({...formData, supplier_name: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="label">Quantity *</label>
                            <input 
                                type="number"
                                step="any"
                                className="input-field" 
                                required
                                placeholder="0"
                                value={formData.quantity}
                                onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="label">Unit *</label>
                            <select 
                                className="input-field" 
                                required
                                value={formData.unit}
                                onChange={(e) => setFormData({...formData, unit: e.target.value})}
                            >
                                <option value="Reams">Reams (500 sheets)</option>
                                <option value="Packets">Packets (100 sheets)</option>
                                <option value="Sheets">Sheets</option>
                            </select>
                        </div>

                        <div>
                            <label className="label">Purchase Rate (per unit)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>₹</span>
                                <input 
                                    type="number"
                                    step="0.01"
                                    className="input-field" 
                                    style={{ paddingLeft: 30 }}
                                    placeholder="0.00"
                                    value={formData.purchase_rate}
                                    onChange={(e) => setFormData({...formData, purchase_rate: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="span-2">
                            <label className="label">Notes / Reference</label>
                            <textarea 
                                className="input-field" 
                                rows="3"
                                placeholder="Enter any notes or bill reference..."
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            ></textarea>
                        </div>
                    </div>

                    {selectedPaper && (
                        <div className="p-md bg-surface rounded mt-md border border-dashed">
                            <div className="row items-center gap-sm text-primary font-bold mb-4">
                                <Info size={16} /> Summary
                            </div>
                            <div className="text-sm muted">
                                You are adding <strong>{formData.quantity || 0} {formData.unit}</strong> which equals 
                                <span className="text-primary font-bold"> {
                                    formData.unit === 'Reams' ? (Number(formData.quantity) * 500) : 
                                    formData.unit === 'Packets' ? (Number(formData.quantity) * 100) : 
                                    Number(formData.quantity) || 0
                                } sheets </span> 
                                of {selectedPaper.size_name} to inventory.
                            </div>
                        </div>
                    )}

                    <div className="row justify-end mt-lg">
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <RefreshCcw className="animate-spin" size={18} /> : <Plus size={18} />}
                            Record Inward
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default PaperInward;
