import React, { useState, useCallback } from 'react';
import {
    Plus, Copy, Trash2, Move, ArrowLeft, Download, Image,
    Upload, FileText, FolderOpen, ChevronLeft, ChevronRight,
    Grid, ZoomIn, ZoomOut, Settings, FileDown
} from 'lucide-react';
import './AlbumDesigner.css';
import PageContainer from '../../components/ui/PageContainer';

const AlbumDesigner = () => {
    const [pages, setPages] = useState([
        { id: 1, photos: [], layout: '1' },
    ]);
    const [currentPage, setCurrentPage] = useState(1);
    const [photosPerPage, setPhotosPerPage] = useState('1');
    const [photos, setPhotos] = useState([]);
    const [showSettings, setShowSettings] = useState(false);

    const totalPages = pages.length;

    const handleAddPage = useCallback(() => {
        const newId = Date.now();
        setPages(prev => [...prev, {
            id: newId,
            photos: [],
            layout: photosPerPage === 'auto' ? '1' : photosPerPage,
        }]);
        setCurrentPage(newId);
    }, [photosPerPage]);

    const handleDuplicatePage = useCallback((pageId) => {
        setPages(prev => {
            const source = prev.find(p => p.id === pageId);
            if (!source) return prev;
            const newPage = { ...source, id: Date.now(), photos: [...source.photos] };
            const idx = prev.findIndex(p => p.id === pageId);
            return [...prev.slice(0, idx + 1), newPage, ...prev.slice(idx + 1)];
        });
    }, []);

    const handleDeletePage = useCallback((pageId) => {
        if (pages.length <= 1) return;
        setPages(prev => {
            const filtered = prev.filter(p => p.id !== pageId);
            if (currentPage === pageId) setCurrentPage(filtered[filtered.length - 1].id);
            return filtered;
        });
    }, [pages.length, currentPage]);

    const handleMovePage = useCallback((pageId, direction) => {
        setPages(prev => {
            const idx = prev.findIndex(p => p.id === pageId);
            if (idx === -1) return prev;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const result = [...prev];
            [result[idx], result[newIdx]] = [result[newIdx], result[idx]];
            return result;
        });
    }, []);

    const handleBulkUpload = () => {
        const mockPhotos = Array.from({ length: 12 }, (_, i) => ({
            id: Date.now() + i,
            name: `Photo_${i + 1}.jpg`,
            url: null,
        }));
        setPhotos(prev => [...prev, ...mockPhotos]);
        autoLayout(mockPhotos);
    };

    const autoLayout = (newPhotos) => {
        const perPage = parseInt(photosPerPage) || 1;
        let photoIdx = 0;
        setPages(prev => {
            const updated = [...prev];
            let current = updated[updated.length - 1];

            while (photoIdx < newPhotos.length) {
                if (current.photos.length >= perPage) {
                    current = { id: Date.now() + photoIdx, photos: [], layout: String(perPage) };
                    updated.push(current);
                }
                current.photos.push(newPhotos[photoIdx].id);
                photoIdx++;
            }
            return updated;
        });
    };

    const currentPageData = pages.find(p => p.id === currentPage) || pages[0];

    return (
        <PageContainer>
            <header className="albm-header">
                <div className="albm-header-left">
                    <button className="dse-tb-btn" onClick={() => window.history.back()}><ArrowLeft size={18} /></button>
                    <div>
                        <h2>Album Designer</h2>
                        <span className="albm-subtitle">12 × 18 inch · 300 DPI</span>
                    </div>
                </div>
                <div className="albm-header-center">
                    <span className="albm-page-info">Page {pages.findIndex(p => p.id === currentPage) + 1} of {totalPages}</span>
                    <div className="albm-nav">
                        <button className="dse-tb-btn" onClick={() => {
                            const idx = pages.findIndex(p => p.id === currentPage);
                            if (idx > 0) setCurrentPage(pages[idx - 1].id);
                        }}><ChevronLeft size={16} /></button>
                        <button className="dse-tb-btn" onClick={() => {
                            const idx = pages.findIndex(p => p.id === currentPage);
                            if (idx < pages.length - 1) setCurrentPage(pages[idx + 1].id);
                        }}><ChevronRight size={16} /></button>
                    </div>
                </div>
                <div className="albm-header-right">
                    <button className="ds-btn ds-btn-primary" onClick={handleAddPage}>
                        <Plus size={16} /> Add Page
                    </button>
                    <button className="ds-btn"><Download size={16} /> Export</button>
                    <button className="dse-tb-btn" onClick={() => setShowSettings(!showSettings)}>
                        <Settings size={18} />
                    </button>
                </div>
            </header>

            <div className="albm-body">
                <div className="albm-main">
                    <div className="albm-canvas">
                        <div className="albm-page">
                            <div className="albm-page-grid">
                                {Array.from({ length: parseInt(currentPageData?.layout) || 1 }).map((_, i) => (
                                    <div key={i} className="albm-photo-slot">
                                        {currentPageData?.photos[i] ? (
                                            <div className="albm-photo-filled">
                                                <Image size={32} />
                                                <div className="albm-photo-actions">
                                                    <button className="dse-tb-btn" title="Replace"><Image size={14} /></button>
                                                    <button className="dse-tb-btn" title="Crop"><ZoomIn size={14} /></button>
                                                    <button className="dse-tb-btn" title="Swap"><Move size={14} /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="albm-photo-empty">
                                                <Image size={24} strokeWidth={1} />
                                                <span>Drop photo here</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="albm-sidebar">
                    <div className="albm-sidebar-section">
                        <h4>Photos</h4>
                        <div className="albm-sidebar-actions">
                            <button className="ds-btn" onClick={handleBulkUpload}>
                                <Upload size={14} /> Upload Folder
                            </button>
                            <button className="ds-btn">
                                <FolderOpen size={14} /> Upload ZIP
                            </button>
                        </div>
                        <div className="albm-photo-strip">
                            {photos.map(photo => (
                                <div key={photo.id} className="albm-photo-thumb" draggable>
                                    <Image size={20} />
                                </div>
                            ))}
                            {photos.length === 0 && (
                                <p className="albm-hint">No photos uploaded yet</p>
                            )}
                        </div>
                    </div>

                    <div className="albm-sidebar-section">
                        <h4>Layout</h4>
                        <label className="albm-label">Photos per page</label>
                        <div className="albm-layout-options">
                            {['1', '2', '3', '4', 'auto'].map(opt => (
                                <button
                                    key={opt}
                                    className={`albm-layout-btn ${photosPerPage === opt ? 'active' : ''}`}
                                    onClick={() => setPhotosPerPage(opt)}
                                >
                                    {opt === 'auto' ? <Grid size={14} /> : opt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="albm-sidebar-section">
                        <h4>Pages ({totalPages})</h4>
                        <div className="albm-page-list">
                            {pages.map((page, idx) => (
                                <div
                                    key={page.id}
                                    className={`albm-page-item ${currentPage === page.id ? 'active' : ''}`}
                                    onClick={() => setCurrentPage(page.id)}
                                >
                                    <div className="albm-page-thumb">
                                        <Image size={16} />
                                        <span>{idx + 1}</span>
                                    </div>
                                    <div className="albm-page-item-actions">
                                        <button className="dse-tb-btn" onClick={e => { e.stopPropagation(); handleDuplicatePage(page.id); }}
                                            title="Duplicate Page"><Copy size={12} /></button>
                                        <button className="dse-tb-btn" onClick={e => { e.stopPropagation(); handleMovePage(page.id, -1); }}
                                            title="Move Left" disabled={idx === 0}><ChevronLeft size={12} /></button>
                                        <button className="dse-tb-btn" onClick={e => { e.stopPropagation(); handleMovePage(page.id, 1); }}
                                            title="Move Right" disabled={idx === pages.length - 1}><ChevronRight size={12} /></button>
                                        <button className="dse-tb-btn" onClick={e => { e.stopPropagation(); handleDeletePage(page.id); }}
                                            title="Delete Page" disabled={pages.length <= 1}><Trash2 size={12} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="albm-sidebar-section">
                        <h4>Export</h4>
                        <button className="ds-btn ds-btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}>
                            <FileDown size={14} /> Export PDF
                        </button>
                        <button className="ds-btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}>
                            <Download size={14} /> Export JPG
                        </button>
                        <button className="ds-btn" style={{ width: '100%', justifyContent: 'center' }}>
                            <FolderOpen size={14} /> Export ZIP
                        </button>
                    </div>
                </aside>
            </div>
        </PageContainer>
    );
};

export default AlbumDesigner;
