import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import { Image as ImageIcon, Upload, Download, Search, FileText, Link as LinkIcon, Plus, X } from 'lucide-react';

const ProductLibrary = () => {
    useSEO('Product Library');
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [formData, setFormData] = useState({
        asset_name: '',
        drive_link: '',
        editable_source_url: '',
        tags: '',
        preview: null,
        final_pdf: null
    });

    const { data: assets, isLoading } = useQuery({
        queryKey: ['designer_assets'],
        queryFn: async () => {
            const res = await api.get('/design-workspace/assets');
            return res.data;
        }
    });

    const uploadMutation = useMutation({
        mutationFn: async (data) => {
            const formDataObj = new FormData();
            formDataObj.append('asset_name', data.asset_name);
            formDataObj.append('drive_link', data.drive_link);
            formDataObj.append('editable_source_url', data.editable_source_url);
            
            const tagsArray = data.tags.split(',').map(t => t.trim()).filter(Boolean);
            formDataObj.append('tags', JSON.stringify(tagsArray));
            
            if (data.preview) formDataObj.append('preview', data.preview);
            if (data.final_pdf) formDataObj.append('final_pdf', data.final_pdf);
            
            return api.post('/design-workspace/assets', formDataObj, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
        },
        onSuccess: () => {
            toast.success('Asset uploaded successfully');
            queryClient.invalidateQueries(['designer_assets']);
            setShowUpload(false);
            setFormData({ asset_name: '', drive_link: '', editable_source_url: '', tags: '', preview: null, final_pdf: null });
        },
        onError: () => toast.error('Failed to upload asset')
    });

    const handleUpload = (e) => {
        e.preventDefault();
        uploadMutation.mutate(formData);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Link copied to clipboard');
    };

    const filteredAssets = assets?.filter(a => 
        a.asset_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.tags && Array.isArray(a.tags) && a.tags.some(t => typeof t === 'string' && t.toLowerCase().includes(searchTerm.toLowerCase())))
    ) || [];

    return (
        <div className="container-lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="section-title">Product Library</h1>
                    <p className="section-subtitle">Manage reusable design assets and templates.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="input-group" style={{ width: '250px' }}>
                        <Search className="input-icon" size={18} />
                        <input 
                            type="text" 
                            className="input-field input-field--icon" 
                            placeholder="Search assets or tags..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {!showUpload && (
                        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
                            <Upload size={18} />
                            Upload Asset
                        </button>
                    )}
                </div>
            </div>

            {showUpload && (
                <div className="card mb-24" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <h2 className="section-title" style={{ margin: 0 }}>Upload New Asset</h2>
                        <button className="btn-icon" onClick={() => setShowUpload(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleUpload} className="grid grid-2" style={{ gap: '20px' }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="label">Asset Name / Title</label>
                            <input 
                                type="text" 
                                className="input-field"
                                value={formData.asset_name}
                                onChange={e => setFormData({...formData, asset_name: e.target.value})}
                                placeholder="e.g. Corporate Brochure Template"
                                required
                            />
                        </div>

                        <div>
                            <label className="label">Preview Image (JPG/PNG)</label>
                            <input 
                                type="file" 
                                className="input-field"
                                onChange={e => setFormData({...formData, preview: e.target.files[0]})}
                                accept=".jpg,.jpeg,.png,.webp"
                            />
                        </div>

                        <div>
                            <label className="label">Final Print PDF (Optional)</label>
                            <input 
                                type="file" 
                                className="input-field"
                                onChange={e => setFormData({...formData, final_pdf: e.target.files[0]})}
                                accept=".pdf"
                            />
                        </div>

                        <div>
                            <label className="label">Google Drive / Cloud Link (Source Files)</label>
                            <input 
                                type="url" 
                                className="input-field"
                                value={formData.drive_link}
                                onChange={e => setFormData({...formData, drive_link: e.target.value})}
                                placeholder="https://drive.google.com/..."
                            />
                        </div>

                        <div>
                            <label className="label">Tags (comma separated)</label>
                            <input 
                                type="text" 
                                className="input-field"
                                value={formData.tags}
                                onChange={e => setFormData({...formData, tags: e.target.value})}
                                placeholder="brochure, corporate, template"
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" className="btn btn-outline" onClick={() => setShowUpload(false)}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={uploadMutation.isLoading}>
                                {uploadMutation.isLoading ? 'Uploading...' : 'Upload Asset'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Loading library...</div>
            ) : filteredAssets.length === 0 ? (
                <div className="empty-state">
                    <ImageIcon size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
                    <h3>No assets found</h3>
                    <p>Try adjusting your search or upload a new asset.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {filteredAssets.map(asset => (
                        <div key={asset.id} className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ height: '180px', backgroundColor: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                {asset.preview_url ? (
                                    <img src={`/${asset.preview_url}`} alt={asset.asset_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <ImageIcon size={40} color="var(--text-muted)" />
                                )}
                                <div style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>
                                    v{asset.version}
                                </div>
                            </div>
                            
                            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600' }}>{asset.asset_name}</h3>
                                <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>Uploaded by {asset.uploaded_by_name}</p>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                                    {Array.isArray(asset.tags) && asset.tags.map((tag, i) => (
                                        <span key={i} style={{ padding: '2px 8px', backgroundColor: 'var(--surface-3)', borderRadius: '4px', fontSize: '11px' }}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                                    {asset.drive_link && (
                                        <button 
                                            className="btn btn-outline btn-sm" 
                                            style={{ flex: 1 }}
                                            onClick={() => window.open(asset.drive_link, '_blank')}
                                            title="Open Drive Link"
                                        >
                                            <LinkIcon size={14} /> Drive
                                        </button>
                                    )}
                                    {asset.final_pdf_url && (
                                        <button 
                                            className="btn btn-outline btn-sm"
                                            style={{ flex: 1 }}
                                            onClick={() => window.open(`/${asset.final_pdf_url}`, '_blank')}
                                            title="Download PDF"
                                        >
                                            <FileText size={14} /> PDF
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ProductLibrary;
