import React, { useEffect, useState } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const InventoryImageSettings = ({ onClose }) => {
    const [settings, setSettings] = useState({
        auto_assign_images: 1,
        cache_images: 1,
        generate_missing: 1,
        category_placeholders: 1,
        ask_before_saving: 1,
        image_quality: 'Medium'
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await api.get('/inventory/settings/image');
                if (res.data) setSettings(res.data);
            } catch (err) {
                toast.error('Failed to load settings');
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e) => {
        const { name, type, checked, value } = e.target;
        setSettings({ ...settings, [name]: type === 'checkbox' ? (checked ? 1 : 0) : value });
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await api.put('/inventory/settings/image', settings);
            toast.success('Settings saved');
            onClose();
        } catch (err) {
            toast.error('Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: 500 }}>
                <button className="modal-close" onClick={onClose}><X size={20} /></button>
                <h2 className="section-title mb-16">Image Fallback Settings</h2>

                <div className="stack-md mb-24">
                    <label className="row items-center gap-sm cursor-pointer" style={{ justifyContent: 'space-between' }}>
                        <div>
                            <div className="font-medium text-sm">Auto-Assign Images</div>
                            <div className="muted text-xs">Automatically fetch and assign images for new items.</div>
                        </div>
                        <input type="checkbox" name="auto_assign_images" checked={!!settings.auto_assign_images} onChange={handleChange} />
                    </label>

                    <label className="row items-center gap-sm cursor-pointer" style={{ justifyContent: 'space-between' }}>
                        <div>
                            <div className="font-medium text-sm">Generate Missing Images</div>
                            <div className="muted text-xs">Generate images for existing items if they don't have one.</div>
                        </div>
                        <input type="checkbox" name="generate_missing" checked={!!settings.generate_missing} onChange={handleChange} />
                    </label>

                    <label className="row items-center gap-sm cursor-pointer" style={{ justifyContent: 'space-between' }}>
                        <div>
                            <div className="font-medium text-sm">Cache Images</div>
                            <div className="muted text-xs">Save generated URLs locally to avoid re-fetching.</div>
                        </div>
                        <input type="checkbox" name="cache_images" checked={!!settings.cache_images} onChange={handleChange} />
                    </label>

                    <label className="row items-center gap-sm cursor-pointer" style={{ justifyContent: 'space-between' }}>
                        <div>
                            <div className="font-medium text-sm">Category Placeholders</div>
                            <div className="muted text-xs">Show category-specific icons if no image is found.</div>
                        </div>
                        <input type="checkbox" name="category_placeholders" checked={!!settings.category_placeholders} onChange={handleChange} />
                    </label>

                    <label className="row items-center gap-sm cursor-pointer" style={{ justifyContent: 'space-between' }}>
                        <div>
                            <div className="font-medium text-sm">Ask Before Saving Generated</div>
                            <div className="muted text-xs">Confirm before permanently saving an AI-generated match.</div>
                        </div>
                        <input type="checkbox" name="ask_before_saving" checked={!!settings.ask_before_saving} onChange={handleChange} />
                    </label>

                    <div className="mt-8">
                        <label className="label">Image Quality</label>
                        <select name="image_quality" className="input-field" value={settings.image_quality} onChange={handleChange}>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                </div>

                <div className="row justify-end gap-sm">
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                        <Save size={16} /> Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InventoryImageSettings;
