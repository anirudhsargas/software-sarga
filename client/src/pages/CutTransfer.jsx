import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback } from 'react';
import { Scissors, Plus, X, RefreshCcw, ArrowLeft, ArrowRight, Truck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';

const CutTransfer = () => {
    useSEO('Cut & Transfer');

    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(false);
    const [paperTypes, setPaperTypes] = useState([]);
    const [stockMap, setStockMap] = useState({});
    const [branches, setBranches] = useState([]);

    const [branchId, setBranchId] = useState(location.state?.branch_id || '');
    const [sourceSizeId, setSourceSizeId] = useState(location.state?.paper_type_id || '');
    const [sourceQty, setSourceQty] = useState('');
    const [wastageQty, setWastageQty] = useState(0);
    const [outputs, setOutputs] = useState([{ output_size_id: '', output_qty_sheets: '' }]);
    const [notes, setNotes] = useState('');
    const [transferAfterCut, setTransferAfterCut] = useState(false);
    const [transferBranchId, setTransferBranchId] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [typesRes, stockRes, branchesRes] = await Promise.all([
                    api.get('/paperInventory/types'),
                    api.get('/paperInventory/stock'),
                    api.get('/branches')
                ]);
                setPaperTypes(typesRes.data);
                setBranches(branchesRes.data);

                const map = {};
                (stockRes.data || []).forEach(item => {
                    const key = `${item.paper_type_id}-${item.branch_id}`;
                    map[key] = Number(item.current_sheets);
                });
                setStockMap(map);
            } catch {
                toast.error('Failed to load data');
            }
        };
        fetchData();
    }, []);

    const availableSheets = stockMap[`${sourceSizeId}-${branchId}`] || 0;

    const addOutput = () => {
        setOutputs([...outputs, { output_size_id: '', output_qty_sheets: '' }]);
    };

    const removeOutput = (index) => {
        if (outputs.length <= 1) return;
        setOutputs(outputs.filter((_, i) => i !== index));
    };

    const updateOutput = (index, field, value) => {
        const updated = [...outputs];
        updated[index][field] = value;
        setOutputs(updated);
    };

    const totalOutputQty = outputs.reduce((sum, o) => sum + (Number(o.output_qty_sheets) || 0), 0);
    const isInsufficient = Number(sourceQty) > availableSheets;
    const yieldDiff = Number(sourceQty) - totalOutputQty - Number(wastageQty);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!sourceQty || Number(sourceQty) <= 0) {
            return toast.error('Enter a valid source quantity');
        }
        if (outputs.some(o => !o.output_size_id || !o.output_qty_sheets)) {
            return toast.error('Fill all output rows');
        }
        if (isInsufficient) {
            return toast.error('Insufficient stock for the source quantity');
        }
        if (transferAfterCut && !transferBranchId) {
            return toast.error('Select a destination branch for transfer');
        }

        setLoading(true);
        try {
            const payload = {
                branch_id: Number(branchId),
                paper_type_id: Number(sourceSizeId),
                source_size_id: Number(sourceSizeId),
                source_qty_sheets: Number(sourceQty),
                wastage_qty_sheets: Number(wastageQty) || 0,
                outputs: outputs.map(o => ({
                    output_size_id: Number(o.output_size_id),
                    output_qty_sheets: Number(o.output_qty_sheets)
                })),
                notes: notes || undefined
            };

            const cutRes = await api.post('/cutting-jobs', payload);
            toast.success(`Cutting job #${cutRes.data.cuttingJobId} completed`);

            if (cutRes.data.yield_check?.difference !== 0) {
                console.warn('[Yield Mismatch]', cutRes.data.yield_check);
            }

            // Chain transfer if checkbox is checked
            if (transferAfterCut && transferBranchId) {
                const transferPromises = outputs.map(o =>
                    api.post('/stock-transfers', {
                        from_branch_id: Number(branchId),
                        to_branch_id: Number(transferBranchId),
                        paper_type_id: Number(o.output_size_id),
                        size_id: Number(o.output_size_id),
                        qty_dispatched: Number(o.output_qty_sheets)
                    })
                );
                await Promise.all(transferPromises);
                toast.success(`Stock transferred to ${branches.find(b => b.id === Number(transferBranchId))?.name || 'destination'}`);
            }

            navigate('/dashboard/paper/stock');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Cutting job failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageContainer>
            <div className="row items-center gap-md">
                <button className="btn btn-ghost p-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="section-title">Cut & Transfer</h1>
                    <p className="section-subtitle">Cut paper from source size into finished sizes.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="stack-md" style={{ maxWidth: 720 }}>
                <div className="panel stack-md">
                    <div className="row gap-md items-center mb-8">
                        <div className="badge badge-primary">
                            <Scissors size={14} /> Cutting Details
                        </div>
                    </div>

                    <div className="grid grid--2 gap-md">
                        <div>
                            <label className="label">Branch *</label>
                            <select className="input-field" required
                                value={branchId}
                                onChange={e => setBranchId(e.target.value)}>
                                <option value="">-- Select Branch --</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="label">Source Paper Size *</label>
                            <select className="input-field" required
                                value={sourceSizeId}
                                onChange={e => setSourceSizeId(e.target.value)}>
                                <option value="">-- Select Source --</option>
                                {paperTypes.filter(t => t.is_active !== false).map(t => (
                                    <option key={t.id} value={t.id}>
                                        [{t.category}] {t.size_name} {t.gsm ? `${t.gsm} GSM` : ''} {t.brand ? `• ${t.brand}` : ''}
                                    </option>
                                ))}
                            </select>
                            {sourceSizeId && branchId && (
                                <div className="text-xs muted mt-4">
                                    Available: <strong>{availableSheets.toLocaleString()} sheets</strong>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="label">Source Quantity (Sheets) *</label>
                            <input type="number" step="any" min="0" className="input-field" required
                                placeholder="0"
                                value={sourceQty}
                                onChange={e => setSourceQty(e.target.value)} />
                            {isInsufficient && (
                                <div className="text-xs text-error mt-4">
                                    Exceeds available stock!
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="label">Wastage (Sheets)</label>
                            <input type="number" step="any" min="0" className="input-field"
                                placeholder="0"
                                value={wastageQty}
                                onChange={e => setWastageQty(e.target.value)} />
                        </div>
                    </div>

                    <div className="divider" />

                    <div className="row space-between items-center">
                        <label className="label" style={{ margin: 0 }}>Output Sizes</label>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={addOutput}>
                            <Plus size={14} /> Add Output
                        </button>
                    </div>

                    {outputs.map((output, index) => (
                        <div key={index} className="grid grid--2 gap-md" style={{ alignItems: 'end' }}>
                            <div>
                                <label className="label">Output Size *</label>
                                <select className="input-field" required
                                    value={output.output_size_id}
                                    onChange={e => updateOutput(index, 'output_size_id', e.target.value)}>
                                    <option value="">-- Select --</option>
                                    {paperTypes.filter(t => t.is_active !== false && Number(t.id) !== Number(sourceSizeId)).map(t => (
                                        <option key={t.id} value={t.id}>
                                            [{t.category}] {t.size_name} {t.gsm ? `${t.gsm} GSM` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="row gap-xs items-end">
                                <div style={{ flex: 1 }}>
                                    <label className="label">Qty (Sheets) *</label>
                                    <input type="number" step="any" min="0" className="input-field" required
                                        placeholder="0"
                                        value={output.output_qty_sheets}
                                        onChange={e => updateOutput(index, 'output_qty_sheets', e.target.value)} />
                                </div>
                                <button type="button" className="btn btn-ghost btn-sm"
                                    style={{ marginBottom: 2, color: 'var(--error)' }}
                                    onClick={() => removeOutput(index)}
                                    disabled={outputs.length <= 1}>
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {sourceQty && outputs.some(o => o.output_qty_sheets) && (
                        <div className={`p-md rounded mt-md border ${yieldDiff !== 0 ? 'bg-warning-light border-warning' : 'bg-surface border-dashed'}`}>
                            <div className="text-sm">
                                <strong>Yield Check:</strong> Source: {Number(sourceQty)} sheets |
                                Outputs: {totalOutputQty} sheets |
                                Wastage: {Number(wastageQty)} |
                                {yieldDiff > 0
                                    ? <span className="text-warning"> Unaccounted: {yieldDiff} sheets</span>
                                    : yieldDiff < 0
                                        ? <span className="text-error"> Over-allocated: {Math.abs(yieldDiff)} sheets</span>
                                        : <span className="text-success"> Balanced</span>
                                }
                            </div>
                        </div>
                    )}

                    <div className="span-2">
                        <label className="label">Notes</label>
                        <textarea className="input-field" rows="2" maxLength={255}
                            placeholder="Cutting notes..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)} />
                    </div>

                    <div className="divider" />

                    <div className="row items-center gap-md">
                        <input type="checkbox" id="transferAfterCut"
                            checked={transferAfterCut}
                            onChange={e => setTransferAfterCut(e.target.checked)} />
                        <label htmlFor="transferAfterCut" className="label" style={{ margin: 0, cursor: 'pointer' }}>
                            <Truck size={14} className="inline" /> Transfer outputs to another branch immediately
                        </label>
                    </div>

                    {transferAfterCut && (
                        <div>
                            <label className="label">Destination Branch *</label>
                            <select className="input-field" required
                                value={transferBranchId}
                                onChange={e => setTransferBranchId(e.target.value)}>
                                <option value="">-- Select Destination --</option>
                                {branches.filter(b => Number(b.id) !== Number(branchId)).map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="row justify-end mt-lg">
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        <button type="submit" className="btn btn-primary"
                            disabled={loading || isInsufficient || !sourceQty || outputs.some(o => !o.output_size_id || !o.output_qty_sheets)}>
                            {loading ? <RefreshCcw className="animate-spin" size={18} /> : <Scissors size={18} />}
                            {transferAfterCut ? 'Cut & Transfer' : 'Execute Cut'}
                        </button>
                    </div>
                </div>
            </form>
        </PageContainer>
    );
};

export default CutTransfer;
