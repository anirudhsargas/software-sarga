import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { lazyWithRetry } from '../utils/errorUtils';
import { FileText, Plus, Edit2, Trash2, Send, ArrowRight, Search, X, Loader2, UserSquare, Package, Clock, Camera, Eye, Copy, AlertCircle, Zap } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';
import SecureImage from '../components/SecureImage';
import { calculateProductPrice } from '../utils/pricing';

const ScannerModal = lazyWithRetry(() => import('../components/ScannerModal'));

const statusColors = {
    draft: 'var(--muted-foreground)', sent: 'var(--accent)', accepted: 'var(--success)', rejected: 'var(--destructive)',
    expired: 'var(--warning)', converted: 'var(--accent)'
};

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, marginBottom: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.05)' };
const btnStyle = (bg = 'var(--primary)') => ({ background: bg, color: bg === 'var(--primary)' ? 'var(--on-accent)' : 'var(--card)', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 42, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface))', color: 'var(--text)', fontSize: 14, minHeight: 42, boxSizing: 'border-box' };

const bookTypeFromCategory = (catName) => {
    const name = String(catName || '').trim().toLowerCase();
    if (name === 'offset') return 'Offset';
    if (name === 'laser') return 'Laser';
    return 'Other';
};

const emptyForm = () => ({
    customer_id: '', customer_name: '', customer_mobile: '', customer_email: '',
    customer_address: '', customer_gst: '', date: new Date().toISOString().slice(0, 10),
    valid_until: '', notes: '', discount_percent: 0, tax_rate: 18,
    items: [{ item_name: '', description: '', quantity: 1, unit_price: 0, total: 0, book_type: 'Offset', customPaperRate: 0, is_double_side: false, applied_extras: [] }]
});

