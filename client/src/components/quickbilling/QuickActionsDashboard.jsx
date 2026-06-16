import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Zap, Plus, Settings, Mic, MicOff } from 'lucide-react';
import api from '../../services/api';
import useAuth from '../../hooks/useAuth';
import ShortcutModal from './ShortcutModal';
import QuickCart from './QuickCart';
import ManageShortcuts from './ManageShortcuts';
import toast from 'react-hot-toast';
import './QuickBilling.css';

const QuickActionsDashboard = () => {
    const [shortcuts, setShortcuts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedShortcut, setSelectedShortcut] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const { user } = useAuth();
    
    const recognitionRef = useRef(null);

    const fetchShortcuts = useCallback(async () => {
        try {
            const res = await api.get('/quick-billing/shortcuts');
            setShortcuts(res.data);
        } catch (err) {
            console.error('Failed to load shortcuts', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchShortcuts();
    }, [fetchShortcuts]);

    // Voice Recognition Setup
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.toLowerCase();
                toast(`Voice heard: "${transcript}"`, { icon: '🎤' });
                
                // Simple matching logic
                const match = shortcuts.find(s => 
                    transcript.includes(s.name.toLowerCase()) || 
                    (s.display_name && transcript.includes(s.display_name.toLowerCase()))
                );

                if (match) {
                    setSelectedShortcut(match);
                } else {
                    toast.error('No shortcut matched this voice command.');
                }
                setIsListening(false);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
                if (event.error !== 'no-speech') {
                    toast.error(`Voice error: ${event.error}`);
                }
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
        }
    }, [shortcuts]);

    const toggleVoice = () => {
        if (!recognitionRef.current) {
            toast.error('Voice recognition is not supported in this browser.');
            return;
        }
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            recognitionRef.current.start();
            setIsListening(true);
            toast('Listening for a shortcut...', { icon: '🎤', duration: 3000 });
        }
    };

    // Handle global keyboard shortcuts for items
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if typing in inputs
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
            
            if (e.altKey) {
                const shortcut = shortcuts.find(s => s.keyboard_shortcut === `Alt+${e.key}`);
                if (shortcut) {
                    e.preventDefault();
                    setSelectedShortcut(shortcut);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);

    const handleAddToCart = (item) => {
        setCartItems(prev => {
            const existing = prev.find(i => i.shortcut_id === item.shortcut_id);
            if (existing) {
                return prev.map(i => i.shortcut_id === item.shortcut_id 
                    ? { ...i, quantity: i.quantity + item.quantity } 
                    : i);
            }
            return [...prev, item];
        });
        setSelectedShortcut(null);
        if (!isCartOpen) setIsCartOpen(true);
    };

    if (loading) {
        return <div className="qb-dashboard"><p>Loading quick shortcuts...</p></div>;
    }

    return (
        <div className="qb-dashboard">
            <div className="qb-header">
                <h2 className="qb-title"><Zap size={24} color="var(--primary)" /> Quick Actions</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                        className={`btn btn-sm btn-icon ${isListening ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={toggleVoice}
                        title="Voice Command"
                    >
                        {isListening ? <Mic size={16} className="spin-pulse" /> : <MicOff size={16} />}
                    </button>
                    {['Admin', 'Manager'].includes(user?.role) && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setIsManageOpen(true)}>
                            <Settings size={16} /> Manage
                        </button>
                    )}
                </div>
            </div>

            <div className="qb-grid">
                {shortcuts.map(s => (
                    <div 
                        key={s.id} 
                        className="qb-card" 
                        onClick={() => setSelectedShortcut(s)}
                    >
                        {s.keyboard_shortcut && <span className="qb-card-kb">{s.keyboard_shortcut}</span>}
                        <div className="qb-card-icon">
                            <Plus size={20} />
                        </div>
                        <span className="qb-card-name">{s.display_name || s.name}</span>
                        <span className="qb-card-price">₹{s.default_price}</span>
                    </div>
                ))}
                {shortcuts.length === 0 && (
                    <p style={{ gridColumn: '1 / -1', color: 'var(--muted)' }}>No shortcuts configured yet.</p>
                )}
            </div>

            {selectedShortcut && (
                <ShortcutModal 
                    shortcut={selectedShortcut} 
                    onClose={() => setSelectedShortcut(null)} 
                    onAdd={handleAddToCart}
                />
            )}

            <QuickCart 
                isOpen={isCartOpen}
                setIsOpen={setIsCartOpen}
                items={cartItems}
                setItems={setCartItems}
            />

            {isManageOpen && (
                <ManageShortcuts 
                    onClose={() => {
                        setIsManageOpen(false);
                        fetchShortcuts();
                    }} 
                />
            )}
        </div>
    );
};

export default QuickActionsDashboard;
