import React, { useEffect, useRef } from 'react';

const Modal = ({
  isOpen,
  onClose,
  children,
  size = 'default',
  className = '',
  closeOnBackdrop = true,
  showClose = true,
}) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      modalRef.current?.focus();
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = size === 'large' ? 'modal--large' 
    : size === 'xlarge' ? 'modal--xlarge' 
    : size === 'narrow' ? 'modal--narrow' 
    : '';

  return (
    <div
      className={`modal-backdrop ${className}`}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={modalRef}
        className={`modal ${sizeClass}`}
        tabIndex={-1}
      >
        {showClose && (
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  );
};

export const ModalHeader = ({ children, onClose, showClose = true }) => (
  <div className="modal-header">
    {children}
    {showClose && (
      <button className="modal-close modal-close--static" onClick={onClose} aria-label="Close">
        ✕
      </button>
    )}
  </div>
);

export const ModalBody = ({ children, className = '' }) => (
  <div className={`modal-body ${className}`}>
    {children}
  </div>
);

export const ModalFooter = ({ children, className = '' }) => (
  <div className={`modal-footer ${className}`}>
    {children}
  </div>
);

export default Modal;
