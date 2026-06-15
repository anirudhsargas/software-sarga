import React, { useState } from 'react';
import { ShieldAlert, X, Chrome, Compass, Flame, RefreshCw } from 'lucide-react';

const CameraPermissionModal = ({ isOpen, onClose, onRetry }) => {
    const [activeBrowserTab, setActiveBrowserTab] = useState('chrome');

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 10100 }}>
            <div className="modal animate-scale-in" style={{ maxWidth: '500px', width: '92%', position: 'relative', padding: '28px' }}>
                
                {/* Close Button */}
                <button
                    className="icon-button"
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '20px', right: '20px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        zIndex: 10
                    }}
                >
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="row gap-sm items-center mb-16" style={{ color: 'var(--error)' }}>
                    <ShieldAlert size={24} />
                    <h2 className="section-title" style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
                        Camera Permission Required
                    </h2>
                </div>

                <p className="muted mb-20" style={{ fontSize: '14px', lineHeight: '1.5' }}>
                    We need access to your camera to scan barcodes and QR codes. Because permission was denied or blocked, you will need to grant access manually in your browser settings.
                </p>

                {/* Browser Instructions Tabs */}
                <div className="row gap-xs mb-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <button
                        className={`btn btn-xs ${activeBrowserTab === 'chrome' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveBrowserTab('chrome')}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Chrome size={12} /> Chrome / Edge
                    </button>
                    <button
                        className={`btn btn-xs ${activeBrowserTab === 'safari' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveBrowserTab('safari')}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Compass size={12} /> Safari
                    </button>
                    <button
                        className={`btn btn-xs ${activeBrowserTab === 'firefox' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveBrowserTab('firefox')}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Flame size={12} /> Firefox
                    </button>
                </div>

                {/* Instructions Body */}
                <div style={{ background: 'var(--bg-2)', padding: '16px', borderRadius: '10px', marginBottom: '24px', fontSize: '13px' }}>
                    {activeBrowserTab === 'chrome' && (
                        <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text)' }}>
                            <li>Click the <strong>🔒 Lock icon</strong> (or settings icon) in the address bar (left side of the web page URL).</li>
                            <li>Toggle the switch next to <strong>Camera</strong> to <strong>Allow</strong>.</li>
                            <li>If you don't see it, click <strong>Site Settings</strong>, find <strong>Camera</strong>, and change it to <strong>Allow</strong>.</li>
                            <li>Click the <strong>Try Again</strong> button below or refresh the page.</li>
                        </ol>
                    )}
                    {activeBrowserTab === 'safari' && (
                        <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text)' }}>
                            <li>Open your device <strong>Settings</strong> app.</li>
                            <li>Scroll down and tap <strong>Safari</strong>.</li>
                            <li>Under <em>Settings for Websites</em>, tap <strong>Camera</strong>.</li>
                            <li>Choose <strong>Allow</strong> or <strong>Ask</strong>.</li>
                            <li>Go back to the browser and click the <strong>Try Again</strong> button.</li>
                        </ol>
                    )}
                    {activeBrowserTab === 'firefox' && (
                        <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text)' }}>
                            <li>Click the <strong>Camera / Blocked icon</strong> in the address bar (left side of the web page URL).</li>
                            <li>Click the <strong>X</strong> next to <em>Blocked Temporarily</em> or similar permission settings.</li>
                            <li>Click the <strong>Try Again</strong> button below or reload the page and select <strong>Allow</strong> when prompted.</li>
                        </ol>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="row gap-sm justify-end">
                    <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                        Close
                    </button>
                    <button className="btn btn-primary" onClick={onRetry} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <RefreshCw size={14} /> Try Again
                    </button>
                </div>

            </div>
        </div>
    );
};

export default CameraPermissionModal;
