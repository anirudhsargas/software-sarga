import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
    FileText, Download, X, Image as ImageIcon, Search,
    Package, Tag, Layers, Loader2, Eye, FileArchive,
    ChevronDown, ChevronUp, Sliders
} from 'lucide-react';
import {
    generateCataloguePDF,
    downloadCataloguePDF,
    downloadCompressedPDF,
    downloadPrintReadyPDF,
    downloadIndividualCardsZip,
} from '../utils/productCataloguePdf';

const FILTER_SECTIONS = {
    products: 'Product Selection',
    layout: 'Layout & Content',
    download: 'Download Options',
};

const CatalogueModal = ({ isOpen, onClose, hierarchy = [], selectedIds = [] }) => {
    const [activeFilters, setActiveFilters] = useState({
        category: 'all',
        brand: 'all',
        search: '',
        activeOnly: true,
        priceMin: '',
        priceMax: '',
        selectionMode: 'all',
    });

    const [options, setOptions] = useState({
        showImages: true,
        showDescription: true,
        showRetailPrice: true,
        showOffsetPrice: true,
        showProductCode: true,
        showCategory: true,
        showStock: true,
        showHeader: true,
        showFooter: true,
        orientation: 'portrait',
        margins: 'normal',
    });

    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(null);
    const [cancelled, setCancelled] = useState(false);
    const [expandedSection, setExpandedSection] = useState('products');
    const [expandedLayout, setExpandedLayout] = useState(false);
    const generateRef = useRef(null);

    const abortControllerRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setGenerating(false);
            setProgress(null);
            setCancelled(false);
        }
    }, [isOpen]);

    const allProducts = useMemo(() => {
        const products = [];
        hierarchy.forEach(cat => {
            (cat.subcategories || []).forEach(sub => {
                (sub.products || []).forEach(p => {
                    products.push({
                        ...p,
                        category_name: cat.name,
                        category_id: cat.id,
                        subcategory_name: sub.name,
                    });
                });
            });
        });
        return products;
    }, [hierarchy]);

    const categoryOptions = useMemo(() => {
        const cats = {};
        hierarchy.forEach(c => { cats[c.name] = c.id; });
        return Object.entries(cats).sort((a, b) => a[0].localeCompare(b[0]));
    }, [hierarchy]);

    const brandOptions = useMemo(() => {
        const brands = new Set();
        allProducts.forEach(p => {
            if (p.company_name) brands.add(p.company_name);
        });
        return [...brands].sort();
    }, [allProducts]);

    const filteredProducts = useMemo(() => {
        let result = [...allProducts];

        if (activeFilters.selectionMode === 'selected') {
            result = result.filter(p => selectedIds.includes(p.id));
        }

        if (activeFilters.category !== 'all') {
            result = result.filter(p => String(p.category_id) === String(activeFilters.category));
        }

        if (activeFilters.brand !== 'all') {
            result = result.filter(p => p.company_name === activeFilters.brand);
        }

        if (activeFilters.search) {
            const q = activeFilters.search.toLowerCase().trim();
            result = result.filter(p =>
                (p.name || '').toLowerCase().includes(q) ||
                (p.product_code || '').toLowerCase().includes(q)
            );
        }

        if (activeFilters.activeOnly) {
            result = result.filter(p => p.is_active === 1 || p.is_active === true);
        }

        if (activeFilters.priceMin) {
            const min = Number(activeFilters.priceMin);
            result = result.filter(p => {
                const price = p.slabs?.[0]?.unit_rate || p.sell_price || 0;
                return Number(price) >= min;
            });
        }

        if (activeFilters.priceMax) {
            const max = Number(activeFilters.priceMax);
            result = result.filter(p => {
                const price = p.slabs?.[0]?.unit_rate || p.sell_price || 0;
                return Number(price) <= max;
            });
        }

        return result;
    }, [allProducts, activeFilters, selectedIds]);

    const estimatedPages = useMemo(() => {
        return Math.max(1, Math.ceil(filteredProducts.length / 20));
    }, [filteredProducts]);

    const getCompanyInfo = useCallback(async () => {
        try {
            const res = await api.get('/company-settings');
            return {
                name: res.data.company_name || 'SARGA',
                phone: res.data.phone || '',
                email: res.data.email || '',
                website: res.data.website || '',
                gst: res.data.gst_number || '',
                logo: res.data.logo || '',
            };
        } catch {
            return {
                name: 'SARGA',
                phone: '',
                email: '',
                website: '',
                gst: '',
                logo: '',
            };
        }
    }, []);

    const fetchCatalogueProducts = useCallback(async () => {
        const params = {};
        if (activeFilters.category !== 'all') params.category_id = activeFilters.category;
        if (activeFilters.brand !== 'all') params.brand = activeFilters.brand;
        if (activeFilters.search) params.search = activeFilters.search;
        if (activeFilters.selectionMode === 'selected' && selectedIds.length > 0) {
            params.ids = selectedIds.join(',');
        }
        params.active_only = activeFilters.activeOnly ? 'true' : 'false';
        if (activeFilters.priceMin) params.price_min = activeFilters.priceMin;
        if (activeFilters.priceMax) params.price_max = activeFilters.priceMax;
        const res = await api.get('/products/catalogue', { params });
        return res.data || [];
    }, [activeFilters, selectedIds]);

    const handleGenerate = async (type = 'pdf') => {
        if (filteredProducts.length === 0) {
            toast.error('No products match the selected filters');
            return;
        }

        setGenerating(true);
        setCancelled(false);
        setProgress({ step: 'starting', message: 'Fetching product data...', percent: 0 });

        abortControllerRef.current = new AbortController();

        try {
            setProgress({ step: 'fetching', message: 'Loading product details...', percent: 5 });
            const products = await fetchCatalogueProducts();

            if (cancelled) return;
            if (!products || products.length === 0) {
                toast.error('No products returned from server');
                setGenerating(false);
                setProgress(null);
                return;
            }

            const companyInfo = await getCompanyInfo();

            const pdfOptions = {
                showImages: options.showImages,
                showDescription: options.showDescription,
                showRetailPrice: options.showRetailPrice,
                showOffsetPrice: options.showOffsetPrice,
                showProductCode: options.showProductCode,
                showCategory: options.showCategory,
                showStock: options.showStock,
                showHeader: options.showHeader,
                showFooter: options.showFooter,
                orientation: options.orientation,
                onProgress: (p) => {
                    if (!cancelled) setProgress(p);
                },
                onPage: (current, total) => {
                    if (!cancelled) {
                        setProgress({
                            step: 'generating',
                            message: `Generating page ${current} of ${total}...`,
                            percent: 20 + (current / total) * 75,
                        });
                    }
                },
            };

            if (type === 'pdf') {
                await downloadCataloguePDF(products, companyInfo, pdfOptions);
            } else if (type === 'compressed') {
                await downloadCompressedPDF(products, companyInfo, pdfOptions);
            } else if (type === 'print') {
                await downloadPrintReadyPDF(products, companyInfo, pdfOptions);
            } else if (type === 'zip') {
                await downloadIndividualCardsZip(products, companyInfo, pdfOptions);
            }

            if (!cancelled) {
                toast.success('Catalogue downloaded successfully!');
                onClose();
            }
        } catch (err) {
            if (!cancelled) {
                toast.error(err?.message || 'Failed to generate catalogue');
                console.error('Catalogue generation error:', err);
            }
        } finally {
            if (!cancelled) {
                setGenerating(false);
                setProgress(null);
            }
        }
    };

    const handleCancel = () => {
        setCancelled(true);
        setGenerating(false);
        setProgress(null);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const resetFilters = () => {
        setActiveFilters({
            category: 'all',
            brand: 'all',
            search: '',
            activeOnly: true,
            priceMin: '',
            priceMax: '',
            selectionMode: 'all',
        });
    };

    const inputStyle = {
        width: '100%',
        padding: '6px 10px',
        fontSize: '13px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
        color: 'var(--text)',
        outline: 'none',
        height: '34px',
        boxSizing: 'border-box',
    };

    const selectStyle = { ...inputStyle, cursor: 'pointer' };
    const labelStyle = { fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '4px', display: 'block' };
    const toggleRowStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !generating) onClose(); }}>
            <div className="modal catalogue-modal" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose} aria-label="Close" disabled={generating}>&times;</button>

                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
                            background: 'var(--accent-light)', display: 'grid', placeItems: 'center'
                        }}>
                            <FileText size={18} style={{ color: 'var(--accent)' }} />
                        </div>
                        <div>
                            <h2 className="modal-title" style={{ margin: 0 }}>Generate Product Catalogue</h2>
                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                {filteredProducts.length} products selected &middot; ~{estimatedPages} page{estimatedPages !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="modal-body catalogue-modal-body">
                    <div className="catalogue-layout">
                        <div className="catalogue-left">
                            {generating && progress ? (
                                <div className="catalogue-progress">
                                    <div className="catalogue-progress-header">
                                        <Loader2 size={20} className="catalogue-spinner" />
                                        <span>{progress.message}</span>
                                    </div>
                                    <div className="catalogue-progress-bar-track">
                                        <div className="catalogue-progress-bar-fill" style={{ width: `${progress.percent}%` }} />
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {Math.round(progress.percent)}%
                                    </div>
                                    <button className="btn btn-ghost btn-sm" onClick={handleCancel} style={{ marginTop: '12px' }}>
                                        <X size={14} /> Cancel
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="catalogue-section-header" onClick={() => setExpandedSection(expandedSection === 'products' ? null : 'products')}>
                                        <Sliders size={14} />
                                        <span>Product Filters</span>
                                        {expandedSection === 'products' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                    {expandedSection === 'products' && (
                                        <div className="catalogue-section-content">
                                            <div style={{ marginBottom: '12px' }}>
                                                <label style={labelStyle}>Product Selection</label>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    {[
                                                        { value: 'all', label: 'All Products' },
                                                        { value: 'selected', label: `Selected (${selectedIds.length})` },
                                                    ].map(opt => (
                                                        <button
                                                            key={opt.value}
                                                            className={`btn btn-sm ${activeFilters.selectionMode === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                                                            onClick={() => setActiveFilters(f => ({ ...f, selectionMode: opt.value }))}
                                                            disabled={opt.value === 'selected' && selectedIds.length === 0}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                                <div>
                                                    <label style={labelStyle}>Category</label>
                                                    <select style={selectStyle} value={activeFilters.category} onChange={(e) => setActiveFilters(f => ({ ...f, category: e.target.value }))}>
                                                        <option value="all">All Categories</option>
                                                        {categoryOptions.map(([name, id]) => (
                                                            <option key={id} value={id}>{name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Brand / Vendor</label>
                                                    <select style={selectStyle} value={activeFilters.brand} onChange={(e) => setActiveFilters(f => ({ ...f, brand: e.target.value }))}>
                                                        <option value="all">All Brands</option>
                                                        {brandOptions.map(b => (
                                                            <option key={b} value={b}>{b}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '12px' }}>
                                                <div className="input-group" style={{ width: '100%' }}>
                                                    <Search size={16} className="input-icon" />
                                                    <input
                                                        type="text"
                                                        className="input-field input-field--icon"
                                                        placeholder="Search by product name or SKU..."
                                                        value={activeFilters.search}
                                                        onChange={(e) => setActiveFilters(f => ({ ...f, search: e.target.value }))}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                                <div>
                                                    <label style={labelStyle}>Min Price</label>
                                                    <input type="number" style={inputStyle} placeholder="0" value={activeFilters.priceMin} onChange={(e) => setActiveFilters(f => ({ ...f, priceMin: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Max Price</label>
                                                    <input type="number" style={inputStyle} placeholder="999999" value={activeFilters.priceMax} onChange={(e) => setActiveFilters(f => ({ ...f, priceMax: e.target.value }))} />
                                                </div>
                                            </div>

                                            <div style={toggleRowStyle}>
                                                <input
                                                    type="checkbox"
                                                    id="activeOnly"
                                                    checked={activeFilters.activeOnly}
                                                    onChange={(e) => setActiveFilters(f => ({ ...f, activeOnly: e.target.checked }))}
                                                    style={{ accentColor: 'var(--accent)' }}
                                                />
                                                <label htmlFor="activeOnly" style={{ fontSize: '13px', cursor: 'pointer' }}>Active Products Only</label>
                                            </div>

                                            <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ marginTop: '4px' }}>
                                                <X size={12} /> Reset Filters
                                            </button>
                                        </div>
                                    )}

                                    <div className="catalogue-section-header" onClick={() => setExpandedLayout(!expandedLayout)}>
                                        <Layers size={14} />
                                        <span>Layout & Content</span>
                                        {expandedLayout ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                    {expandedLayout && (
                                        <div className="catalogue-section-content">
                                            <div style={{ marginBottom: '12px' }}>
                                                <label style={labelStyle}>Orientation</label>
                                                <select style={selectStyle} value={options.orientation} onChange={(e) => setOptions(o => ({ ...o, orientation: e.target.value }))}>
                                                    <option value="portrait">Portrait</option>
                                                    <option value="landscape">Landscape</option>
                                                </select>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: '8px' }}>
                                                {[
                                                    { key: 'showImages', label: 'Product Images' },
                                                    { key: 'showDescription', label: 'Description' },
                                                    { key: 'showRetailPrice', label: 'Retail Price' },
                                                    { key: 'showOffsetPrice', label: 'Offset/WS Price' },
                                                    { key: 'showStock', label: 'Stock Quantity' },
                                                    { key: 'showProductCode', label: 'Product Code/SKU' },
                                                    { key: 'showCategory', label: 'Category' },
                                                    { key: 'showHeader', label: 'Company Header' },
                                                    { key: 'showFooter', label: 'Page Footer' },
                                                ].map(({ key, label }) => (
                                                    <div key={key} style={toggleRowStyle}>
                                                        <input
                                                            type="checkbox"
                                                            id={`opt-${key}`}
                                                            checked={options[key]}
                                                            onChange={(e) => setOptions(o => ({ ...o, [key]: e.target.checked }))}
                                                            style={{ accentColor: 'var(--accent)' }}
                                                        />
                                                        <label htmlFor={`opt-${key}`} style={{ fontSize: '13px', cursor: 'pointer' }}>{label}</label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="catalogue-section-header" style={{ borderBottom: 'none', cursor: 'default' }}>
                                        <Download size={14} />
                                        <span>Download Options</span>
                                    </div>
                                    <div className="catalogue-section-content">
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => handleGenerate('pdf')} disabled={filteredProducts.length === 0}>
                                                <Download size={14} /> PDF (High Quality)
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => handleGenerate('compressed')} disabled={filteredProducts.length === 0}>
                                                <Download size={14} /> PDF (Compressed)
                                            </button>
                                            <button className="btn btn-accent btn-sm" onClick={() => handleGenerate('print')} disabled={filteredProducts.length === 0}>
                                                <Download size={14} /> PDF (Print Ready)
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => handleGenerate('zip')} disabled={filteredProducts.length === 0}>
                                                <FileArchive size={14} /> ZIP (Individual Cards)
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="catalogue-right">
                            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-heading)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Eye size={14} /> Preview
                            </div>
                            <div className="catalogue-preview">
                                <div className="catalogue-preview-header">
                                    <div style={{ fontWeight: 'bold', fontSize: '7px' }}>{'COMPANY NAME'}</div>
                                    <div style={{ fontSize: '5px', color: '#999' }}>Product Catalogue</div>
                                </div>
                                <div className="catalogue-preview-list">
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].slice(0, Math.min(20, filteredProducts.length)).map(i => {
                                        const p = filteredProducts[i];
                                        return (
                                            <div key={i} className="catalogue-preview-row">
                                                <div className="catalogue-preview-img">
                                                    <ImageIcon size={8} />
                                                </div>
                                                <div className="catalogue-preview-info">
                                                    <div className="catalogue-preview-row-top">
                                                        <span className="catalogue-preview-name">
                                                            {p ? (p.name || '').substring(0, 28) + ((p.name || '').length > 28 ? '...' : '') : '-'}
                                                        </span>
                                                        {options.showRetailPrice && p && (
                                                            <span className="catalogue-preview-retail">
                                                                {'\u20B9'}{Number(p.slabs?.[0]?.unit_rate || p.sell_price || 0).toLocaleString('en-IN')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="catalogue-preview-row-mid">
                                                        {p && p.product_code && options.showProductCode && (
                                                            <span className="catalogue-preview-sku">SKU: {p.product_code}</span>
                                                        )}
                                                        {options.showOffsetPrice && (p?.slabs?.[0]?.offset_unit_rate) && (
                                                            <span className="catalogue-preview-offset">
                                                                Offset: {'\u20B9'}{Number(p.slabs[0].offset_unit_rate).toLocaleString('en-IN')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="catalogue-preview-row-bot">
                                                        <span className="catalogue-preview-desc">
                                                            {p && p.description ? (p.description.substring(0, 55) + (p.description.length > 55 ? '...' : '')) : ''}
                                                        </span>
                                                        {options.showStock && p && p.stock_quantity !== undefined && (
                                                            <span className="catalogue-preview-stock-sm">Stock: {Number(p.stock_quantity)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {filteredProducts.length > 20 && (
                                    <div className="catalogue-preview-more">
                                        ...and {filteredProducts.length - 20} more products
                                    </div>
                                )}
                                <div className="catalogue-preview-footer">
                                    <span>Page 1 of {estimatedPages}</span>
                                    <span>Generated by Sarga ERP</span>
                                </div>
                            </div>
                            <div className="catalogue-preview-stats">
                                <div className="catalogue-stat">
                                    <Package size={14} />
                                    <span>{filteredProducts.length}</span>
                                    <small>Products</small>
                                </div>
                                <div className="catalogue-stat">
                                    <FileText size={14} />
                                    <span>{estimatedPages}</span>
                                    <small>Pages</small>
                                </div>
                                <div className="catalogue-stat">
                                    <Tag size={14} />
                                    <span>{categoryOptions.length}</span>
                                    <small>Categories</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {!generating && (
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary"
                            onClick={() => handleGenerate('pdf')}
                            disabled={filteredProducts.length === 0}
                        >
                            <Download size={16} />
                            Generate & Download
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CatalogueModal;
