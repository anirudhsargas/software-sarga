import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default class ScannerErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('[ScannerErrorBoundary] Caught error:', error, info);
    }
    render() {
        if (this.state.error) {
            return (
                <div className="modal-backdrop animate-fade-in" style={{ zIndex: 'var(--z-modal)' }}>
                    <div className="modal animate-scale-in" style={{ maxWidth: '460px', width: '92%', position: 'relative', padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Scanner Error</h3>
                        </div>
                        <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
                            The scanner encountered an unexpected error. Please try again or use a different device.
                        </p>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: 8, background: 'var(--bg-2)', borderRadius: 6, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {this.state.error?.message || 'Unknown error'}
                        </div>
                        <button className="btn btn-primary btn--full" onClick={this.props.onClose}>
                            Close
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
