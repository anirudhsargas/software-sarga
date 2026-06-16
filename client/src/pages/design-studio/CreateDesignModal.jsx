import React, { useState, useMemo } from 'react';
import { X, RotateCcw, Printer, Image, BookOpen, CreditCard, FileText } from 'lucide-react';

const presets = {
    laser: { name: 'Laser Print', width: 13, height: 19, unit: 'inch', bleed: 5, safeMargin: 5, dpi: 300 },
    wedding: { name: 'Wedding Card', width: 5, height: 7, unit: 'inch', bleed: 3, safeMargin: 5, dpi: 300 },
    album: { name: 'Album', width: 12, height: 18, unit: 'inch', bleed: 5, safeMargin: 10, dpi: 300 },
    visiting: { name: 'Visiting Card', width: 3.5, height: 2, unit: 'inch', bleed: 3, safeMargin: 3, dpi: 300 },
    posterA3: { name: 'Poster A3', width: 297, height: 420, unit: 'mm', bleed: 5, safeMargin: 10, dpi: 300 },
    posterA4: { name: 'Poster A4', width: 210, height: 297, unit: 'mm', bleed: 5, safeMargin: 10, dpi: 300 },
};

const categoryOptions = [
    { value: 'wedding', label: 'Wedding Card' },
    { value: 'visiting', label: 'Visiting Card' },
    { value: 'album', label: 'Album' },
    { value: 'invitation', label: 'Invitation' },
    { value: 'flex', label: 'Flex' },
    { value: 'poster', label: 'Poster' },
    { value: 'frame', label: 'Photo Frame' },
    { value: 'certificate', label: 'Certificate' },
    { value: 'custom', label: 'Custom Size' },
];

const unitOptions = ['mm', 'cm', 'inch', 'px'];

