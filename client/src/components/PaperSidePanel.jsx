import React, { useEffect, useState } from 'react';
import { X, Package, Minus, Plus } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const PaperSidePanel = React.memo(function PaperSidePanel({ open, onClose }) {
    const [loading, setLoading] = useState(false);
    const [papers, setPapers] = useState([]);
    const [filter, setFilter] = useState('all'); // all | category name
    const [categories, setCategories] = useState([]);
    const [mappings, setMappings] = useState([]);
    const [mapForm, setMapForm] = useState({ parent_inventory_item_id: '', child_size_code: '', pieces_per_parent: 2, loss_pct: 0, min_waste: 0 });
    const [paperTypes, setPaperTypes] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedPaperType, setSelectedPaperType] = useState('');

    useEffect(() => {
        if (!open) return;
        fetchPapers();
        fetchPaperTypes();
        // eslint-disable-next-line
    }, [open, filter]);

    const fetchPapers = async () => {
        setLoading(true);
        try {
            // Fetch a reasonable slice of inventory and derive paper categories from it
            const res = await api.get('/inventory', { params: { limit: 1000 } });
            const all = (res.data && Array.isArray(res.data.data)) ? res.data.data : [];

            // Heuristic: treat items as paper candidates if category/name/size hints exist
            const candidates = all.filter(i => {
                const cat = String(i.category || '').toLowerCase();
                const name = String(i.name || '').toLowerCase();
                const hasSize = !!(i.size_code || i.model_name);
                return (
                    cat && /paper|laser|offset|copy|sheet|slab|card/.test(cat)
                    || name && /paper|copy|slab|a4|a3|gsm|card|art /.test(name)
                    || hasSize
                );
            });

            // Derive unique categories for the UI
            const cats = Array.from(new Set(candidates.map(p => p.category).filter(Boolean))).sort();
            setCategories(cats);

            let list = candidates;
            if (filter && filter !== 'all') {
                // Allow selecting built-in keywords like 'laser'/'offset' or explicit category names
                const key = String(filter).toLowerCase();
                list = list.filter(i => (i.category || '').toLowerCase().includes(key) || (i.name || '').toLowerCase().includes(key));
            }

            // Sort by category then by size_code or name
            list.sort((a, b) => (String(a.category || '')).localeCompare(String(b.category || '')) || String(a.size_code || a.name || '').localeCompare(String(b.size_code || b.name || '')));
            setPapers(list);
            // also fetch mappings when paper list is ready
            fetchCutMaps();
            // keep paper types in sync
            // (fetchPaperTypes also called on open)
        } catch (err) {
            console.error(err);
            toast.error('Failed to load paper inventory');
        } finally {
            setLoading(false);
        }
    };

    const fetchPaperTypes = async () => {
        try {
            const res = await api.get('/inventory/paper-types');
            setPaperTypes(res.data?.types || res.data || []);
        } catch (e) {
            setPaperTypes([]);
        }
    };

    const fetchCutMaps = async () => {
        try {
            const res = await api.get('/inventory/paper-cut-maps');
            setMappings(res.data || []);
        } catch (err) {
            // ignore if table/endpoint missing
            setMappings([]);
        }
    };

    const saveMapping = async () => {
        const body = {
            parent_inventory_item_id: Number(mapForm.parent_inventory_item_id) || null,
            child_size_code: String(mapForm.child_size_code || '').trim(),
            pieces_per_parent: Number(mapForm.pieces_per_parent) || 1,
            loss_pct: Number(mapForm.loss_pct) || 0,
            min_waste: Number(mapForm.min_waste) || 0,
            notes: ''
        };
        if (!body.parent_inventory_item_id || !body.child_size_code) return toast.error('Select parent and provide child size');
        try {
            await api.post('/inventory/paper-cut-maps', body);
            toast.success('Mapping saved');
            setMapForm({ parent_inventory_item_id: '', child_size_code: '', pieces_per_parent: 2, loss_pct: 0, min_waste: 0 });
            fetchCutMaps();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save mapping');
        }
    };

    const deleteMapping = async (id) => {
        if (!window.confirm('Delete this cut mapping?')) return;
        try {
            await api.delete(`/inventory/paper-cut-maps/${id}`);
            toast.success('Deleted');
            fetchCutMaps();
        } catch (err) {
            toast.error('Failed to delete mapping');
        }
    };

    const [manualConsume, setManualConsume] = useState({ jobId: '', mode: 'parent', parent_inventory_item_id: '', inventory_item_id: '', paper_size: '', required_sheets: 0 });

    const executeConsume = async () => {
        const jobId = manualConsume.jobId;
        if (!jobId) return toast.error('Enter Job ID');
        const required = Number(manualConsume.required_sheets) || 0;
        if (required <= 0) return toast.error('Enter required sheets');

        const item = {};
        if (manualConsume.mode === 'parent') {
            if (!manualConsume.parent_inventory_item_id) return toast.error('Select parent inventory item');
            item.parent_inventory_item_id = Number(manualConsume.parent_inventory_item_id);
            item.paper_size = manualConsume.paper_size || '';
            item.required_sheets = required;
        } else {
            if (!manualConsume.inventory_item_id) return toast.error('Select inventory item');
            item.inventory_item_id = Number(manualConsume.inventory_item_id);
            item.paper_size = manualConsume.paper_size || '';
            item.required_sheets = required;
        }

        try {
            // include paper category where available to help server choose mappings/parents
            if (manualConsume.mode === 'parent' && manualConsume.parent_inventory_item_id) {
                const parent = papers.find(p => String(p.id) === String(manualConsume.parent_inventory_item_id));
                if (parent) item.paper_category = parent.category || null;
            }
            if (manualConsume.mode === 'direct' && manualConsume.inventory_item_id) {
                const inv = papers.find(p => String(p.id) === String(manualConsume.inventory_item_id));
                if (inv) item.paper_category = inv.category || null;
            }

            const res = await api.post(`/jobs/${jobId}/consume-paper`, { items: [item], stage: 'manual-panel', notes: 'Manual consume from panel' });
            toast.success('Consume request completed');
            console.log('Consume result', res.data);
            fetchPapers();
            fetchCutMaps();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Consume failed');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const cur = Array.isArray(prev) ? [...prev] : [];
            const idx = cur.indexOf(id);
            if (idx === -1) cur.push(id); else cur.splice(idx, 1);
            return cur;
        });
    };

    const mapSelectedToType = async () => {
        if (!selectedIds || selectedIds.length === 0) return toast.error('Select at least one item');
        if (!selectedPaperType) return toast.error('Select a paper type');
        try {
            await api.post('/inventory/paper-map', { inventory_ids: selectedIds, paper_type: selectedPaperType });
            toast.success('Mapped successfully');
            setSelectedIds([]);
            fetchPapers();
            fetchCutMaps();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Mapping failed');
        }
    };

    const handleConsume = async (item, qty) => {
        const qtyN = Number(qty || 0);
        if (!qtyN || qtyN <= 0) return toast.error('Enter a valid quantity');
        try {
            await api.post(`/inventory/${item.id}/consume`, { quantity_consumed: qtyN, notes: `Paper panel manual consume` });
            toast.success('Stock updated');
            fetchPapers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to consume stock');
        }
    };

    if (!open) return null;

    return (
        <div className="modal-backdrop" onClick={() => onClose && onClose()}>
            <div className="em-modal" style={{ width: 420, height: '100vh', right: 0, position: 'fixed', top: 0, margin: 0, borderRadius: 0 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Package size={18} />
                        <strong>Paper Management</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6 }}>
                            <option value="all">All</option>
                            <option value="laser">Laser</option>
                            <option value="offset">Offset</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onClose && onClose()}><X size={16} /></button>
                    </div>
                </div>

                <div style={{ padding: 12, overflowY: 'auto', height: 'calc(100% - 56px)' }}>
                    {loading ? (
                        <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>
                    ) : papers.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center' }}>No paper items found in inventory.</div>
                    ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {papers.map((p) => (
                                <div key={p.id} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', width: 28 }}>
                                        <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.category || ''} · Size: {p.size_code || p.model_name || '—'}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', marginRight: 8 }}>
                                        <div style={{ fontWeight: 800 }}>Qty: {Number(p.quantity || 0)}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-ghost btn-sm" title="Consume 1" onClick={() => handleConsume(p, 1)}><Minus size={14} /></button>
                                            <button className="btn btn-ghost btn-sm" title="Consume 5" onClick={() => handleConsume(p, 5)}><Minus size={14} /></button>
                                            <button className="btn btn-ghost btn-sm" title="Consume custom" onClick={() => {
                                                const v = window.prompt('Sheets to consume', '1'); if (v !== null) handleConsume(p, Number(v));
                                            }}><Plus size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Cut mappings management */}
                    <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <strong>Cut Mappings</strong>
                            <small className="muted">Map parent sheets → child sizes</small>
                        </div>

                        <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <select value={mapForm.parent_inventory_item_id} onChange={e => setMapForm(prev => ({ ...prev, parent_inventory_item_id: e.target.value }))} style={{ flex: 1 }}>
                                    <option value="">Select parent sheet</option>
                                    {papers.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} · {p.size_code || p.model_name}</option>
                                    ))}
                                </select>
                                <input placeholder="Child size code" value={mapForm.child_size_code} onChange={e => setMapForm(prev => ({ ...prev, child_size_code: e.target.value }))} style={{ width: 120 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input type="number" min={1} placeholder="Pieces per parent" value={mapForm.pieces_per_parent} onChange={e => setMapForm(prev => ({ ...prev, pieces_per_parent: e.target.value }))} style={{ width: 140 }} />
                                <input type="number" step="0.1" placeholder="Loss %" value={mapForm.loss_pct} onChange={e => setMapForm(prev => ({ ...prev, loss_pct: e.target.value }))} style={{ width: 120 }} />
                                <input type="number" placeholder="Min waste" value={mapForm.min_waste} onChange={e => setMapForm(prev => ({ ...prev, min_waste: e.target.value }))} style={{ width: 120 }} />
                                <button className="btn btn-primary" onClick={saveMapping}>Save</button>
                            </div>

                            <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 6 }}>
                                {mappings.length === 0 ? (
                                    <div className="muted text-xs">No mappings configured.</div>
                                ) : (
                                    mappings.map(m => (
                                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}>
                                            <div style={{ fontSize: 13 }}>
                                                <div style={{ fontWeight: 700 }}>{m.parent_name || m.parent_inventory_item_id} → {m.child_size_code}</div>
                                                <div className="muted text-xs">Pieces/parent: {m.pieces_per_parent} · Loss%: {m.loss_pct}% · Min waste: {m.min_waste}</div>
                                            </div>
                                            <div>
                                                <button className="btn btn-ghost btn-sm btn-danger" onClick={() => deleteMapping(m.id)}>Delete</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Manual consume for job */}
                    <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <strong>Manual Consume</strong>
                            <small className="muted">Call consume endpoint for a job</small>
                        </div>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input placeholder="Job ID" value={manualConsume.jobId} onChange={e => setManualConsume(prev => ({ ...prev, jobId: e.target.value }))} style={{ width: 100 }} />
                                <select value={manualConsume.mode} onChange={e => setManualConsume(prev => ({ ...prev, mode: e.target.value }))}>
                                    <option value="parent">Cut from Parent</option>
                                    <option value="direct">Direct Inventory</option>
                                </select>
                                <input placeholder="Paper size (child)" value={manualConsume.paper_size} onChange={e => setManualConsume(prev => ({ ...prev, paper_size: e.target.value }))} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {manualConsume.mode === 'parent' ? (
                                    <select value={manualConsume.parent_inventory_item_id} onChange={e => setManualConsume(prev => ({ ...prev, parent_inventory_item_id: e.target.value }))} style={{ flex: 1 }}>
                                        <option value="">Select parent</option>
                                        {papers.map(p => <option key={p.id} value={p.id}>{p.name} · {p.size_code || p.model_name}</option>)}
                                    </select>
                                ) : (
                                    <select value={manualConsume.inventory_item_id} onChange={e => setManualConsume(prev => ({ ...prev, inventory_item_id: e.target.value }))} style={{ flex: 1 }}>
                                        <option value="">Select inventory item</option>
                                        {papers.map(p => <option key={p.id} value={p.id}>{p.name} · {p.size_code || p.model_name}</option>)}
                                    </select>
                                )}
                                <input type="number" min={1} placeholder="Required sheets" value={manualConsume.required_sheets} onChange={e => setManualConsume(prev => ({ ...prev, required_sheets: e.target.value }))} style={{ width: 130 }} />
                                <button className="btn btn-primary" onClick={executeConsume}>Consume</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default PaperSidePanel;
