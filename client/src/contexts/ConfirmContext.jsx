import React, { createContext, useContext, useState, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal';

const ConfirmContext = createContext();

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context;
};

export const ConfirmProvider = ({ children }) => {
    const [modalState, setModalState] = useState({
        isOpen: false,
        title: 'Confirm Action',
        message: 'Are you sure?',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        type: 'default' // 'default', 'danger', 'primary'
    });

    const [resolver, setResolver] = useState({ resolve: null });

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            setModalState({
                isOpen: true,
                title: options?.title || 'Confirm',
                message: options?.message || 'Are you sure you want to proceed?',
                confirmText: options?.confirmText || 'Yes',
                cancelText: options?.cancelText || 'No',
                type: options?.type || 'default'
            });
            setResolver({ resolve });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        setModalState(prev => ({ ...prev, isOpen: false }));
        if (resolver.resolve) {
            resolver.resolve(true);
        }
    }, [resolver]);

    const handleCancel = useCallback(() => {
        setModalState(prev => ({ ...prev, isOpen: false }));
        if (resolver.resolve) {
            resolver.resolve(false);
        }
    }, [resolver]);

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            <ConfirmModal
                isOpen={modalState.isOpen}
                title={modalState.title}
                message={modalState.message}
                confirmText={modalState.confirmText}
                cancelText={modalState.cancelText}
                type={modalState.type}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </ConfirmContext.Provider>
    );
};