const CreateDesignModal = ({ onClose, onCreate }) => {
    const [form, setForm] = useState({
        name: '',
        category: 'wedding',
        width: 5,
        height: 7,
        unit: 'inch',
        bleed: 3,
        safeMargin: 5,
        dpi: 300,
        printReady: false,
    });
    const [errors, setErrors] = useState({});

    const getPresets = useMemo(() => {
        switch (form.category) {
            case 'laser': return presets.laser;
            case 'wedding': return presets.wedding;
            case 'album': return presets.album;
            case 'visiting': return presets.visiting;
            case 'poster': return presets.posterA3;
            default: return null;
        }
    }, [form.category]);

    const handlePreset = (key) => {
        const p = presets[key];
        if (!p) return;
        setForm(prev => ({ ...prev, ...p, category: key }));
    };

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
    };

    const validate = () => {
        const errs = {};
        if (!form.name.trim()) errs.name = 'Project name is required';
        if (!form.width || form.width <= 0) errs.width = 'Invalid width';
        if (!form.height || form.height <= 0) errs.height = 'Invalid height';
        if (!form.dpi || form.dpi < 72) errs.dpi = 'DPI must be at least 72';
        if (form.bleed < 0) errs.bleed = 'Bleed cannot be negative';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) return;
        onCreate(form);
    };

    const presetButtons = [
        { key: 'laser', label: 'Laser', icon: Printer, desc: '13×19 in' },
        { key: 'wedding', label: 'Wedding', icon: Image, desc: '5×7 in' },
        { key: 'album', label: 'Album', icon: BookOpen, desc: '12×18 in' },
        { key: 'visiting', label: 'Visiting', icon: CreditCard, desc: '3.5×2 in' },
        { key: 'posterA3', label: 'Poster A3', icon: FileText, desc: '297×420 mm' },
    ];

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="ds-modal" onClick={e => e.stopPropagation()}>
                <div className="ds-modal-header">
                    <h2>Create New Design</h2>
                    <button className="ds-modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="ds-modal-presets">
                    <label className="ds-label">Quick Presets</label>
                    <div className="ds-preset-row">
                        {presetButtons.map(({ key, label, icon: Icon, desc }) => (
                            <button key={key} type="button" className={`ds-preset-btn ${form.category === key ? 'active' : ''}`} onClick={() => handlePreset(key)}>
                                <Icon size={20} />
                                <span className="ds-preset-label">{label}</span>
                                <span className="ds-preset-desc">{desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <form className="ds-modal-form" onSubmit={handleSubmit}>
                    <div className="ds-form-row">
                        <div className="ds-form-group full">
                            <label className="ds-label">Project Name</label>
                            <input
                                className={`ds-input ${errors.name ? 'error' : ''}`}
                                value={form.name}
                                onChange={e => handleChange('name', e.target.value)}
                                placeholder="e.g., Anand & Priya Wedding"
                            />
                            {errors.name && <span className="ds-error">{errors.name}</span>}
                        </div>
                    </div>

                    <div className="ds-form-row">
                        <div className="ds-form-group">
                            <label className="ds-label">Category</label>
                            <select className="ds-select" value={form.category} onChange={e => handleChange('category', e.target.value)}>
                                {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="ds-form-group">
                            <label className="ds-label">Unit</label>
                            <select className="ds-select" value={form.unit} onChange={e => handleChange('unit', e.target.value)}>
                                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div className="ds-form-group">
                            <label className="ds-label">Orientation</label>
                            <select className="ds-select" value={form.width > form.height ? 'landscape' : 'portrait'} onChange={e => {
                                if (e.target.value === 'landscape' && form.width <= form.height) {
                                    handleChange('width', form.height);
                                    handleChange('height', form.width);
                                } else if (e.target.value === 'portrait' && form.width > form.height) {
                                    handleChange('width', form.height);
                                    handleChange('height', form.width);
                                }
                            }}>
                                <option value="portrait">Portrait</option>
                                <option value="landscape">Landscape</option>
                            </select>
                        </div>
                    </div>

                    <div className="ds-form-row">
                        <div className="ds-form-group">
                            <label className="ds-label">Width</label>
                            <input className={`ds-input ${errors.width ? 'error' : ''}`} type="number" step="any" min="0.1"
                                value={form.width} onChange={e => handleChange('width', parseFloat(e.target.value) || 0)} />
                            {errors.width && <span className="ds-error">{errors.width}</span>}
                        </div>
                        <div className="ds-form-group">
                            <label className="ds-label">Height</label>
                            <input className={`ds-input ${errors.height ? 'error' : ''}`} type="number" step="any" min="0.1"
                                value={form.height} onChange={e => handleChange('height', parseFloat(e.target.value) || 0)} />
                            {errors.height && <span className="ds-error">{errors.height}</span>}
                        </div>
                        <div className="ds-form-group">
                            <label className="ds-label">DPI</label>
                            <input className={`ds-input ${errors.dpi ? 'error' : ''}`} type="number" min="72" max="1200" step="1"
                                value={form.dpi} onChange={e => handleChange('dpi', parseInt(e.target.value) || 72)} />
                            {errors.dpi && <span className="ds-error">{errors.dpi}</span>}
                        </div>
                    </div>

                    <div className="ds-form-row">
                        <div className="ds-form-group">
                            <label className="ds-label">Bleed ({form.unit})</label>
                            <input className={`ds-input ${errors.bleed ? 'error' : ''}`} type="number" step="0.5" min="0"
                                value={form.bleed} onChange={e => handleChange('bleed', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="ds-form-group">
                            <label className="ds-label">Safe Margin ({form.unit})</label>
                            <input className="ds-input" type="number" step="0.5" min="0"
                                value={form.safeMargin} onChange={e => handleChange('safeMargin', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="ds-form-group ds-check-group">
                            <label className="ds-label">&nbsp;</label>
                            <label className="ds-toggle">
                                <input type="checkbox" checked={form.printReady} onChange={e => handleChange('printReady', e.target.checked)} />
                                <span className="ds-toggle-slider"></span>
                                <span>Print Ready</span>
                            </label>
                        </div>
                    </div>

                    <div className="ds-size-preview">
                        <div className="ds-size-preview-bar">
                            <span>{form.width} × {form.height} {form.unit}</span>
                            <span className="ds-dot">·</span>
                            <span>{form.dpi} DPI</span>
                            <span className="ds-dot">·</span>
                            <span>{form.width > form.height ? 'Landscape' : 'Portrait'}</span>
                            {form.printReady && <><span className="ds-dot">·</span><span className="ds-print-badge">Print Ready</span></>}
                        </div>
                    </div>

                    <div className="ds-modal-footer">
                        <button type="button" className="ds-btn ds-btn-ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="ds-btn ds-btn-primary">
                            <RotateCcw size={16} /> Create Design
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateDesignModal;