// Memoized Quote Card Component
const QuoteCard = React.memo(({ q, onEdit, onSend, onConvert, onDelete }) => {
    return (
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 16 }}>{q.quote_number}</strong>
                        <span style={{ background: statusColors[q.status] || 'var(--muted-foreground)', color: 'var(--card)', padding: '4px 12px', borderRadius: 14, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            {q.status}
                        </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.customer_name} {q.customer_mobile ? `• ${q.customer_mobile}` : ''}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>{q.date?.slice(0, 10)} {q.valid_until ? `• Valid until: ${q.valid_until?.slice(0, 10)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 180, flex: '0 0 auto' }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>₹{Number(q.total || 0).toLocaleString('en-IN')}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {q.status !== 'converted' && (
                            <>
                                <button onClick={() => onEdit(q.id)} className="touch-target" style={btnStyle('var(--muted-foreground)')} title="Edit" aria-label={`Edit quote ${q.quote_number}`}><Edit2 size={14} /></button>
                                <button onClick={() => onSend(q)} className="touch-target" style={btnStyle('var(--accent)')} title="Send" aria-label={`Send quote ${q.quote_number}`}><Send size={14} /></button>
                                <button onClick={() => onConvert(q.id)} className="touch-target" style={btnStyle('var(--success)')} title="Convert to Invoice" aria-label={`Convert quote ${q.quote_number} to invoice`}><ArrowRight size={14} /> Invoice</button>
                            </>
                        )}
                        <button onClick={() => onDelete(q.id)} className="touch-target" style={btnStyle('var(--destructive)')} title="Delete" aria-label={`Delete quote ${q.quote_number}`}><Trash2 size={14} /></button>
                    </div>
                </div>
            </div>
        </div>
    );
});

// Memoized Quote Item Row Component with Billing-level features
const QuoteItemRow = React.memo(({ item, index, onUpdate, onRemove, onDuplicate, onViewDetails }) => {
    const totalCalc = item.total != null ? Number(item.total) : (Number(item.quantity || 1) * Number(item.unit_price || 0));

    return (
        <div className="quote-item-card" style={{ 
            padding: 18, 
            borderRadius: 16, 
            border: '1px solid var(--border)', 
            background: 'var(--surface)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
        }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <div style={{ gridColumn: 'span 4' }}>
                    <input 
                        id={`item-name-${index}`} 
                        aria-label={`Item ${index + 1} name`} 
                        placeholder="Item name *" 
                        value={item.item_name || ''} 
                        onChange={e => onUpdate(index, 'item_name', e.target.value)} 
                        style={{ ...inputStyle, fontWeight: 600 }} 
                    />
                </div>
                <div style={{ gridColumn: 'span 4' }}>
                    <input 
                        id={`item-desc-${index}`} 
                        aria-label={`Item ${index + 1} description`} 
                        placeholder="Description (Optional)" 
                        value={item.description || ''} 
                        onChange={e => onUpdate(index, 'description', e.target.value)} 
                        style={{ ...inputStyle, fontSize: 13 }} 
                    />
                </div>

                {/* Book Type & Paper / Double Side options */}
                <div style={{ gridColumn: 'span 4', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-2, rgba(255,255,255,0.03))', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Book Type:</span>
                        <select
                            value={item.book_type || 'Offset'}
                            onChange={e => onUpdate(index, 'book_type', e.target.value)}
                            style={{
                                padding: '4px 8px', fontSize: 12, height: 30, borderRadius: 6,
                                border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer',
                                background: (item.book_type || 'Offset') === 'Laser' ? 'rgba(99, 102, 241, 0.12)' : (item.book_type || 'Offset') === 'Offset' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                color: (item.book_type || 'Offset') === 'Laser' ? '#4f46e5' : (item.book_type || 'Offset') === 'Offset' ? '#059669' : '#d97706',
                            }}
                        >
                            <option value="Offset">Offset Book</option>
                            <option value="Laser">Laser Book</option>
                            <option value="Other">Other Book</option>
                        </select>
                    </div>

                    {(item._product?.has_paper_rate || item.customPaperRate > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Paper Rate: ₹</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.customPaperRate ?? 0}
                                onChange={e => onUpdate(index, 'customPaperRate', Number(e.target.value) || 0)}
                                style={{ ...inputStyle, width: 90, height: 30, padding: '2px 8px', fontSize: 12 }}
                            />
                        </div>
                    )}

                    {(item._product?.has_double_side_rate || item.is_double_side) && (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, color: 'var(--text-muted)' }}>
                            <input
                                type="checkbox"
                                checked={!!item.is_double_side}
                                onChange={e => onUpdate(index, 'is_double_side', e.target.checked)}
                                style={{ cursor: 'pointer', width: 14, height: 14 }}
                            />
                            Double Side
                        </label>
                    )}
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                    <label htmlFor={`item-qty-${index}`} style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--text-muted)' }}>Quantity</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button type="button" onClick={() => onUpdate(index, 'quantity', Math.max(1, (Number(item.quantity) || 1) - 1))} style={{ ...btnStyle('var(--bg-3)'), color: 'var(--text)', padding: '4px 10px', minHeight: 38, width: 38, justifyContent: 'center' }}>-</button>
                        <input 
                            id={`item-qty-${index}`} 
                            type="number" 
                            placeholder="Qty" 
                            value={item.quantity} 
                            onChange={e => onUpdate(index, 'quantity', Number(e.target.value))} 
                            style={{ ...inputStyle, textAlign: 'center' }} 
                            aria-label={`Item ${index + 1} quantity`} 
                        />
                        <button type="button" onClick={() => onUpdate(index, 'quantity', (Number(item.quantity) || 1) + 1)} style={{ ...btnStyle('var(--bg-3)'), color: 'var(--text)', padding: '4px 10px', minHeight: 38, width: 38, justifyContent: 'center' }}>+</button>
                    </div>
                </div>

                <div style={{ gridColumn: 'span 1' }}>
                    <label htmlFor={`item-price-${index}`} style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--text-muted)' }}>Unit Price (₹)</label>
                    <input 
                        id={`item-price-${index}`} 
                        type="number" 
                        placeholder="Price" 
                        value={item.unit_price} 
                        onChange={e => onUpdate(index, 'unit_price', Number(e.target.value))} 
                        style={inputStyle} 
                        aria-label={`Item ${index + 1} unit price`} 
                    />
                </div>

                <div style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Total</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>₹{totalCalc.toLocaleString('en-IN')}</span>
                </div>

                <div style={{ gridColumn: 'span 4', display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                    {item._product && (
                        <button type="button" onClick={() => onViewDetails(item._product)} className="touch-target" style={{ ...btnStyle('var(--bg-3)'), color: 'var(--text)', padding: '6px 12px', minHeight: 34, fontSize: 12 }} title="View product details & pricing slabs">
                            <Eye size={14} /> Details
                        </button>
                    )}
                    <button type="button" onClick={() => onDuplicate(index)} className="touch-target" style={{ ...btnStyle('var(--bg-3)'), color: 'var(--text)', padding: '6px 12px', minHeight: 34, fontSize: 12 }} title="Duplicate item">
                        <Copy size={14} /> Duplicate
                    </button>
                    <button type="button" onClick={() => onRemove(index)} className="touch-target" style={{ ...btnStyle('var(--destructive)'), padding: '6px 12px', minHeight: 34, fontSize: 12 }} title="Remove item">
                        <Trash2 size={14} /> Remove
                    </button>
                </div>
            </div>
        </div>
    );
});

// Quote Card Skeleton Loader
const QuoteCardSkeleton = () => {
    return (
        <div style={{ ...cardStyle, animation: 'pulse-glow 1.5s infinite ease-in-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ height: 18, width: 120, background: 'var(--border)', borderRadius: 4 }}></div>
                        <div style={{ height: 18, width: 60, background: 'var(--border)', borderRadius: 10 }}></div>
                    </div>
                    <div style={{ height: 14, width: '60%', background: 'var(--border)', borderRadius: 4, marginBottom: 8 }}></div>
                    <div style={{ height: 12, width: '40%', background: 'var(--border)', borderRadius: 4 }}></div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 180, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ height: 24, width: 100, background: 'var(--border)', borderRadius: 4, marginBottom: 8 }}></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ height: 36, width: 36, background: 'var(--border)', borderRadius: 8 }}></div>
                        <div style={{ height: 36, width: 36, background: 'var(--border)', borderRadius: 8 }}></div>
                        <div style={{ height: 36, width: 80, background: 'var(--border)', borderRadius: 8 }}></div>
                        <div style={{ height: 36, width: 36, background: 'var(--border)', borderRadius: 8 }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function Quotes() {
    useSEO('Quotes');

    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalQuotes, setTotalQuotes] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const LIMIT = 10;
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    
    const [searchVal, setSearchVal] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [statusFilter, setStatusFilter] = useState('');
    const [customers, setCustomers] = useState([]);
    const [form, setForm] = useState(emptyForm());

    // Product picker & Modals (Billing features)
    const [hierarchy, setHierarchy] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [qrInput, setQrInput] = useState('');
    const [showScanner, setShowScanner] = useState(false);

    const [detailProduct, setDetailProduct] = useState(null);
    const [duplicateItemModal, setDuplicateItemModal] = useState(null);
    const [showQuickEntry, setShowQuickEntry] = useState(false);
    const [quickEntry, setQuickEntry] = useState({ name: '', amount: '', book_type: 'Laser' });

    // Debounce searchVal update to searchQuery (250ms)
    useEffect(() => {
        const handler = setTimeout(() => {
            setSearchQuery(searchVal);
        }, 250);
        return () => clearTimeout(handler);
    }, [searchVal]);

    useEffect(() => {
        const fetchHierarchy = async () => {
            try {
                const { data } = await api.get('/product-hierarchy');
                const serverHierarchy = Array.isArray(data) ? data : (data?.data || []);
                setHierarchy(serverHierarchy);
                if (serverHierarchy.length > 0) {
                    setSelectedCategoryId(serverHierarchy[0].id);
                    const subs = serverHierarchy[0].subcategories || [];
                    if (subs.length > 0) setSelectedSubcategoryId(subs[0].id);
                }
            } catch {
                // ignore silently
            }
        };
        fetchHierarchy();
    }, []);

    const normalizeCode = (value) => {
        let code = String(value || '');
        code = code.replace(/^\uFEFF/, '').trim().replace(/\s+/g, '').toUpperCase();
        return code;
    };

    const qrLookupMap = useMemo(() => {
        const map = new Map();
        hierarchy.forEach((cat) => {
            (cat.subcategories || []).forEach((sub) => {
                (sub.products || []).forEach((prod) => {
                    const code = String(prod.product_code || '').replace(/\s+/g, '').toUpperCase();
                    if (code) map.set(code, { product: prod, catId: cat.id, subId: sub.id, catName: cat.name });
                });
            });
        });
        return map;
    }, [hierarchy]);

    const handleQrLookup = async (providedCode) => {
        const code = providedCode || qrInput;
        const normalized = normalizeCode(code);
        if (!normalized) { toast.error('Enter a product code'); return; }
        const entry = qrLookupMap.get(normalized);
        if (entry) {
            setSelectedCategoryId(entry.catId || '');
            setSelectedSubcategoryId(entry.subId || '');
            setSelectedProduct(entry.product);
            setQrInput('');
            toast.success(`Selected product: ${entry.product.name}`);
            return;
        }
        toast.error('No product found for this code');
    };

    const addSelectedProductItem = (productToAdd = selectedProduct, forceNew = false) => {
        const product = productToAdd || selectedProduct;
        if (!product) { toast.error('Select a product first'); return; }

        if (!forceNew) {
            const existingLine = form.items.find(it => String(it.product_id) === String(product.id));
            if (existingLine) {
                setDuplicateItemModal({ product, existingLine });
                return;
            }
        }

        const defaultPaperRate = product.has_paper_rate ? (Number(product.paper_rate) || 0) : 0;
        const catObj = hierarchy.find(c => String(c.id) === String(selectedCategoryId));
        const isOffset = bookTypeFromCategory(catObj?.name) === 'Offset';

        const priceResult = calculateProductPrice({
            product,
            quantity: 1,
            extras: [],
            currentPaperRate: defaultPaperRate,
            isOffset,
            isDoubleSide: false
        });

        const item = {
            product_id: product.id,
            item_name: product.name || '',
            description: product.description || '',
            quantity: 1,
            unit_price: priceResult ? priceResult.unit_price : Number(product.sell_price || product.price || 0),
            total: priceResult ? priceResult.total_amount : Number(product.sell_price || product.price || 0),
            book_type: bookTypeFromCategory(catObj?.name) || 'Offset',
            customPaperRate: defaultPaperRate,
            is_double_side: false,
            applied_extras: [],
            _product: product
        };

        setForm(f => ({ ...f, items: [...f.items, item] }));
        setSelectedProduct(null);
        toast.success(`Added: ${item.item_name}`);
    };

    const handleAddQuickEntry = () => {
        if (!quickEntry.name || !quickEntry.amount) {
            toast.error('Enter item name and amount');
            return;
        }
        const amt = Number(quickEntry.amount) || 0;
        const item = {
            product_id: null,
            item_name: quickEntry.name,
            description: 'Quick custom item',
            quantity: 1,
            unit_price: amt,
            total: amt,
            book_type: quickEntry.book_type || 'Laser',
            customPaperRate: 0,
            is_double_side: false,
            applied_extras: []
        };
        setForm(f => ({ ...f, items: [...f.items, item] }));
        setQuickEntry({ name: '', amount: '', book_type: 'Laser' });
        setShowQuickEntry(false);
        toast.success(`Added: ${item.item_name}`);
    };

    const fetchQuotes = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.set('search', searchQuery);
            if (statusFilter) params.set('status', statusFilter);
            params.set('page', page);
            params.set('limit', LIMIT);
            const { data } = await api.get(`/quotes?${params}`);
            const items = data.data || data;
            setQuotes(items);
            setTotalQuotes(data.total || items.length);
            setTotalPages(data.total ? Math.ceil(data.total / LIMIT) : 1);
        } catch { toast.error('Failed to load quotes'); }
        finally { setLoading(false); }
    }, [searchQuery, statusFilter, page]);

    useEffect(() => { setPage(1); }, [searchQuery, statusFilter]);

    useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

    // Keyboard ESC key modal closer
    useEffect(() => {
        if (!showForm) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setShowForm(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showForm]);

    useEffect(() => {
        api.get('/customers?limit=500').then(r => setCustomers(r.data?.data || r.data || [])).catch(() => {});
    }, []);

    const selectCustomer = (c) => {
        setForm(f => ({ ...f, customer_id: c.id, customer_name: c.name, customer_mobile: c.mobile, customer_email: c.email || '', customer_address: c.address || '', customer_gst: c.gst || '' }));
    };

    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { item_name: '', description: '', quantity: 1, unit_price: 0, total: 0, book_type: 'Offset', customPaperRate: 0, is_double_side: false, applied_extras: [] }] }));
    const removeItem = useCallback((i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) })), []);
    
    const duplicateItem = useCallback((i) => {
        setForm(f => {
            const items = [...f.items];
            const copy = { ...items[i], id: undefined };
            items.splice(i + 1, 0, copy);
            return { ...f, items };
        });
        toast.success('Item duplicated');
    }, []);

    const updateItem = useCallback((i, field, val) => setForm(f => {
        const items = [...f.items];
        const cur = { ...items[i], [field]: val };
        const prod = cur._product;

        if (prod && (field === 'quantity' || field === 'customPaperRate' || field === 'is_double_side' || field === 'book_type')) {
            const isOffset = (cur.book_type || 'Offset') === 'Offset';
            const priceResult = calculateProductPrice({
                product: prod,
                quantity: Number(cur.quantity) || 0,
                extras: cur.applied_extras || [],
                paperRateOverride: cur.customPaperRate,
                currentPaperRate: Number(cur.customPaperRate) || 0,
                isOffset,
                isDoubleSide: !!cur.is_double_side
            });
            if (priceResult) {
                cur.unit_price = priceResult.unit_price;
                cur.total = priceResult.total_amount;
            }
        } else if (field === 'unit_price') {
            cur.total = (Number(val) || 0) * (Number(cur.quantity) || 1);
        } else if (field === 'quantity' && !prod) {
            cur.total = (Number(cur.unit_price) || 0) * (Number(val) || 1);
        }

        items[i] = cur;
        return { ...f, items };
    }), []);

    const subtotal = form.items.reduce((s, it) => s + (it.total != null ? Number(it.total) : ((it.quantity || 0) * (it.unit_price || 0))), 0);
    const discountAmt = subtotal * ((form.discount_percent || 0) / 100);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = afterDiscount * ((form.tax_rate || 0) / 100);
    const total = afterDiscount + taxAmt;

    const handleSave = async () => {
        if (!form.customer_name) return toast.error('Customer name is required');
        if (!form.items.length || !form.items[0].item_name) return toast.error('At least one item is required');
        try {
            if (editing) {
                await api.put(`/quotes/${editing}`, form);
                toast.success('Quote updated');
            } else {
                await api.post('/quotes', form);
                toast.success('Quote created');
            }
            setShowForm(false); setEditing(null); setForm(emptyForm()); fetchQuotes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to save quote'); }
    };

    const handleKeyDownForm = (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.id !== 'qr-lookup-input') {
            e.preventDefault();
            handleSave();
        }
    };

    const handleEdit = useCallback(async (id) => {
        try {
            const { data } = await api.get(`/quotes/${id}`);
            const items = (data.items || []).map(it => ({
                ...it,
                customPaperRate: Number(it.custom_paper_rate || it.customPaperRate) || 0,
                is_double_side: !!it.is_double_side,
                book_type: it.book_type || 'Offset',
                total: it.total != null ? Number(it.total) : (Number(it.quantity || 1) * Number(it.unit_price || 0)),
                applied_extras: typeof it.applied_extras === 'string' ? JSON.parse(it.applied_extras || '[]') : (it.applied_extras || [])
            }));
            setForm({ ...data, items });
            setEditing(id); setShowForm(true);
        } catch { toast.error('Failed to load quote'); }
    }, []);

    const handleDelete = useCallback(async (id) => {
        if (!confirm('Delete this quote?')) return;
        setQuotes(prev => prev.filter(q => q.id !== id));
        try {
            await api.delete(`/quotes/${id}`);
            toast.success('Deleted');
            fetchQuotes();
        } catch { toast.error('Failed to delete'); fetchQuotes(); }
    }, [fetchQuotes]);

    const handleConvert = useCallback(async (id) => {
        if (!confirm('Convert this quote to an invoice? This action cannot be undone.')) return;
        try {
            const { data } = await api.post(`/quotes/${id}/convert`);
            toast.success(`Converted! Invoice #${data.invoice_id} created`);
            fetchQuotes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to convert'); }
    }, [fetchQuotes]);

    const handleSendQuote = useCallback(async (quote) => {
        const email = quote.customer_email || prompt('Enter customer email:');
        if (!email) return;
        try {
            await api.post(`/quotes/${quote.id}/send-email`, {
                email,
                subject: `Quotation ${quote.quote_number}`,
            });
            toast.success('Quote sent!'); fetchQuotes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to send'); }
    }, [fetchQuotes]);

    return (
        <PageContainer>
            <style>{`
                /* Accessible focus highlights */
                input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
                    outline: 2px solid var(--accent) !important;
                    outline-offset: 2px !important;
                }
                @keyframes pulse-glow {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 0.3; }
                }
                .quotes-controls-row {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 16px;
                    flex-wrap: wrap;
                }
                .quotes-search-wrapper {
                    position: relative;
                    flex: 1;
                    min-width: 200px;
                }
                .quotes-filters-and-actions {
                    display: flex;
                    gap: 12px;
                    flex: 0 0 auto;
                }
                @media (max-width: 640px) {
                    .quotes-controls-row {
                        flex-direction: column;
                        gap: 8px;
                    }
                    .quotes-search-wrapper {
                        width: 100%;
                        flex: none;
                    }
                    .quotes-filters-and-actions {
                        width: 100%;
                        display: flex;
                        gap: 8px;
                    }
                    .quotes-filters-and-actions > select,
                    .quotes-filters-and-actions > button {
                        flex: 1 !important;
                        min-width: 0 !important;
                        width: 50% !important;
                        justify-content: center;
                    }
                }
            `}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><FileText size={22} /> Quotes & Estimates</h2>
            </div>

            {/* Filters & Actions */}
            <div className="quotes-controls-row">
                <div className="quotes-search-wrapper">
                    <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
                    <input 
                        id="quote-search-filter"
                        placeholder="Search quotes..." 
                        value={searchVal} 
                        onChange={e => setSearchVal(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: 32 }}
                        aria-label="Search quotations"
                    />
                </div>
                <div className="quotes-filters-and-actions">
                    <select 
                        id="quote-status-filter"
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value)} 
                        style={{ ...inputStyle, width: 'auto', minWidth: 140 }}
                        aria-label="Filter quotations by status"
                    >
                        <option value="">All Statuses</option>
                        {['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <button className="touch-target" style={btnStyle()} onClick={() => { setForm(emptyForm()); setEditing(null); setShowForm(true); }} aria-label="Create new quote"><Plus size={16} /> New Quote</button>
                </div>
            </div>

            {/* Quote List */}
            {loading ? (
                <div>
                    <QuoteCardSkeleton />
                    <QuoteCardSkeleton />
                    <QuoteCardSkeleton />
                </div>
            ) : (
                <div>
                    {(Array.isArray(quotes) ? quotes : []).length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No quotes found. Create your first quote!</div>
                    ) : (Array.isArray(quotes) ? quotes : []).map(q => (
                        <QuoteCard 
                            key={q.id} 
                            q={q} 
                            onEdit={handleEdit} 
                            onSend={handleSendQuote} 
                            onConvert={handleConvert} 
                            onDelete={handleDelete} 
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && !loading && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
                    <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</button>
                    <span className="text-sm muted">Page {page} of {totalPages} ({totalQuotes} total)</span>
                    <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            )}

            {/* Create/Edit Modal */}
            {showForm && (
                <div role="presentation" className="modal-backdrop" style={{ zIndex: 1003 }} onClick={() => setShowForm(false)}>
                    <div 
                        role="dialog" 
                        aria-modal="true"
                        aria-labelledby="modal-title"
                        className="modal" 
                        style={{ maxWidth: 940, width: '100%', maxHeight: '92vh', overflowX: 'hidden', padding: 0, borderRadius: 18, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(15, 23, 42, 0.18)' }} 
                        onClick={e => e.stopPropagation()}
                        onKeyDown={handleKeyDownForm}
                    >
                        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <h3 id="modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editing ? 'Edit Quote' : 'Create New Quote'}</h3>
                            <button onClick={() => setShowForm(false)} aria-label="Close modal" style={{ background: 'var(--bg-3)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>

                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                            {/* Customer Section */}
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: 'var(--primary)' }}>
                                    <UserSquare size={18} />
                                    <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Information</span>
                                </div>
                                
                                <div style={{ marginBottom: 16 }}>
                                    <label id="quick-customer-select-label" htmlFor="quick-customer-select" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-muted)' }}>Quick Select Existing Customer</label>
                                    <select 
                                        autoFocus
                                        id="quick-customer-select"
                                        aria-labelledby="quick-customer-select-label"
                                        value={form.customer_id} 
                                        onChange={e => { const c = customers.find(c => c.id === Number(e.target.value)); if (c) selectCustomer(c); }}
                                        style={{ ...inputStyle, height: 42 }}
                                    >
                                        <option value="">Select or type manually below</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                                    <div>
                                        <label id="customer-name-label" htmlFor="customer-name-input" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Customer Name *</label>
                                        <input 
                                            id="customer-name-input" 
                                            aria-labelledby="customer-name-label" 
                                            placeholder="Enter name" 
                                            value={form.customer_name} 
                                            onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} 
                                            style={{ ...inputStyle, height: 42 }} 
                                        />
                                    </div>
                                    <div>
                                        <label id="customer-mobile-label" htmlFor="customer-mobile-input" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Mobile Number</label>
                                        <input 
                                            id="customer-mobile-input" 
                                            aria-labelledby="customer-mobile-label" 
                                            placeholder="Enter mobile" 
                                            value={form.customer_mobile} 
                                            onChange={e => setForm(f => ({ ...f, customer_mobile: e.target.value }))} 
                                            style={{ ...inputStyle, height: 42 }} 
                                        />
                                    </div>
                                    <div>
                                        <label id="customer-email-label" htmlFor="customer-email-input" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Email Address</label>
                                        <input 
                                            id="customer-email-input" 
                                            aria-labelledby="customer-email-label" 
                                            placeholder="Enter email" 
                                            value={form.customer_email} 
                                            onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} 
                                            style={{ ...inputStyle, height: 42 }} 
                                        />
                                    </div>
                                    <div>
                                        <label id="customer-gst-label" htmlFor="customer-gst-input" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>GST Number</label>
                                        <input 
                                            id="customer-gst-input" 
                                            aria-labelledby="customer-gst-label" 
                                            placeholder="GSTIN (Optional)" 
                                            value={form.customer_gst} 
                                            onChange={e => setForm(f => ({ ...f, customer_gst: e.target.value }))} 
                                            style={{ ...inputStyle, height: 42 }} 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Quote Details */}
                            <div style={{ marginBottom: 24, padding: '20px', background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: 'var(--primary)' }}>
                                    <Clock size={18} />
                                    <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quote Details</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                                    <div>
                                        <label id="quote-date-label" htmlFor="quote-date-input" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Quote Date</label>
                                        <input 
                                            id="quote-date-input" 
                                            aria-labelledby="quote-date-label" 
                                            type="date" 
                                            value={form.date} 
                                            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} 
                                            style={{ ...inputStyle, height: 40 }} 
                                        />
                                    </div>
                                    <div>
                                        <label id="valid-until-label" htmlFor="valid-until-input" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Valid Until</label>
                                        <input 
                                            id="valid-until-input" 
                                            aria-labelledby="valid-until-label" 
                                            type="date" 
                                            value={form.valid_until} 
                                            onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} 
                                            style={{ ...inputStyle, height: 40 }} 
                                        />
                                    </div>
                                    <div>
                                        <label id="discount-label" htmlFor="discount-input" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Discount %</label>
                                        <input 
                                            id="discount-input" 
                                            aria-labelledby="discount-label" 
                                            type="number" 
                                            value={form.discount_percent} 
                                            onChange={e => setForm(f => ({ ...f, discount_percent: Number(e.target.value) }))} 
                                            style={{ ...inputStyle, height: 40 }} 
                                        />
                                    </div>
                                    <div>
                                        <label id="tax-rate-label" htmlFor="tax-rate-input" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Tax Rate %</label>
                                        <input 
                                            id="tax-rate-input" 
                                            aria-labelledby="tax-rate-label" 
                                            type="number" 
                                            value={form.tax_rate} 
                                            onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))} 
                                            style={{ ...inputStyle, height: 40 }} 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Items Section */}
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                                        <Package size={18} />
                                        <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Items & Pricing</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={() => setShowQuickEntry(!showQuickEntry)} className="touch-target" aria-label="Toggle Quick Custom Entry" style={{ ...btnStyle('var(--bg-3)'), color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 14px', fontSize: 13, minHeight: 'auto' }}><Zap size={14} /> Quick Entry</button>
                                        <button onClick={addItem} className="touch-target" aria-label="Add a blank item row" style={{ ...btnStyle('var(--primary)'), padding: '8px 14px', fontSize: 13, minHeight: 'auto' }}><Plus size={14} /> Add Item</button>
                                    </div>
                                </div>

                                {/* Quick Custom Entry Box */}
                                {showQuickEntry && (
                                    <div style={{ marginBottom: 16, padding: 16, background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--accent)' }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                                            <Zap size={14} /> Quick Custom Item Entry
                                        </div>
                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            <input
                                                placeholder="Custom Item Name *"
                                                value={quickEntry.name}
                                                onChange={e => setQuickEntry(q => ({ ...q, name: e.target.value }))}
                                                style={{ ...inputStyle, flex: 2, minWidth: 180 }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Amount (₹) *"
                                                value={quickEntry.amount}
                                                onChange={e => setQuickEntry(q => ({ ...q, amount: e.target.value }))}
                                                style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                                            />
                                            <select
                                                value={quickEntry.book_type}
                                                onChange={e => setQuickEntry(q => ({ ...q, book_type: e.target.value }))}
                                                style={{ ...inputStyle, flex: 1, minWidth: 130 }}
                                            >
                                                <option value="Offset">Offset Book</option>
                                                <option value="Laser">Laser Book</option>
                                                <option value="Other">Other Book</option>
                                            </select>
                                            <button onClick={handleAddQuickEntry} style={{ ...btnStyle('var(--accent)'), minWidth: 100 }}>Add Line</button>
                                        </div>
                                    </div>
                                )}
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {/* Product picker (Billing-level technology) */}
                                    <div style={{ marginBottom: 8, padding: 16, border: '1px dashed var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
                                        <div style={{ marginBottom: 12 }}>
                                            <label id="qr-lookup-label" htmlFor="qr-lookup-input" style={{ fontSize: 13, fontWeight: 600 }}>Scan Barcode / Search Product Code</label>
                                            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                                <input
                                                    id="qr-lookup-input"
                                                    aria-labelledby="qr-lookup-label"
                                                    className="input-field"
                                                    value={qrInput}
                                                    onChange={e => setQrInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleQrLookup(); } }}
                                                    placeholder="Scan code or type product code (e.g. BC-001)"
                                                    style={{ ...inputStyle }}
                                                />
                                                <button onClick={() => setShowScanner(true)} className="touch-target" aria-label="Scan barcode via camera" style={{ ...btnStyle('var(--primary)'), minWidth: '100px' }}><Camera size={14} /> Scan</button>
                                                <button onClick={() => handleQrLookup()} className="touch-target" aria-label="Find product by code" style={{ ...btnStyle(), minWidth: '70px' }}>Find</button>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1, minWidth: 160 }}>
                                                <label id="category-select-label" htmlFor="category-select" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Category</label>
                                                <select 
                                                    id="category-select"
                                                    aria-labelledby="category-select-label"
                                                    className="input-field" 
                                                    value={selectedCategoryId} 
                                                    onChange={e => {
                                                        setSelectedCategoryId(e.target.value);
                                                        const subs = hierarchy.find(c => String(c.id) === String(e.target.value))?.subcategories || [];
                                                        if (subs.length > 0) setSelectedSubcategoryId(subs[0].id);
                                                        else setSelectedSubcategoryId('');
                                                    }} 
                                                    style={{ ...inputStyle }}
                                                >
                                                    <option value="">Select category</option>
                                                    {hierarchy.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 160 }}>
                                                <label id="subcategory-select-label" htmlFor="subcategory-select" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Sub-category</label>
                                                <select 
                                                    id="subcategory-select"
                                                    aria-labelledby="subcategory-select-label"
                                                    className="input-field" 
                                                    value={selectedSubcategoryId} 
                                                    onChange={e => setSelectedSubcategoryId(e.target.value)} 
                                                    style={{ ...inputStyle }}
                                                >
                                                    <option value="">Select sub-category</option>
                                                    {(hierarchy.find(c => String(c.id) === String(selectedCategoryId))?.subcategories || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <label id="product-select-label" htmlFor="product-select" style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Product</label>
                                                <select 
                                                    id="product-select"
                                                    aria-labelledby="product-select-label"
                                                    className="input-field" 
                                                    value={selectedProduct?.id || ''} 
                                                    onChange={e => {
                                                        const subs = (hierarchy.find(c => String(c.id) === String(selectedCategoryId))?.subcategories || []);
                                                        const products = (subs.find(s => String(s.id) === String(selectedSubcategoryId))?.products || []);
                                                        const p = products.find(p => String(p.id) === String(e.target.value));
                                                        setSelectedProduct(p || null);
                                                    }} 
                                                    style={{ ...inputStyle }}
                                                >
                                                    <option value="">Select product</option>
                                                    {((hierarchy.find(c => String(c.id) === String(selectedCategoryId))?.subcategories || []).find(s => String(s.id) === String(selectedSubcategoryId))?.products || []).map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                                <button onClick={() => addSelectedProductItem()} className="touch-target" aria-label="Add selected product to quotation" style={{ ...btnStyle('var(--primary)'), minWidth: '130px' }}>Add to Quote</button>
                                            </div>
                                        </div>
                                    </div>

                                    {form.items.map((item, i) => (
                                        <QuoteItemRow 
                                            key={i} 
                                            item={item} 
                                            index={i} 
                                            onUpdate={updateItem} 
                                            onRemove={removeItem}
                                            onDuplicate={duplicateItem}
                                            onViewDetails={setDetailProduct}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Summary & Notes */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'start' }}>
                                <div>
                                    <label id="quote-notes-label" htmlFor="quote-notes-textarea" style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>Notes / Terms & Conditions</label>
                                    <textarea 
                                        id="quote-notes-textarea" 
                                        aria-labelledby="quote-notes-label" 
                                        placeholder="Any specific requirements or validity notes..." 
                                        value={form.notes || ''} 
                                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} 
                                        rows={4} 
                                        style={{ ...inputStyle, resize: 'none' }} 
                                    />
                                </div>
                                <div style={{ background: 'var(--primary)', color: 'var(--on-accent)', borderRadius: 16, padding: 20, boxShadow: '0 8px 24px rgba(var(--primary-rgb), 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, opacity: 0.9 }}>
                                        <span style={{ fontSize: 13 }}>Subtotal</span>
                                        <span style={{ fontWeight: 600 }}>₹{subtotal.toLocaleString('en-IN')}</span>
                                    </div>
                                    {form.discount_percent > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, color: 'var(--secondary)' }}>
                                            <span style={{ fontSize: 13 }}>Discount ({form.discount_percent}%)</span>
                                            <span style={{ fontWeight: 600 }}>-₹{discountAmt.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    {form.tax_rate > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, opacity: 0.9 }}>
                                            <span style={{ fontSize: 13 }}>Tax ({form.tax_rate}%)</span>
                                            <span style={{ fontWeight: 600 }}>₹{taxAmt.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 22, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 12 }}>
                                        <span>Total</span>
                                        <span>₹{total.toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {showScanner && (
                            <React.Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}><Loader2 className="animate-spin" /> Loading scanner…</div>}>
                                <ScannerModal isOpen={showScanner} onClose={() => setShowScanner(false)} onScan={(code) => handleQrLookup(code)} />
                            </React.Suspense>
                        )}

                        {/* Product Detail Modal */}
                        {detailProduct && (
                            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Product details: ${detailProduct.name || detailProduct.title}`} onClick={() => setDetailProduct(null)} style={{ zIndex: 1005 }}>
                                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', borderRadius: 18, padding: 24, background: 'var(--surface)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{detailProduct.name || detailProduct.title}</h3>
                                        <button onClick={() => setDetailProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                                    </div>
                                    <div style={{ padding: '16px 0' }}>
                                        <div style={{ width: 160, height: 160, margin: '0 auto 16px auto', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {detailProduct.image_url ? (
                                                <SecureImage src={detailProduct.image_url} alt={detailProduct.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
                                            ) : (
                                                <Package size={48} style={{ opacity: 0.4 }} />
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>Name</span><span style={{ fontWeight: 600 }}>{detailProduct.name || detailProduct.title}</span></div>
                                        {detailProduct.mrp != null && Number(detailProduct.mrp) > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>MRP</span><span>₹{Number(detailProduct.mrp).toLocaleString()}</span></div>
                                        )}
                                        {detailProduct.sell_price != null && Number(detailProduct.sell_price) > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>Sell Price</span><span>₹{Number(detailProduct.sell_price).toLocaleString()}</span></div>
                                        )}
                                        {detailProduct.calculation_type && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>Pricing Type</span><span style={{ fontWeight: 600, color: 'var(--primary)' }}>{detailProduct.calculation_type}</span></div>
                                        )}
                                        {detailProduct.sku && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>SKU</span><span style={{ fontFamily: 'monospace' }}>{detailProduct.sku}</span></div>
                                        )}
                                        {detailProduct.description && (
                                            <div style={{ padding: '6px 0', fontSize: 13 }}><span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Description</span><div>{detailProduct.description}</div></div>
                                        )}
                                        {detailProduct.slabs && detailProduct.slabs.length > 0 && (
                                            <div style={{ marginTop: 12 }}>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Pricing Slabs</span>
                                                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                    <thead>
                                                        <tr style={{ background: 'var(--bg-2)', textAlign: 'left' }}>
                                                            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Min Qty</th>
                                                            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Max Qty</th>
                                                            <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Rate</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detailProduct.slabs.map((s, i) => (
                                                            <tr key={i}>
                                                                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{s.min_qty}</td>
                                                                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{s.max_qty || '∞'}</td>
                                                                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>₹{Number(s.unit_rate || s.rate || 0).toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                                        <button type="button" onClick={() => { setDetailProduct(null); addSelectedProductItem(detailProduct, true); }} style={{ ...btnStyle('var(--primary)') }}>
                                            <Plus size={14} /> Add to Quote
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Duplicate Item Prompt Modal */}
                        {duplicateItemModal && (
                            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Item already added options" onClick={() => setDuplicateItemModal(null)} style={{ zIndex: 1006 }}>
                                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '100%', borderRadius: 18, padding: 24, background: 'var(--surface)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <AlertCircle size={20} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Item Already Added</h3>
                                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>This item is already in your quotation.</div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{duplicateItemModal.product?.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Current qty in quote: <strong>{duplicateItemModal.existingLine?.quantity || 1}</strong></div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const idx = form.items.findIndex(it => String(it.product_id) === String(duplicateItemModal.product.id));
                                                if (idx !== -1) {
                                                    updateItem(idx, 'quantity', (Number(form.items[idx].quantity) || 1) + 1);
                                                }
                                                setDuplicateItemModal(null);
                                                toast.success('Quantity increased by 1');
                                            }}
                                            style={{ ...btnStyle('var(--primary)'), justifyContent: 'center' }}
                                        >
                                            Increase Quantity (+1)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                addSelectedProductItem(duplicateItemModal.product, true);
                                                setDuplicateItemModal(null);
                                            }}
                                            style={{ ...btnStyle('var(--bg-3)'), color: 'var(--text)', border: '1px solid var(--border)', justifyContent: 'center' }}
                                        >
                                            Add as New Line Item
                                        </button>
                                        <button type="button" onClick={() => setDuplicateItemModal(null)} style={{ ...btnStyle('transparent'), color: 'var(--text-muted)', justifyContent: 'center' }}>Cancel</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ padding: '20px 24px', background: 'var(--surface-lowest)', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowForm(false)} className="touch-target" aria-label="Cancel editing quote" style={{ ...btnStyle('#ffffff00'), color: 'var(--text)', fontWeight: 500, border: '1px solid var(--border)' }}>Cancel</button>
                            <button onClick={handleSave} className="touch-target" aria-label={editing ? 'Update current quote' : 'Create quotation from form'} style={{ ...btnStyle('var(--primary)'), padding: '10px 24px', fontWeight: 600, boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)' }}>{editing ? 'Update Quotation' : 'Create Quotation'}</button>
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
