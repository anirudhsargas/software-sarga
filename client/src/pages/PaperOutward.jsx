import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { 
    Minus, ArrowLeft, Package, MapPin, Layers, 
    FileText, Briefcase, RefreshCcw, Info, Search
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
const PaperOutward = () => {
    useSEO('Paper Outward');

    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [paperTypes, setPaperTypes] = useState([]);
    const [branches, setBranches] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [stockSummary, setStockSummary] = useState([]);
    
    const [formData, setFormData] = useState({
        paper_type_id: location.state?.paper_type_id || '',
        branch_id: location.state?.branch_id || '',
        quantity: '',
        unit: 'Sheets',
        job_id: '',
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

    const fetchJobs = async (search) => {
        if (!search || search.length < 2) return;
        try {
            const res = await api.get('/jobs', { params: { search, limit: 10 } });
            setJobs(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch jobs');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/paperInventory/outward', {
                ...formData,
                quantity: Number(formData.quantity),
                job_id: formData.job_id || null
            });
            toast.success('Stock usage recorded');
            navigate('/dashboard/paper/stock');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to record outward stock');
        } finally {
            setLoading(false);
        }
    };

    const currentStockItem = stockSummary.find(s => s.paper_type_id === Number(formData.paper_type_id) && s.branch_id === Number(formData.branch_id));
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
                    <h1 className="section-title">Record Outward Stock</h1>
                    <p className="section-subtitle">Deduct paper stock for jobs or other usage.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="stack-md">
                <div className="panel stack-md">
                    <div className="row gap-md items-center mb-8">
                        <div className="badge badge-warning">
                            <Briefcase size={14} /> Usage Details
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
                            <BranchSelect 
                                className="input-field" 
                                required
                                value={formData.branch_id}
                                onChange={(e) => setFormData({...formData, branch_id: e.target.value})}
                            >
                                <option value="">-- Select Branch --</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </BranchSelect>
                        </div>

                        <div>
                            <label className="label">Available Stock</label>
                            <div className="input-field" style={{ background: 'var(--surface)', fontWeight: 700 }}>
                                {availableSheets.toLocaleString()} Sheets
                            </div>
                        </div>

                        <div className="span-2">
                            <label className="label">Link to Job (Search by Job # or Name)</label>
                            <div style={{ position: 'relative' }}>
                                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={18} />
                                <input 
                                    className="input-field" 
                                    style={{ paddingLeft: 40 }}
                                    placeholder="Search active jobs..."
                                    list="jobs-list"
                                    onChange={(e) => fetchJobs(e.target.value)}
                                />
                                <datalist id="jobs-list">
                                    {jobs.map(j => (
                                        <option key={j.id} value={j.job_number}>{j.job_name} ({j.customer_name})</option>
                                    ))}
                                </datalist>
                            </div>
                            <select 
                                className="input-field mt-sm"
                                value={formData.job_id}
                                onChange={(e) => setFormData({...formData, job_id: e.target.value})}
                            >
                                <option value="">-- Select Linked Job (Optional) --</option>
                                {jobs.map(j => (
                                    <option key={j.id} value={j.id}>{j.job_number} - {j.job_name}</option>
                                ))}
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
                                placeholder="Purpose of deduction..."
                                value={formData.notes}
                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            ></textarea>
                        </div>
                    </div>

                    {formData.quantity && (
                        <div className={`p-md rounded mt-md border ${isInsufficient ? 'bg-error-light border-error' : 'bg-surface border-dashed'}`}>
                            <div className={`row items-center gap-sm font-bold mb-4 ${isInsufficient ? 'text-error' : 'text-primary'}`}>
                                <Info size={16} /> Summary
                            </div>
                            <div className="text-sm">
                                Deducting <strong>{requestedSheets.toLocaleString()} sheets</strong> from 
                                <strong> {availableSheets.toLocaleString()} sheets </strong> available.
                                {isInsufficient && (
                                    <div className="text-error font-bold mt-4">
                                        Error: Insufficient stock for this operation!
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="row justify-end mt-lg">
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        <button 
                            type="submit" 
                            className="btn btn-warning" 
                            disabled={loading || isInsufficient || !formData.quantity || !formData.paper_type_id}
                        >
                            {loading ? <RefreshCcw className="animate-spin" size={18} /> : <Minus size={18} />}
                            Record Outward
                        </button>
                    </div>
                </div>
            </form>
        </PageContainer>
    );
};

export default PaperOutward;
