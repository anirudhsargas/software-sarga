import React from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ConfirmModal = ({ isOpen, title, message, confirmText, cancelText, type, onConfirm, onCancel }) => {
    const triggerRef = React.useRef(null);

    React.useEffect(() => {
        if (isOpen) {
            triggerRef.current = document.activeElement;
        }
        return () => {
            triggerRef.current?.focus();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const Icon = type === 'danger' ? AlertCircle : type === 'warning' ? AlertTriangle : Info;
    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary';
    const primaryPress = btnClass === 'btn-primary' ? 'btn-press' : '';

    return (
        <div 
            role="dialog" 
            aria-modal="true" 
            aria-labelledby="confirm-title"
            className="modal-backdrop animate-fade-in" 
            style={{ zIndex: 'var(--z-modal)' }} 
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onCancel();
                }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.target === e.currentTarget) onCancel(); } }}
        >
            <div className="confirm-modal animate-scale-in" onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
                <div className="confirm-modal__icon" data-type={type}>
                    <Icon size={32} />
                </div>
                <div className="confirm-modal__content">
                    <h3 id="confirm-title" className="confirm-modal__title">{title}</h3>
                    <p className="confirm-modal__message" style={{ whiteSpace: 'pre-line' }}>{message}</p>
                </div>
                <div className="confirm-modal__actions">
                    <button className="btn btn-ghost" onClick={onCancel}>{cancelText}</button>
                    <button className={`btn ${btnClass} ${primaryPress}`} onClick={onConfirm}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
