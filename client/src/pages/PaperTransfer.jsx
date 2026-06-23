import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { 
    Repeat, ArrowLeft, Package, MapPin, Layers, 
    RefreshCcw, Info, ArrowRight
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';

const PaperTransfer = () => {
    useSEO('Paper Transfer');

    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [paperTypes, setPaperTypes] = useState([]);
    const [branches, setBranches] = useState([]);
    const [stockSummary, setStockSummary] = useState([]);
    
    const [formData, setFormData] = useState({
        paper_type_id: location.state?.paper_type_id || '',
        from_branch_id: location.state?.branch_id || '',
        to_branch_id: '',
        quantity: '',
        unit: 'Sheets',
        notes: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [typesRes, branchesRes, stockRes] = await Promise.all([
                    api.get('/paperInventory/types'),
                    api.get('/branches'),
                    api.get('/paperInventory/stock')
                ]);
                setPaperTypes(typesRes.data);
                setBranches(branchesRes.data);
                setStockSummary(stockRes.data);
            } catch {
                toast.error('Failed to load initial data');
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.from_branch_id === formData.to_branch_id) {
            return toast.error('Source and destination branches must be different');
        }

        setLoading(true);
        try {
            await api.post('/paperInventory/transfer', {
                ...formData,
                quantity: Number(formData.quantity)
            });
            toast.success('Stock transfer successful');
            navigate('/dashboard/paper/stock');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to transfer stock');
        } finally {
            setLoading(false);
        }
    };

    const currentStockItem = stockSummary.find(s => s.paper_type_id === Number(formData.paper_type_id) && s.branch_id === Number(formData.from_branch_id));
    const availableSheets = currentStockItem ? currentStockItem.current_sheets : 0;
    
    const requestedSheets = formData.unit === 'Reams' ? (Number(formData.quantity) * 500) : 
                           formData.unit === 'Packets' ? (Number(formData.quantity) * 100) : 
                           Number(formData.quantity) || 0;

    const isInsufficient = requestedSheets > availableSheets;

    return (
        <PageContainer>
            {/* Header */}
            <div className="row items-center gap-md">
                <button className="btn btn-ghost p-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="section-title">Branch Transfer</h1>
                    <p className="section-subtitle">Move stock between branches securely.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="stack-md">
                <div className="panel stack-md">
                    <div className="row gap-md items-center mb-8">
                        <div className="badge badge-primary">
                            <Repeat size={14} /> Transfer Details
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
                            <label className="label">From Branch *</label>
                            <select 
                                className="input-field" 
                                required
                                value={formData.from_branch_id}
                                onChange={(e) => setFormData({...formData, from_branch_id: e.target.value})}
                            >
                                <option value="">-- Select Source --</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <div className="text-xs muted mt-4">
                                Available: <strong>{availableSheets.toLocaleString()} sheets</strong>
                            </div>
                        </div>

                        <div>
                            <label className="label">To Branch *</label>
                            <select 
                                className="input-field" 
                                required
                                value={formData.to_branch_id}
                                onChange={(e) => setFormData({...formData, to_branch_id: e.target.value})}
                            >
                                <option value="">-- Select Destination --</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
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
                                <option value="Sheets">Sheets</option>
                                <option value="Reams">Reams (500 sheets)</option>
                                <option value="Packets">Packets (100 sheets)</option>
                            </select>
                        </div>

                        <div className="span-2">
                            <label className="label">Notes</label>
                            <textarea 
                                className="input-field" 
                                rows="2"
                                placeholder="Reason for transfer..."
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            ></textarea>
                        </div>
                    </div>

                    {formData.quantity && formData.from_branch_id && formData.to_branch_id && (
                        <div className={`p-md rounded mt-md border ${isInsufficient ? 'bg-error-light border-error' : 'bg-surface border-dashed'}`}>
                            <div className="row items-center gap-md justify-center mb-8">
                                <div className="text-center">
                                    <div className="text-xs muted uppercase font-bold">Source</div>
                                    <div className="font-bold">{branches.find(b => b.id === Number(formData.from_branch_id))?.name}</div>
                                </div>
                                <div className="text-primary"><ArrowRight size={20} /></div>
                                <div className="text-center">
                                    <div className="text-xs muted uppercase font-bold">Destination</div>
                                    <div className="font-bold">{branches.find(b => b.id === Number(formData.to_branch_id))?.name}</div>
                                </div>
                            </div>
                            <div className="text-sm text-center">
                                Transferring <strong>{requestedSheets.toLocaleString()} sheets</strong>.
                                {isInsufficient && (
                                    <div className="text-error font-bold mt-4">
                                        Error: Insufficient stock in source branch!
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="row justify-end mt-lg">
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            disabled={loading || isInsufficient || !formData.quantity || !formData.paper_type_id || !formData.to_branch_id}
                        >
                            {loading ? <RefreshCcw className="animate-spin" size={18} /> : <Repeat size={18} />}
                            Confirm Transfer
                        </button>
                    </div>
                </div>
            </form>
        </PageContainer>
    );
};

export default PaperTransfer;
