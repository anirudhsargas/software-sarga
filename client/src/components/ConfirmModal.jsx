import React from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ConfirmModal = React.memo(({ isOpen, title, message, confirmText, cancelText, type, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    const Icon = type === 'danger' ? AlertCircle : type === 'warning' ? AlertTriangle : Info;
    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary';
    const primaryPress = btnClass === 'btn-primary' ? 'btn-press' : '';

    return (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 9999 }} onClick={onCancel}>
            <div className="confirm-modal animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="confirm-modal__icon" data-type={type}>
                    <Icon size={32} />
                </div>
                <div className="confirm-modal__content">
                    <h3 className="confirm-modal__title">{title}</h3>
                    <p className="confirm-modal__message" style={{ whiteSpace: 'pre-line' }}>{message}</p>
                </div>
                <div className="confirm-modal__actions">
                    <button className="btn btn-ghost" onClick={onCancel}>{cancelText}</button>
                    <button className={`btn ${btnClass} ${primaryPress}`} onClick={onConfirm}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
});

export default ConfirmModal;
