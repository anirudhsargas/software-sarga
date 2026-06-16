import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import { BookOpen, Plus, X, Search } from 'lucide-react';

const BlockJournal = () => {
    useSEO('Block Journal');
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        block_number: '',
        customer_id: '',
        block_type: 'Physical',
        location: '',
        remarks: ''
    });

    const { data: blocks, isLoading } = useQuery({
        queryKey: ['designer_blocks'],
        queryFn: async () => {
            const res = await api.get('/design-workspace/blocks');
            return res.data;
        }
    });

    const { data: customers } = useQuery({
        queryKey: ['customers_list'],
        queryFn: async () => {
            const res = await api.get('/customers');
            return res.data;
        }
    });

    const addMutation = useMutation({
        mutationFn: async (data) => api.post('/design-workspace/blocks', data),
        onSuccess: () => {
            toast.success('Block registered');
            queryClient.invalidateQueries(['designer_blocks']);
            setShowForm(false);
            setFormData({ block_number: '', customer_id: '', block_type: 'Physical', location: '', remarks: '' });
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to register block')
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        addMutation.mutate(formData);
    };

    const filteredBlocks = blocks?.filter(b => 
        b.block_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
        <div className="container-lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="section-title">Block Journal</h1>
                    <p className="section-subtitle">Track physical and digital printing blocks.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="input-group" style={{ width: '250px' }}>
                        <Search className="input-icon" size={18} />
                        <input 
                            type="text" 
                            className="input-field input-field--icon" 
                            placeholder="Search block or customer..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {!showForm && (
                        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                            <Plus size={18} />
                            Register Block
                        </button>
                    )}
                </div>
            </div>

            {showForm && (
                <div className="card mb-24" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <h2 className="section-title" style={{ margin: 0 }}>Register New Block</h2>
                        <button className="btn-icon" onClick={() => setShowForm(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="grid grid-2" style={{ gap: '20px' }}>
                        <div>
                            <label className="label">Block Number</label>
                            <input 
                                type="text" 
                                className="input-field"
                                value={formData.block_number}
                                onChange={e => setFormData({...formData, block_number: e.target.value})}
                                placeholder="e.g. BLK-2026-001"
                                required
                            />
                        </div>

                        <div>
                            <label className="label">Customer</label>
                            <select 
                                className="input-field"
                                value={formData.customer_id}
                                onChange={e => setFormData({...formData, customer_id: e.target.value})}
                                required
                            >
                                <option value="">Select Customer</option>
                                {customers?.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.company_name})</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="label">Block Type</label>
                            <select 
                                className="input-field"
                                value={formData.block_type}
                                onChange={e => setFormData({...formData, block_type: e.target.value})}
                                required
                            >
                                <option value="Physical">Physical (Rubber/Polymer)</option>
                                <option value="Digital">Digital (PDF/Vector)</option>
                                <option value="Screen">Screen Print Mesh</option>
                            </select>
                        </div>

                        <div>
                            <label className="label">Storage Location</label>
                            <input 
                                type="text" 
                                className="input-field"
                                value={formData.location}
                                onChange={e => setFormData({...formData, location: e.target.value})}
                                placeholder="e.g. Rack A, Shelf 3"
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="label">Remarks</label>
                            <textarea 
                                className="input-field"
                                value={formData.remarks}
                                onChange={e => setFormData({...formData, remarks: e.target.value})}
                                rows="2"
                                placeholder="Any condition notes or specifics"
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={addMutation.isLoading}>
                                {addMutation.isLoading ? 'Saving...' : 'Register Block'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Block #</th>
                                <th>Customer</th>
                                <th>Type</th>
                                <th>Location</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="7" className="text-center py-4">Loading blocks...</td></tr>
                            ) : filteredBlocks.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-8 text-muted">
                                        <BookOpen size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                                        No blocks registered yet.
                                    </td>
                                </tr>
                            ) : (
                                filteredBlocks.map(b => (
                                    <tr key={b.id}>
                                        <td style={{ fontWeight: '600' }}>{b.block_number}</td>
                                        <td>
                                            <div>{b.customer_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.company_name}</div>
                                        </td>
                                        <td>{b.block_type}</td>
                                        <td>{b.location || '-'}</td>
                                        <td>
                                            <span style={{ 
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                                                backgroundColor: b.reuse_status === 'New' ? 'rgba(59,130,246,0.1)' : 
                                                               b.reuse_status === 'Reused' ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                                                color: b.reuse_status === 'New' ? '#3b82f6' : 
                                                       b.reuse_status === 'Reused' ? '#10b981' : '#6b7280'
                                            }}>
                                                {b.reuse_status}
                                            </span>
                                        </td>
                                        <td>{new Date(b.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <button className="btn btn-outline btn-sm">Edit</button>
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

export default BlockJournal;
