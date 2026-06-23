import React, { useState, useRef } from 'react';
import { Upload, RefreshCw, Trash2, Camera, Loader2 } from 'lucide-react';
import SecureImage from './SecureImage';
import { getCategoryIcon } from '../utils/categoryIcons';
import api, { imgUrl } from '../services/api';
import toast from 'react-hot-toast';

const InventoryImage = ({ item, onUpdate, size = 40, isAdmin = false }) => {
    const [loading, setLoading] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const fileInputRef = useRef(null);

    // Resolution Logic
    let displayUrl = null;
    let source = item.image_source || 'Default';

    if (item.cached_image_url) {
        displayUrl = imgUrl(item.cached_image_url);
    } else if (item.product_image_url || item.image_url) {
        displayUrl = imgUrl(item.product_image_url || item.image_url);
        source = 'Product';
    }

    const handleUploadClick = (e) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await api.post(`/inventory/${item.id}/image`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Image uploaded and locked');
            if (onUpdate) onUpdate(item.id, res.data.image_url, 'Uploaded');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to upload image');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRegenerate = async (e) => {
        e.stopPropagation();
        setLoading(true);
        try {
            const res = await api.post(`/inventory/${item.id}/regenerate-image`);
            toast.success('Image regenerated');
            if (onUpdate) onUpdate(item.id, res.data.image_url, 'Generated');
        } catch (err) {
            toast.error(err.response?.data?.message || 'No better match found');
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async (e) => {
        e.stopPropagation();
        setLoading(true);
        try {
            await api.delete(`/inventory/${item.id}/image`);
            toast.success('Custom image removed');
            if (onUpdate) onUpdate(item.id, null, 'Default');
        } catch (err) {
            toast.error('Failed to remove image');
        } finally {
            setLoading(false);
        }
    };

    const isFallback = !displayUrl;

    return (
        <div 
            className="inv-image-container"
            style={{ 
                width: size, 
                height: size, 
                borderRadius: 8, 
                overflow: 'hidden', 
                position: 'relative',
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '1px solid var(--border)'
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* The Image or Fallback */}
            {loading ? (
                <Loader2 className="animate-spin" size={size * 0.5} color="var(--text-muted)" />
            ) : displayUrl ? (
                <SecureImage 
                    src={displayUrl} 
                    alt={item.name} 
                    loading="lazy" 
                    decoding="async" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
            ) : (
                <div style={{ color: 'var(--text-muted)' }}>
                    {getCategoryIcon(item.category || item.product_subcategory_name, size * 0.5)}
                </div>
            )}

            {/* Hidden File Input */}
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept="image/*" 
                onChange={handleFileChange} 
            />

            {/* Hover Overlay */}
            {isAdmin && isHovered && !loading && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: size > 60 ? 'row' : 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: size > 60 ? 8 : 4,
                    zIndex: 10
                }}>
                    <button 
                        type="button"
                        onClick={handleUploadClick}
                        title="Upload/Change Image"
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}
                    >
                        <Upload size={size > 60 ? 16 : 12} />
                    </button>
                    
                    <button 
                        type="button"
                        onClick={handleRegenerate}
                        title="Auto-Regenerate"
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}
                    >
                        <RefreshCw size={size > 60 ? 16 : 12} />
                    </button>
                    
                    {!isFallback && (
                        <button 
                            type="button"
                            onClick={handleRemove}
                            title="Remove Image"
                            style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 4 }}
                        >
                            <Trash2 size={size > 60 ? 16 : 12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(InventoryImage);
